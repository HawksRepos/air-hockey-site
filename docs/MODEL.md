# Physical Model

This document describes the equations, assumptions, validity envelope, and known limitations of the air-cushioned carriage calculator. Every number the site reports traces to one of the sections below.

## 1. Rig configuration

The tool is tuned to a specific physical rig:

- **Strip**: 2000 mm × 110 mm acrylic plenum (nominally a section of U-profile guttering), 2.0 mm thick, open top.
- **Hole pattern**: 2.0 mm holes on a 20 mm × 27.5 mm grid (4 rows × 100 holes along 2 m), drilled perpendicular to the strip surface.
- **Carriage**: 110 mm × 100 mm acrylic plate, payload up to ~400 g.
- **Fan**: Dewalt DCMBL562N 18 V brushless leaf blower (approx. 762 m³/h free-blow, ~1200 Pa peak). A Manrose MAN150M centrifugal duct fan (80 W, 420 m³/h, 2747 Pa) is supplied as an alternate preset.

The model generalises to similar open-gutter rigs as long as the inputs stay inside the validity envelope (§6).

## 2. Equations

### 2.1 Incompressible orifice flow

Each hole obeys Bernoulli:

$$Q = C_d \, A \, \sqrt{\frac{2 \, \Delta P}{\rho}}$$

where $A = \pi d^2 / 4$ and $C_d$ is the short-tube discharge coefficient (§2.2). [[orifice.js](../src/physics/orifice.js)]

### 2.2 Discharge coefficient

Two effects combine:

1. **Geometric**: $C_{d,\mathrm{geom}} = f(t/d)$, interpolated from Lichtarowicz et al. (1965) table for a short drilled hole. The limit $t/d \to 0$ gives $C_d \to 0.61$ (sharp thin-plate); $t/d \gtrsim 3$ gives $C_d \to 0.82$ (long-tube). [[dischargeCoefficient.js](../src/physics/dischargeCoefficient.js)]
2. **Reynolds**: the tabulated values assume $\mathrm{Re}_d \gtrsim 2000$. Below that, a multiplicative factor $\mathrm{Re}/(\mathrm{Re}+1000)$ collapses $C_d$ smoothly toward zero (Idelchik 2007 §4.5).

$C_d$ and $\mathrm{Re}$ are coupled (each depends on the other via the hole velocity), so the solver uses fixed-point iteration — converges in 3–5 steps.

### 2.3 Split-flow operating point

Holes covered by the carriage discharge against the film pressure $P_\mathrm{film} = m g / A_\mathrm{block}$; holes outside the carriage vent to atmosphere. The system demand is therefore

$$Q_\mathrm{sys}(P) = Q_\mathrm{uncov}(P) + Q_\mathrm{cov}(P - P_\mathrm{film}).$$

The fan delivers $Q_\mathrm{fan}(P)$ (piecewise-linear interpolation of the digitised curve, or a linear $Q_\mathrm{fan} = Q_\mathrm{max}(1-P/P_\mathrm{max})$ toy model). The operating point is the unique intersection, found by bisection in $P$. [[solveOperatingPoint.js](../src/physics/solveOperatingPoint.js)]

### 2.4 Fan power and stall clamps

Two post-hoc corrections reflect physical limits not visible in the raw curve:

- **Power clamp**: aerodynamic output $P \cdot Q$ cannot exceed $\eta_\mathrm{aero} \cdot P_\mathrm{elec}$. Small duct fans typically deliver 20–35 % aero efficiency (Çengel & Cimbala 2018). If the unclamped intersection implies more power than that, the operating point is re-bisected on the system curve until $P \cdot Q = \eta_\mathrm{aero} \cdot P_\mathrm{elec}$.
- **Stall clamp**: flow below ~15 % of free-blow is the unstable stall regime where the published curve no longer applies. Below that threshold the flow is pinned and $P$ is the corresponding curve value.

### 2.5 Coverage penalty

When holes are sparse relative to the block footprint, pressure under the block is non-uniform: peaks near each hole, near-ambient in between. The model approximates this with a **coverage factor**

