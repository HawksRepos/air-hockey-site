/**
 * Lumped pressure loss between the fan outlet and the plenum.
 *
 * Duct bends, sudden expansions, screens, and grills all shed total
 * pressure as dynamic head:
 *
 *     ΔP_loss = K · ½ ρ v²
 *
 * where K is the dimensionless loss coefficient for the geometry and
 * v is the duct-line velocity (Idelchik 2007, §2). For a centrifugal
 * blower feeding a guttering plenum through a short flexible hose,
 * K is typically 0.5-1.5 (one or two 90° bends plus a diffuser); for
 * an open-gutter rig with no duct at all, K → 0.
 *
 * Composition with the fan curve. The published fan curve is
 * Q_fan(P_fan) at the fan outlet. For a given plenum pressure
 * P_plenum, the fan must deliver an *outlet* pressure of
 *
 *     P_fan = P_plenum + ΔP_loss(Q)
 *
 * where Q is the flow we are solving for. This is implicit in Q, so we
 * solve by fixed-point iteration: start from Q₀ = Q_fan(P_plenum),
 * update P_fan, recompute Q₁, and iterate. Converges in a handful of
 * steps because ΔP_loss ∝ Q² and the fan curve is nearly linear over
 * the small excursions we care about.
 *
 * Reference:
 *   Idelchik, I. E. (2007). Handbook of Hydraulic Resistance, 3rd ed.,
 *   Begell House. §2 — loss coefficients for pipe fittings, bends, and
 *   expansions. §4 — grills and screens.
 */

import { RHO } from './constants.js';

/**
 * Wrap a fan Q(P) function with a downstream inlet loss ΔP_loss = K·½ρv².
 *
 * When `K` or `ductAreaM2` is zero/undefined, the original function is
 * returned unchanged — no composition, no iteration.
 *
 * @param {(pPa:number)=>number} fanQFn  Raw fan curve [m³/s ← Pa].
 * @param {object} opts
 * @param {number} opts.K            Loss coefficient (dimensionless).
 * @param {number} opts.ductAreaM2   Cross-section used for duct velocity [m²].
 * @param {number} [opts.rho=RHO]    Air density [kg/m³].
 * @param {number} [opts.tolQ=1e-6]  Convergence tolerance in Q [m³/s].
 * @param {number} [opts.maxIter=20] Max fixed-point iterations.
 * @returns {(pPlenumPa:number)=>number}
 */
export function withInletLoss(
  fanQFn,
  { K = 0, ductAreaM2 = 0, rho = RHO, tolQ = 1e-6, maxIter = 20 } = {},
) {
  if (!(K > 0) || !(ductAreaM2 > 0)) return fanQFn;
  return (pPlenumPa) => {
    let q = fanQFn(pPlenumPa);
    for (let i = 0; i < maxIter; i += 1) {
      const v = q / ductAreaM2;
      const dPLoss = K * 0.5 * rho * v * v;
      const qNext = fanQFn(pPlenumPa + dPLoss);
      if (Math.abs(qNext - q) < tolQ) return qNext;
      q = qNext;
    }
    return q;
  };
}

/**
 * Pressure drop from inlet losses at a given volumetric flow.
 * Useful for the UI to show "N Pa lost to duct" next to the operating point.
 *
 * @param {number} qM3s           Volumetric flow [m³/s].
 * @param {object} opts
 * @param {number} opts.K         Loss coefficient.
 * @param {number} opts.ductAreaM2 Duct cross-section [m²].
 * @param {number} [opts.rho=RHO] Air density [kg/m³].
 * @returns {number} ΔP_loss [Pa]. Zero when K or area is zero.
 */
export function inletLossPa(qM3s, { K = 0, ductAreaM2 = 0, rho = RHO } = {}) {
  if (!(K > 0) || !(ductAreaM2 > 0) || !(qM3s > 0)) return 0;
  const v = qM3s / ductAreaM2;
  return K * 0.5 * rho * v * v;
}
