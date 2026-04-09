/**
 * End-to-end calculation for the air-cushioned strip rig.
 *
 * Inputs are in human units (mm, g, m³/h, …) so the UI can call this
 * directly.  Internally everything is converted to SI by the helpers in
 * `units.js` and stays SI until the result object is built.
 *
 * Physics model:
 *
 *   Orifice flow      Q = Cd · A · √(2 ΔP / ρ)              [Bernoulli]
 *   Discharge coeff   Cd = f(t/d)   from Lichtarowicz et al. 1965
 *                                   (short-tube regime, Re ≳ 2000)
 *   Operating point   Q_fan(P) = Q_uncovered(P)
 *                                + Q_covered(P − P_film)    (split flow)
 *                                clamped by η_aero · P_elec
 *   Hover height      h = ∛( 3 μ L Q_in / (W P_film) )      [Reynolds eq.]
 *
 * The split-flow operating point recognises that holes covered by the
 * floating block discharge to the film pressure P_film = m g / A_block,
 * not to atmosphere — so they leak less than the uncovered holes.
 *
 * The η_aero clamp prevents the model from sitting at an operating point
 * that would require more aerodynamic output than a real fan of the
 * given electrical rating can produce. Small AC induction duct fans
 * typically achieve 25–35 % aero efficiency.
 *
 * The hover height comes from the Reynolds lubrication equation for a
 * thin film, which is the correct regime for sub-millimetre air gaps —
 * Bernoulli over-predicts the gap by ignoring viscous shear in the film.
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
 */

import { G, MU_AIR, NU_AIR, RHO } from './constants.js';
import { gToKg, m3hToM3s, mmToM, mToMm } from './units.js';
import { holeArea, qOrifice } from './orifice.js';
import { fanCurveQ, linearFanQ } from './fanCurve.js';
import { solveOperatingPoint } from './solveOperatingPoint.js';
import { dischargeCoefficient, reynoldsFactor } from './dischargeCoefficient.js';
import { hoverHeightInertial, hoverHeightViscous, modifiedFilmReynolds } from './filmFlow.js';
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
 */

/** Default aerodynamic efficiency for small AC duct fans. */
export const DEFAULT_FAN_AERO_EFFICIENCY = 0.3;

/**
 * Smallest fraction of free-blow flow the fan can stably deliver.
 *
 * Below this the fan is in its stall regime — flow reverses, the motor
 * loads up, and the published curve is no longer reliable.  ~15 % is
 * the conventional rule of thumb for small centrifugal duct fans
 * (Çengel & Cimbala, *Fluid Mechanics*, Ch. 14).
 */
export const DEFAULT_MIN_FAN_FLOW_FRACTION = 0.15;

/**
 * Idle electrical draw of the motor as a fraction of its rated power.
 *
 * AC induction duct fans don't drop their draw to zero at low aero
 * load — there's always magnetising current, friction, and windage.
 * 40 % of rated is a representative floor.
 */
