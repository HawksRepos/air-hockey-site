/**
 * Discharge coefficient for short-tube / drilled-hole orifices.
 *
 * For a thin-plate sharp-edged orifice (t/d → 0) the textbook value is
 * Cd ≈ 0.61.  As the plate thickness `t` approaches and exceeds the hole
 * diameter `d`, the contraction reattaches to the hole wall and Cd rises
 * toward the long-tube asymptote ≈ 0.82.
 *
 * Tabulated values from:
 *   Lichtarowicz, A.; Duggins, R. K.; Markland, E. (1965).
 *   "Discharge coefficients for incompressible non-cavitating flow
 *    through long orifices." J. Mech. Eng. Sci. 7(2):210–219, fig. 4.
 * Cross-checked with Idelchik, Handbook of Hydraulic Resistance (3rd ed.),
 *   table 4-19 (drilled hole in thick wall, sharp inlet).
 *
 * The tabulated values assume fully turbulent flow inside the hole
 * (Re_d ≳ 2000). At smaller Reynolds numbers viscous effects dominate
 * and Cd drops toward zero — captured by `reynoldsFactor()` below.
 *
 * Reference for the Re correction:
 *   Idelchik §4.5, fig. 4-19 (Cd vs Re for sharp-edged orifices).
 *   Approximated here with a smooth piecewise interpolation matching
 *   Idelchik's tabulated points to within ±5 %.
 */

const TABLE = [
  // [t/d, Cd]
  [0.0, 0.61],
  [0.5, 0.73],
  [1.0, 0.78],
  [1.5, 0.8],
  [2.0, 0.81],
  [3.0, 0.82],
  [5.0, 0.82],
];

/**
 * Linear-interpolated discharge coefficient as a function of t/d.
 * Clamps below 0 and above the largest tabulated point.
 *
 * @param {number} thicknessM Plate thickness [m].
 * @param {number} diameterM Hole diameter [m].
 * @returns {number} Discharge coefficient (dimensionless).
 */
export function dischargeCoefficient(thicknessM, diameterM) {
  if (!(diameterM > 0)) return TABLE[0][1];
  const ratio = thicknessM / diameterM;
  if (ratio <= TABLE[0][0]) return TABLE[0][1];
  if (ratio >= TABLE[TABLE.length - 1][0]) return TABLE[TABLE.length - 1][1];
  for (let i = 0; i < TABLE.length - 1; i += 1) {
    const [r0, c0] = TABLE[i];
    const [r1, c1] = TABLE[i + 1];
    if (ratio >= r0 && ratio <= r1) {
      const t = (ratio - r0) / (r1 - r0);
      return c0 + t * (c1 - c0);
    }
  }
  return TABLE[TABLE.length - 1][1]; // unreachable
}

/** Exposed for tests / UI inspection. */
export const CD_TABLE = TABLE;

/**
 * Reynolds-number correction factor for the discharge coefficient.
 *
 * The Lichtarowicz Cd table assumes fully-turbulent orifice flow
 * (Re_d ≳ 10⁴). Below that the contraction never fully forms and
 * viscous losses through the short tube grow, so the effective Cd
 * drops smoothly. The asymptote at low Re is the Hagen-Poiseuille
 * limit for axial viscous flow through a short cylinder.
 *
 * We interpolate piecewise-linearly through tabulated values fitted
 * to Idelchik (2007) §4.5 fig. 4-19 (sharp-edged orifice, ξ vs Re,
 * converted to Cd via Cd = 1/√(1+ξ)). The intermediate-Re points
 * agree with Lichtarowicz et al. (1965) tab. 1 within ~5 %.
 *
 *   Re   factor    notes
 *   ────────────────────────────────────────
 *   1     0.05    Stokes regime, Cd → Hagen-Poiseuille limit
 *   10    0.30
 *   30    0.50
 *   100   0.66    transitional
 *   300   0.78
 *   1000  0.86    near-turbulent
 *   3000  0.93
 *   10000 0.97    fully turbulent (Cd ≈ Cd_geom)
 *   ∞     1.00
 *
 * For Re below the smallest tabulated point we extrapolate linearly
 * to (0, 0) so the orifice closes off cleanly as flow ceases.
 *
 * References:
 *   - Idelchik (2007). Handbook of Hydraulic Resistance, 3rd ed.
 *     Begell House. §4.5, fig. 4-19.
 *   - Lichtarowicz, Duggins & Markland (1965), J. Mech. Eng. Sci.
 *     7(2):210-219, table 1 (Cd vs Re for L/d = 2-10).
 *
 * @param {number} reynolds Hole Reynolds number Re = v·d/ν.
 * @returns {number} Multiplier in [0, 1].
 */
const RE_FACTOR_TABLE = [
  [0, 0.0],
  [1, 0.05],
  [10, 0.3],
  [30, 0.5],
  [100, 0.66],
  [300, 0.78],
  [1000, 0.86],
  [3000, 0.93],
  [10000, 0.97],
  [30000, 0.99],
  [1e6, 1.0],
];

export function reynoldsFactor(reynolds) {
  if (!(reynolds > 0)) return 0;
  if (reynolds >= RE_FACTOR_TABLE[RE_FACTOR_TABLE.length - 1][0]) return 1;
  for (let i = 0; i < RE_FACTOR_TABLE.length - 1; i += 1) {
    const [r0, f0] = RE_FACTOR_TABLE[i];
    const [r1, f1] = RE_FACTOR_TABLE[i + 1];
    if (reynolds >= r0 && reynolds <= r1) {
      const t = (reynolds - r0) / (r1 - r0);
      return f0 + t * (f1 - f0);
    }
  }
  return 1;
}

export const RE_FACTOR_TABLE_DATA = RE_FACTOR_TABLE;
