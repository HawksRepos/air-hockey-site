# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install              # one-time setup
npm run dev              # Vite dev server at http://localhost:5173
npm run build            # production build into dist/
npm run preview          # serve the built bundle locally
npm run lint             # ESLint over the whole repo
npm test                 # Vitest, single run
npm run test:watch       # Vitest in watch mode
npm run check            # lint + test (run before committing)
npm run format           # Prettier over src/**/*.{js,jsx,css}
npm run snapshot         # Playwright screenshots across 5 viewports (needs `npm run dev` running)
npm run calibrate        # Fit semi-empirical knobs to docs/experiments/hover_vs_mass.csv
npm run figures          # Render docs/figures/*.svg from experiments + model
```

Run a single test file or pattern:

```bash
npx vitest run src/physics/__tests__/computeAirHockey.test.js
npx vitest run -t "power clamp"             # by test name
npx vitest run -u                            # update regression snapshot (only when drift is intentional)
```

Deployment: pushing to `main` triggers `.github/workflows/deploy.yml`, which builds and publishes `dist/` to GitHub Pages. `vite.config.js` uses `base: './'` so the site works at any path.

## Architecture

Single-page React app (React 19 + Vite 7, Recharts for graphs). No backend — everything runs in the browser. Two views share one source of truth; a pure physics module does all the math and is the thing that must stay correct.

### State + view routing

[src/App.jsx](src/App.jsx) is the single owner of rig parameters, fan parameters, and theme. It passes everything down to the two views via a `shared` props bundle. Routing is by URL hash:

- `#presentation` (default) → [src/PresentationView.jsx](src/PresentationView.jsx) — landing/TV view
- `#detailed` → [src/AirHockeyCalc.jsx](src/AirHockeyCalc.jsx) — full parameter page with 7 graphs and verification table

Theme is persisted in `localStorage` and provided via [src/ThemeContext.jsx](src/ThemeContext.jsx); palettes live in [src/theme.js](src/theme.js). Both views must call the same `computeAirHockey()` so their numbers agree — don't duplicate formulas into the view files.

### Physics engine (`src/physics/`)

[src/physics/computeAirHockey.js](src/physics/computeAirHockey.js) is a pure function: human-unit inputs in (mm, g, m³/h, …), flat result object out. It orchestrates the smaller modules and is the only entry point the UI should call.

Key model pieces, in order of how they compose:

1. **Orifice flow** — [orifice.js](src/physics/orifice.js), Bernoulli `Q = Cd·A·√(2ΔP/ρ)`.
2. **Discharge coefficient** — [dischargeCoefficient.js](src/physics/dischargeCoefficient.js). Geometric Cd interpolated from the Lichtarowicz 1965 table on `t/d`; then scaled by a Reynolds-number factor `Re/(Re+1000)` to collapse Cd at small/slow holes.
3. **Fan curve** — [fanCurve.js](src/physics/fanCurve.js) with digitised Manrose MAN150M data in [src/data/manroseMan150m.js](src/data/manroseMan150m.js), plus a linear fallback.
4. **Inlet loss** — optional [inletLoss.js](src/physics/inletLoss.js) wraps the fan curve with `ΔP_loss = K · ½ρv²` when a duct geometry is supplied. Default K=0 (open-gutter rig).
5. **Operating point** — [solveOperatingPoint.js](src/physics/solveOperatingPoint.js). Bisects the fan curve against a split-flow system curve (covered holes back-pressure to `P_film`, uncovered holes vent to atmosphere). Then applies a **power clamp** (`P·Q ≤ η_aero·P_elec`) and a **stall clamp** (Q ≥ ~15 % of free-blow). The `powerLimited` / `stallLimited` flags in the result tell you which regime you're in.
6. **Cd ↔ Re coupling** — `computeAirHockey` wraps the solver in a fixed-point loop (usually 3–5 iterations) because Cd depends on Re, which depends on Cd.
7. **Coverage penalty** — each under-block hole pressurises a `CALIBRATION.influenceRadiusMm`-radius influence circle (default 15 mm, Hamrock 2004); when spacing is too wide, `A_eff < A_block` and effective required pressure rises. Prevents the model from claiming sparse holes can lift heavy loads.
8. **Hover height** — [filmFlow.js](src/physics/filmFlow.js) computes both the viscous Reynolds-lubrication height `h = ∛(3μLQ/(WP))` and the inertial Bernoulli edge-gap height. The modified Reynolds number `Re* = ρUh²/(μL)` selects between them (Stokes below 0.5, max of both above).
9. **Compressibility guard** — [compressibility.js](src/physics/compressibility.js) raises `compressibilityWarning=true` when the hole Mach exceeds 0.3 (ISO 5167-1 §5.3.2). Default rig sits at M ≈ 0.07.

### Calibration and semi-empirical knobs

Three values are calibratable rather than derived and live in a single frozen `CALIBRATION` object at the top of [computeAirHockey.js](src/physics/computeAirHockey.js): `influenceRadiusMm`, `nearbyCaptureEff`, `fanIdleDrawFraction`, `minFanFlowFraction`, `defaultFanAeroEfficiency`. Each entry carries a provenance note (source, method, uncertainty).

