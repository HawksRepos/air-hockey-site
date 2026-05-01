/**
 * End-to-end calculation for the air-cushioned strip rig.
 *
 * Inputs are in human units (mm, g, m³/h, …) so the UI can call this
 * directly. Internally everything is converted to SI by the helpers in
 * `units.js` and stays SI until the result object is built.
 *
 * Physics model (all derivations cited in `docs/MODEL.md`):
 *
 *   Orifice flow      Q = Cd · A · √(2 ΔP / ρ)              [Bernoulli]
 *   Discharge coeff   Cd = f(t/d) · g(Re_d)
 *                       f from Lichtarowicz et al. 1965 (geometric);
 *                       g from Idelchik 2007 fig. 4-19 (transition).
 *   Operating point   Q_fan(P) = Q_uncov(P) + Q_cov(P − P_film)
 *                                clamped by η_aero · P_elec    [split flow]
 *   Hover height      2-D Reynolds Poisson series (viscous)
 *                     Bernoulli edge gap (inertial)
 *                     h = max(h_visc, h_inertial)
 *
 * The split-flow operating point recognises that holes covered by the
 * floating block discharge to the film pressure P_film = m g / A_block,
 * not to atmosphere — so they leak less than the uncovered holes.
 *
 * The η_aero clamp prevents the model from sitting at an operating point
 * that would require more aerodynamic output than a real fan of the
 * given electrical rating can produce. Small AC induction duct fans
 * typically achieve 25–35 % aero efficiency; brushless DC leaf-blowers
 * around 18–22 %.
 *
 * The hover height comes from the 2-D Reynolds lubrication equation
 * solved by Fourier series for the actual carriage aspect ratio with
 * all four edges open, plus an inertial Bernoulli edge-gap predictor.
 * The film flow only includes air through holes that are physically
 * underneath the carriage; lateral entrainment from nearby uncovered
 * holes in an open-gutter rig is a known un-modelled mechanism and the
 * predicted hover is therefore conservative on open rigs.
 *
 * References:
 *   - ISO 5167-1:2022. Measurement of fluid flow by means of pressure
 *     differential devices.
 *   - Lichtarowicz, A.; Duggins, R. K.; Markland, E. (1965). Discharge
 *     coefficients for incompressible non-cavitating flow through long
 *     orifices. J. Mech. Eng. Sci. 7(2):210–219.
 *   - Idelchik, I. E. (2007). Handbook of Hydraulic Resistance, 3rd ed.,
 *     Begell House. §4 (orifice and short-tube discharge coefficients).
 *   - Hamrock, B. J. (2004). Fundamentals of Fluid Film Lubrication,
 *     2nd ed., CRC Press. Ch. 7 (Reynolds equation, parallel-plate film).
 *   - Çengel, Y. A.; Cimbala, J. M. (2018). Fluid Mechanics: Fundamentals
 *     and Applications, 4th ed., McGraw-Hill. Ch. 14 (fans).
 */

import { G, MU_AIR, NU_AIR, RHO } from './constants.js';
import { gToKg, m3hToM3s, mmToM, mToMm } from './units.js';
import { holeArea, qOrifice } from './orifice.js';
import { fanCurveQ, linearFanQ } from './fanCurve.js';
import { solveOperatingPoint } from './solveOperatingPoint.js';
import { dischargeCoefficient, reynoldsFactor } from './dischargeCoefficient.js';
import { hoverHeightInertial, hoverHeightViscous, modifiedFilmReynolds } from './filmFlow.js';
import { compressibilityState } from './compressibility.js';
import { inletLossPa, withInletLoss } from './inletLoss.js';
import { FAN_CURVE_C } from '../data/manroseMan150m.js';

