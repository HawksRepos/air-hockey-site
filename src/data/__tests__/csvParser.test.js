/**
 * Tests for the pure CSV parser helpers.
 *
 * The real experimental CSVs are loaded through Vite's `?raw` import in
 * `experiments.js`, which isn't available in the Node test environment —
 * so we test the parser against inline strings here.
 */

import { describe, expect, it } from 'vitest';
import { COERCIONS, aggregateHoverByMass, parseCsv } from '../csvParser.js';

describe('parseCsv', () => {
  it('parses a minimal header + row', () => {
    const rows = parseCsv('a,b,c\n1,2,3');
    expect(rows).toEqual([{ a: '1', b: '2', c: '3' }]);
  });

  it('skips comment and blank lines', () => {
    const csv = '# comment\n\na,b\n# another\n1,2\n\n';
    expect(parseCsv(csv)).toEqual([{ a: '1', b: '2' }]);
  });

  it('skips SAMPLE placeholder rows', () => {
    const csv = 'session_id,val\nSAMPLE,999\nrun1,7';
    expect(parseCsv(csv, new Set(['val']))).toEqual([{ session_id: 'run1', val: 7 }]);
  });

  it('coerces only the listed numeric columns', () => {
    const csv = 'name,x,y\nfoo,1.5,not-a-num';
    const rows = parseCsv(csv, new Set(['x', 'y']));
    expect(rows[0].x).toBe(1.5);
    expect(rows[0].y).toBeNull();
    expect(rows[0].name).toBe('foo');
  });

  it('returns [] for an empty or header-only blob', () => {
    expect(parseCsv('')).toEqual([]);
    expect(parseCsv('a,b')).toEqual([]);
  });
});

describe('aggregateHoverByMass', () => {
  it('averages repeats and reports std and n', () => {
    const rows = [
      { mass_g: 300, hover_mm_mean: 1.0 },
      { mass_g: 300, hover_mm_mean: 1.2 },
      { mass_g: 300, hover_mm_mean: 0.8 },
      { mass_g: 400, hover_mm_mean: 0.5 },
    ];
    const agg = aggregateHoverByMass(rows);
    expect(agg).toHaveLength(2);
    const at300 = agg.find((r) => r.mass_g === 300);
    expect(at300.n).toBe(3);
    expect(at300.mean_mm).toBeCloseTo(1.0, 6);
    // Sample std of (1.0, 1.2, 0.8) is 0.2.
    expect(at300.std_mm).toBeCloseTo(0.2, 5);
  });

  it('sorts rising by mass', () => {
    const rows = [
      { mass_g: 500, hover_mm_mean: 0.1 },
      { mass_g: 200, hover_mm_mean: 2.0 },
      { mass_g: 350, hover_mm_mean: 1.0 },
    ];
    const agg = aggregateHoverByMass(rows);
    expect(agg.map((r) => r.mass_g)).toEqual([200, 350, 500]);
  });

  it('returns [] for empty input', () => {
    expect(aggregateHoverByMass([])).toEqual([]);
  });
});

describe('COERCIONS', () => {
  it('hover_vs_mass includes the expected numeric columns', () => {
    expect(COERCIONS.hover_vs_mass.has('mass_g')).toBe(true);
    expect(COERCIONS.hover_vs_mass.has('hover_mm_mean')).toBe(true);
    expect(COERCIONS.hover_vs_mass.has('notes')).toBe(false);
  });
});
