import { describe, expect, it } from 'vitest';
import { CD_TABLE, dischargeCoefficient } from '../dischargeCoefficient.js';

describe('dischargeCoefficient (short-tube Cd vs t/d)', () => {
  it('returns the thin-plate value 0.61 for t/d = 0', () => {
    expect(dischargeCoefficient(0, 0.003)).toBeCloseTo(0.61, 10);
  });

  it('returns ~0.78 at t/d = 1 (Lichtarowicz et al. 1965 fig. 4)', () => {
    expect(dischargeCoefficient(0.003, 0.003)).toBeCloseTo(0.78, 2);
  });

  it('asymptotes to ~0.82 for long tubes (t/d ≥ 3)', () => {
    expect(dischargeCoefficient(0.01, 0.003)).toBeCloseTo(0.82, 2);
    expect(dischargeCoefficient(0.05, 0.003)).toBeCloseTo(0.82, 2);
  });

  it('clamps below 0', () => {
    expect(dischargeCoefficient(-1, 0.003)).toBeCloseTo(0.61, 10);
  });

  it('default airhockey 2 mm strip × 3 mm hole gives Cd ≈ 0.73', () => {
    // t/d = 0.667, between 0.5 (0.73) and 1.0 (0.78) → ~0.7467
    const cd = dischargeCoefficient(0.002, 0.003);
    expect(cd).toBeGreaterThan(0.73);
    expect(cd).toBeLessThan(0.78);
  });

  it('table is monotonically non-decreasing', () => {
    for (let i = 1; i < CD_TABLE.length; i += 1) {
      expect(CD_TABLE[i][1]).toBeGreaterThanOrEqual(CD_TABLE[i - 1][1]);
    }
  });
});
