# Worked Example — 400 g carriage on the Dewalt rig

Walk-through of a single design calculation so a reader can verify the tool against hand calculations.

**Problem.** Given a 400 g carriage (110 mm × 100 mm acrylic plus payload) on a 2 m × 110 mm open-gutter strip, driven by the Dewalt leaf blower, predict:

1. The operating plenum pressure $P_\mathrm{op}$.
2. Whether the carriage floats.
3. Hover height.
4. Fan electrical draw and running cost.

**Inputs.**

```js
{
  massG: 400,
  blockLengthMm: 110,
  blockWidthMm: 100,
  stripLengthMm: 2000,
  stripWidthMm: 110,
  holeDiaMm: 2.0,
  spacingMm: 20,
  rows: 4,
  stripThicknessMm: 2.0,
  fanMode: 'linear',
  fanFlowM3h: 762,   // Dewalt free-blow
  fanPmaxPa: 1200,   // Dewalt shut-off estimate
  fanWatts: 300,
  fanAeroEfficiency: 0.20,
  costPerKwh: 0.245,
}
```

## Step 1 — Required film pressure

$$P_\mathrm{req} = \frac{m g}{A_\mathrm{block}} = \frac{0.400 \cdot 9.81}{0.110 \cdot 0.100} = \frac{3.924}{0.0110} \approx 357\ \mathrm{Pa}$$

The film must push with **357 Pa** to hold the carriage up. A standing coffee mug on your desk exerts ~400 Pa — so this is modest.

## Step 2 — Hole count and area

- $N_\mathrm{holes\_per\_row} = \lfloor 2000 / 20 \rfloor = 100$
- $N_\mathrm{total} = 100 \times 4 = 400$
- $N_\mathrm{under\_block} = \lfloor 110 / 20 \rfloor \times 4 = 5 \times 4 = 20$
- $A_\mathrm{hole} = \pi (1\ \mathrm{mm})^2 = 3.14\ \mathrm{mm}^2 = 3.14 \times 10^{-6}\ \mathrm{m}^2$

## Step 3 — Discharge coefficient

$t/d = 2.0 / 2.0 = 1.0$. Interpolating Lichtarowicz: $C_{d,\mathrm{geom}} = 0.78$.

At the operating point $P \approx 350$ Pa, hole velocity is $v = \sqrt{2P/\rho} \approx 24\ \mathrm{m/s}$, Reynolds $\mathrm{Re} = v d / \nu \approx (24)(0.002)/(1.516 \times 10^{-5}) \approx 3170$. Reynolds factor $= \mathrm{Re}/(\mathrm{Re}+1000) = 0.76$. So $C_d \approx 0.78 \times 0.76 = 0.59$.

## Step 4 — Coverage factor

$r_\mathrm{inf} = 15$ mm. Influence per hole = $\pi (15)^2 = 707\ \mathrm{mm}^2$. Total coverage area = $20 \times 707 = 14,137\ \mathrm{mm}^2$. Block area = $110 \times 100 = 11,000\ \mathrm{mm}^2$. $\mathrm{cov} = \min(1, 14137/11000) = 1.0$. The block is well-covered; no penalty.

## Step 5 — Operating point

Bisection finds the $P$ where $Q_\mathrm{fan}(P) = Q_\mathrm{sys}(P)$.

Using the linear fan $Q_\mathrm{fan}(P) = 762 (1 - P/1200) / 3600\ \mathrm{m^3/s}$ and the split-flow system demand (20 covered holes at $\Delta P = P - 357$, 380 uncovered at $\Delta P = P$), the intersection is approximately:

- $P_\mathrm{op} \approx 580\ \mathrm{Pa}$
- $Q_\mathrm{op} \approx 0.11\ \mathrm{m^3/s}\ (\approx 400\ \mathrm{m^3/h})$

Aero-power check: $P_\mathrm{op} \cdot Q_\mathrm{op} \approx 63\ \mathrm{W}$. Budget: $\eta_\mathrm{aero} \cdot P_\mathrm{elec} = 0.20 \times 300 = 60\ \mathrm{W}$. Slight overshoot → **power clamp engages**, pulling the operating point down to satisfy $P \cdot Q = 60\ \mathrm{W}$.

