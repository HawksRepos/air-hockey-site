/**
 * Thin-film (lubrication) flow under a hovering block.
 *
 * For air-bearing gap heights (h ≪ 1 mm) the air is in the viscous
 * Stokes regime: pressure gradient is balanced by shear, not by inertia.
 * The 1-D Reynolds lubrication equation gives, for a parallel-plate
 * film of length L (flow direction) and width W (across) with gauge
 * pressure P_film at the centreline falling linearly to zero at both
 * short edges,
 *
 *     Q_side = h³ · W · P_film / ( 6 · μ · L )
 *     Q_film = 2 · Q_side = h³ · W · P_film / ( 3 · μ · L )
 *
 * (the factor 6 = 12 / 2 because each side discharges over a path of
 * length L/2). Solving for h:
 *
 *     h = ∛( 3 · μ · L · Q_in / ( W · P_film ) )
 *
 * Reference:
 *   Hamrock, B. J. (2004). Fundamentals of Fluid Film Lubrication,
 *   2nd ed., CRC Press, Ch. 7.
 *
 * Validity:
 *   - h ≪ L, W   (long-thin film, 1-D approximation valid)
 *   - h ≫ molecular mean free path ≈ 70 nm at STP   (continuum)
 *   - Modified Reynolds number Re* = ρ U h² / (μ L) ≪ 1   (Stokes flow)
 *   - Side walls assumed leak-tight; flow exits the two short edges only.
 */

import { MU_AIR, RHO } from './constants.js';

/**
 * Inertial (Bernoulli) hover height for the edge gap.
 *
 * When the gap is large enough that the modified Reynolds number Re* > 1,
 * the flow escaping under the block edges is dominated by inertia, not
 * viscosity. The air accelerates from the under-block film pressure to
 * atmosphere through the edge gap, and the classic orifice formula applies:
 *
 *     Q_out = Cd_gap × A_gap × √(2 P_film / ρ)
 *
 * where A_gap is the total edge-gap cross-section. Solving for h:
 *
 *     h = Q_in / (Cd_gap × L_perimeter × √(2 P_film / ρ))
 *
 * @param {object} args
 * @param {number} args.qIn          Inflow through covered holes [m³/s].
 * @param {number} args.perimeterM   Total leaking perimeter [m] — sum of
 *                                    all edges where air can escape.
 * @param {number} args.pFilmPa      Film gauge pressure [Pa].
 * @param {number} [args.cdGap=0.6]  Discharge coefficient for the edge gap.
 * @param {number} [args.rho=RHO]    Air density [kg/m³].
 * @returns {number} Hover height [m]; 0 if non-positive inputs.
 */
export function hoverHeightInertial({ qIn, perimeterM, pFilmPa, cdGap = 0.6, rho = RHO }) {
  if (qIn <= 0 || perimeterM <= 0 || pFilmPa <= 0) return 0;
  const vEscape = Math.sqrt((2 * pFilmPa) / rho);
  return qIn / (cdGap * perimeterM * vEscape);
}

/**
 * Equilibrium hover height from the Reynolds lubrication equation.
 *
 * @param {object} args
 * @param {number} args.qIn       Volumetric inflow through covered holes [m³/s].
 * @param {number} args.lengthM   Block length in flow direction [m].
 * @param {number} args.widthM    Block width perpendicular to flow [m].
 * @param {number} args.pFilmPa   Gauge pressure under block [Pa].
 * @param {number} [args.muPas=MU_AIR] Dynamic viscosity [Pa·s].
 * @returns {number} Hover height [m]; 0 if any input non-positive.
 */
export function hoverHeightViscous({ qIn, lengthM, widthM, pFilmPa, muPas = MU_AIR }) {
  if (qIn <= 0 || lengthM <= 0 || widthM <= 0 || pFilmPa <= 0) return 0;
  const numerator = 3 * muPas * lengthM * qIn;
  const denominator = widthM * pFilmPa;
  return Math.cbrt(numerator / denominator);
}

/**
 * Modified Reynolds number for the thin film:
 *   Re* = ρ U h² / (μ L)
 * Used as a sanity check that the Stokes regime is appropriate (Re* ≪ 1).
 */
export function modifiedFilmReynolds({ uMps, hM, lengthM, rho = RHO, muPas = MU_AIR }) {
  if (lengthM <= 0 || muPas <= 0) return 0;
  return (rho * uMps * hM * hM) / (muPas * lengthM);
}
