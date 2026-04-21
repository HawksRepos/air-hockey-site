/**
 * Tests for the fan-to-plenum inlet loss model.
 *
 * The default rig has K=0 (no duct) — the wrapper must return the raw
 * fan curve unchanged. Non-zero K should shift the predicted plenum
 * pressure downward and the required fan-output pressure upward.
 */

import { describe, expect, it } from 'vitest';
import { inletLossPa, withInletLoss } from '../inletLoss.js';
import { computeAirHockey } from '../computeAirHockey.js';

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
  fanAeroEfficiency: 0.3,
  costPerKwh: 0.245,
};

describe('inletLossPa', () => {
  it('is zero when K or ductArea is zero', () => {
    expect(inletLossPa(0.01, { K: 0, ductAreaM2: 1e-3 })).toBe(0);
    expect(inletLossPa(0.01, { K: 1, ductAreaM2: 0 })).toBe(0);
  });

  it('scales with ρ·v²/2 for K = 1', () => {
    // v = Q / A = 0.01 / 1e-3 = 10 m/s → ΔP = 0.5·1.2·100 = 60 Pa.
    expect(inletLossPa(0.01, { K: 1, ductAreaM2: 1e-3 })).toBeCloseTo(60, 3);
  });

  it('scales linearly with K', () => {
    const base = inletLossPa(0.01, { K: 1, ductAreaM2: 1e-3 });
    const doubled = inletLossPa(0.01, { K: 2, ductAreaM2: 1e-3 });
    expect(doubled).toBeCloseTo(2 * base, 6);
  });
});

describe('withInletLoss', () => {
  it('returns the identity when K is zero', () => {
    const fan = (p) => Math.max(0, 1 - p / 1000);
    const wrapped = withInletLoss(fan, { K: 0, ductAreaM2: 1e-3 });
    expect(wrapped).toBe(fan);
  });

  it('returns the identity when ductArea is zero', () => {
    const fan = (p) => Math.max(0, 1 - p / 1000);
    const wrapped = withInletLoss(fan, { K: 1, ductAreaM2: 0 });
    expect(wrapped).toBe(fan);
  });

  it('reduces delivered Q at a given plenum pressure when K>0', () => {
    const fan = (p) => Math.max(0, 0.01 * (1 - p / 1000));
    const wrapped = withInletLoss(fan, { K: 1.5, ductAreaM2: 1e-3 });
    const pPlenum = 400;
    expect(wrapped(pPlenum)).toBeLessThan(fan(pPlenum));
  });
});

describe('computeAirHockey integrates inlet loss cleanly', () => {
  it('default (no duct) produces zero inletLossPa in the result', () => {
    const r = computeAirHockey(RIG);
    expect(r.inletLossPa).toBe(0);
  });

  it('adding a duct loss lowers the plenum pressure at the operating point', () => {
    // Use η_aero = 1.0 to bypass the fan power clamp; otherwise the
    // clamped regime masks the inlet-loss effect (see MODEL.md for the
    // interaction between inlet loss and the power clamp).
    const uncapped = { ...RIG, fanAeroEfficiency: 1.0 };
    const clean = computeAirHockey(uncapped);
    // 50 mm-dia duct ≈ 2×10⁻³ m² (2000 mm²); K = 1.0 (one bend).
    const lossy = computeAirHockey({ ...uncapped, inletLossK: 1.0, ductAreaMm2: 2000 });
    expect(lossy.pOp).toBeLessThan(clean.pOp);
    expect(lossy.inletLossPa).toBeGreaterThan(0);
  });
});
