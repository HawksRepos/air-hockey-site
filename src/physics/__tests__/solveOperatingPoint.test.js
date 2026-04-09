import { describe, expect, it } from 'vitest';
import { solveOperatingPoint } from '../solveOperatingPoint.js';
import { linearFanQ } from '../fanCurve.js';
import { qOrifice } from '../orifice.js';
import { Cd, RHO } from '../constants.js';

const fan = (qMax, pMax) => (p) => linearFanQ(p, qMax, pMax);

const HOLE = (Math.PI / 4) * 3e-3 ** 2; // 3 mm hole

describe('solveOperatingPoint — split-flow intersection', () => {
  it('returns p = 0 when there are no holes', () => {
    const r = solveOperatingPoint({
      fanQFn: fan(0.1, 2000),
      aHoleM2: HOLE,
      nCovered: 0,
      nUncovered: 0,
      pFilmPa: 0,
    });
    expect(r.pOp).toBe(0);
  });

  it('mass conservation: residual is small at the returned operating point', () => {
    const r = solveOperatingPoint({
      fanQFn: fan(0.12, 2747),
      aHoleM2: HOLE,
      nCovered: 24,
      nUncovered: 376,
      pFilmPa: 245.25,
    });
    expect(r.residual).toBeLessThan(1e-6);
  });

  it('split-flow predicts higher plenum pressure than treating all holes as open', () => {
    // With block: covered holes leak less ⇒ higher steady plenum.
    const withBlock = solveOperatingPoint({
      fanQFn: fan(0.12, 2747),
      aHoleM2: HOLE,
      nCovered: 24,
      nUncovered: 376,
      pFilmPa: 245.25,
    });
    // Without block: every hole vents to atmosphere.
    const noBlock = solveOperatingPoint({
      fanQFn: fan(0.12, 2747),
      aHoleM2: HOLE,
      nCovered: 0,
      nUncovered: 400,
      pFilmPa: 0,
    });
    expect(withBlock.pOp).toBeGreaterThan(noBlock.pOp);
  });

  it('agrees with the analytic intersection for a linear fan + quadratic system', () => {
    const r = solveOperatingPoint({
      fanQFn: fan(0.1, 2000),
      aHoleM2: HOLE,
      nCovered: 0,
      nUncovered: 50,
      pFilmPa: 0,
    });
    const aTotal = 50 * HOLE;
    const lhs = 0.1 * (1 - r.pOp / 2000);
    const rhs = Cd * aTotal * Math.sqrt((2 * r.pOp) / RHO);
    expect(lhs).toBeCloseTo(rhs, 6);
    // qOrifice cross-check
    expect(qOrifice(Cd, aTotal, r.pOp)).toBeCloseTo(r.qOp, 6);
  });
});

describe('solveOperatingPoint — fan power clamp', () => {
  it('clamp engages when unconstrained aero output exceeds η · P_elec', () => {
    const r = solveOperatingPoint({
      fanQFn: fan(0.1, 2000),
      aHoleM2: HOLE,
      nCovered: 0,
      nUncovered: 50,
      pFilmPa: 0,
      fanWatts: 80,
      fanAeroEfficiency: 0.05, // very tight cap forces clamping
    });
    expect(r.powerLimited).toBe(true);
    expect(r.pOp * r.qOp).toBeLessThanOrEqual(0.05 * 80 + 1e-3);
  });

  it('clamp does not engage when there is plenty of headroom', () => {
    const r = solveOperatingPoint({
      fanQFn: fan(0.1, 2000),
      aHoleM2: HOLE,
      nCovered: 0,
      nUncovered: 50,
      pFilmPa: 0,
      fanWatts: 1000,
      fanAeroEfficiency: 0.5,
    });
    expect(r.powerLimited).toBe(false);
  });

  it('clamping a generous unconstrained point lowers both P and Q', () => {
    const args = {
      fanQFn: fan(0.1, 2000),
      aHoleM2: HOLE,
      nCovered: 0,
      nUncovered: 50,
      pFilmPa: 0,
    };
    const free = solveOperatingPoint(args);
    const clamped = solveOperatingPoint({
      ...args,
      fanWatts: 80,
      fanAeroEfficiency: 0.05,
    });
    expect(clamped.pOp).toBeLessThan(free.pOp);
    expect(clamped.qOp).toBeLessThan(free.qOp);
  });
});
