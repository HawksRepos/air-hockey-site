/**
 * Steady-state operating point of the fan + leakage system.
 *
 * The operating point is the (P, Q) at which the fan supply curve
 * crosses the system demand curve. We bracket the intersection between
 * 0 and the fan stall pressure and bisect to a tolerance.
 *
 * Holes covered by the floating block discharge to the under-block film
 * pressure P_film, not to atmosphere, so the system curve is the sum of
 * two orifice contributions: uncovered holes at ΔP = P, and covered
 * holes at ΔP = P − P_film.
 *
 * A real fan can only deliver aerodynamic output up to η_aero · P_elec
 * (the electrical input scaled by the achievable aero efficiency, ~30 %
 * for small AC induction duct fans). When the unconstrained intersection
 * implies more aero power than the fan can sustain, the operating point
 * is clamped to the curve  P · Q_system(P) = η_aero · P_elec.
 *
 * References:
 *   - Bernoulli orifice form: ISO 5167-1:2022; Idelchik (2007), §4.
 *   - Fan operating-point matching: any fluid-mechanics text;
 *     e.g. Çengel & Cimbala, *Fluid Mechanics*, Ch. 14.
 */

import { Cd as CD_DEFAULT, RHO } from './constants.js';
import { qOrifice } from './orifice.js';

/**
 * @typedef {object} OperatingPoint
 * @property {number} pOp        Plenum pressure [Pa].
 * @property {number} qOp        Volumetric flow [m³/s].
 * @property {number} iterations Bisection iterations used.
 * @property {number} residual   |Q_fan − Q_system| at solution [m³/s].
 * @property {boolean} powerLimited  True if the operating point was
 *                                   clamped by the fan power budget.
 * @property {boolean} stallLimited  True if the operating point would
 *                                   have required flow below the fan's
 *                                   minimum sustainable range.
 */

/** Bracket the upper bound where the fan stalls (Q_fan → 0). */
function findStallBracket(fanQFn, pStart = 3000, pCap = 50000) {
  let p = pStart;
  while (fanQFn(p) > 1e-4 && p < pCap) p *= 1.5;
  return p;
}

/**
 * Total system flow at plenum pressure P, accounting for the block.
 * Covered holes back-pressure to P_film; uncovered holes vent to
 * atmosphere.
 */
function systemFlow(pPa, { cd, aCovered, aUncovered, pFilmPa, rho }) {
  return (
    qOrifice(cd, aUncovered, pPa, rho) + qOrifice(cd, aCovered, pPa - pFilmPa, rho)
  );
}

/**
 * Solve the operating point.
 *
 * @param {object} args
 * @param {(p:number)=>number} args.fanQFn  Fan curve as Q(P) [m³/s ← Pa].
 * @param {number} args.aHoleM2             Single-hole area [m²].
 * @param {number} args.nCovered            Holes under the block.
 * @param {number} args.nUncovered          Holes outside the block.
 * @param {number} args.pFilmPa             Required film pressure [Pa].
 * @param {number} [args.fanWatts=Infinity] Fan electrical input [W].
 * @param {number} [args.fanAeroEfficiency=1] Maximum aero/electrical ratio.
 * @param {number} [args.minSustainableFlowFraction=0]  Smallest fraction
 *        of free-blow flow the fan can stably deliver. Below this the
 *        fan is in its unstable / stall regime — the operating point is
 *        clamped to (P @ Q_min, Q_min) and `stallLimited` is set true.
 * @param {object} [opts]
 * @param {number} [opts.cd=0.6]
 * @param {number} [opts.rho=RHO]
 * @param {number} [opts.tolPa=0.01]
 * @param {number} [opts.maxIter=200]
 * @returns {OperatingPoint}
 */
