/**
 * Fabrication bill-of-materials helpers.
 *
 * Turns the design inputs into the numbers a machinist or maker needs to
 * actually build the rig:
 *   - total hole count and the nearest standard drill bit
 *   - strip & carriage material dimensions
 *   - rough cost and build-time estimates
 *
 * The numeric constants here (acrylic sheet price, per-hole drill time)
 * are ball-park values for UK university-workshop fabrication ca. 2026.
 * Override via the optional `rates` argument if a finer estimate is
 * needed for a specific make.
 */

/**
 * ISO metric drill sizes commonly stocked in UK workshops
 * (ANSI/ASME B94.11M). Not exhaustive — we just need enough coverage
 * to snap an arbitrary diameter to something you can actually buy.
 * Reference: Engineers Edge drill-size table (REFS[3]).
 */
export const STANDARD_METRIC_DRILLS_MM = Object.freeze([
  0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.5, 1.8, 2.0, 2.5, 3.0, 3.2,
  3.5, 4.0, 4.5, 5.0, 5.5, 6.0, 6.5, 7.0, 7.5, 8.0, 8.5, 9.0, 9.5, 10.0,
]);

/** Default workshop rates (UK, 2026 ballpark). Override via `rates`. */
export const DEFAULT_RATES = Object.freeze({
  acrylicPerM2GBP: 30, // 3 mm cast acrylic sheet
  secondsPerHole: 8, // deburred drilled hole on a pillar drill
  setupMinutes: 30, // one-off template + clamping setup
  labourPerHourGBP: 25, // student workshop rate
});

/**
 * Snap an arbitrary diameter to the nearest *larger-or-equal* stocked
 * drill — always round up so the actual hole is at least what the model
 * assumes. If the requested size exceeds the largest listed drill, the
 * largest is returned and `exceedsStocked` is true.
 *
 * @param {number} targetMm
 * @param {number[]} [stocked=STANDARD_METRIC_DRILLS_MM]
 * @returns {{sizeMm: number, exceedsStocked: boolean}}
 */
export function nearestStockedDrill(targetMm, stocked = STANDARD_METRIC_DRILLS_MM) {
  if (!(targetMm > 0)) return { sizeMm: stocked[0], exceedsStocked: false };
  const hit = stocked.find((d) => d >= targetMm - 1e-9);
  if (hit != null) return { sizeMm: hit, exceedsStocked: false };
  return { sizeMm: stocked[stocked.length - 1], exceedsStocked: true };
}

/**
 * Produce a flat fabrication summary for a given rig configuration.
 *
 * @param {object} rig             Same geometry/dim inputs as computeAirHockey.
 * @param {object} [rates]         Override workshop rates.
 * @returns {object}
 */
export function fabricationSpec(rig, rates = DEFAULT_RATES) {
  const {
    stripLengthMm,
    stripWidthMm,
    stripThicknessMm,
    holeDiaMm,
    spacingMm,
    rows,
    blockLengthMm,
    blockWidthMm,
  } = rig;

  const holesPerRow = Math.max(0, Math.floor(stripLengthMm / spacingMm));
  const totalHoles = holesPerRow * rows;
  const holesUnderBlock = Math.max(
    0,
    Math.floor(blockLengthMm / spacingMm) * rows,
  );
  const holesOutsideBlock = totalHoles - holesUnderBlock;
  const drill = nearestStockedDrill(holeDiaMm);

  // Material area: strip rectangle + carriage rectangle (no allowance).
  const stripAreaM2 = (stripLengthMm * stripWidthMm) / 1e6;
  const carriageAreaM2 = (blockLengthMm * blockWidthMm) / 1e6;
  const materialAreaM2 = stripAreaM2 + carriageAreaM2;
  const materialCostGBP = materialAreaM2 * rates.acrylicPerM2GBP;

  // Fabrication time: setup + per-hole drill time.
  const drillMinutes = (totalHoles * rates.secondsPerHole) / 60;
  const totalBuildMinutes = rates.setupMinutes + drillMinutes;
  const labourCostGBP = (totalBuildMinutes / 60) * rates.labourPerHourGBP;

  // Row pitch across the width (even spacing, edges accounted for).
  const rowPitchMm = rows > 1 ? stripWidthMm / (rows + 1) : stripWidthMm / 2;

  return {
    totalHoles,
    holesPerRow,
    holesUnderBlock,
    holesOutsideBlock,
    drill: drill.sizeMm,
    drillExceedsStocked: drill.exceedsStocked,
    drillTargetMm: holeDiaMm,
    rowPitchMm,
    stripDimsMm: { length: stripLengthMm, width: stripWidthMm, thickness: stripThicknessMm },
    carriageDimsMm: { length: blockLengthMm, width: blockWidthMm },
    stripAreaM2,
    carriageAreaM2,
    materialAreaM2,
    materialCostGBP,
    drillMinutes,
    setupMinutes: rates.setupMinutes,
    totalBuildMinutes,
    labourCostGBP,
    totalCostGBP: materialCostGBP + labourCostGBP,
    rates,
  };
}
