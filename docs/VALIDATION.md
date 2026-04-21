# Model Validation

This document compares model predictions to rig measurements. It is populated from CSVs in `docs/experiments/` and rebuilt by `scripts/build-figures.mjs`.

**Status: awaiting Stream A data capture** (see [../PLAN.md](../PLAN.md) for the capture protocol). The sections below are scaffolds; values marked **TBD** are filled in after the lab session.

## 1. Rig under test

Full rig configuration and measurement protocol are recorded in [experiments/rig_config.md](experiments/rig_config.md).

- Date: **TBD**
- Operator: **TBD**
- Ambient: **TBD** °C, **TBD** % RH, **TBD** Pa atmospheric
- Instruments: digital manometer (**TBD** model, ±**TBD** Pa), feeler gauges (±0.02 mm), mass balance (±0.1 g)

## 2. Fan characterisation

We measured the Dewalt DCMBL562N output curve by progressively throttling a variable-orifice restriction between the blower and a sealed plenum, reading plenum gauge pressure with the manometer and flow by Bernoulli back-calculation through a calibrated orifice.

Raw data: [experiments/fan_curve.csv](experiments/fan_curve.csv).

| Q [m³/h] | P [Pa] | Notes |
|---|---|---|
| TBD | TBD | TBD |

**Comparison to the model's linear fan preset** (Q_max = 762 m³/h, P_max = 1200 Pa, η_aero = 0.20):

Model-vs-experiment plot: `docs/figures/fan_curve.svg` (**TBD**).

Residual statistics: **TBD**.

## 3. Hover-vs-mass sweep

We added incremental masses (100 g increments from 100 g to the failure mass) and measured hover height with feeler gauges at three locations along the block.

Raw data: [experiments/hover_vs_mass.csv](experiments/hover_vs_mass.csv).

| Mass [g] | h̄ [mm] | σ [mm] | N repeats | Model h [mm] | Δ [mm] |
|---|---|---|---|---|---|
| TBD | TBD | TBD | TBD | TBD | TBD |

**Failure mass**: **TBD** g (observed); **TBD** g (predicted). Acceptable discrepancy: ±20 %.

Model-vs-experiment plot: `docs/figures/hover_vs_mass.svg` (**TBD**).

## 4. Plenum pressure verification

Plenum gauge pressure with the block in place, for cross-check against the split-flow operating-point prediction.

Raw data: [experiments/plenum_pressure.csv](experiments/plenum_pressure.csv).

| Mass [g] | P_plenum measured [Pa] | Model P_op [Pa] | Δ [%] |
|---|---|---|---|
| TBD | TBD | TBD | TBD |

## 5. Calibration

Two parameters in [CALIBRATION](../src/physics/computeAirHockey.js) are calibratable rather than derived:

- `influenceRadiusMm` — initially 15 mm from Hamrock 2004 Fig. 7-11.
- `nearbyCaptureEff` — initially 0.50 from back-of-envelope gutter-capture argument.

`scripts/calibrate.mjs` sweeps both on a 2-D grid, minimising the sum of squared residuals between predicted and measured hover height across `hover_vs_mass.csv`.

Best fit: **TBD** (will be written here automatically on the next `node scripts/calibrate.mjs` run).

Uncertainty (1σ on each parameter from the curvature of χ² near the minimum): **TBD**.

## 6. Sensitivity analysis

`scripts/build-figures.mjs` emits `docs/figures/sensitivity_hover.svg`: a tornado chart of the top drivers of `hoverHeightMm`, ranked by elasticity at the default operating point.

Output summary (placeholder):

| Input | Elasticity | Meaning |
|---|---|---|
| TBD | TBD | TBD |

## 7. Discussion

*Populated after the lab session.* Expected topics: where the model over- or under-predicts, which input uncertainty dominates, what refinements would most improve accuracy (CFD for the coverage factor? sealed plenum to eliminate nearby capture? higher-order fan curve?).

## 8. Re-running the validation

```bash
# Once the CSVs are updated
node scripts/calibrate.mjs         # re-fits the two semi-empirical knobs
node scripts/build-figures.mjs     # regenerates SVG plots in docs/figures/
npm test                           # experimental.test.js asserts match within ±1.5σ
```

Commit the updated CSVs, the new `CALIBRATION` values, the snapshot, and the regenerated figures together.
