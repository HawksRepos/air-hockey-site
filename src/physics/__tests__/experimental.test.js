/**
 * Model-vs-experiment tests.
 *
 * Loads `docs/experiments/hover_vs_mass.csv` directly from disk (via
 * `node:fs`, not the Vite-specific `?raw` import in `experiments.js`)
 * and compares model predictions to measured means.
 *
 * Behaviour in two regimes:
 *
 *   (a) CSV empty — before Stream A rig data is captured. The parser
 *       returns []; we assert only that the file exists and reports as
 *       empty. The suite stays green so CI doesn't redden from lack of
 *       measurements.
 *
 *   (b) CSV populated — strict pass/fail: every measured point must
 *       agree with the model's prediction within `HOVER_TOLERANCE_MM`,
 *       and the RMS residual must be below `RMS_TOLERANCE_MM`. Tighten
 *       both constants after calibration lands if we want tighter
 *       gates.
 *
 * When this test fails after measurements land, the next steps are:
 *   1. Run `npm run calibrate` to see if re-fitting closes the gap.
 *   2. Check docs/MODEL.md §6 for an out-of-envelope point.
 *   3. Investigate specific outliers before loosening the tolerance.
 */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { COERCIONS, aggregateHoverByMass, parseCsv } from '../../data/csvParser.js';
import { computeAirHockey } from '../computeAirHockey.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSV_PATH = resolve(__dirname, '../../../docs/experiments/hover_vs_mass.csv');

// Tighten these once the calibrated model lands.
const HOVER_TOLERANCE_MM = 1.5;
const RMS_TOLERANCE_MM = 1.0;

// Rig configuration captured in docs/experiments/rig_config.md. When the
// rig setup changes (e.g. new hole diameter), update this block.
const RIG = {
  blockLengthMm: 110,
  blockWidthMm: 100,
  stripLengthMm: 2000,
  stripWidthMm: 110,
  holeDiaMm: 2.0,
  spacingMm: 20,
  rows: 4,
  stripThicknessMm: 2.0,
  fanMode: 'linear',
  fanFlowM3h: 762,
  fanPmaxPa: 1200,
  fanWatts: 300,
  fanAeroEfficiency: 0.2,
  costPerKwh: 0.245,
};

function loadAggregated() {
  if (!existsSync(CSV_PATH)) return [];
  const rows = parseCsv(readFileSync(CSV_PATH, 'utf8'), COERCIONS.hover_vs_mass);
  return aggregateHoverByMass(rows);
}

describe('experimental validation — hover_vs_mass', () => {
  const measurements = loadAggregated();

  it('CSV exists', () => {
    expect(existsSync(CSV_PATH)).toBe(true);
  });

  if (measurements.length === 0) {
    it.skip('(awaiting rig capture — see docs/experiments/rig_config.md)', () => {});
    return;
  }

  it.each(measurements)(
    'predicts $mass_g g within tolerance',
    ({ mass_g, mean_mm }) => {
      const predicted = computeAirHockey({ ...RIG, massG: mass_g }).hoverHeightMm;
      expect(Math.abs(predicted - mean_mm)).toBeLessThanOrEqual(HOVER_TOLERANCE_MM);
    },
  );

  it('RMS residual stays below tolerance', () => {
    const sumSq = measurements.reduce((s, pt) => {
      const predicted = computeAirHockey({ ...RIG, massG: pt.mass_g }).hoverHeightMm;
      return s + (predicted - pt.mean_mm) ** 2;
    }, 0);
    const rms = Math.sqrt(sumSq / measurements.length);
    expect(rms).toBeLessThanOrEqual(RMS_TOLERANCE_MM);
  });
});
