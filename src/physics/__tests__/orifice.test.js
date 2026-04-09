import { describe, expect, it } from 'vitest';
import { holeArea, qOrifice } from '../orifice.js';
import { RHO } from '../constants.js';

describe('orifice flow', () => {
  it('returns 0 for non-positive ΔP or area', () => {
    expect(qOrifice(0.6, 1e-4, 0)).toBe(0);
    expect(qOrifice(0.6, 1e-4, -10)).toBe(0);
    expect(qOrifice(0.6, 0, 1000)).toBe(0);
  });

  it('matches Bernoulli analytic value: Q = Cd·A·√(2P/ρ)', () => {
    const cd = 0.6;
    const a = 1e-4; // 1 cm²
    const p = 1000; // Pa
    const expected = cd * a * Math.sqrt((2 * p) / RHO);
    expect(qOrifice(cd, a, p)).toBeCloseTo(expected, 12);
  });

  it('is monotonic in pressure', () => {
    const a = 1e-5;
    const q1 = qOrifice(0.6, a, 100);
    const q2 = qOrifice(0.6, a, 400);
    const q3 = qOrifice(0.6, a, 1600);
    expect(q2).toBeGreaterThan(q1);
    expect(q3).toBeGreaterThan(q2);
  });

  it('flow scales as √P (doubling P → ×√2 in Q)', () => {
    const q1 = qOrifice(0.6, 1e-4, 500);
    const q2 = qOrifice(0.6, 1e-4, 1000);
    expect(q2 / q1).toBeCloseTo(Math.sqrt(2), 10);
  });

  it('is linear in Cd and A', () => {
    const base = qOrifice(0.6, 1e-4, 1000);
    expect(qOrifice(0.6, 2e-4, 1000)).toBeCloseTo(2 * base, 10);
    expect(qOrifice(0.3, 1e-4, 1000)).toBeCloseTo(0.5 * base, 10);
  });

  it('hole area: A = πd²/4', () => {
    expect(holeArea(0.003)).toBeCloseTo((Math.PI / 4) * 9e-6, 14);
  });
});
