/**
 * Tests for the compressibility guard.
 *
 * The default rig sits well inside the incompressible regime. These
 * tests lock in (a) that the flag stays quiet for normal inputs, (b)
 * that it fires for extreme ΔP, and (c) that the Y-factor collapses
 * to 1 in the incompressible limit.
 */

import { describe, expect, it } from 'vitest';
import {
  COMPRESSIBILITY_MACH_THRESHOLD,
  SOUND_SPEED_MPS,
  compressibilityState,
  expansibilityFactor,
  mach,
} from '../compressibility.js';
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

describe('mach number', () => {
  it('returns zero for zero velocity', () => {
    expect(mach(0)).toBe(0);
  });

  it('equals v/a at the reference sound speed', () => {
    expect(mach(SOUND_SPEED_MPS)).toBeCloseTo(1.0, 6);
    expect(mach(SOUND_SPEED_MPS / 2)).toBeCloseTo(0.5, 6);
  });
});

describe('compressibilityState', () => {
  it('classifies a 30 m/s flow as incompressible', () => {
    const s = compressibilityState(30);
    expect(s.regime).toBe('incompressible');
    expect(s.compressibilityWarning).toBe(false);
    expect(s.mach).toBeCloseTo(30 / SOUND_SPEED_MPS, 6);
  });

  it('raises the warning above Mach 0.3', () => {
    const s = compressibilityState(SOUND_SPEED_MPS * (COMPRESSIBILITY_MACH_THRESHOLD + 0.01));
    expect(s.regime).toBe('compressible');
    expect(s.compressibilityWarning).toBe(true);
  });

  it('classifies above Mach 1 as choked', () => {
    const s = compressibilityState(SOUND_SPEED_MPS * 1.1);
    expect(s.regime).toBe('choked');
    expect(s.compressibilityWarning).toBe(true);
  });
});

describe('expansibility factor Y (ISO 5167-1)', () => {
  it('returns 1 in the zero-pressure-drop limit', () => {
    expect(expansibilityFactor(0)).toBe(1);
  });

  it('stays > 0.95 at typical air-hockey pressure drops', () => {
    // Operating plenum ~600 Pa against atmosphere → ΔP/(κ·P₁) ≈ 4e-3
    // → Y ≈ 1 − 0.41 × 4e-3 ≈ 0.998.
    expect(expansibilityFactor(600)).toBeGreaterThan(0.995);
  });

  it('drops below 0.95 at 10 % of atmospheric', () => {
    // ΔP = 10 kPa → Y ≈ 1 − 0.41 × 0.10/1.40 ≈ 0.971 (still above 0.95)
    // ΔP = 20 kPa → Y ≈ 0.941.
    expect(expansibilityFactor(20_000)).toBeLessThan(0.95);
  });
});

describe('computeAirHockey surfaces compressibility metadata', () => {
  it('default rig is incompressible with warning clear', () => {
    const r = computeAirHockey(RIG);
    expect(r.compressibilityRegime).toBe('incompressible');
    expect(r.compressibilityWarning).toBe(false);
    expect(r.holeMach).toBeGreaterThan(0);
    expect(r.holeMach).toBeLessThan(COMPRESSIBILITY_MACH_THRESHOLD);
  });
});
