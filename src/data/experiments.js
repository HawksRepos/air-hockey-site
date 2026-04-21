/**
 * Experimental datasets captured on the rig, loaded at build time from
 * `docs/experiments/*.csv` via Vite's `?raw` import.
 *
 * This module is **UI-facing** — it runs under Vite's transformer and
 * will fail to load in a Node-only test environment. Pure parsing logic
 * lives in `csvParser.js` so it can be unit-tested without Vite.
 *
 * Runtime contract:
 *   - Each dataset is an array of typed objects (numeric columns coerced,
 *     others left as strings).
 *   - Placeholder rows (first column `SAMPLE`) and comments are skipped,
 *     so the CSVs can ship with a sample line before Stream A data is
 *     captured — builds never break.
 *   - UI components must handle the empty case; `HAS_EXPERIMENTAL_DATA`
 *     is exported as a convenience for "no data yet" guards.
 */

import hoverVsMassCsv from '../../docs/experiments/hover_vs_mass.csv?raw';
import fanCurveCsv from '../../docs/experiments/fan_curve.csv?raw';
import plenumPressureCsv from '../../docs/experiments/plenum_pressure.csv?raw';

import { COERCIONS, aggregateHoverByMass, parseCsv } from './csvParser.js';

/** Parsed Dewalt fan-curve measurements. Empty before Stream A capture. */
export const FAN_CURVE_MEASURED = parseCsv(fanCurveCsv, COERCIONS.fan_curve);

/** Parsed hover-vs-mass sweep. Empty before Stream A capture. */
export const HOVER_VS_MASS_MEASURED = parseCsv(hoverVsMassCsv, COERCIONS.hover_vs_mass);

/** Aggregated hover-vs-mass ({mass, mean, std, n}). Empty if no data. */
export const HOVER_VS_MASS_AGGREGATED = aggregateHoverByMass(HOVER_VS_MASS_MEASURED);

/** Parsed plenum-pressure verification points. Empty before Stream A capture. */
export const PLENUM_PRESSURE_MEASURED = parseCsv(plenumPressureCsv, COERCIONS.plenum_pressure);

/** True iff any dataset contains real (non-sample) rows. */
export const HAS_EXPERIMENTAL_DATA =
  FAN_CURVE_MEASURED.length > 0 ||
  HOVER_VS_MASS_MEASURED.length > 0 ||
  PLENUM_PRESSURE_MEASURED.length > 0;