export const FAN_IDLE_DRAW_FRACTION = 0.4;

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
  const fanQFn = makeFanQFn(inputs);
  const fanAeroEfficiency = inputs.fanAeroEfficiency ?? DEFAULT_FAN_AERO_EFFICIENCY;

  // ── Geometry & weight ────────────────────────────────────────────
  const massKg = gToKg(inputs.massG);
  const force = massKg * G;
  const blockLengthM = mmToM(inputs.blockLengthMm);
  const blockWidthM = mmToM(inputs.blockWidthMm);
  const areaBlock = blockLengthM * blockWidthM;
  // Required film pressure to support the weight: P = F / A.
  // Uses the raw geometric area here — the coverage penalty is applied
  // after the operating point is solved to compute the *effective* lift.
  const pRequired = areaBlock > 0 ? force / areaBlock : 0;

  const holesPerRow = Math.floor(inputs.stripLengthMm / inputs.spacingMm);
  const totalHoles = holesPerRow * inputs.rows;
  const holeDiaM = mmToM(inputs.holeDiaMm);
  const aHole = holeArea(holeDiaM);
  const aTotalM2 = totalHoles * aHole;
  const aTotalMm2 = aTotalM2 * 1e6;

  const holesUnderBlock = Math.floor(inputs.blockLengthMm / inputs.spacingMm) * inputs.rows;
  const fractionUseful = totalHoles > 0 ? holesUnderBlock / totalHoles : 0;

  // ── Coverage penalty ────────────────────────────────────────────
  // The hover model assumes roughly uniform film pressure under the
  // block. This breaks down when holes are too sparse: air must travel
  // laterally from each hole across the gap, losing pressure to
  // viscous shear. When the spacing between holes exceeds the block's
  // shorter dimension, the pressure peaks around each hole with
  // near-zero pressure in between, and the block tilts / contacts.
  //
  // We model the effective lift area as
  //
  //   A_eff = A_block × coverageFactor
  //
  // where coverageFactor = min(1, influenceArea / A_block) and the
  // influence area around each under-block hole is a circle of radius
  // ≈ min(spacing/2, blockWidth/rows/2) — capped at the Voronoi cell
  // the hole "owns" within the block footprint.
  //
  // This is a first-order correction, not a 2-D film solve, but it
  // prevents the model from claiming sparse holes can lift heavy loads.
  // Each hole supports a patch of block surface around it. When
  // holes are closely spaced, the patches overlap and the entire
  // block area sees lift. When spacing is large, each hole only
  // pressurises a limited zone and the rest of the block sees
  // near-ambient pressure.
  //
  // Influence radius: for a thin viscous film the pressure from a
  // single orifice decays over a characteristic length that depends
  // on the gap height and viscosity. A practical estimate is that
  // each hole effectively pressurises a circle of radius ≈
  // min(spacing/2, 15 mm). The 15 mm cap comes from the observation
  // that at sub-mm gaps the lateral decay is very rapid — air from
  // one hole doesn't meaningfully reach beyond ~15 mm in a real
  // air bearing (Hamrock 2004, Ch. 7, fig. 7-11 pressure profiles).
  //
  // coverageFactor = N_under × π × r_inf² / A_block, capped at 1.
  // At tight spacing the influence circles overlap — that's correct,
  // and the min(total, blockArea) clamp handles the saturation.
  const influenceRadiusMm = 15;
  const influenceAreaPerHoleMm2 = Math.PI * influenceRadiusMm * influenceRadiusMm;
  const totalInfluenceMm2 = holesUnderBlock * influenceAreaPerHoleMm2;
  const blockAreaMm2 = inputs.blockLengthMm * inputs.blockWidthMm;
  const coverageFactor = Math.min(1, totalInfluenceMm2 / blockAreaMm2);
  const areaBlockEffective = areaBlock * coverageFactor;

  // Geometric discharge coefficient from t/d ratio (Lichtarowicz et al.
  // 1965). The Reynolds correction below scales this down at small
  // holes where the flow is no longer fully turbulent.
  const stripThicknessM = mmToM(inputs.stripThicknessMm ?? 2.0);
  const cdGeometric = dischargeCoefficient(stripThicknessM, holeDiaM);

  // ── Operating point ─────────────────────────────────────────────
  // Cd depends on Re, which depends on the velocity in the hole, which
  // depends on Cd. We solve the coupled problem by fixed-point
  // iteration: start with the geometric Cd, solve the operating point,
  // measure Re at the resulting hole velocity, update Cd accordingly,
  // and repeat. Converges in 3–5 iterations for the parameter range
  // we care about.
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

  // Maximum lift the plenum could exert, scaled by the coverage factor.
  // With sparse holes the film pressure is non-uniform, so only a
  // fraction of the block footprint sees meaningful lift.
  const maxLiftForce = pOp * areaBlockEffective;
  // Effective required pressure accounts for the reduced lift area:
  // P_eff = F / A_eff. When coverage is poor, P_eff rises — the system
  // needs higher plenum pressure to compensate for the dead zones.
  const pRequiredEffective = areaBlockEffective > 0 ? force / areaBlockEffective : Infinity;
  const pressureHeadroomPct = pRequiredEffective > 0 && Number.isFinite(pRequiredEffective)
    ? ((pOp - pRequiredEffective) / pRequiredEffective) * 100
    : -100;
  const floats = pOp >= pRequiredEffective && pRequiredEffective > 0;

  // ── Velocities and ideal hole sizing ────────────────────────────
  const vAtOp = Math.sqrt((2 * Math.max(0, pOp)) / RHO);

  const qAtPReq = fanQFn(pRequired);
  const vAtPReq = pRequired > 0 ? Math.sqrt((2 * pRequired) / RHO) : 0;
  const aIdealTotal = qAtPReq > 0 && vAtPReq > 0 ? qAtPReq / (cd * vAtPReq) : 0;
  const aIdealPerHole = totalHoles > 0 ? aIdealTotal / totalHoles : 0;
  const dIdealM = aIdealPerHole > 0 ? Math.sqrt((4 * aIdealPerHole) / Math.PI) : 0;
  const dIdeal = mToMm(dIdealM);

  // ── Hover height ────────────────────────────────────────────────
  // Two models are computed and the physically appropriate one is
  // selected based on the modified Reynolds number Re*.
  //
  // 1. VISCOUS (Reynolds lubrication equation, Hamrock 2004 Ch. 7):
  //    h = ∛( 3 μ L Q / (W P) )
  //    Valid when Re* = ρUh²/(μL) ≪ 1 (Stokes flow in the film).
  //
  // 2. INERTIAL (Bernoulli edge-gap, standard orifice model):
  //    h = Q / (Cd_gap × perimeter × √(2P/ρ))
  //    Valid when Re* ≫ 1 (inertia-dominated flow).
  //
  // At intermediate Re* (~0.5–5) both contribute; we take the max
  // of the two predictions as a practical engineering blend.
  //
  // Edge perimeter: the model accounts for ALL edges where air can
  // escape. If the block is narrower than the channel, the two long
  // sides also leak — they aren't sealed.
  const deltaPHoles = Math.max(0, pOp - pRequired);
  const aHolesUnder = holesUnderBlock * aHole;
  // Direct inflow through the geometrically covered holes.
  const qDirect = qOrifice(cd, aHolesUnder, deltaPHoles);
  // In an open-gutter rig (no sealed plenum walls at the block edges),
  // air from uncovered holes spreads along the gutter surface and
  // contributes to the under-block cushion. The gutter acts as a
  // channel that directs surface flow toward the block from both
  // directions.
  //
  // All holes on the strip produce a surface flow at the plenum
  // pressure. A fraction of this total surface flow is "captured"
  // by the block as it passes underneath. The capture fraction
  // depends on the block's footprint relative to the strip area:
  // a block covering 10 % of the strip will intercept roughly
  // 10–50 % of the total flow depending on geometry and edge
  // effects. We model capture as:
  //
  //   q_nearby = captureEff × (totalFlow − directFlow)
  //
  // where captureEff is calibrated against the experimental
  // observation of 2–3 mm hover at 350 g with the Dewalt blower.
  // The value ~0.5 corresponds to the block intercepting air from
  // roughly ±1.5 block-lengths along the gutter in each direction,
  // with losses to the sides. This is a semi-empirical parameter;
  // a precise value requires CFD or wind-tunnel measurement.
  const sideGapMm = inputs.stripWidthMm - inputs.blockWidthMm;
  const sidesOpen = sideGapMm > 1;
  const qAllHoles = qOrifice(cd, aTotalM2, pOp);
  const qUncoveredNearby = Math.max(0, qAllHoles - qDirect);
  const NEARBY_CAPTURE_EFF = sidesOpen ? 0.5 : 0.0;
  const qNearby = NEARBY_CAPTURE_EFF * qUncoveredNearby;
  const qIntoGap = qDirect + qNearby;

  // Leaking perimeter: always the two short edges (block width).
  // Plus the two long edges IF the block doesn't fill the channel.
  const leakPerimeterM = sidesOpen
    ? 2 * blockWidthM + 2 * blockLengthM            // all four edges
    : 2 * blockWidthM;                               // only front + back

  let hoverHeight;
  if (!floats || qIntoGap <= 0) {
    hoverHeight = 0;
  } else {
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
    // Check which regime we're in at each predicted height.
    const meanU = blockWidthM > 0 && hVisc > 0
      ? qIntoGap / (blockWidthM * hVisc)
      : 0;
    const reStar = modifiedFilmReynolds({
      uMps: meanU,
      hM: hVisc,
      lengthM: blockLengthM,
    });
    // Re* < 0.5 → viscous dominates; Re* > 5 → inertial dominates;
    // in between, take the larger (more conservative) prediction.
    hoverHeight = reStar < 0.5 ? hVisc : Math.max(hVisc, hInertial);
  }
  const hoverHeightMm = mToMm(hoverHeight);

  // ── Energy & cost ───────────────────────────────────────────────
  const aeroPower = pOp * qOp;
  // Estimated electrical draw at the current operating point.
  // Off-design operation lets the motor coast at its idle floor;
  // near the η_aero ceiling it draws full rated power.
  const fanIdleW = FAN_IDLE_DRAW_FRACTION * inputs.fanWatts;
  const fanElectricalDraw = Math.min(
    inputs.fanWatts,
    Math.max(fanIdleW, fanAeroEfficiency > 0 ? aeroPower / fanAeroEfficiency : fanIdleW),
  );
  const fanMotorEff = fanElectricalDraw > 0 ? (aeroPower / fanElectricalDraw) * 100 : 0;
  const qUseful = qOp * fractionUseful;
  const qWasted = qOp * (1 - fractionUseful);
  const powerUseful = pOp * qUseful;
  const powerWasted = pOp * qWasted;
  const powerMotorHeat = fanElectricalDraw - aeroPower;
  const geometricEff = fractionUseful * 100;
  const systemEff = fanElectricalDraw > 0 ? (powerUseful / fanElectricalDraw) * 100 : 0;
  const edgeLeakArea = 2 * blockWidthM * hoverHeight;
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
    hoverHeightMm,
    qIntoGap,

    aeroPower,
    fanMotorEff,
    qUseful,
    qWasted,
    powerUseful,
    powerWasted,
    powerMotorHeat,
    geometricEff,
    systemEff,
    minPracticalPower,
    powerRatio,

    costPerHour,
    costPer8Hrs,
  };
}

export { G, MU_AIR, NU_AIR, RHO };