/**
 * @typedef {object} AirHockeyInputs
 * @property {number} massG            Block mass [g].
 * @property {number} blockLengthMm    Block length in flow direction [mm].
 * @property {number} blockWidthMm     Block width across strip [mm].
 * @property {number} stripLengthMm    Strip length [mm].
 * @property {number} stripWidthMm     Strip width [mm].
 * @property {number} holeDiaMm        Hole diameter [mm].
 * @property {number} spacingMm        Hole pitch (centre-to-centre) [mm].
 * @property {number} rows             Number of hole rows across the strip.
 * @property {number} stripThicknessMm Plate thickness drilled through [mm].
 * @property {'curve'|'linear'} fanMode  Fan model.
 * @property {number} fanFlowM3h       Free-blow flow [m³/h] (linear mode).
 * @property {number} fanPmaxPa        Shut-off pressure [Pa] (linear mode).
 * @property {number} fanWatts         Fan electrical input rating [W].
 * @property {number} fanAeroEfficiency  Aerodynamic efficiency cap (0–1).
 * @property {number} costPerKwh       Electricity tariff [£/kWh].
 * @property {number} [inletLossK=0]   Lumped loss coefficient between the
 *                                     fan outlet and the plenum (ducts,
 *                                     bends, screens). Default 0 — no duct.
 * @property {number} [ductAreaMm2=0]  Cross-sectional area of the duct used
 *                                     to compute the line velocity for
 *                                     ΔP_loss = K·½ρv². Required when
 *                                     `inletLossK > 0`, ignored otherwise.
 */

/**
 * Semi-empirical calibration parameters — the model's "knobs".
 *
 * The model is otherwise derived from first principles. The remaining
 * values below either come from published handbooks (with citation) or
 * are conservative engineering rules of thumb. Each entry carries a
 * provenance note and an uncertainty band.
 */
export const CALIBRATION = Object.freeze({
  /**
   * Aerodynamic-to-electrical efficiency ceiling of a small duct fan.
   * The operating point is clamped so that P·Q ≤ η_aero·P_elec.
   *
   * Source: Çengel & Cimbala (2018), *Fluid Mechanics*, Ch. 14 — small
   * centrifugal fans typically 25-35 %. 0.30 is the midrange default
   * for an AC centrifugal duct fan (Manrose). The Dewalt leaf-blower
   * preset lowers this to 0.20 because a brushless DC impeller
   * optimised for jet velocity loses more electrical input to kinetic
   * energy than to useful plenum pressure.
   *
   * Uncertainty: ±0.05 (literature range). Override via input.
   */
  defaultFanAeroEfficiency: 0.3,

  /**
   * Minimum fan flow as a fraction of free-blow flow below which the
   * published performance curve becomes unreliable (stall regime).
   *
   * Source: Çengel & Cimbala (2018), Ch. 14 — 15 % is the conventional
   * rule of thumb for small centrifugal duct fans.
   *
   * Uncertainty: ±0.05.
   */
  minFanFlowFraction: 0.15,

  /**
   * Electrical draw of the motor at zero aerodynamic load, as a
   * fraction of rated power. Comes from magnetising current, bearing
   * friction, and windage; these don't disappear at off-design.
   *
   * Source: typical AC duct-fan spec sheets (no-load vs. rated);
   * 40 % is representative for small units.
   *
   * Uncertainty: ±0.10.
   */
  fanIdleDrawFraction: 0.4,

  /**
   * Characteristic radius of the pressure-influence circle around a
   * single hole in the under-block film. Used as a first-order penalty
   * on the load-bearing area for sparse hole patterns: when the union
   * of influence circles cannot tile the block footprint, the model
   * raises the effective required pressure F / (A_block · cov).
   *
   * Source: Hamrock (2004), Fig. 7-11 — pressure profiles for an
   * orifice in a parallel-plate film decay to ~1/e over 10-20 mm at
   * sub-mm gap heights; 15 mm is the midrange.
   *
   * This is a stand-in for a non-uniform-source 2-D Reynolds solve
   * (which would naturally compute the area-averaged pressure for a
   * discrete hole pattern). Replacing it with that solve is on the
   * future-work list. For dense hole patterns (e.g. 20 mm pitch with
   * 15 mm influence) the factor saturates at 1 and the approximation
   * is exact.
   *
   * Uncertainty: ±5 mm.
   */
  influenceRadiusMm: 15,
});

/** @deprecated Use `CALIBRATION.defaultFanAeroEfficiency`. Retained as an alias. */
export const DEFAULT_FAN_AERO_EFFICIENCY = CALIBRATION.defaultFanAeroEfficiency;

/** @deprecated Use `CALIBRATION.minFanFlowFraction`. Retained as an alias. */
export const DEFAULT_MIN_FAN_FLOW_FRACTION = CALIBRATION.minFanFlowFraction;

/** @deprecated Use `CALIBRATION.fanIdleDrawFraction`. Retained as an alias. */
export const FAN_IDLE_DRAW_FRACTION = CALIBRATION.fanIdleDrawFraction;

