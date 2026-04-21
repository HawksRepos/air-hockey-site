# Rig Configuration — Experimental Log

Capture-time metadata. Fill in once per lab session; every CSV in this folder refers back to this file by `session_id`.

## Session

- **session_id**: `TBD` (ISO-8601 date-time, e.g. `2026-04-22T14:00`)
- **operator**: `TBD`
- **location**: `TBD`
- **ambient temperature**: `TBD` °C (±0.5 °C)
- **ambient humidity**: `TBD` % RH
- **atmospheric pressure**: `TBD` Pa
- **photos of rig & instruments**: see [photos/](photos/)

## Rig geometry

- **Strip material**: 2 mm cast acrylic
- **Strip dimensions**: 2000 mm × 110 mm
- **Hole pattern**: 2.0 mm holes on a 20 mm × 27.5 mm grid (4 rows × 100 holes)
- **Plate thickness drilled**: 2.0 mm
- **Carriage material**: 3 mm acrylic
- **Carriage dimensions**: 110 mm × 100 mm × 3 mm
- **Carriage empty mass**: `TBD` g (±0.1 g, digital scale)
- **Carriage with nominal payload (400 g total target)**: `TBD` g

## Fan

- **Model**: Dewalt DCMBL562N 18 V brushless leaf blower
- **Setting**: `TBD` (variable-speed trigger position)
- **Battery state of charge**: `TBD` % at start, `TBD` % at end
- **Coupling to rig**: `TBD` (describe adapter / duct / direct-into-gutter arrangement, include photo)

## Instruments

| Quantity | Instrument | Range | Resolution | Calibration |
|---|---|---|---|---|
| Plenum pressure | `TBD` digital manometer | `TBD` | `TBD` Pa | `TBD` |
| Hover gap | feeler gauges | 0.05 – 3.0 mm | 0.05 mm | n/a |
| Mass | `TBD` balance | `TBD` g | 0.1 g | `TBD` |
| Fan flow | pitot / calibrated orifice | `TBD` | `TBD` | `TBD` |

## Measurement protocol

1. Set up the rig, let the blower warm up at the target setting for 30 s.
2. For the **fan curve** (`fan_curve.csv`): progressively restrict the outlet with a variable orifice (iris or sliding plate), record plenum pressure and derived flow at 6–8 restriction levels from free-blow to ~80 % of shut-off.
3. For **hover vs. mass** (`hover_vs_mass.csv`): starting at 100 g, add 50 g increments until the carriage fails to float. At each mass:
   - Place the carriage at mid-strip.
   - Let it settle for 3 s.
   - Measure hover gap at three points (front, middle, rear) using feeler gauges.
   - Repeat three times, lifting and re-seating between repeats.
   - If the carriage tips or contacts on one edge, record the failure mode in `notes`.
4. For **plenum pressure** (`plenum_pressure.csv`): with the carriage on, read plenum gauge pressure at three masses (e.g. 150 g, 300 g, and ~30 g below failure). Three repeats each.

## Uncertainty

- Pressure: ± (manometer resolution) + 10 % of reading (to cover airflow pulsations).
- Hover: ± 0.05 mm per single reading; average of 3 locations reduces to ~0.03 mm, plus ±0.05 mm for rig flatness.
- Mass: ±0.1 g.
- Flow: ±5 % of reading at best (pitot) or ±10 % (orifice back-calc).

Combined uncertainty for each reported point is propagated in `scripts/calibrate.mjs` and surfaced as error bars in `docs/figures/*.svg`.
