/**
 * Single source of truth for the reference list.
 *
 * Matched 1:1 with `docs/REFERENCES.md`. When adding a citation, update
 * both places. The `id` field is the superscript number shown in the UI
 * (don't reshuffle existing IDs — tests and docs pin to them).
 *
 * Consumed by:
 *   - src/AirHockeyCalc.jsx (<Ref> component + end-of-page bibliography)
 *   - src/PresentationView.jsx (planned — same <Ref> component)
 *   - docs/REFERENCES.md (hand-maintained mirror, prose form)
 */

/**
 * @typedef {object} Reference
 * @property {number} id     Stable identifier shown as a superscript.
 * @property {string} short  Short citation used in tooltips ("Hamrock 2004").
 * @property {string} title  Full reference title.
 * @property {string} url    Canonical URL (DOI preferred where available).
 */

/** @type {ReadonlyArray<Reference>} */
export const REFS = Object.freeze([
  {
    id: 1,
    short: 'Engineering ToolBox',
    title: 'Orifice, Nozzle and Venturi Flow Rate Meters',
    url: 'https://www.engineeringtoolbox.com/orifice-nozzle-venturi-d_590.html',
  },
  {
    id: 2,
    short: 'Bird Precision',
    title: 'BDS Sharp Edge Orifices — Discharge Coefficient',
    url: 'https://birdprecision.com/publications/bds-sharp-edge-orifices/',
  },
  {
    id: 3,
    short: 'Engineers Edge',
    title: 'ISO Metric Drill Bit Size Table (ANSI/ASME B94.11M)',
    url: 'https://www.engineersedge.com/drill_sizes.htm',
  },
  {
    id: 4,
    short: 'TLC Direct',
    title: 'Manrose MAN150M 150mm In-Line Centrifugal Fan — Specifications',
    url: 'https://www.tlc-direct.co.uk/Products/MRMRK150M.html',
  },
  {
    id: 5,
    short: 'Engineering ToolBox',
    title: 'International Standard Atmosphere (ISA) — Air Properties',
    url: 'https://www.engineeringtoolbox.com/international-standard-atmosphere-d_985.html',
  },
  {
    id: 6,
    short: 'Utah State University',
    title:
      'Discharge Coefficient Performance of Venturi, Standard Concentric Orifice Plate, V-Cone, and Wedge Flow Meters',
    url: 'https://digitalcommons.usu.edu/cgi/viewcontent.cgi?article=1865&context=etd',
  },
  {
    id: 7,
    short: 'New Way Air Bearings',
    title: 'Technical Report: Orifice vs Porous Media Air Bearings',
    url: 'https://www.newwayairbearings.com/technology/technical-resources/new-way-techincal-reports/technical-report-1-orifice-vs-porous-media-air-bearings/',
  },
  {
    id: 8,
    short: 'Ofgem',
    title: 'Energy Price Cap Explained',
    url: 'https://www.ofgem.gov.uk/information-consumers/energy-advice-households/energy-price-cap-explained',
  },
  {
    id: 9,
    short: 'OpenStax',
    title: "University Physics — Bernoulli's Equation (Ch. 14.8)",
    url: 'https://phys.libretexts.org/Bookshelves/University_Physics/University_Physics_(OpenStax)/Book%3A_University_Physics_I_-_Mechanics_Sound_Oscillations_and_Waves_(OpenStax)/14%3A_Fluid_Mechanics/14.08%3A_Bernoullis_Equation',
  },
  {
    id: 10,
    short: 'CNC Cookbook',
    title: 'G81, G73, G83: Drilling & Peck Drilling Canned Cycles',
    url: 'https://www.cnccookbook.com/g81-g73-g83-drill-peck-canned-cycle/',
  },
  {
    id: 11,
    short: 'UKAM',
    title: 'Micro Drilling Guide — Deflection, Breakage & Feed Rate',
    url: 'https://ukam.com/micro-drilling-guide/',
  },
  {
    id: 12,
    short: 'THK',
    title: 'Features of the LM Guide — Friction Coefficient',
    url: 'https://tech.thk.com/en/products/pdf/en_b01_008.pdf',
  },
  {
    id: 13,
    short: 'ISO 5167-1:2022',
    title:
      'Measurement of fluid flow by means of pressure differential devices inserted in circular cross-section conduits running full — Part 1: General principles',
    url: 'https://www.iso.org/standard/79179.html',
  },
  {
    id: 14,
    short: 'Lichtarowicz et al. 1965',
    title:
      'Discharge coefficients for incompressible non-cavitating flow through long orifices. J. Mech. Eng. Sci. 7(2):210–219.',
    url: 'https://doi.org/10.1243/JMES_JOUR_1965_007_029_02',
  },
  {
    id: 15,
    short: 'Idelchik 2007',
    title:
      'Handbook of Hydraulic Resistance, 3rd ed. — orifice and short-tube discharge coefficients (Ch. 4).',
    url: 'https://www.begellhouse.com/ebook_platform/61df93de7adf5e0c.html',
  },
  {
    id: 16,
    short: 'Hamrock 2004',
    title:
      'Fundamentals of Fluid Film Lubrication, 2nd ed. — Reynolds equation and air-bearing film theory (Ch. 7).',
    url: 'https://www.routledge.com/Fundamentals-of-Fluid-Film-Lubrication/Hamrock-Schmid-Jacobson/p/book/9780824753719',
  },
  {
    id: 17,
    short: 'Çengel & Cimbala 2018',
    title:
      'Fluid Mechanics: Fundamentals and Applications, 4th ed. — Ch. 14 Turbomachinery (fan operating points, aero efficiency, stall).',
    url: 'https://www.mheducation.com/highered/product/fluid-mechanics-fundamentals-applications-cengel-cimbala/M9781259696534.html',
  },
  {
    id: 18,
    short: 'Saltelli et al. 2008',
    title:
      'Global Sensitivity Analysis: The Primer (Wiley) — basis for the sensitivity/tornado analysis.',
    url: 'https://onlinelibrary.wiley.com/doi/book/10.1002/9780470725184',
  },
]);

/** Lookup helper used by the UI &lt;Ref&gt; component. */
export function findRef(id) {
  return REFS.find((r) => r.id === id);
}
