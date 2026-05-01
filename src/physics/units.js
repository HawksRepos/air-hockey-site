/**
 * Unit conversion helpers — single source of truth.
 *
 * Convention: every physics module operates in SI (m, kg, s, Pa, m³/s).
 * UI components convert to/from human units only at their own boundary
 * via these helpers — never with inline `/1000` arithmetic.
 */

/** Millimetres → metres. */
export const mmToM = (mm) => mm / 1000;

/** Metres → millimetres. */
export const mToMm = (m) => m * 1000;

/** Grams → kilograms. */
export const gToKg = (g) => g / 1000;

/** Cubic metres per hour → cubic metres per second. */
export const m3hToM3s = (q) => q / 3600;

/** Cubic metres per second → cubic metres per hour. */
export const m3sToM3h = (q) => q * 3600;

/**
 * Millimetres of water gauge → pascals.
 *
 * 1 mmH₂O = ρ_water × g × h with ρ_water = 1000 kg/m³ (4 °C) and
 * g = 9.81 m/s² → 9.81 Pa per mm. Held as its own constant rather than
 * `gravity × 1` so that updating g doesn't silently shift fan-curve
 * digitisations through an unrelated channel.
 */
export const MMWG_PA = 9.81;
export const mmwgToPa = (mmwg) => mmwg * MMWG_PA;

/** Pascals → millimetres of water gauge. */
export const paToMmwg = (pa) => pa / MMWG_PA;
