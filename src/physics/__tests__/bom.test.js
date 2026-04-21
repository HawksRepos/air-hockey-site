/**
 * Tests for the fabrication-spec helpers.
 */

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RATES,
  STANDARD_METRIC_DRILLS_MM,
  fabricationSpec,
  nearestStockedDrill,
} from '../bom.js';

const RIG = {
  massG: 400,
  blockLengthMm: 110,
  blockWidthMm: 100,
  stripLengthMm: 2000,
  stripWidthMm: 110,
  holeDiaMm: 2.0,
  spacingMm: 20,
  rows: 4,
  stripThicknessMm: 2.0,
};

describe('nearestStockedDrill', () => {
  it('rounds up to the nearest stocked size', () => {
    expect(nearestStockedDrill(2.3).sizeMm).toBe(2.5);
    expect(nearestStockedDrill(2.0).sizeMm).toBe(2.0);
    expect(nearestStockedDrill(0.1).sizeMm).toBe(0.5);
  });

  it('flags when the requested size exceeds the stocked list', () => {
    const r = nearestStockedDrill(50);
    expect(r.sizeMm).toBe(STANDARD_METRIC_DRILLS_MM[STANDARD_METRIC_DRILLS_MM.length - 1]);
    expect(r.exceedsStocked).toBe(true);
  });
});

describe('fabricationSpec', () => {
  it('counts holes per row and under-block correctly', () => {
    const s = fabricationSpec(RIG);
    expect(s.holesPerRow).toBe(100); // 2000 / 20
    expect(s.totalHoles).toBe(400);
    expect(s.holesUnderBlock).toBe(20); // floor(110/20) × 4 = 5 × 4
    expect(s.holesOutsideBlock).toBe(380);
  });

  it('snaps the drill up from a fractional target', () => {
    const s = fabricationSpec({ ...RIG, holeDiaMm: 2.3 });
    expect(s.drill).toBe(2.5);
    expect(s.drillTargetMm).toBe(2.3);
  });

  it('material area matches strip + carriage footprint', () => {
    const s = fabricationSpec(RIG);
    const expected = (2000 * 110 + 110 * 100) / 1e6;
    expect(s.materialAreaM2).toBeCloseTo(expected, 6);
    expect(s.materialCostGBP).toBeCloseTo(expected * DEFAULT_RATES.acrylicPerM2GBP, 6);
  });

  it('build time = setup + per-hole drill time', () => {
    const s = fabricationSpec(RIG);
    const expected =
      DEFAULT_RATES.setupMinutes + (s.totalHoles * DEFAULT_RATES.secondsPerHole) / 60;
    expect(s.totalBuildMinutes).toBeCloseTo(expected, 6);
  });

  it('responds to rate overrides', () => {
    const s = fabricationSpec(RIG, {
      ...DEFAULT_RATES,
      acrylicPerM2GBP: 100,
      labourPerHourGBP: 0,
    });
    // Labour zeroed → total cost equals material cost.
    expect(s.labourCostGBP).toBeCloseTo(0, 6);
    expect(s.totalCostGBP).toBeCloseTo(s.materialCostGBP, 6);
  });
});