$$\mathrm{cov} = \min\!\left(1,\ \frac{N_\mathrm{under} \cdot \pi r_\mathrm{inf}^2}{A_\mathrm{block}}\right),$$

with influence radius $r_\mathrm{inf} = 15$ mm (Hamrock 2004 Fig. 7-11). This scales the effective lift area $A_\mathrm{eff} = A_\mathrm{block} \cdot \mathrm{cov}$ and raises the effective required pressure $P_\mathrm{req,eff} = F / A_\mathrm{eff}$. It is a first-order correction, not a 2-D film solve; `scripts/calibrate.mjs` re-fits $r_\mathrm{inf}$ against experimental data once available.

### 2.6 Hover height

Two regimes:

- **Viscous** (Reynolds lubrication equation, Hamrock 2004 Ch. 7):
  $$h = \sqrt[3]{\frac{3 \, \mu \, L \, Q_\mathrm{in}}{W \, P_\mathrm{film}}}$$
  valid when the modified Reynolds number $\mathrm{Re}^{\!*} = \rho U h^2 / (\mu L) \ll 1$ (Stokes flow in the film).
- **Inertial** (Bernoulli edge-gap):
  $$h = \frac{Q_\mathrm{in}}{C_{d,\mathrm{gap}} \, L_\mathrm{perim} \, \sqrt{2 P_\mathrm{film}/\rho}}$$
  valid when $\mathrm{Re}^{\!*} \gg 1$.

We compute both and select by $\mathrm{Re}^{\!*}$: below 0.5 use viscous; above 0.5 take $\max(h_\mathrm{visc},\,h_\mathrm{inert})$ as a conservative engineering blend. For the default rig $\mathrm{Re}^{\!*} \approx 0.3-2$, so both mechanisms contribute.

### 2.7 Nearby-hole capture (open-gutter rigs)

In an open-gutter rig (no sealed plenum at the block edges), surface flow from uncovered holes partially converges on the block. The model captures a fraction $\mathrm{NC} = 0.5$ of the uncovered-hole flow into the under-block film:

$$Q_\mathrm{in} = Q_\mathrm{direct} + \mathrm{NC} \cdot (Q_\mathrm{total\_holes} - Q_\mathrm{direct}).$$

`NC` is semi-empirical — see [CALIBRATION](../src/physics/computeAirHockey.js) for provenance. Sealed plenums set $\mathrm{NC} = 0$ automatically when the block fills the strip width.

### 2.8 Inlet (manifold) loss

Optional. A lumped loss coefficient $K$ represents duct bends, expansions, and screens between the fan outlet and the plenum:

$$\Delta P_\mathrm{loss} = K \cdot \tfrac{1}{2} \rho v_\mathrm{duct}^2, \quad v_\mathrm{duct} = Q / A_\mathrm{duct}.$$

The fan must deliver $P_\mathrm{fan} = P_\mathrm{plenum} + \Delta P_\mathrm{loss}(Q)$ at its outlet. Default $K = 0$ (open-gutter rig has no duct). See [inletLoss.js](../src/physics/inletLoss.js).

**Known limitation**: inlet loss is currently applied only to the unclamped solver branch. When the fan is power-limited, the clamp uses $P_\mathrm{plenum} \cdot Q$ rather than $P_\mathrm{fan} \cdot Q$ as the aero-power budget — a second-order optimism. For the default rig ($K = 0$) this is irrelevant; for studies with a real duct, treat the predicted plenum pressure as an upper bound when `powerLimited=true`.

### 2.9 Compressibility guard

The Bernoulli form assumes $M \ll 1$. The solver computes the hole Mach number $M = v / a_\mathrm{air}$ and raises `compressibilityWarning` when $M \geq 0.3$ (ISO 5167-1 §5.3.2). For the default rig $M \approx 0.07$, well inside the validated regime. See [compressibility.js](../src/physics/compressibility.js).

## 3. Solver mechanics

