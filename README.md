# Air Hockey Strip Calculator

Interactive calculator for designing an air-cushioned floating carriage using plenum guttering and a centrifugal fan.

**[Live Demo →](https://hawksrepos.github.io/air-hockey-site/)**

## What it does

- Calculates the operating point where fan supply meets hole demand using a **real digitised fan curve** (Manrose MAN150M, Curve C)
- Estimates **hover height**, lift margin, energy efficiency, and running costs
- 7 interactive graphs that update live as you adjust parameters
- 7-layer verification system with independent cross-checks
- Sweet spot optimiser balancing margin, efficiency, and hover height
- Toggle between the real fan curve and a custom linear model

## Defaults

Optimised for a 300g block on a 2m × 110mm guttering strip:
- **4 rows** of holes for weight distribution tolerance
- **20mm spacing** for smooth gliding (24 holes always under block)
- **3mm holes** — easy to drill, good pressure, +400% margin

## Deploy to GitHub Pages

1. Fork or clone this repo
2. Go to **Settings → Pages → Source → GitHub Actions**
3. Push to `main` — the site deploys automatically

Or build locally:
```bash
npm install
npm run build
# Serve dist/ folder
```

## Tech

React + Recharts, built with Vite. No backend — everything runs in the browser.

## Fan curve data

Digitised from the Manrose MAN150M datasheet (Curve C):
- P_max ≈ 280 mmwg (2747 Pa) at zero flow
- Q_max = 420 m³/h at zero back-pressure
- 80W rated power

