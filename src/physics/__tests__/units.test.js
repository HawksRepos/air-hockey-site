import { describe, expect, it } from 'vitest';
import {
  gToKg,
  m3hToM3s,
  m3sToM3h,
  mToMm,
  mmToM,
  mmwgToPa,
  paToMmwg,
} from '../units.js';

describe('units conversions', () => {
  it('mm ↔ m round-trip', () => {
    expect(mToMm(mmToM(123.456))).toBeCloseTo(123.456, 12);
  });

  it('g → kg', () => {
    expect(gToKg(300)).toBe(0.3);
  });

  it('m³/h ↔ m³/s round-trip', () => {
    expect(m3sToM3h(m3hToM3s(420))).toBeCloseTo(420, 12);
  });

  it('mmwg ↔ Pa exact round-trip', () => {
    const original = 280;
    expect(paToMmwg(mmwgToPa(original))).toBeCloseTo(original, 12);
  });

  it('1 mmwg = 9.81 Pa exactly (matches legacy g=9.81)', () => {
    expect(mmwgToPa(1)).toBe(9.81);
  });

  it('Manrose shut-off 280 mmwg = 2746.8 Pa', () => {
    expect(mmwgToPa(280)).toBeCloseTo(2746.8, 6);
  });
});
