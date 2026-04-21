# References

Every citation used in the model, tests, and UI. The `REFS` array in the source pulls short-names from this list — any change here should be mirrored in [../src/data/references.js](../src/data/references.js).

## Primary (model equations & coefficients)

1. **ISO 5167-1:2022** — *Measurement of fluid flow by means of pressure differential devices inserted in circular cross-section conduits running full — Part 1: General principles*. International Organization for Standardization.
   Used for: orifice flow form, expansibility factor Y, Mach limit on incompressible regime.
   <https://www.iso.org/standard/79179.html>

2. **Lichtarowicz, A.; Duggins, R. K.; Markland, E.** (1965). "Discharge coefficients for incompressible non-cavitating flow through long orifices." *Journal of Mechanical Engineering Science* **7**(2):210–219.
   Used for: `dischargeCoefficient.js` $C_d$ vs. $t/d$ table.
   DOI: <https://doi.org/10.1243/JMES_JOUR_1965_007_029_02>

3. **Idelchik, I. E.** (2007). *Handbook of Hydraulic Resistance*, 3rd ed., Begell House.
   Used for: cross-check of the $C_d$ table (§4 orifice and short-tube discharge); Reynolds correction at transitional orifice flow (§4.5); inlet loss coefficients (§2 pipe fittings).
   <https://www.begellhouse.com/ebook_platform/61df93de7adf5e0c.html>

4. **Hamrock, B. J.; Schmid, S. R.; Jacobson, B. O.** (2004). *Fundamentals of Fluid Film Lubrication*, 2nd ed., CRC Press.
   Used for: Reynolds lubrication equation for the under-block film (Ch. 7); pressure decay profiles around a single orifice in a parallel-plate film (Fig. 7-11 — basis for the 15 mm influence radius).
   <https://www.routledge.com/Fundamentals-of-Fluid-Film-Lubrication/Hamrock-Schmid-Jacobson/p/book/9780824753719>

5. **Çengel, Y. A.; Cimbala, J. M.** (2018). *Fluid Mechanics: Fundamentals and Applications*, 4th ed., McGraw-Hill. Ch. 14 — Turbomachinery.
   Used for: fan operating-point matching method; 25–35 % aero efficiency for small centrifugal duct fans; 15 % minimum-flow stall rule of thumb.

## Secondary (tables, tools, web references)

6. **Engineering ToolBox** — *International Standard Atmosphere (ISA) — Air Properties*.
   Used for: air density, kinematic viscosity at 20 °C, 1 atm in [constants.js](../src/physics/constants.js).
   <https://www.engineeringtoolbox.com/international-standard-atmosphere-d_985.html>

7. **Engineering ToolBox** — *Orifice, Nozzle and Venturi Flow Rate Meters*.
   Used for: cross-check of the Bernoulli orifice form as displayed in the UI.
   <https://www.engineeringtoolbox.com/orifice-nozzle-venturi-d_590.html>

8. **Bird Precision** — *BDS Sharp Edge Orifices — Discharge Coefficient*.
   Used for: industrial cross-check of the $C_d \approx 0.6$ thin-plate baseline.
   <https://birdprecision.com/publications/bds-sharp-edge-orifices/>

9. **Engineers Edge** — *ISO Metric Drill Bit Size Table (ANSI/ASME B94.11M)*.
   Used for: the BOM drill-chart shortcut in the UI — mapping an ideal hole diameter to the nearest stocked bit.
   <https://www.engineersedge.com/drill_sizes.htm>

10. **TLC Direct** — *Manrose MAN150M 150 mm In-Line Centrifugal Fan — Specifications*.
    Used for: Manrose fan curve (Curve C) and headline Q_max / P_max. Datasheet PDF archived at [datasheets/manrose-man150m.pdf](datasheets/manrose-man150m.pdf) (once downloaded).
    <https://www.tlc-direct.co.uk/Products/MRMRK150M.html>

11. **Utah State University digital commons** — Stephens, T. G. (thesis). *Discharge Coefficient Performance of Venturi, Standard Concentric Orifice Plate, V-Cone, and Wedge Flow Meters*.
    Used for: additional context on orifice Cd behaviour at low Re; supports the Reynolds correction form.
    <https://digitalcommons.usu.edu/cgi/viewcontent.cgi?article=1865&context=etd>

12. **New Way Air Bearings** — *Technical Report: Orifice vs Porous Media Air Bearings*.
    Used for: qualitative comparison of drilled-orifice vs. porous air bearings; motivation for the influence-radius coverage penalty.
    <https://www.newwayairbearings.com/technology/technical-resources/new-way-techincal-reports/technical-report-1-orifice-vs-porous-media-air-bearings/>

13. **Ofgem** — *Energy Price Cap Explained*.
    Used for: default £/kWh electricity tariff (0.245 £/kWh) in the cost estimate.
    <https://www.ofgem.gov.uk/information-consumers/energy-advice-households/energy-price-cap-explained>

14. **OpenStax University Physics** — Vol. I, Ch. 14.8, *Bernoulli's Equation*.
    Used for: pedagogical derivation in the Detailed view.
    <https://phys.libretexts.org/Bookshelves/University_Physics/University_Physics_(OpenStax)/Book%3A_University_Physics_I_-_Mechanics_Sound_Oscillations_and_Waves_(OpenStax)/14%3A_Fluid_Mechanics/14.08%3A_Bernoullis_Equation>

15. **CNC Cookbook** — *G81, G73, G83: Drilling & Peck Drilling Canned Cycles*.
    Used for: fabrication discussion in the Detailed view (drilling rationale).
    <https://www.cnccookbook.com/g81-g73-g83-drill-peck-canned-cycle/>

16. **UKAM** — *Micro Drilling Guide — Deflection, Breakage & Feed Rate*.
    Used for: upper limit on practical hole-diameter-to-thickness ratio (fabrication constraint, not physics).
    <https://ukam.com/micro-drilling-guide/>

17. **THK** — *Features of the LM Guide — Friction Coefficient*.
    Used for: comparison of air-bearing friction to rolling linear guides (qualitative, in the UI's Discussion pane).
    <https://tech.thk.com/en/products/pdf/en_b01_008.pdf>

## Supporting (sensitivity & global methods)

18. **Saltelli, A.; Ratto, M.; Andres, T.; Campolongo, F.; Cariboni, J.; Gatelli, D.; Saisana, M.; Tarantola, S.** (2008). *Global Sensitivity Analysis: The Primer*. Wiley.
    Used for: justification of local central-difference sensitivity as a first-order tool for smooth deterministic models ([sensitivity.js](../src/physics/sensitivity.js)).
