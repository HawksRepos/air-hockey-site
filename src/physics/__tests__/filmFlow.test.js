import { describe, expect, it } from 'vitest';
import { hoverHeightViscous, modifiedFilmReynolds } from '../filmFlow.js';
import { MU_AIR } from '../constants.js';

describe('hoverHeightViscous (Reynolds equation)', () => {
  it('returns 0 for non-positive inputs', () => {
    expect(hoverHeightViscous({ qIn: 0, lengthM: 0.1, widthM: 0.1, pFilmPa: 100 })).toBe(0);
    expect(hoverHeightViscous({ qIn: 1e-4, lengthM: 0, widthM: 0.1, pFilmPa: 100 })).toBe(0);
  });

  it('matches the analytic form h = ∛(3 μ L Q / (W P))', () => {
    const qIn = 1e-4;
    const lengthM = 0.12;
    const widthM = 0.1;
    const pFilmPa = 245.25;
    const expected = Math.cbrt((3 * MU_AIR * lengthM * qIn) / (widthM * pFilmPa));
    expect(hoverHeightViscous({ qIn, lengthM, widthM, pFilmPa })).toBeCloseTo(expected, 14);
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

describe('modifiedFilmReynolds', () => {
  it('Re* ≪ 1 in the air-bearing regime (validates the Stokes assumption)', () => {
    const re = modifiedFilmReynolds({ uMps: 5, hM: 1e-4, lengthM: 0.12 });
    expect(re).toBeLessThan(0.1);
  });
});
