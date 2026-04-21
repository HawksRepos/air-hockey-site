/**
 * Pure CSV helpers for the experimental datasets.
 *
 * Separated from `experiments.js` (which performs Vite-specific `?raw`
 * imports and therefore can't load in a Node test environment) so the
 * parsing logic is unit-testable.
 *
 * Not a full RFC 4180 implementation — it does not support embedded
 * commas in quoted fields. If experimental CSVs ever need that, swap
 * in a proper parser (e.g. `papaparse`) and keep this contract.
 */

/**
 * Parse a CSV text blob into an array of objects.
 *
 * Skips comment lines (leading `#`), blank lines, and any row whose
 * first cell equals `SAMPLE` (used as a placeholder before real data
 * is captured — see `docs/experiments/`).
 *
 * @param {string} text                     Raw CSV text.
 * @param {Set<string>} [numericColumns]    Columns to coerce to number.
 *                                          Others are left as strings.
 * @returns {Array<Record<string, string|number|null>>}
 */
export function parseCsv(text, numericColumns = new Set()) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'));
  if (lines.length < 2) return [];
  const header = lines[0].split(',').map((h) => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cells = lines[i].split(',').map((c) => c.trim());
    if (cells[0]?.toUpperCase() === 'SAMPLE') continue;
    const obj = {};
    for (let j = 0; j < header.length; j += 1) {
      const col = header[j];
      const raw = cells[j] ?? '';
      if (numericColumns.has(col)) {
        const n = Number(raw);
        obj[col] = Number.isFinite(n) ? n : null;
      } else {
        obj[col] = raw;
      }
    }
    rows.push(obj);
  }
  return rows;
}

/**
 * Aggregate per-repeat hover-vs-mass rows into {mass, mean, std, n}.
 *
 * @param {ReturnType<typeof parseCsv>} rows
 * @returns {Array<{mass_g: number, mean_mm: number, std_mm: number, n: number}>}
 */
export function aggregateHoverByMass(rows) {
  const byMass = new Map();
  for (const r of rows) {
    const mass = Number(r.mass_g);
    const h = Number(r.hover_mm_mean);
    if (!Number.isFinite(mass) || !Number.isFinite(h)) continue;
    const bucket = byMass.get(mass) ?? { sum: 0, sumSq: 0, n: 0 };
    bucket.sum += h;
    bucket.sumSq += h * h;
    bucket.n += 1;
    byMass.set(mass, bucket);
  }
  const out = [];
  for (const [mass_g, { sum, sumSq, n }] of byMass) {
    const mean = sum / n;
    const variance = n > 1 ? (sumSq - (sum * sum) / n) / (n - 1) : 0;
    out.push({ mass_g, mean_mm: mean, std_mm: Math.sqrt(Math.max(0, variance)), n });
  }
  out.sort((a, b) => a.mass_g - b.mass_g);
  return out;
}

/**
 * Numeric-column sets for each of the experimental CSV files.
 * Keep in sync with the header comment in each `docs/experiments/*.csv`.
 */
export const COERCIONS = Object.freeze({
  fan_curve: new Set(['p_plenum_pa', 'p_plenum_uncertainty_pa', 'q_m3h', 'q_uncertainty_m3h']),
  hover_vs_mass: new Set([
    'mass_g',
    'mass_uncertainty_g',
    'hover_mm_front',
    'hover_mm_mid',
    'hover_mm_rear',
    'hover_mm_mean',
    'repeat_index',
  ]),
  plenum_pressure: new Set(['mass_g', 'p_plenum_pa', 'p_plenum_uncertainty_pa', 'repeat_index']),
});