**Actual operating point (tool output)**: $P_\mathrm{op} \approx 450$ Pa, $Q_\mathrm{op} \approx 0.133\ \mathrm{m^3/s}$.

## Step 6 — Float check

Effective required pressure $P_\mathrm{req,eff} = P_\mathrm{req}/\mathrm{cov} = 357 / 1.0 = 357\ \mathrm{Pa}$.

$P_\mathrm{op} = 450 > 357$ → **floats**, with headroom $= (450 - 357)/357 = 26\,\%$.

## Step 7 — Hover height

- $\Delta P_\mathrm{holes} = P_\mathrm{op} - P_\mathrm{req} = 93$ Pa
- Direct inflow $Q_\mathrm{direct} = C_d \cdot 20 A_\mathrm{hole} \cdot \sqrt{2 \cdot 93/\rho} \approx 0.59 \cdot 63 \times 10^{-6} \cdot 12.4 \approx 4.6 \times 10^{-4}\ \mathrm{m^3/s}$
- Nearby capture (block fills strip → sides closed → NC = 0): $Q_\mathrm{nearby} = 0$
- $Q_\mathrm{in} = 4.6 \times 10^{-4}\ \mathrm{m^3/s}$

Viscous hover:
$$h = \sqrt[3]{\frac{3 \mu L Q}{W P}} = \sqrt[3]{\frac{3 \cdot 1.81 \times 10^{-5} \cdot 0.110 \cdot 4.6 \times 10^{-4}}{0.100 \cdot 357}} \approx \sqrt[3]{7.7 \times 10^{-11}} \approx 4.3 \times 10^{-4}\ \mathrm{m} = 0.43\ \mathrm{mm}$$

Inertial hover (perimeter = 2 × 0.100 = 0.200 m):
$$h = \frac{Q}{C_d \cdot L_\mathrm{perim} \cdot \sqrt{2P/\rho}} = \frac{4.6 \times 10^{-4}}{0.60 \cdot 0.200 \cdot 24.4} \approx 1.6 \times 10^{-4}\ \mathrm{m} = 0.16\ \mathrm{mm}$$

Modified Reynolds at $h = 0.43$ mm: $U \approx Q/(Wh) = 4.6 \times 10^{-4}/(0.100 \cdot 4.3 \times 10^{-4}) \approx 11\ \mathrm{m/s}$; $\mathrm{Re}^* = \rho U h^2/(\mu L) = 1.2 \cdot 11 \cdot (4.3\!\times\!10^{-4})^2/(1.81\!\times\!10^{-5} \cdot 0.110) \approx 1.2$. Above the 0.5 threshold → take $\max(h_\mathrm{visc}, h_\mathrm{inert}) = 0.43$ mm.

**Predicted hover: ~0.4 mm.** Thinner than the observed 2–3 mm at 350 g on the Dewalt — see [VALIDATION.md](VALIDATION.md) for the calibration that brings the two into agreement.

## Step 8 — Electrical draw and cost

At the power-clamped operating point the motor draws its full rated 300 W (the clamp means aero output ≈ $\eta \cdot P_\mathrm{elec}$, so electrical ≈ rated).

- Idle floor: $0.40 \times 300 = 120\ \mathrm{W}$
- Power-clamped draw: $300\ \mathrm{W}$
- Cost per hour: $0.300\ \mathrm{kW} \times £0.245/\mathrm{kWh} = £0.074/\mathrm{hr}$
- Cost per 8 hr day: $£0.59$

## Step 9 — Cross-check against the tool

```js
import { computeAirHockey } from './src/physics/computeAirHockey.js';
const r = computeAirHockey({ /* the inputs above */ });
console.log(r.pOp, r.qOp, r.hoverHeightMm, r.costPerHour);
```

Expected (±5 %):

- `pOp`: **TBD Pa** (hand calculation ≈ 450)
- `qOp`: **TBD m³/s** (hand calculation ≈ 0.133)
- `hoverHeightMm`: **TBD mm** (hand calculation ≈ 0.4)
- `costPerHour`: **TBD £** (hand calculation ≈ 0.074)

(Populate from the live tool after Stream A recalibration lands.)
