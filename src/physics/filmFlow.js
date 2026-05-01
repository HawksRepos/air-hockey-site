/**
 * Thin-film (lubrication) flow under a hovering block.
 *
 * For a parallel-plate film of length L (along strip) and width W
 * (across strip) with a uniform inflow source Q'_in (volume per area)
 * and atmospheric pressure on all four edges (open-gutter rig), the
 * 2-D Reynolds lubrication equation reduces to a Poisson problem:
 *
 *     ∇²P = − 12 μ Q'_in / h³ ,        on [0, L] × [0, W]
 *     P = 0                             on the boundary
 *
 * (Hamrock 2004, Ch. 7, eq. 7.49 with constant film height and a
 * source term from the under-block orifice array.)
 *
 * The Fourier-sine series solution is
 *
 *     P(x, y) = (48 μ Q'_in)/(h³ π⁴) ·
 *               Σ_{m,n odd} sin(mπx/L) sin(nπy/W)
 *                           / [ m n ( (m/L)² + (n/W)² ) ]
 *
 * Integrating P over the carriage footprint gives the load capacity:
 *
 *     F = ∫∫ P dA = (192 μ Q_in S(L,W)) / (h³ π⁶) ,
 *     S(L,W) = Σ_{m,n odd}  1 / [ m² n² ( (m/L)² + (n/W)² ) ] .
 *
 * Force balance F = m g pins P_avg = F / A and we solve for the gap:
 *
 *     h = ∛( 192 μ Q_in S(L,W) / ( π⁶ · F ) ) .
 *
 * Limiting behaviour:
 *   - Square (L = W = a):   h = ∛(0.105 · μ Q_in / P_avg)
 *   - Long  (L ≫ W):        h → ∛(μ W Q_in / (L · P_avg))
 *                           (the leading (1, n=odd) modes dominate).
 *
 * The 1-D simplification h = ∛(3 μ L Q_in / (W P)) — sourceless film
 * with linear pressure decay across L — over-predicts h by a factor
 * of ∛3 (square plate) up to ~3× (highly elongated, wrong leak axis),
 * and is not used here.
 *
 * Validity:
 *   - h ≪ L, W   (thin-film, lubrication assumption).
 *   - h ≫ molecular mean free path ≈ 70 nm at STP   (continuum).
 *   - Modified Reynolds number Re* = ρ U h² / (μ L) ≪ 1   (Stokes).
 *   - Above Re* ≈ 1, the inertial edge-gap formula governs instead.
 *
 * Reference:
 *   Hamrock, B. J. (2004). Fundamentals of Fluid Film Lubrication,
 *   2nd ed., CRC Press. Ch. 7 (Reynolds equation, parallel-plate film).
 */

import { MU_AIR, RHO } from './constants.js';

/**
 * Series shape factor S(L, W) for a uniformly-fed rectangular film
 * with all four edges at atmospheric pressure.
 *
 * Truncated at `terms` odd modes per axis. 25 modes converges to
 * < 0.1 % over the aspect-ratio range we care about.
 *
 * @param {number} lengthM
 * @param {number} widthM
 * @param {number} [terms=25]  Largest odd index used.
 * @returns {number}  S(L,W) [m²]
 */
export function viscousShapeFactor(lengthM, widthM, terms = 25) {
  let s = 0;
  const invL2 = 1 / (lengthM * lengthM);
  const invW2 = 1 / (widthM * widthM);
  for (let m = 1; m <= terms; m += 2) {
    for (let n = 1; n <= terms; n += 2) {
      s += 1 / (m * m * n * n * (m * m * invL2 + n * n * invW2));
    }
  }
  return s;
}

/**
 * Equilibrium hover height from the 2-D Reynolds lubrication equation.
 *
 * Inputs are the carriage geometry, the steady volumetric inflow into
 * the film, and the average film pressure required for force balance
 * (P_avg = m g / A). Returns the gap height that makes the boundary
 * leakage at the four edges equal Q_in.
 *
 * @param {object} args
 * @param {number} args.qIn       Volumetric inflow into film [m³/s].
 * @param {number} args.lengthM   Carriage length [m].
 * @param {number} args.widthM    Carriage width [m].
 * @param {number} args.pFilmPa   Average film pressure F/A [Pa].
 * @param {number} [args.muPas=MU_AIR] Dynamic viscosity [Pa·s].
 * @returns {number} Gap height [m]; 0 if any input is non-positive.
 */
export function hoverHeightViscous({ qIn, lengthM, widthM, pFilmPa, muPas = MU_AIR }) {
  if (qIn <= 0 || lengthM <= 0 || widthM <= 0 || pFilmPa <= 0) return 0;
  const F = pFilmPa * lengthM * widthM; // load capacity = average pressure × area
  const S = viscousShapeFactor(lengthM, widthM);
  const PI6 = Math.PI ** 6;
  const h3 = (192 * muPas * qIn * S) / (PI6 * F);
  return Math.cbrt(h3);
}

/**
 * Inertial (Bernoulli) hover height for the edge gap.
 *
 * When the film Reynolds number Re* = ρUh²/(μL) ≳ 1, viscous shear in
 * the film is no longer the binding constraint; instead, the air
 * accelerates from film pressure to atmosphere across the perimeter
 * gap. Bernoulli through the slot:
 *
 *     v_exit = √(2 P_film / ρ)
 *     Q_out  = C_{d,gap} · L_perim · h · v_exit
 *
 * Setting Q_out = Q_in and solving for h:
 *
 *     h = Q_in / (C_{d,gap} · L_perim · √(2 P_film / ρ)) .
 *
 * @param {object} args
 * @param {number} args.qIn          Inflow into film [m³/s].
 * @param {number} args.perimeterM   Total leaking perimeter [m].
 * @param {number} args.pFilmPa      Average film pressure [Pa].
 * @param {number} [args.cdGap=0.6]  Discharge coefficient for the gap.
 * @param {number} [args.rho=RHO]    Air density [kg/m³].
 * @returns {number} Hover height [m]; 0 if non-positive inputs.
 */
export function hoverHeightInertial({ qIn, perimeterM, pFilmPa, cdGap = 0.6, rho = RHO }) {
  if (qIn <= 0 || perimeterM <= 0 || pFilmPa <= 0) return 0;
  const vEscape = Math.sqrt((2 * pFilmPa) / rho);
  return qIn / (cdGap * perimeterM * vEscape);
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