/** Build the fan Q(P) function from the input fan-mode selector. */
export function makeFanQFn(inputs) {
  if (inputs.fanMode === 'curve') {
    return (pPa) => fanCurveQ(pPa, FAN_CURVE_C);
  }
  const qMax = m3hToM3s(inputs.fanFlowM3h);
  return (pPa) => linearFanQ(pPa, qMax, inputs.fanPmaxPa);
}

/**
 * Run the full air-hockey calculation.
 * @param {AirHockeyInputs} inputs
 * @returns {object} Flat result object — geometry, operating point,
 *                   hover height, energy and running costs.
 */
export function computeAirHockey(inputs) {
  const rawFanQFn = makeFanQFn(inputs);
  const inletLossK = inputs.inletLossK ?? 0;
  const ductAreaM2 = inputs.ductAreaMm2 ? inputs.ductAreaMm2 * 1e-6 : 0;
  const fanQFn = withInletLoss(rawFanQFn, { K: inletLossK, ductAreaM2 });
  const fanAeroEfficiency = inputs.fanAeroEfficiency ?? DEFAULT_FAN_AERO_EFFICIENCY;
  const calInfluenceRadiusMm = inputs._calInfluenceRadiusMm ?? CALIBRATION.influenceRadiusMm;

  // ── Geometry & weight ────────────────────────────────────────────
  const massKg = gToKg(inputs.massG);
  const force = massKg * G;
  const blockLengthM = mmToM(inputs.blockLengthMm);
  const blockWidthM = mmToM(inputs.blockWidthMm);
  const areaBlock = blockLengthM * blockWidthM;
  const pRequired = areaBlock > 0 ? force / areaBlock : 0;

  const holesPerRow = Math.floor(inputs.stripLengthMm / inputs.spacingMm);
  const totalHoles = holesPerRow * inputs.rows;
  const holeDiaM = mmToM(inputs.holeDiaMm);
  const aHole = holeArea(holeDiaM);
  const aTotalM2 = totalHoles * aHole;
  const aTotalMm2 = aTotalM2 * 1e6;

  const holesUnderBlock = Math.floor(inputs.blockLengthMm / inputs.spacingMm) * inputs.rows;

  // ── Coverage penalty ────────────────────────────────────────────
  // First-order area-of-influence model. See CALIBRATION.influenceRadiusMm
  // docstring for derivation and limits.
  const influenceAreaPerHoleMm2 = Math.PI * calInfluenceRadiusMm * calInfluenceRadiusMm;
  const totalInfluenceMm2 = holesUnderBlock * influenceAreaPerHoleMm2;
  const blockAreaMm2 = inputs.blockLengthMm * inputs.blockWidthMm;
  const coverageFactor = Math.min(1, totalInfluenceMm2 / blockAreaMm2);
  const areaBlockEffective = areaBlock * coverageFactor;

  // Geometric discharge coefficient from t/d ratio (Lichtarowicz 1965).
  // The Reynolds correction below scales this down at small holes where
  // the flow is no longer fully turbulent.
  const stripThicknessM = mmToM(inputs.stripThicknessMm ?? 2.0);
  const cdGeometric = dischargeCoefficient(stripThicknessM, holeDiaM);

  // ── Operating point (Cd ↔ Re fixed point) ──────────────────────
  let cd = cdGeometric;
  let opResult;
  for (let iter = 0; iter < 8; iter += 1) {
    opResult = solveOperatingPoint(
      {
        fanQFn,
        aHoleM2: aHole,
        nCovered: holesUnderBlock,
        nUncovered: totalHoles - holesUnderBlock,
        pFilmPa: pRequired,
        fanWatts: inputs.fanWatts,
        fanAeroEfficiency,
        minSustainableFlowFraction: DEFAULT_MIN_FAN_FLOW_FRACTION,
      },
      { cd },
    );
    const v = Math.sqrt((2 * Math.max(0, opResult.pOp)) / RHO);
    const re = (v * holeDiaM) / NU_AIR;
    const cdNext = cdGeometric * reynoldsFactor(re);
    if (Math.abs(cdNext - cd) < 1e-4) {
      cd = cdNext;
      break;
    }
    cd = cdNext;
  }
  const {
    pOp,
    qOp,
    iterations: opIterations,
    residual: opResidual,
    powerLimited,
    stallLimited,
  } = opResult;

  const maxLiftForce = pOp * areaBlockEffective;
  const pRequiredEffective = areaBlockEffective > 0 ? force / areaBlockEffective : Infinity;
  const pressureHeadroomPct =
    pRequiredEffective > 0 && Number.isFinite(pRequiredEffective)
      ? ((pOp - pRequiredEffective) / pRequiredEffective) * 100
      : -100;
  const floats = pOp >= pRequiredEffective && pRequiredEffective > 0;

  // ── Velocities and ideal hole sizing ────────────────────────────
  const vAtOp = Math.sqrt((2 * Math.max(0, pOp)) / RHO);
  const compressibility = compressibilityState(vAtOp);

  // dIdeal: the hole diameter that makes the fan deliver pRequired exactly
  // through `totalHoles` orifices. Solved iteratively because Cd depends on
  // diameter (via t/d) and on Re (which depends on diameter and the
  // velocity at pRequired). Converges in 4-6 steps.
  const qAtPReq = fanQFn(pRequired);
  const vAtPReq = pRequired > 0 ? Math.sqrt((2 * pRequired) / RHO) : 0;
  let dIdeal = 0;
  if (qAtPReq > 0 && vAtPReq > 0 && totalHoles > 0) {
    let dIter = holeDiaM;
    for (let k = 0; k < 12; k += 1) {
      const reAtIter = (vAtPReq * dIter) / NU_AIR;
      const cdGeomAtIter = dischargeCoefficient(stripThicknessM, dIter);
      const cdEff = cdGeomAtIter * reynoldsFactor(reAtIter);
      if (cdEff <= 0) break;
      const aTotalReq = qAtPReq / (cdEff * vAtPReq);
      const aPerHole = aTotalReq / totalHoles;
      if (aPerHole <= 0) break;
      const dNext = Math.sqrt((4 * aPerHole) / Math.PI);
      if (Math.abs(dNext - dIter) < 1e-7) {
        dIter = dNext;
        break;
      }
      dIter = dNext;
    }
    dIdeal = mToMm(dIter);
  }

  // ── Hover height ────────────────────────────────────────────────
  // qIntoGap is the steady inflow into the under-carriage film. We
  // model only the geometrically covered holes: each passes flow
  // against the film back-pressure (pOp − pRequired) at the operating
  // point Cd. Lateral entrainment from uncovered holes in an open-
  // gutter rig is a real mechanism but requires a 3-D coupled
  // entrainment model to resolve — see docs/MODEL.md §2.7. The
  // hover prediction is therefore conservative on open rigs.
  const deltaPHoles = Math.max(0, pOp - pRequired);
  const aHolesUnder = holesUnderBlock * aHole;
  const qIntoGap = qOrifice(cd, aHolesUnder, deltaPHoles);

  // Edge perimeter for inertial leakage. With sides open (carriage
  // narrower than strip), all four carriage edges discharge to
  // atmosphere; otherwise the long edges butt against the gutter
  // walls and only the short edges leak.
  const sideGapMm = inputs.stripWidthMm - inputs.blockWidthMm;
  const sidesOpen = sideGapMm > 1;
  const leakPerimeterM = sidesOpen ? 2 * blockWidthM + 2 * blockLengthM : 2 * blockWidthM;

  let hoverHeight = 0;
  let reStar = 0;
  if (floats && qIntoGap > 0) {
    const hVisc = hoverHeightViscous({
      qIn: qIntoGap,
      lengthM: blockLengthM,
      widthM: blockWidthM,
      pFilmPa: pRequired,
    });
    const hInertial = hoverHeightInertial({
      qIn: qIntoGap,
      perimeterM: leakPerimeterM,
      pFilmPa: pRequired,
    });
    // Each prediction is a lower bound for its regime (viscous shear
    // and inertial throttling are independent constraints). The
    // physical gap is whichever resistance is binding — i.e. the larger.
    hoverHeight = Math.max(hVisc, hInertial);
    const meanU =
      leakPerimeterM > 0 && hoverHeight > 0 ? qIntoGap / (leakPerimeterM * hoverHeight) : 0;
    reStar = modifiedFilmReynolds({
      uMps: meanU,
      hM: hoverHeight,
      lengthM: blockLengthM,
    });
  }
  const hoverHeightMm = mToMm(hoverHeight);

  // ── Energy & cost ───────────────────────────────────────────────
  const aeroPower = pOp * qOp;
  const fanIdleW = FAN_IDLE_DRAW_FRACTION * inputs.fanWatts;
  const fanElectricalDraw = Math.min(
    inputs.fanWatts,
    Math.max(fanIdleW, fanAeroEfficiency > 0 ? aeroPower / fanAeroEfficiency : fanIdleW),
  );
  const fanMotorEff = fanElectricalDraw > 0 ? (aeroPower / fanElectricalDraw) * 100 : 0;

  // Useful vs. wasted air. The split-flow operating point already
  // resolved the per-hole flow rates: covered holes pass against the
  // film back-pressure (pOp − pRequired); uncovered holes vent against
  // atmosphere. Useful flow is what the under-block holes feed into
  // the load-bearing film (= qIntoGap by mass conservation); the rest
  // discharges to the gutter.
  const qPerUncoveredHole = qOrifice(cd, aHole, pOp);
  const qUseful = qIntoGap;
  const qWasted = (totalHoles - holesUnderBlock) * qPerUncoveredHole;
  // Useful power = work done pumping air through the leak gap at film
  // pressure. The orifice loss (pOp − pRequired)·qIntoGap is dissipated
  // in the hole contraction and counted under "wasted" along with the
  // uncovered-hole leakage.
  const powerUseful = pRequired * qUseful;
  const powerWasted = aeroPower - powerUseful;
  const powerMotorHeat = fanElectricalDraw - aeroPower;

  // Two efficiencies are reported separately so the reader can see
  // them both. They differ because covered holes pass less air per
  // hole than uncovered ones (back-pressure reduces the orifice ΔP).
  const fractionUseful = totalHoles > 0 ? holesUnderBlock / totalHoles : 0;
  const flowFractionUseful = qOp > 0 ? qUseful / qOp : 0;
  const geometricEff = fractionUseful * 100;
  const flowEff = flowFractionUseful * 100;
  const systemEff = fanElectricalDraw > 0 ? (powerUseful / fanElectricalDraw) * 100 : 0;

  // Minimum-power benchmark: the aero output that would just maintain
  // pRequired against the actual edge-leak area at the predicted
  // hover height. powerRatio > 1 means the rig is over-powered for
  // the operating point (typical, since the fan must also feed
  // uncovered-hole leakage).
  const edgeLeakArea = leakPerimeterM * hoverHeight;
  const qMinLeakage = qOrifice(cd, edgeLeakArea, pRequired);
  const minPracticalPower = pRequired * qMinLeakage;
  const powerRatio = minPracticalPower > 0 ? aeroPower / minPracticalPower : Infinity;
  const costPerHour = (fanElectricalDraw / 1000) * inputs.costPerKwh;
  const costPer8Hrs = costPerHour * 8;

  return {
    cd,
    cdGeometric,
    stripThicknessMm: inputs.stripThicknessMm ?? 2.0,
    fanAeroEfficiency,

    massKg,
    force,
    areaBlock,
    pRequired,
    qMax: m3hToM3s(inputs.fanFlowM3h),
    holesPerRow,
    totalHoles,
    aHole,
    aTotalM2,
    aTotalMm2,
    holesUnderBlock,
    fractionUseful,
    flowFractionUseful,
    coverageFactor,
    areaBlockEffective,
    pRequiredEffective,
    dIdeal,

    pOp,
    qOp,
    opIterations,
    opResidual,
    powerLimited,
    stallLimited,
    fanElectricalDraw,

    maxLiftForce,
    pressureHeadroomPct,
    floats,
    // Aliases retained because the existing detailed UI references them.
    liftForce: maxLiftForce,
    liftMarginPct: pressureHeadroomPct,

    vAtOp,
    holeMach: compressibility.mach,
    compressibilityRegime: compressibility.regime,
    compressibilityWarning: compressibility.compressibilityWarning,
    inletLossPa: inletLossPa(qOp, { K: inletLossK, ductAreaM2 }),
    hoverHeightMm,
    qIntoGap,
    filmReStar: reStar,

    aeroPower,
    fanMotorEff,
    qUseful,
    qWasted,
    powerUseful,
    powerWasted,
    powerMotorHeat,
    geometricEff,
    flowEff,
    systemEff,
    minPracticalPower,
    powerRatio,

    costPerHour,
    costPer8Hrs,
  };
}

export { G, MU_AIR, NU_AIR, RHO };
