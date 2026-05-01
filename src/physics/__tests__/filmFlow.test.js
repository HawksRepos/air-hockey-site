import { describe, expect, it } from 'vitest';
import { hoverHeightViscous, modifiedFilmReynolds, viscousShapeFactor } from '../filmFlow.js';
import { MU_AIR } from '../constants.js';

describe('hoverHeightViscous (2-D Reynolds Poisson series)', () => {
  it('returns 0 for non-positive inputs', () => {
    expect(hoverHeightViscous({ qIn: 0, lengthM: 0.1, widthM: 0.1, pFilmPa: 100 })).toBe(0);
    expect(hoverHeightViscous({ qIn: 1e-4, lengthM: 0, widthM: 0.1, pFilmPa: 100 })).toBe(0);
  });

  it('matches the closed-form series sum h = ∛(192 μ Q S / (π⁶ F))', () => {
    const qIn = 1e-4;
    const lengthM = 0.12;
    const widthM = 0.1;
    const pFilmPa = 245.25;
    const F = pFilmPa * lengthM * widthM;
    const S = viscousShapeFactor(lengthM, widthM);
    const expected = Math.cbrt((192 * MU_AIR * qIn * S) / (Math.PI ** 6 * F));
    expect(hoverHeightViscous({ qIn, lengthM, widthM, pFilmPa })).toBeCloseTo(expected, 14);
  });

  it('square-plate limit gives h ≈ ∛(0.105 μ Q / P_avg) — analytic check', () => {
    // For L=W=a, the dimensionless series sums to σ ≈ 0.5275 so
    // h³ = 192·σ/π⁶ × μ Q / P_avg ≈ 0.1054 × μ Q / P_avg.
    const a = 0.1;
    const qIn = 1e-4;
    const pFilmPa = 245.25;
    const h = hoverHeightViscous({ qIn, lengthM: a, widthM: a, pFilmPa });
    const expectedCoeff = (192 * 0.5275) / Math.PI ** 6;
    const expected = Math.cbrt((expectedCoeff * MU_AIR * qIn) / pFilmPa);
    expect(h).toBeCloseTo(expected, 4);
  });

  it('scales as Q^(1/3) — doubling Q gives ×∛2 in h', () => {
    const base = hoverHeightViscous({ qIn: 1e-4, lengthM: 0.12, widthM: 0.1, pFilmPa: 245 });
    const dbl = hoverHeightViscous({ qIn: 2e-4, lengthM: 0.12, widthM: 0.1, pFilmPa: 245 });
    expect(dbl / base).toBeCloseTo(Math.cbrt(2), 10);
  });

  it('produces a sub-mm gap for typical air-hockey conditions', () => {
    const h = hoverHeightViscous({
      qIn: 2.5e-3,
      lengthM: 0.12,
      widthM: 0.1,
      pFilmPa: 245.25,
    });
    expect(h).toBeGreaterThan(1e-5);
    expect(h).toBeLessThan(2e-3);
  });
});

describe('viscousShapeFactor', () => {
  it('series converges quickly — 25 vs 51 modes agree to 0.01 %', () => {
    const a = viscousShapeFactor(0.12, 0.1, 25);
    const b = viscousShapeFactor(0.12, 0.1, 51);
    expect(Math.abs(a - b) / b).toBeLessThan(1e-4);
  });

  it('symmetric in L and W (square is a special case)', () => {
    expect(viscousShapeFactor(0.1, 0.12)).toBeCloseTo(viscousShapeFactor(0.12, 0.1), 14);
  });
});

describe('modifiedFilmReynolds', () => {
  it('Re* ≪ 1 in the air-bearing regime (validates the Stokes assumption)', () => {
    const re = modifiedFilmReynolds({ uMps: 5, hM: 1e-4, lengthM: 0.12 });
    expect(re).toBeLessThan(0.1);
  });
});
