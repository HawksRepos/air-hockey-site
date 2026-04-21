/**
 * Validity envelope classification tests.
 *
 * Locks the contract that the badge turns green for the default rig,
 * amber for inputs outside the validated range but physically legal,
 * and red for hard-limit violations or compressibility warnings.
 */

import { describe, expect, it } from 'vitest';
import { ENVELOPE, checkValidity } from '../validity.js';

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
  fanWatts: 80,
};

describe('checkValidity', () => {
  it('is ok for the default rig inputs', () => {
    const v = checkValidity(RIG);
    expect(v.status).toBe('ok');
    expect(v.findings).toEqual([]);
  });

  it('turns amber when hole diameter exits the validated range', () => {
    const v = checkValidity({ ...RIG, holeDiaMm: 8 });
    expect(v.status).toBe('amber');
    expect(v.findings).toHaveLength(1);
    expect(v.findings[0].key).toBe('holeDiaMm');
    expect(v.findings[0].status).toBe('amber');
  });

  it('turns red on a hard-limit breach', () => {
    const v = checkValidity({ ...RIG, holeDiaMm: -0.5 });
    expect(v.status).toBe('red');
  });

  it('turns red when the compressibility warning is set on the result', () => {
    const v = checkValidity(RIG, { compressibilityWarning: true, holeMach: 0.45 });
    expect(v.status).toBe('red');
    expect(v.findings.some((f) => f.key === 'compressibilityWarning')).toBe(true);
  });

  it('combines multiple findings and keeps the worst status', () => {
    const v = checkValidity({ ...RIG, massG: 10, holeDiaMm: 0.4 });
    expect(v.status).toBe('amber');
    const keys = v.findings.map((f) => f.key).sort();
    expect(keys).toEqual(['holeDiaMm', 'massG']);
  });
});

describe('ENVELOPE shape', () => {
  it('entries pair validated bounds with a label', () => {
    for (const [key, env] of Object.entries(ENVELOPE)) {
      expect(typeof env.label).toBe('string');
      expect(env.validated).toHaveLength(2);
      expect(env.validated[0]).toBeLessThanOrEqual(env.validated[1]);
      expect(env, `${key} has hard bounds`).toHaveProperty('hard');
    }
  });
});
