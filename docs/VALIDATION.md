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

**Comparison to the model's linear fan preset** (Q_max = 762 m³/h, P_max = 1500 Pa, η_aero = 0.20):

The shut-off pressure was **calibrated against an in-rig measurement** (2026-04 trial): with the carriage in place and the rig at steady state, the plenum manometer read **1246 Pa**. The original P_max estimate of 1200 Pa (derived from the nozzle dynamic-pressure argument ½ρv² × 65 %) under-predicted because a sealed plenum recovers more kinetic-to-static pressure than a free jet. Bumping P_max to 1500 Pa lands the modelled operating point at ≈ 1225 Pa (Δ < 2 %).

Model-vs-experiment plot: `docs/figures/fan_curve.svg` (**TBD**).

Residual statistics: **TBD**.

## 3. Hover-vs-mass sweep

We added incremental masses (100 g increments from 100 g to the failure mass) and measured hover height with feeler gauges at three locations along the block.

Raw data: [experiments/hover_vs_mass.csv](experiments/hover_vs_mass.csv).

**Latest carriage** (140 × 105 mm, 2026-05 revision):

| Mass [g] | h̄ [mm] (measured) | Source | Model h [mm] | Notes |
|---|---|---|---|---|
| 500 | 1.0–1.5 | 2026-04 trial | 0.36 | model under-predicts; see discussion below |

**Predicted failure mass** (140 × 105 carriage, Dewalt fan): the model finds the carriage still floating at 1500 g (head-room shrinking but positive). Real measurement on the new carriage is pending.

### Why the model under-predicts hover

The model deliberately omits the lateral-entrainment mechanism by which uncovered holes adjacent to the carriage feed the under-carriage film in an open-gutter rig (see [MODEL.md §2.7](MODEL.md#27-nearby-hole-capture-open-gutter-rigs--not-modelled)). Including it requires a 3-D coupled CFD model that is out of scope here.

The size of the residual ($h_\text{measured} - h_\text{predicted}$) is therefore an *experimental measurement* of how much hover the lateral-entrainment mechanism contributes on the rig, not a calibration error. For the 110 × 100 mm carriage the residual is ~0.7 mm at 500 g; for the 140 × 105 mm carriage we expect a similar magnitude (more covered holes increase $Q_\text{direct}$ but the entrainment from the smaller side gap also matters).

We considered fitting a lumped empirical knob ($\alpha \cdot L_\text{block}$ "capture range" with 100 % capture per nearby hole) to close the gap, and an earlier version of the model did so. We removed it because (a) the step-function form has no derivation, (b) it does not generalise across geometries, and (c) the residual itself is the more honest report. Future work would replace it with the CFD or 2-D enlarged-domain Reynolds solve outlined in MODEL.md §2.7.

Model-vs-experiment plot: `docs/figures/hover_vs_mass.svg` (**TBD**).

## 4. Plenum pressure verification

Plenum gauge pressure with the block in place, for cross-check against the split-flow operating-point prediction.

Raw data: [experiments/plenum_pressure.csv](experiments/plenum_pressure.csv).

| Mass [g] | P_plenum measured [Pa] | Model P_op [Pa] | Δ [%] |
|---|---|---|---|
| 400 (default) | 1246 (2026-04 trial) | 1232 | -1.1 % |

## 5. Calibration

Only one parameter in [CALIBRATION](../src/physics/computeAirHockey.js) is now calibratable rather than derived:

- `influenceRadiusMm` — initially 15 mm from Hamrock 2004 Fig. 7-11.

The earlier `nearbyCaptureEff` and `captureRangeBlockLengths` knobs were removed when the lumped lateral-entrainment term was dropped (see §3 above and [MODEL.md §2.7](MODEL.md#27-nearby-hole-capture-open-gutter-rigs--not-modelled)). The remaining knob (`influenceRadiusMm`) saturates at the coverage-factor cap of 1.0 for any reasonably dense hole pattern (~20 mm pitch with ~15 mm influence) so it has little leverage on the headline predictions.

`scripts/calibrate.mjs` sweeps `influenceRadiusMm`, minimising the sum of squared residuals between predicted and measured hover height across `hover_vs_mass.csv`.

Best fit: **TBD** (will be written here automatically on the next `node scripts/calibrate.mjs` run).

Uncertainty (1σ on the parameter from the curvature of χ² near the minimum): **TBD**.

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
