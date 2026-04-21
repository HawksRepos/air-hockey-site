/**
 * Compressibility guard for the incompressible orifice model.
 *
 * The Bernoulli orifice equation Q = Cd·A·√(2ΔP/ρ) assumes the flow
 * is effectively incompressible — density changes through the orifice
 * are negligible. This assumption holds when the Mach number at the
 * orifice is small, conventionally M ≤ 0.3 (Y-factor correction
 * remains ≲ 5 %). Above that, the ISO 5167 expansibility factor Y
 * should scale the mass-flow prediction down.
 *
 * For the air-hockey rig the plenum pressure is typically 200-1500 Pa,
 * giving a hole velocity of 18-50 m/s and Mach 0.05-0.15 — well inside
 * the incompressible regime. This module is a safety net: if a user
 * drives the tool to extreme inputs (tiny holes, huge fan, heavy
 * block), the result flags a compressibility warning rather than
 * silently mispredicting.
 *
 * References:
 *   - ISO 5167-1:2022 §5.3.2, expansibility (Y-factor) definition.
 *   - Idelchik (2007), §4.5 — regimes of applicability of orifice
 *     discharge coefficients, including Mach effects.
 */

/** Speed of sound in dry air at 20 °C, 1 atm [m/s]. */
export const SOUND_SPEED_MPS = 343;

/**
 * Conventional threshold above which compressibility corrections
 * exceed ~5 % and the incompressible form becomes unsafe.
 */
export const COMPRESSIBILITY_MACH_THRESHOLD = 0.3;

/**
 * Mach number at a given velocity (dimensionless).
 * @param {number} velocityMps Fluid speed [m/s].
 * @param {number} [aMps=SOUND_SPEED_MPS] Reference speed of sound [m/s].
 * @returns {number} M = v / a.
 */
export function mach(velocityMps, aMps = SOUND_SPEED_MPS) {
  if (!(aMps > 0)) return 0;
  return Math.max(0, velocityMps) / aMps;
}

/**
 * ISO 5167 expansibility factor Y for a sharp-edged orifice in
 * subsonic compressible flow. Returns 1 in the incompressible limit.
 *
 * Y ≈ 1 − (0.41 + 0.35 β⁴) · (ΔP / (κ·P₁))   [ISO 5167-1 §5.3.2]
 *
 * where β is the diameter ratio (hole/pipe — taken as 0 for our
 * plenum-to-atmosphere geometry, which makes the bracket 0.41),
 * κ is the ratio of specific heats (1.40 for air), and P₁ is the
 * upstream absolute pressure.
 *
 * @param {number} dPPa  Pressure drop across the orifice [Pa].
 * @param {number} [p1Pa=101325] Upstream absolute pressure [Pa].
 * @param {number} [kappa=1.40]  Ratio of specific heats.
 * @param {number} [beta=0]      Diameter ratio (hole / upstream line).
 * @returns {number} Y in [0, 1].
 */
export function expansibilityFactor(dPPa, p1Pa = 101325, kappa = 1.4, beta = 0) {
  if (!(dPPa > 0) || !(p1Pa > 0) || !(kappa > 0)) return 1;
  const y = 1 - (0.41 + 0.35 * beta ** 4) * (dPPa / (kappa * p1Pa));
  return Math.max(0, Math.min(1, y));
}

/**
 * Classify an operating velocity against the incompressible assumption.
 *
 * @param {number} velocityMps Hole velocity at the operating point [m/s].
 * @returns {{mach: number, compressibilityWarning: boolean, regime: 'incompressible'|'compressible'|'choked'}}
 */
export function compressibilityState(velocityMps) {
  const m = mach(velocityMps);
  let regime;
  if (m >= 1) regime = 'choked';
  else if (m >= COMPRESSIBILITY_MACH_THRESHOLD) regime = 'compressible';
  else regime = 'incompressible';
  return {
    mach: m,
    compressibilityWarning: m >= COMPRESSIBILITY_MACH_THRESHOLD,
    regime,
  };
}
