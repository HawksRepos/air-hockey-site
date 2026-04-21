/**
 * Validity envelope for `computeAirHockey` inputs and outputs.
 *
 * Every number this calculator emits has a range outside of which the
 * underlying model assumptions are questionable (see `docs/MODEL.md` §6).
 * This module classifies a given input/result pair as one of:
 *
 *   - 'ok'        — all values inside the validated envelope.
 *   - 'amber'     — one or more values outside the validated range but
 *                   still inside the hard limit; predictions are
 *                   extrapolated and the reader should apply judgement.
 *   - 'red'       — a hard limit is breached (e.g. Mach > 1, Cd → 0,
 *                   compressibility warning triggered). Predictions are
 *                   not trustworthy.
 *
 * The checker returns the classification plus a list of every out-of-
 * range finding so the UI can explain the badge ("holeDia 7.0 mm is
 * extrapolated beyond the validated 1-5 mm range").
 *
 * Keep ENVELOPE in sync with the table in `docs/MODEL.md` §6.
 */

/**
 * @typedef {object} Envelope
 * @property {[number, number]} [validated] Soft bounds — amber outside.
 * @property {[number, number]} [hard]      Hard bounds — red outside.
 * @property {string} [unit]                Unit label for messages.
 * @property {string} [label]               Human-friendly name.
 */

/** @type {Record<string, Envelope>} */
export const ENVELOPE = Object.freeze({
  massG: { validated: [50, 700], hard: [0, Infinity], unit: 'g', label: 'Block mass' },
  blockLengthMm: {
    validated: [50, 200],
    hard: [0, Infinity],
    unit: 'mm',
    label: 'Block length',
  },
  blockWidthMm: {
    validated: [50, 200],
    hard: [0, Infinity],
    unit: 'mm',
    label: 'Block width',
  },
  stripLengthMm: {
    validated: [500, 3000],
    hard: [0, Infinity],
    unit: 'mm',
    label: 'Strip length',
  },
  stripWidthMm: {
    validated: [50, 200],
    hard: [0, Infinity],
    unit: 'mm',
    label: 'Strip width',
  },
  stripThicknessMm: {
    validated: [1, 8],
    hard: [0, Infinity],
    unit: 'mm',
    label: 'Strip thickness',
  },
  holeDiaMm: {
    validated: [1, 5],
    hard: [0, Infinity],
    unit: 'mm',
    label: 'Hole diameter',
  },
  spacingMm: {
    validated: [10, 60],
    hard: [0, Infinity],
    unit: 'mm',
    label: 'Hole spacing',
  },
  rows: { validated: [2, 6], hard: [1, Infinity], label: 'Rows' },
  fanWatts: { validated: [40, 500], hard: [0, Infinity], unit: 'W', label: 'Fan rated power' },
});

/** Output-side envelopes — evaluated against the result object. */
export const OUTPUT_ENVELOPE = Object.freeze({
  pOp: {
    validated: [100, 3000],
    hard: [0, Infinity],
    unit: 'Pa',
    label: 'Plenum pressure',
  },
  holeMach: {
    validated: [0, 0.3],
    hard: [0, 1],
    label: 'Hole Mach number',
  },
});

/**
 * Classify a single value against an envelope entry.
 * @param {number} v
 * @param {Envelope} env
 * @returns {'ok'|'amber'|'red'}
 */
function classifyValue(v, env) {
  if (!Number.isFinite(v)) return 'red';
  const [hMin, hMax] = env.hard ?? [-Infinity, Infinity];
  if (v < hMin || v > hMax) return 'red';
  const [sMin, sMax] = env.validated ?? [-Infinity, Infinity];
  if (v < sMin || v > sMax) return 'amber';
  return 'ok';
}

/**
 * Full validity check across inputs and the corresponding result.
 *
 * @param {object} inputs
 * @param {object} [result]  Optional — pass the `computeAirHockey(inputs)`
 *                           return value to also check output-side envelopes.
 *                           If omitted, only inputs are checked.
 * @returns {{status: 'ok'|'amber'|'red', findings: Array<{key:string,value:number,status:'amber'|'red',label:string,unit?:string,validated:[number,number]}>}}
 */
export function checkValidity(inputs, result) {
  const findings = [];
  let worst = 'ok';

  const consider = (obj, envelope) => {
    if (!obj) return;
    for (const [key, env] of Object.entries(envelope)) {
      const value = obj[key];
      if (value === undefined) continue;
      const s = classifyValue(value, env);
      if (s !== 'ok') {
        findings.push({
          key,
          value,
          status: s,
          label: env.label ?? key,
          unit: env.unit,
          validated: env.validated ?? [-Infinity, Infinity],
        });
        if (s === 'red') worst = 'red';
        else if (worst === 'ok') worst = 'amber';
      }
    }
  };

  consider(inputs, ENVELOPE);
  consider(result, OUTPUT_ENVELOPE);

  if (result?.compressibilityWarning) {
    findings.push({
      key: 'compressibilityWarning',
      value: result.holeMach ?? NaN,
      status: 'red',
      label: 'Compressibility',
      unit: null,
      validated: [0, 0.3],
    });
    worst = 'red';
  }

  return { status: worst, findings };
}