- Bisection on plenum pressure $P$, bracketed $[P_\mathrm{film},\ P_\mathrm{stall}]$, tolerance 0.01 Pa.
- Fixed-point outer loop on $C_d \leftrightarrow \mathrm{Re}$, tolerance $|\Delta C_d| < 10^{-4}$, max 8 iterations.
- Optional fixed-point inner loop for inlet loss, tolerance $|\Delta Q| < 10^{-6}$ m³/s, max 20 iterations.
- Verification: residual $|Q_\mathrm{fan}(P_\mathrm{op}) - Q_\mathrm{sys}(P_\mathrm{op})|$ is asserted to be $< 10^{-6}$ m³/s in [computeAirHockey.test.js](../src/physics/__tests__/computeAirHockey.test.js).

## 4. Constants

| Symbol | Value | Source |
|---|---|---|
| $\rho$ | 1.20 kg/m³ | Air at 20 °C, 1 atm — Engineering ToolBox, ISA [constants.js](../src/physics/constants.js) |
| $\mu$ | 1.81 × 10⁻⁵ Pa·s | Sutherland at 293.15 K / NIST WebBook |
| $\nu$ | 1.516 × 10⁻⁵ m²/s | $\mu/\rho$ |
| $a_\mathrm{air}$ | 343 m/s | Speed of sound at 20 °C |
| $g$ | 9.81 m/s² | Standard gravity |

## 5. Assumptions

1. **Incompressible flow** through orifices ($M \leq 0.3$; guarded in §2.9).
2. **Isothermal** — all air at 20 °C; no thermal correction to $\rho$ or $\mu$.
3. **Continuum** — hole diameter ≫ mean free path ≈ 70 nm; always true in this rig.
4. **Turbulent orifice flow** — $\mathrm{Re}_d \gtrsim 2000$; the Reynolds correction tapers $C_d$ smoothly below this but the tabulated $C_{d,\mathrm{geom}}$ is extrapolated.
5. **1-D Reynolds lubrication film** — block length and width ≫ gap height (always satisfied: $h \sim 1$ mm, $L \sim 100$ mm).
6. **Sharp-edged, burr-free holes** — deburring after drilling is assumed. Burrs add uncharacterised losses.
7. **Uniform plenum pressure** — the plenum is treated as well-mixed; pressure gradients along the 2 m strip are ignored. Valid if the strip internal volume is large vs. the flow rate times residence time.
8. **Rigid block, flat strip** — no bending, no manufacturing warp. Real carriages may see a few tens of µm of flatness error; sub-dominant next to ~1 mm hover.
9. **No acoustic resonance** — plenum quarter-wave resonances above 100 Hz are ignored.

## 6. Validity envelope

The model is intended for inputs in these ranges. Outside them, predictions are *extrapolated* and the site's Validity badge will turn amber/red.

| Input | Validated range | Hard limit |
|---|---|---|
| Block mass | 50 – 700 g | any |
| Block length × width | 50–200 mm × 50–200 mm | ≤ strip dimensions |
| Strip length | 500 – 3000 mm | > block length |
| Strip width | 50 – 200 mm | > block width |
| Strip thickness | 1 – 8 mm | > 0 |
| Hole diameter | 1 – 5 mm | > 0 |
| Hole spacing | 10 – 60 mm | > hole dia |
| Rows | 2 – 6 | ≥ 1 |
| Fan rated power | 40 – 500 W | > 0 |
| Plenum pressure (computed) | 100 – 3000 Pa | ≥ 0 |
| Hole Mach (computed) | ≤ 0.3 | ≤ 1 |

## 7. Uncertainty summary

Reported as ±1σ on the output, propagated from input uncertainty by finite-difference sensitivity (see [sensitivity.js](../src/physics/sensitivity.js) and [VALIDATION.md](VALIDATION.md)).

Pending calibration. Populated from `docs/experiments/` once captured.

## 8. What the model does **not** capture

- 2-D film pressure distribution (we use a 1-D Reynolds equation with an approximate coverage factor).
- Block tilt / centre-of-pressure vs. centre-of-gravity stability.
- Static friction at breakaway (relevant to start-up forces, not steady hover).
- Transient response (spin-up, mass perturbations).
- Side-load stability in an open-gutter rig (the two long edges are a known failure mode).
- Non-Newtonian air behaviour (none; air is Newtonian).

## 9. References

See [REFERENCES.md](REFERENCES.md) for full citations and DOIs.