export function solveOperatingPoint(
  {
    fanQFn,
    aHoleM2,
    nCovered,
    nUncovered,
    pFilmPa = 0,
    fanWatts = Infinity,
    fanAeroEfficiency = 1,
    minSustainableFlowFraction = 0,
  },
  { cd = CD_DEFAULT, rho = RHO, tolPa = 0.01, maxIter = 200 } = {},
) {
  const aCovered = nCovered * aHoleM2;
  const aUncovered = nUncovered * aHoleM2;
  const aTotal = aCovered + aUncovered;
  if (aTotal <= 0) {
    return {
      pOp: 0,
      qOp: fanQFn(0),
      iterations: 0,
      residual: 0,
      powerLimited: false,
      stallLimited: false,
    };
  }

  const sysArgs = { cd, aCovered, aUncovered, pFilmPa, rho };

  // Free-blow flow at zero back-pressure — used to set the minimum
  // sustainable flow, below which the fan is in its stall regime and
  // the published curve is unreliable.
  const qFreeBlow = fanQFn(0);
  const qMinSustainable = minSustainableFlowFraction > 0
    ? minSustainableFlowFraction * qFreeBlow
    : 0;

  // ── 1. Unclamped fan-vs-system intersection (bisection on P) ──
  let pHigh = findStallBracket(fanQFn);
  let pLow = pFilmPa > 0 ? pFilmPa : 0;

  // If even the smallest viable plenum pressure already over-supplies
  // the system, drop to a no-block bracket starting at 0.
  if (fanQFn(pLow) <= systemFlow(pLow, sysArgs)) {
    pLow = 0;
  }

  let i = 0;
  while (pHigh - pLow > tolPa && i < maxIter) {
    const pMid = (pLow + pHigh) / 2;
    const qFan = fanQFn(pMid);
    const qSys = systemFlow(pMid, sysArgs);
    if (qFan > qSys) pLow = pMid;
    else pHigh = pMid;
    i += 1;
  }
  let pOp = (pLow + pHigh) / 2;
  let qOp = fanQFn(pOp);
  let powerLimited = false;
  let stallLimited = false;

  // ── 2. Power clamp ─────────────────────────────────────────────
  // Cap the operating point so that aerodynamic output cannot exceed
  // the fan's achievable aero power η · P_elec. Real centrifugal duct
  // fans rarely exceed ~30 % aero efficiency.
  const pAeroMax = fanAeroEfficiency * fanWatts;
  if (Number.isFinite(pAeroMax) && pAeroMax > 0 && pOp * qOp > pAeroMax) {
    powerLimited = true;
    // Find P on the system demand curve where P · Q_system(P) = P_aero_max.
    let lo = 0;
    let hi = pOp;
    let j = 0;
    while (hi - lo > tolPa && j < maxIter) {
      const mid = (lo + hi) / 2;
      const aero = mid * systemFlow(mid, sysArgs);
      if (aero < pAeroMax) lo = mid;
      else hi = mid;
      j += 1;
    }
    pOp = (lo + hi) / 2;
    qOp = systemFlow(pOp, sysArgs);
  }

  // ── 3. Stall clamp ─────────────────────────────────────────────
  // If the operating point would require less flow than the fan can
  // sustainably deliver, pin the flow to the minimum and find the
  // pressure the fan provides at that flow. Below the published
  // low-Q range the fan curve is unreliable so this is the safest
  // assumption.
  if (qMinSustainable > 0 && qOp < qMinSustainable) {
    stallLimited = true;
    // Find P where fanQFn(P) ≈ qMinSustainable (fan curve is monotonic
    // decreasing in P, so bisect over [0, stall bracket]).
    let lo = 0;
    let hi = findStallBracket(fanQFn);
    let j = 0;
    while (hi - lo > tolPa && j < maxIter) {
      const mid = (lo + hi) / 2;
      if (fanQFn(mid) > qMinSustainable) lo = mid;
      else hi = mid;
      j += 1;
    }
    pOp = (lo + hi) / 2;
    qOp = qMinSustainable;
    // Re-check the power clamp at the new operating point.
    if (Number.isFinite(pAeroMax) && pAeroMax > 0 && pOp * qOp > pAeroMax) {
      powerLimited = true;
      pOp = pAeroMax / qOp;
    }
  }

  const residual = Math.abs(qOp - systemFlow(pOp, sysArgs));
  return { pOp, qOp, iterations: i, residual, powerLimited, stallLimited };
}
