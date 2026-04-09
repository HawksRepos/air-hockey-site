/**
 * Physical constants used throughout the calculator.
 *
 * Air properties at 20 °C, 1 atm. References:
 * - ρ, ν: Engineering ToolBox, ISA tables (id 5 in REFS).
 * - μ:    Sutherland's formula at T = 293.15 K, equivalently NIST WebBook.
 *
 * Keep this file purely declarative — no imports, no React.
 */

/** Discharge coefficient for a thin sharp-edged orifice (legacy default). */
export const Cd = 0.6;

/** Air density at 20 °C, 1 atm [kg/m³]. */
export const RHO = 1.2;

/** Standard gravity [m/s²]. */
export const G = 9.81;

/** Air kinematic viscosity at 20 °C, 1 atm [m²/s]. */
export const NU_AIR = 1.516e-5;

/** Air dynamic viscosity at 20 °C, 1 atm [Pa·s].  μ = ρ × ν. */
export const MU_AIR = 1.81e-5;
