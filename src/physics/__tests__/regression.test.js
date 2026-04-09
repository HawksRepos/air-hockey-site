/**
 * Regression snapshot for the calculator's default-input outputs.
 *
 * Locks the high-precision result of computeAirHockey() against the
 * default rig configuration so that future refactors which are supposed
 * to be behaviour-preserving cannot silently shift the numbers. When a
 * snapshot drift is intentional, regenerate with `vitest -u` and explain
 * the change in the commit message.
 */

import { describe, expect, it } from 'vitest';
import { computeAirHockey } from '../computeAirHockey.js';

const DEFAULT_INPUTS = {
  massG: 300,
  blockLengthMm: 120,
  blockWidthMm: 100,
  stripLengthMm: 2000,
  stripWidthMm: 110,
  holeDiaMm: 3.5,
  spacingMm: 20,
  rows: 4,
  stripThicknessMm: 3.0,
  fanMode: 'curve',
  fanFlowM3h: 420,
  fanPmaxPa: 2747,
  fanWatts: 80,
  fanAeroEfficiency: 0.3,
  costPerKwh: 0.245,
};

/** Round to a fixed number of significant figures for stable snapshots. */
function sig(x, n = 8) {
  if (!Number.isFinite(x)) return x;
  if (x === 0) return 0;
  const m = Math.pow(10, n - 1 - Math.floor(Math.log10(Math.abs(x))));
  return Math.round(x * m) / m;
}

function snapshot(result) {
  const out = {};
  for (const k of Object.keys(result).sort()) {
    out[k] = typeof result[k] === 'number' ? sig(result[k]) : result[k];
  }
  return out;
}

describe('regression — default rig configuration', () => {
  it('matches the locked snapshot', () => {
    const r = computeAirHockey(DEFAULT_INPUTS);
    expect(snapshot(r)).toMatchSnapshot();
  });

  it('total holes = floor(2000/20) × 4 = 400', () => {
    const r = computeAirHockey(DEFAULT_INPUTS);
    expect(r.totalHoles).toBe(400);
  });

  it('aerodynamic output is capped at η · P_elec when the clamp engages', () => {
    const r = computeAirHockey(DEFAULT_INPUTS);
    const cap = DEFAULT_INPUTS.fanAeroEfficiency * DEFAULT_INPUTS.fanWatts;
    expect(r.aeroPower).toBeLessThanOrEqual(cap + 1e-3);
  });

  it('floats with default 300 g payload but fails near the experimental limit', () => {
    const r = computeAirHockey(DEFAULT_INPUTS);
    const heavy = computeAirHockey({ ...DEFAULT_INPUTS, massG: 600 });
    // The clamp brings the calculator into the same ballpark as the
    // measured rig: fails somewhere between ~300 g and ~600 g.
    expect(r.floats).toBe(true);
    expect(heavy.floats).toBe(false);
  });
});
