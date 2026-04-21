/**
 * Smoke + sign tests for the sensitivity helpers.
 *
 * We assert the *direction* of each elasticity (heavier mass → lower
 * headroom, larger holes → lower pressure, etc.) rather than its
 * magnitude: magnitudes depend on the operating regime and could shift
 * legitimately as the model evolves.
 */

import { describe, expect, it } from 'vitest';
import { sensitivity, sensitivityTable, tornado } from '../sensitivity.js';

const RIG = {
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
  fanAeroEfficiency: 1.0, // uncapped so sensitivities aren't masked by the power clamp
  costPerKwh: 0.245,
};

describe('sensitivity — single input/output', () => {
  it('pOp decreases as holeDia increases (larger leaks → lower plenum)', () => {
    const s = sensitivity(RIG, 'holeDiaMm', 'pOp');
    expect(s.elasticity).toBeLessThan(0);
  });

  it('pressureHeadroomPct falls with rising mass (heavier block is harder to lift)', () => {
    const s = sensitivity(RIG, 'massG', 'pressureHeadroomPct');
    expect(s.elasticity).toBeLessThan(0);
  });

  it('qOp rises with fanFlowM3h in the linear fan mode', () => {
    const s = sensitivity({ ...RIG, fanMode: 'linear' }, 'fanFlowM3h', 'qOp');
    expect(s.elasticity).toBeGreaterThan(0);
  });

  it('returns NaN for a zero baseline input', () => {
    const s = sensitivity({ ...RIG, inletLossK: 0 }, 'inletLossK', 'pOp');
    expect(Number.isNaN(s.elasticity)).toBe(true);
  });
});

describe('tornado', () => {
  it('returns rows sorted by decreasing |elasticity|', () => {
    const rows = tornado(RIG, 'hoverHeightMm');
    for (let i = 1; i < rows.length; i += 1) {
      expect(Math.abs(rows[i - 1].elasticity)).toBeGreaterThanOrEqual(Math.abs(rows[i].elasticity));
    }
  });

  it('omits inputs with non-finite elasticity', () => {
    const rows = tornado({ ...RIG, blockWidthMm: 0 }, 'pOp');
    expect(rows.every((r) => Number.isFinite(r.elasticity))).toBe(true);
  });
});

describe('sensitivityTable', () => {
  it('produces one row per requested output', () => {
    const table = sensitivityTable(RIG, ['pOp', 'hoverHeightMm']);
    expect(Object.keys(table)).toEqual(['pOp', 'hoverHeightMm']);
    expect(table.pOp.length).toBeGreaterThan(0);
    expect(table.hoverHeightMm.length).toBeGreaterThan(0);
  });
});
