# References

Every citation used in the model, tests, and UI. The `REFS` array in [../src/data/references.js](../src/data/references.js) is the single source of truth for the numeric IDs — this document mirrors it 1-for-1 so that a `<Ref n={N} />` in the UI lines up with the entry numbered `N` here. Adding or reordering an entry requires editing both files in the same change.

URL audit status (last checked 2026-05-01): every URL below either loads in a browser or returns a bot-blocking 403/404 to automated fetches but resolves correctly when opened by a human. Where a citation could not be auto-verified, the entry's authority comes from the canonical title/DOI/ISBN.

## 1. Engineering ToolBox — *Orifice, Nozzle and Venturi Flow Rate Meters*
Used for: cross-check of the Bernoulli orifice form `Q = Cd · A · √(2 ΔP / ρ)` displayed in the UI.
<https://www.engineeringtoolbox.com/orifice-nozzle-venturi-d_590.html>

## 2. Bird Precision — *BDS Sharp Edge Orifices — Discharge Coefficient*
Used for: industrial cross-check of the `Cd ≈ 0.61` thin-plate sharp-edge baseline (Bird Precision states `Cd = 0.60`).
Verified 2026-05: page confirms "A True Sharp Edge Orifice® has a Cd value of .60."
<https://birdprecision.com/publications/bds-sharp-edge-orifices/>

## 3. Engineers Edge — *ISO Metric Drill Bit Size Table (ANSI/ASME B94.11M)*
Used for: BOM drill-chart shortcut in the UI — mapping an ideal hole diameter to the nearest stocked bit ([bom.js](../src/physics/bom.js)).
Verified 2026-05: page lists ANSI/ASME B94.11M-1993 metric drill sizes.
<https://www.engineersedge.com/drill_sizes.htm>

## 4. TLC Direct — *Manrose MAN150M 150 mm In-Line Centrifugal Fan — Specifications*
Used for: Manrose fan (Q_max, P_max for the digitised Curve C in [src/data/manroseMan150m.js](../src/data/manroseMan150m.js)).
Verified 2026-05: page confirms `Q_max = 420 m³/h`, `Power = 65 W max`. **Discrepancy noted**: the test rig in `computeAirHockey.test.js` uses `fanWatts: 80` (the headline rating quoted in some retailer listings) rather than `65`; both values are observed in the wild for the MAN150M family. The shut-off pressure (`P_max ≈ 280 mmwg`) is read from the manufacturer's published Curve C graph, not from this product page.
Datasheet PDF (when available locally): [datasheets/manrose-man150m.pdf](datasheets/manrose-man150m.pdf).
<https://www.tlc-direct.co.uk/Products/MRMRK150M.html>

## 5. Engineering ToolBox — *International Standard Atmosphere (ISA) — Air Properties*
Used for: air density (ρ = 1.20 kg/m³), kinematic viscosity, dynamic viscosity at 20 °C, 1 atm in [constants.js](../src/physics/constants.js).
<https://www.engineeringtoolbox.com/international-standard-atmosphere-d_985.html>

## 6. Hollingshead, C. L.; Johnson, M. C.; Barfuss, S. L.; Spall, R. E. (2011)
*Discharge coefficient performance of Venturi, standard concentric orifice plate, V-cone and wedge flow meters at low Reynolds numbers.* Journal of Petroleum Science and Engineering, Elsevier. Thesis archive on Utah State University Digital Commons.
Used for: corroboration that orifice Cd decreases at low Re — supports the Reynolds correction `g(Re_d)` in [dischargeCoefficient.js](../src/physics/dischargeCoefficient.js).
Verified 2026-05: title and authors confirmed via Google Scholar; the USU URL hosts the open-access version.
<https://digitalcommons.usu.edu/cgi/viewcontent.cgi?article=1865&context=etd>

## 7. New Way Air Bearings — *Technical Report: Orifice vs Porous Media Air Bearings*
Used for: qualitative comparison of drilled-orifice vs. porous air bearings; motivation for the influence-radius coverage penalty in [computeAirHockey.js](../src/physics/computeAirHockey.js) (`CALIBRATION.influenceRadiusMm`).
Verified 2026-05: page describes orifice bearings as having "uneven pressure distribution" decaying away from each hole, vs. porous media producing "a perfectly even pressure gradient" — exactly the asymmetry the coverage factor approximates.
<https://www.newwayairbearings.com/technology/technical-resources/new-way-techincal-reports/technical-report-1-orifice-vs-porous-media-air-bearings/>

## 8. Ofgem — *Energy Price Cap Explained*
Used for: default UK electricity tariff (£/kWh) in the cost estimate. Default in [App.jsx](../src/App.jsx) is `0.245 £/kWh`; current Ofgem cap (Apr–Jun 2026) is **24.67 p/kWh** = `0.2467 £/kWh`. The default is a slightly conservative round number; users override via the slider.
<https://www.ofgem.gov.uk/information-consumers/energy-advice-households/energy-price-cap-explained>

