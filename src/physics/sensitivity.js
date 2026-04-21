/**
 * Finite-difference sensitivity analysis for `computeAirHockey`.
 *
 * For each input of interest we compute ∂output/∂input via a symmetric
 * central difference at a small relative step (±1 % by default):
 *
 *     dy/dx ≈ (y(x + εx) − y(x − εx)) / (2εx)
 *
 * and report both the raw gradient and a normalised elasticity
 *
 *     E = (dy/y) / (dx/x)
 *
 * which is the percent-change in y per percent-change in x at the
 * current operating point — the quantity a reader of a tornado chart
 * actually cares about.
 *
 * We use the exported physics `computeAirHockey` (not a re-implementation)
 * so the sensitivity always agrees with whatever the live model does.
 *
 * Reference:
 *   - Saltelli et al. (2008). *Global Sensitivity Analysis: The Primer*.
 *     Wiley. Ch. 1 — local vs. global methods; local FD is a reasonable
 *     first-order tool for smooth deterministic models like this one.
 */

import { computeAirHockey } from './computeAirHockey.js';

/**
 * Inputs treated as continuous for sensitivity sweeps. Integer-valued
 * inputs (`rows`) are excluded because a 1 % perturbation rounds to
 * zero — step those manually if needed.
 */
export const CONTINUOUS_INPUTS = Object.freeze([
  'massG',
  'blockLengthMm',
  'blockWidthMm',
  'stripLengthMm',
  'stripWidthMm',
  'holeDiaMm',
  'spacingMm',
  'stripThicknessMm',
  'fanFlowM3h',
  'fanPmaxPa',
  'fanWatts',
  'fanAeroEfficiency',
]);

/** Reasonable default set of output fields to sweep. */
export const DEFAULT_OUTPUTS = Object.freeze([
  'pOp',
  'qOp',
  'hoverHeightMm',
  'maxLiftForce',
  'pressureHeadroomPct',
  'fanElectricalDraw',
  'costPerHour',
]);

/**
 * Central-difference sensitivity of a single output to a single input.
 *
 * @param {object} inputs   Baseline input object for `computeAirHockey`.
 * @param {string} inputKey Name of the input to perturb.
 * @param {string} outputKey Name of the output to watch.
 * @param {number} [relStep=0.01] Relative step size.
 * @returns {{gradient: number, elasticity: number, baseline: number}}
 *   `gradient` = dy/dx [output-unit per input-unit];
 *   `elasticity` = (dy/y)/(dx/x);
 *   `baseline` = y at the unperturbed input.
 */
export function sensitivity(inputs, inputKey, outputKey, relStep = 0.01) {
  const x0 = inputs[inputKey];
  if (!(typeof x0 === 'number') || x0 === 0) {
    return { gradient: NaN, elasticity: NaN, baseline: NaN };
  }
  const dx = Math.abs(x0) * relStep;
  const plus = computeAirHockey({ ...inputs, [inputKey]: x0 + dx });
  const minus = computeAirHockey({ ...inputs, [inputKey]: x0 - dx });
  const baseline = computeAirHockey(inputs)[outputKey];
  const yPlus = plus[outputKey];
  const yMinus = minus[outputKey];
  const gradient = (yPlus - yMinus) / (2 * dx);
  const elasticity = Number.isFinite(baseline) && baseline !== 0 ? (gradient * x0) / baseline : NaN;
  return { gradient, elasticity, baseline };
}

/**
 * Build a tornado-chart-ready table for one output.
 * Rows are sorted by |elasticity| descending.
 *
 * @param {object} inputs
 * @param {string} outputKey
 * @param {string[]} [inputKeys=CONTINUOUS_INPUTS]
 * @param {number} [relStep=0.01]
 * @returns {Array<{input: string, gradient: number, elasticity: number}>}
 */
export function tornado(inputs, outputKey, inputKeys = CONTINUOUS_INPUTS, relStep = 0.01) {
  const rows = inputKeys
    .map((key) => {
      const { gradient, elasticity } = sensitivity(inputs, key, outputKey, relStep);
      return { input: key, gradient, elasticity };
    })
    .filter((row) => Number.isFinite(row.elasticity));
  rows.sort((a, b) => Math.abs(b.elasticity) - Math.abs(a.elasticity));
  return rows;
}

/**
 * Cross-table: for each listed output, a tornado of its top drivers.
 *
 * @param {object} inputs
 * @param {string[]} [outputs=DEFAULT_OUTPUTS]
 * @param {string[]} [inputKeys=CONTINUOUS_INPUTS]
 * @param {number} [relStep=0.01]
 * @returns {Record<string, Array<{input: string, elasticity: number}>>}
 */
export function sensitivityTable(
  inputs,
  outputs = DEFAULT_OUTPUTS,
  inputKeys = CONTINUOUS_INPUTS,
  relStep = 0.01,
) {
  const out = {};
  for (const o of outputs) {
    out[o] = tornado(inputs, o, inputKeys, relStep).map(({ input, elasticity }) => ({
      input,
      elasticity,
    }));
  }
  return out;
}
