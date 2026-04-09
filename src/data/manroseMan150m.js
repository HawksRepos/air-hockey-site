/**
 * Manrose MAN150M centrifugal in-line fan, performance Curve C.
 *
 * Source:
 *   Manrose datasheet, retrieved from
 *     https://www.tlc-direct.co.uk/Products/MRMRK150M.html
 *   (TLC Direct product page; PDF link "Specifications").
 *
 * Digitised by hand from the user-annotated graph with curve C highlighted
 * in red.  Reading uncertainty: ±10 mmwg on most points, ±5 mmwg at the
 * endpoints (P_max at zero flow, Q_max at zero pressure).
 *
 * The two endpoint values (q=0, p=280; q=420, p=0) are confirmed from the
 * tabulated specification on the same datasheet.
 *
 * NOTE: archive a local copy of the datasheet PDF in
 *   docs/datasheets/manrose-man150m.pdf
 * so the citation does not rot when TLC Direct restructures their site.
 *
 * Units in this file: q in m³/h, p in mmwg.  Convert at module boundary.
 */

import { m3hToM3s, mmwgToPa } from '../physics/units.js';

/** Raw digitised points (mm H₂O gauge vs m³/h). */
export const FAN_CURVE_C_RAW = [
  { q: 0, p: 280 },
  { q: 50, p: 270 },
  { q: 100, p: 250 },
  { q: 150, p: 228 },
  { q: 200, p: 200 },
  { q: 250, p: 155 },
  { q: 300, p: 100 },
  { q: 350, p: 50 },
  { q: 380, p: 25 },
  { q: 400, p: 10 },
  { q: 420, p: 0 },
];

/** Same curve in SI: q in m³/s, p in Pa. */
export const FAN_CURVE_C = FAN_CURVE_C_RAW.map((pt) => ({
  q: m3hToM3s(pt.q),
  p: mmwgToPa(pt.p),
}));

/** Reading uncertainty for the digitised curve, in Pa. */
export const FAN_CURVE_C_UNCERTAINTY_PA = mmwgToPa(10);
