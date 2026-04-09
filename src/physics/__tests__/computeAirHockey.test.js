/**
 * End-to-end behavioural tests for computeAirHockey().
 *
 * Locks in the qualitative facts the calculator is meant to express:
 *   • Discharge coefficient is t/d-aware (Lichtarowicz et al. 1965).
 *   • Operating point uses split-flow (covered holes back-pressure to
 *     P_film) and is clamped by the fan's achievable aero power.
 *   • Hover height comes from the viscous Reynolds equation and lies
 *     in a physical sub-mm range for the default rig.
 *   • Float / sink threshold tracks the experimentally observed limit.
 */

import { describe, expect, it } from 'vitest';
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

describe('discharge coefficient', () => {
  it('geometric Cd comes from the t/d table for the default rig', () => {
    const r = computeAirHockey(RIG);
    // t/d = 3/3.5 ≈ 0.86 → between 0.5 (0.73) and 1.0 (0.78), ≈ 0.77
    expect(r.cdGeometric).toBeGreaterThan(0.73);
    expect(r.cdGeometric).toBeLessThan(0.79);
  });

  it('geometric Cd rises toward the long-tube asymptote for thicker plates', () => {
    const thin = computeAirHockey({ ...RIG, stripThicknessMm: 0.5 });
    const thick = computeAirHockey({ ...RIG, stripThicknessMm: 8 });
    expect(thick.cdGeometric).toBeGreaterThan(thin.cdGeometric);
    expect(thick.cdGeometric).toBeGreaterThan(0.8);
    expect(thick.cdGeometric).toBeLessThan(0.83);
  });

  it('effective Cd is reduced by the Reynolds correction at default rig', () => {
    // At the default operating point Re ≈ 5000, factor ≈ 0.83.
    const r = computeAirHockey(RIG);
    expect(r.cd).toBeLessThan(r.cdGeometric);
    expect(r.cd / r.cdGeometric).toBeGreaterThan(0.6);
    expect(r.cd / r.cdGeometric).toBeLessThan(0.95);
  });

  it('effective Cd collapses toward zero for sub-millimetre holes', () => {
    const tiny = computeAirHockey({ ...RIG, holeDiaMm: 0.4 });
    expect(tiny.cd).toBeLessThan(tiny.cdGeometric);
    expect(tiny.cd).toBeLessThan(0.5);
  });
});

describe('operating point', () => {
  it('residual is small at the returned solution', () => {
    const r = computeAirHockey(RIG);
    expect(r.opResidual).toBeLessThan(1e-6);
  });

  it('power clamp engages on the default rig (fan curve over-promises)', () => {
    const r = computeAirHockey(RIG);
    expect(r.powerLimited).toBe(true);
    expect(r.aeroPower).toBeLessThanOrEqual(RIG.fanAeroEfficiency * RIG.fanWatts + 1e-3);
  });

  it('does not power-clamp when efficiency cap is generous', () => {
    const r = computeAirHockey({ ...RIG, fanAeroEfficiency: 1.0 });
    expect(r.powerLimited).toBe(false);
  });
});

describe('lift force semantics', () => {
  it('exposes maxLiftForce and pressureHeadroomPct alongside legacy aliases', () => {
    const r = computeAirHockey(RIG);
    expect(r.maxLiftForce).toBeCloseTo(r.pOp * r.areaBlock, 10);
    expect(r.pressureHeadroomPct).toBeCloseTo(((r.pOp - r.pRequired) / r.pRequired) * 100, 6);
    expect(r.liftForce).toBe(r.maxLiftForce);
    expect(r.liftMarginPct).toBe(r.pressureHeadroomPct);
  });

  it('floats iff plenum exceeds the required film pressure', () => {
    const sinks = computeAirHockey({ ...RIG, massG: 5000 });
    expect(sinks.floats).toBe(false);
    const featherweight = computeAirHockey({ ...RIG, massG: 50 });
    expect(featherweight.floats).toBe(true);
  });
});

describe('hover height', () => {
  it('produces a physical hover gap in the mm range', () => {
    const r = computeAirHockey(RIG);
    expect(r.hoverHeightMm).toBeGreaterThan(0.1);
    expect(r.hoverHeightMm).toBeLessThan(20);
  });
});

describe('stall clamp', () => {
  it('engages at very small holes (low Q operating point)', () => {
    const r = computeAirHockey({ ...RIG, holeDiaMm: 1.0 });
    expect(r.stallLimited).toBe(true);
  });

  it('does not engage at the default rig', () => {
    const r = computeAirHockey(RIG);
    expect(r.stallLimited).toBe(false);
  });
});

describe('dynamic electrical draw and cost', () => {
  it('draws full rated power when the η ceiling is engaged', () => {
    const r = computeAirHockey(RIG);
    expect(r.powerLimited).toBe(true);
    expect(r.fanElectricalDraw).toBeCloseTo(RIG.fanWatts, 1);
  });

  it('drops toward the idle floor at very large holes (off-design)', () => {
    const big = computeAirHockey({ ...RIG, holeDiaMm: 8 });
    expect(big.powerLimited).toBe(false);
    expect(big.fanElectricalDraw).toBeLessThan(RIG.fanWatts);
    expect(big.fanElectricalDraw).toBeGreaterThanOrEqual(0.4 * RIG.fanWatts - 1e-6);
  });

  it('cost varies with operating point — bigger holes cost less', () => {
    const tight = computeAirHockey({ ...RIG, holeDiaMm: 2 });
    const loose = computeAirHockey({ ...RIG, holeDiaMm: 8 });
    expect(loose.costPerHour).toBeLessThan(tight.costPerHour);
  });
});

describe('experimental match', () => {
  it('fail mass with default-rig η_aero = 0.30 lands near the observed ~300 g', () => {
    // Sweep mass and find the transition from floats → sinks.
    let failMass = null;
    for (let m = 100; m <= 1500; m += 10) {
      const r = computeAirHockey({ ...RIG, massG: m });
      if (!r.floats) {
        failMass = m;
        break;
      }
    }
    expect(failMass).not.toBeNull();
    expect(failMass).toBeGreaterThan(150);
    expect(failMass).toBeLessThan(700);
  });
});
