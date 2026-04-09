/**
 * Incompressible orifice (Bernoulli) flow.
 *
 * Q = Cd · A · √(2 · ΔP / ρ)
 *
 * Standard form for a sharp-edged orifice in the incompressible, turbulent
 * regime (Re ≳ 2000). For drilled holes through a plate of comparable
 * thickness to the hole diameter, the *short-tube* discharge coefficient
 * applies — see `dischargeCoefficient.js`.
 *
 * References:
 * - ISO 5167-1:2022 — Measurement of fluid flow by means of pressure
 *   differential devices.
 * - Idelchik, *Handbook of Hydraulic Resistance* (3rd ed., 2007), §4.
 */

import { RHO } from './constants.js';

/**
 * Volumetric flow through an orifice.
 * @param {number} cd  Discharge coefficient (dimensionless).
 * @param {number} aM2 Orifice cross-sectional area [m²].
 * @param {number} dPPa Pressure difference across orifice [Pa]. Negative → 0.
 * @param {number} [rho=RHO] Upstream fluid density [kg/m³].
 * @returns {number} Volumetric flow [m³/s].
 */
export function qOrifice(cd, aM2, dPPa, rho = RHO) {
  if (dPPa <= 0 || aM2 <= 0) return 0;
  return cd * aM2 * Math.sqrt((2 * dPPa) / rho);
}

/**
 * Geometric area of a circular orifice.
 * @param {number} dM Diameter [m].
 * @returns {number} Area [m²].
 */
export function holeArea(dM) {
  return (Math.PI / 4) * dM * dM;
}
