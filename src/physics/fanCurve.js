/**
 * Fan-curve interpolation and the linear toy model.
 *
 * A fan curve is a list of (Q, P) operating points published by the
 * manufacturer. We linearly interpolate between digitised points and
 * clamp outside the bracketed range.
 *
 * Both functions are pure: same input ⇒ same output.
 */

/**
 * Volumetric flow at a given back-pressure, by piecewise-linear
 * interpolation of a digitised fan curve.
 *
 * @param {number} pPa Back-pressure [Pa].
 * @param {{q:number,p:number}[]} curveData Curve points sorted by *decreasing* P
 *        (i.e. shut-off first, free-blow last). Q in m³/s, P in Pa.
 * @returns {number} Flow [m³/s]. Returns 0 above shut-off, free-blow Q below 0.
 */
export function fanCurveQ(pPa, curveData) {
  if (pPa >= curveData[0].p) return 0;
  if (pPa <= 0) return curveData[curveData.length - 1].q;
  for (let i = 0; i < curveData.length - 1; i += 1) {
    if (pPa <= curveData[i].p && pPa >= curveData[i + 1].p) {
      const t = (curveData[i].p - pPa) / (curveData[i].p - curveData[i + 1].p);
      return curveData[i].q + t * (curveData[i + 1].q - curveData[i].q);
    }
  }
  return 0;
}

/**
 * Linear toy fan model: Q(P) = Q_max · (1 − P/P_max), clamped at 0.
 * Useful when no real curve data is available.
 *
 * @param {number} pPa Back-pressure [Pa].
 * @param {number} qMaxM3s Free-blow flow at P=0 [m³/s].
 * @param {number} pMaxPa Shut-off pressure at Q=0 [Pa].
 * @returns {number} Flow [m³/s].
 */
export function linearFanQ(pPa, qMaxM3s, pMaxPa) {
  return qMaxM3s * Math.max(0, 1 - pPa / pMaxPa);
}