## 9. OpenStax University Physics — Vol. I, Ch. 14.8, *Bernoulli's Equation*
Used for: pedagogical derivation of the orifice flow form in the Detailed view; Bernoulli reference in the Edge-gap hover-zone of the rig diagram.
Verified 2026-05: page contains the standard `p + ½ρv² + ρgy = const` form.
<https://phys.libretexts.org/Bookshelves/University_Physics/University_Physics_(OpenStax)/Book%3A_University_Physics_I_-_Mechanics_Sound_Oscillations_and_Waves_(OpenStax)/14%3A_Fluid_Mechanics/14.08%3A_Bernoullis_Equation>

## 10. CNC Cookbook — *G81, G73, G83: Drilling & Peck Drilling Canned Cycles*
Used for: fabrication discussion in the Detailed view (drilling rationale).
Verified 2026-05: page covers G81/G73/G83 canned cycles as cited.
<https://www.cnccookbook.com/g81-g73-g83-drill-peck-canned-cycle/>

## 11. UKAM — *Micro Drilling Guide — Deflection, Breakage & Feed Rate*
Used for: practical limit on hole-diameter-to-thickness ratio (fabrication constraint, not physics) in the Detailed view's fabrication notes.
Verified 2026-05: page covers feed-rate tables and breakage causes; deflection-limit discussion is implicit (referenced via flute-length geometry rather than as a closed-form rule).
<https://ukam.com/micro-drilling-guide/>

## 12. THK — *Features of the LM Guide — Friction Coefficient*
Used for: comparison of air-bearing friction to rolling linear guides (qualitative, in the UI's Discussion pane).
URL serves a 1.1 MB binary PDF; verified to load in a browser.
<https://tech.thk.com/en/products/pdf/en_b01_008.pdf>

## 13. ISO 5167-1:2022 — *Measurement of fluid flow by means of pressure differential devices inserted in circular cross-section conduits running full — Part 1: General principles*
Used for: orifice flow form, expansibility factor `Y`, Mach limit on the incompressible regime in [compressibility.js](../src/physics/compressibility.js).
ISO landing page returns `403` to automated requests; standard exists and is canonical.
<https://www.iso.org/standard/79179.html>

## 14. Lichtarowicz, A.; Duggins, R. K.; Markland, E. (1965)
*Discharge coefficients for incompressible non-cavitating flow through long orifices.* Journal of Mechanical Engineering Science **7**(2):210–219. DOI: 10.1243/JMES_JOUR_1965_007_029_02.
Used for: `dischargeCoefficient.js` `Cd` vs. `t/d` table.
Verified 2026-05 via Google Scholar (521+ citations); SagePub landing page blocks bots, opens normally in a browser.
<https://doi.org/10.1243/JMES_JOUR_1965_007_029_02>

## 15. Idelchik, I. E. (2007)
*Handbook of Hydraulic Resistance*, 3rd ed., Begell House.
Used for: cross-check of the `Cd` table (§4 orifice and short-tube discharge); Reynolds correction at transitional orifice flow (§4.5, fig. 4-19 — basis for the `reynoldsFactor()` table); inlet loss coefficients (§2 pipe fittings).
Begell House blocks crawlers; canonical industry reference (ISBN 978-1-56700-251-5).
<https://www.begellhouse.com/ebook_platform/61df93de7adf5e0c.html>

## 16. Hamrock, B. J.; Schmid, S. R.; Jacobson, B. O. (2004)
*Fundamentals of Fluid Film Lubrication*, 2nd ed., CRC Press. ISBN 978-0-8247-5371-9.
Used for: 2-D Reynolds lubrication equation for the under-block film (Ch. 7, eq. 7.49); pressure decay profiles around a single orifice in a parallel-plate film (Fig. 7-11 — basis for the 15 mm influence radius in `CALIBRATION.influenceRadiusMm`).
<https://www.routledge.com/Fundamentals-of-Fluid-Film-Lubrication/Hamrock-Schmid-Jacobson/p/book/9780824753719>

## 17. Çengel, Y. A.; Cimbala, J. M. (2018)
*Fluid Mechanics: Fundamentals and Applications*, 4th ed., McGraw-Hill. ISBN 978-1-259-69653-4. Ch. 14 — Turbomachinery.
Used for: fan operating-point matching method; 25–35 % aero efficiency for small centrifugal duct fans (`CALIBRATION.defaultFanAeroEfficiency`); 15 % minimum-flow stall rule of thumb (`CALIBRATION.minFanFlowFraction`).
<https://www.mheducation.com/highered/product/fluid-mechanics-fundamentals-applications-cengel-cimbala/M9781259696534.html>

## 18. Saltelli, A.; Ratto, M.; Andres, T.; Campolongo, F.; Cariboni, J.; Gatelli, D.; Saisana, M.; Tarantola, S. (2008)
*Global Sensitivity Analysis: The Primer.* Wiley. DOI: 10.1002/9780470725184.
Used for: justification of local central-difference sensitivity as a first-order tool for smooth deterministic models in [sensitivity.js](../src/physics/sensitivity.js).
<https://onlinelibrary.wiley.com/doi/book/10.1002/9780470725184>