`scripts/calibrate.mjs` (run: `npm run calibrate`) sweeps a 2-D grid of the two most tunable knobs against the hover-vs-mass dataset in `docs/experiments/`, reports the best fit, and writes it to `docs/VALIDATION.md` between the `<!-- calibrate:start -->` markers. The computeAirHockey function accepts `_calInfluenceRadiusMm` and `_calNearbyCaptureEff` as optional input overrides — this is the hook calibrate.mjs uses; don't call it from the UI.

### Experimental data

Raw rig measurements live in [docs/experiments/](docs/experiments/) as CSVs:

- `fan_curve.csv` — measured Dewalt P vs Q
- `hover_vs_mass.csv` — hover height (feeler gauge) at incremental masses, 3 repeats per point
- `plenum_pressure.csv` — plenum gauge pressure with carriage in place

CSVs ship with a `SAMPLE` placeholder row that the loader skips (see [src/data/csvParser.js](src/data/csvParser.js)), so builds work before Stream A data is captured. Once captured, `npm run calibrate && npm run figures` re-fits the knobs and regenerates `docs/figures/*.svg`. UI side is [src/data/experiments.js](src/data/experiments.js) (uses Vite `?raw`; not importable in Node tests — that's why `csvParser.js` is a separate pure module).

When editing physics, remember the experimental anchor: the rig lifts a 300 g block on a 110 mm strip with the Dewalt leaf blower, and the calculator is tuned to match that float/sink threshold (see the `experimental match` test in `computeAirHockey.test.js` and the planned full dataset in `hover_vs_mass.csv`).

### Tests

Unit tests live alongside the modules they exercise: [src/physics/__tests__/](src/physics/__tests__/) for the physics engine, [src/data/__tests__/](src/data/__tests__/) for pure data helpers. Notable files:

- `computeAirHockey.test.js` — end-to-end behavioural tests (Cd regime, power/stall clamps, float threshold near 300–600 g).
- `regression.test.js` — snapshot of the full result object at the default rig. If this drifts, regenerate with `vitest -u` **only** when the change is intentional and say why in the commit.
- `compressibility.test.js` / `inletLoss.test.js` — lock behaviour of the guards added in April 2026.
- `sensitivity.test.js` — direction (sign) of ∂output/∂input for the tornado chart, not magnitudes.
- `csvParser.test.js` — the experiment-data parser; safe in Node because it doesn't touch Vite.

`vitest.config.js` runs in the `node` environment over `src/**/*.{test,spec}.{js,jsx}`. Anything that imports `experiments.js` (Vite `?raw` CSVs) can only run in the browser — test the pure bits via `csvParser.js` instead.

### Visual checks

[scripts/visual-check.mjs](scripts/visual-check.mjs) and [scripts/console-check.mjs](scripts/console-check.mjs) drive Playwright against the local dev server; they expect `npm run dev` to already be running on port 5173. Screenshots land in `/tmp/airhockey-visual-check/`. Use these when touching the UI — type-check alone won't catch Recharts layout regressions.

## Documentation

Engineering documentation is in [docs/](docs/) and is the place readers go for context the code alone doesn't give:

- [docs/MODEL.md](docs/MODEL.md) — equations, assumptions, validity envelope, known limitations.
- [docs/VALIDATION.md](docs/VALIDATION.md) — experimental rig, model-vs-measurement comparison, sensitivity analysis, calibration table.
- [docs/REFERENCES.md](docs/REFERENCES.md) — every citation with DOI/URL. Single source of truth; [src/data/references.js](src/data/references.js) mirrors the short form for the UI's `<Ref>` component.
- [docs/WORKED_EXAMPLE.md](docs/WORKED_EXAMPLE.md) — one design problem solved end-to-end with intermediate numbers for readers verifying against hand calc.
- [docs/experiments/](docs/experiments/) — rig_config.md + CSV data capture templates.
- [docs/figures/](docs/figures/) — generated SVGs (produced by `npm run figures`; don't hand-edit).
- [docs/datasheets/](docs/datasheets/) — archived fan datasheets (link-rot insurance).

## CI / deployment

Two workflows in [.github/workflows/](.github/workflows/):

- `check.yml` runs on every PR and non-main push: `npm ci && npm run lint && npm test && prettier --check`.
- `deploy.yml` runs on `main`: first executes the same check job; only if it passes does the build+deploy to GitHub Pages run.

So deploy is always gated by green tests, lint, and formatting. A failing regression snapshot or an unformatted file blocks deploy.

## Conventions

- ESLint rule `no-unused-vars` ignores names matching `^[A-Z_]` (consts like `REFS`, `FAN_CURVE_C`) and args matching `^_` (intentionally-unused destructured props like `_onOpenDetailed`).
- Prettier: single quotes, trailing commas, 100-char print width, semicolons on. `npm run format` fixes; CI checks.
- Physics code: human units at the boundary (`*Mm`, `*G`, `*M3h`), SI everywhere internally via [units.js](src/physics/units.js). Keep [constants.js](src/physics/constants.js) purely declarative.
- Every semi-empirical number lives in `CALIBRATION` in [computeAirHockey.js](src/physics/computeAirHockey.js) with a source and uncertainty note. Don't sprinkle new magic numbers through the code.
- When adding a result field to `computeAirHockey`, the regression snapshot will fail until regenerated — expected. Note the intentional drift in the commit message.
