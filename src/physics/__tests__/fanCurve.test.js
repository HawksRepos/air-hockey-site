import { describe, expect, it } from 'vitest';
import { fanCurveQ, linearFanQ } from '../fanCurve.js';
import { FAN_CURVE_C, FAN_CURVE_C_RAW } from '../../data/manroseMan150m.js';
import { mmwgToPa, m3hToM3s } from '../units.js';

describe('fanCurveQ (Manrose MAN150M curve C)', () => {
  it('returns 0 at or above shut-off pressure', () => {
    expect(fanCurveQ(FAN_CURVE_C[0].p, FAN_CURVE_C)).toBe(0);
    expect(fanCurveQ(FAN_CURVE_C[0].p + 1, FAN_CURVE_C)).toBe(0);
  });

  it('returns Q_max (free-blow) at zero pressure', () => {
    expect(fanCurveQ(0, FAN_CURVE_C)).toBeCloseTo(m3hToM3s(420), 12);
  });

  it('hits each digitised point exactly', () => {
    for (const raw of FAN_CURVE_C_RAW) {
      const pPa = mmwgToPa(raw.p);
      const expected = m3hToM3s(raw.q);
      // Endpoints clamp; interior points must interpolate exactly.
      if (raw.p === 280) continue;
      if (raw.p === 0) continue;
      expect(fanCurveQ(pPa, FAN_CURVE_C)).toBeCloseTo(expected, 10);
    }
  });

  it('is monotonically non-increasing in pressure (Q rises as P drops)', () => {
    let prevQ = 0;
    for (let p = FAN_CURVE_C[0].p; p >= 0; p -= 50) {
      const q = fanCurveQ(p, FAN_CURVE_C);
      expect(q).toBeGreaterThanOrEqual(prevQ - 1e-12);
      prevQ = q;
    }
  });
});

describe('linearFanQ', () => {
  it('Q = Q_max at P = 0', () => {
    expect(linearFanQ(0, 0.1, 2000)).toBeCloseTo(0.1, 12);
  });

  it('Q = 0 at P = P_max', () => {
    expect(linearFanQ(2000, 0.1, 2000)).toBe(0);
  });

  it('clamps to 0 above P_max', () => {
    expect(linearFanQ(3000, 0.1, 2000)).toBe(0);
  });

  it('linear interpolation in between', () => {
    expect(linearFanQ(1000, 0.1, 2000)).toBeCloseTo(0.05, 12);
  });
});
