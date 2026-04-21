#!/usr/bin/env node
/**
 * Render SVG figures for `docs/VALIDATION.md` from the experimental
 * datasets and the live physics model.
 *
 * Emits:
 *   docs/figures/fan_curve.svg          — Dewalt measured points vs. linear fit.
 *   docs/figures/hover_vs_mass.svg      — hover prediction curve + measured points with ±σ.
 *   docs/figures/sensitivity_hover.svg  — tornado chart for `hoverHeightMm`.
 *
 * Each figure degrades gracefully when the corresponding CSV has no
 * non-SAMPLE rows — the script writes a placeholder SVG with a
 * "no data yet" notice so the Markdown links still resolve.
 *
 * Usage:
 *     node scripts/build-figures.mjs
 *
 * No runtime dependencies — SVG is emitted by hand to keep the script
 * portable and reviewable.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { COERCIONS, aggregateHoverByMass, parseCsv } from '../src/data/csvParser.js';
import { computeAirHockey } from '../src/physics/computeAirHockey.js';
import { tornado } from '../src/physics/sensitivity.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const OUT = resolve(ROOT, 'docs/figures');
mkdirSync(OUT, { recursive: true });

// ── Rendering constants (declared first so placeholder() can reach them) ──
const W = 640;
const H = 400;
const PAD = { top: 40, right: 30, bottom: 55, left: 70 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

// Same rig baseline as calibrate.mjs; keep in sync with docs/experiments/rig_config.md.
const RIG = {
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
  fanFlowM3h: 762,
  fanPmaxPa: 1200,
  fanWatts: 300,
  fanAeroEfficiency: 0.2,
  costPerKwh: 0.245,
};

function load(csvFile, numericCols) {
  const path = resolve(ROOT, 'docs/experiments', csvFile);
  try {
    return parseCsv(readFileSync(path, 'utf8'), numericCols);
  } catch {
    return [];
  }
}

const hoverRows = load('hover_vs_mass.csv', COERCIONS.hover_vs_mass);
const fanRows = load('fan_curve.csv', COERCIONS.fan_curve);

buildHoverFigure(aggregateHoverByMass(hoverRows));
buildFanFigure(fanRows);
buildTornadoFigure();

// ── Figures ────────────────────────────────────────────────────

function buildHoverFigure(agg) {
  const path = resolve(OUT, 'hover_vs_mass.svg');
  if (agg.length === 0) {
    writeFileSync(path, placeholder('hover_vs_mass.csv', 'Hover vs. Mass — awaiting data'));
    console.error(`build-figures: ${path} written (placeholder)`);
    return;
  }
  // Predictions sweep over the same mass range.
  const massMin = Math.min(...agg.map((r) => r.mass_g)) * 0.9;
  const massMax = Math.max(...agg.map((r) => r.mass_g)) * 1.1;
  const model = [];
  for (let m = massMin; m <= massMax; m += (massMax - massMin) / 60) {
    const r = computeAirHockey({ ...RIG, massG: m });
    model.push({ x: m, y: r.hoverHeightMm });
  }
  const svg = scatterWithLine({
    title: 'Hover height vs. carriage mass',
    xLabel: 'Mass (g)',
    yLabel: 'Hover (mm)',
    points: agg.map((r) => ({ x: r.mass_g, y: r.mean_mm, err: r.std_mm })),
    line: model,
  });
  writeFileSync(path, svg);
  console.error(`build-figures: ${path} written (${agg.length} data points)`);
}

function buildFanFigure(rows) {
  const path = resolve(OUT, 'fan_curve.svg');
  const pts = rows
    .map((r) => ({ x: Number(r.q_m3h), y: Number(r.p_plenum_pa) }))
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (pts.length === 0) {
    writeFileSync(path, placeholder('fan_curve.csv', 'Fan curve — awaiting data'));
    console.error(`build-figures: ${path} written (placeholder)`);
    return;
  }
  // Linear model Q_max=762 m³/h, P_max=1200 Pa (Dewalt preset).
  const model = [];
  for (let q = 0; q <= RIG.fanFlowM3h; q += RIG.fanFlowM3h / 40) {
    const pPa = RIG.fanPmaxPa * (1 - q / RIG.fanFlowM3h);
    model.push({ x: q, y: Math.max(0, pPa) });
  }
  const svg = scatterWithLine({
    title: 'Fan curve — Dewalt DCMBL562N',
    xLabel: 'Flow (m³/h)',
    yLabel: 'Plenum pressure (Pa)',
    points: pts,
    line: model,
  });
  writeFileSync(path, svg);
  console.error(`build-figures: ${path} written (${pts.length} data points)`);
}

function buildTornadoFigure() {
  const path = resolve(OUT, 'sensitivity_hover.svg');
  const rows = tornado(RIG, 'hoverHeightMm').slice(0, 7);
  const svg = tornadoSvg({
    title: 'Top drivers of hover height (±1 % input perturbation)',
    rows,
  });
  writeFileSync(path, svg);
  console.error(`build-figures: ${path} written (${rows.length} drivers)`);
}

// ── SVG emitters ───────────────────────────────────────────────

function scatterWithLine({ title, xLabel, yLabel, points, line }) {
  const xs = [...points.map((p) => p.x), ...line.map((p) => p.x)];
  const ys = [
    ...points.map((p) => p.y + (p.err ?? 0)),
    ...points.map((p) => p.y - (p.err ?? 0)),
    ...line.map((p) => p.y),
  ];
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(0, ...ys);
  const yMax = Math.max(...ys) * 1.05;
  const sx = (x) => PAD.left + ((x - xMin) / (xMax - xMin || 1)) * PLOT_W;
  const sy = (y) => PAD.top + PLOT_H - ((y - yMin) / (yMax - yMin || 1)) * PLOT_H;

  const linePath = line.length
    ? 'M ' + line.map((p) => `${sx(p.x).toFixed(1)} ${sy(p.y).toFixed(1)}`).join(' L ')
    : '';
  const pointMarks = points
    .map(
      (p) =>
        `<g>
          ${p.err ? `<line x1="${sx(p.x)}" y1="${sy(p.y - p.err)}" x2="${sx(p.x)}" y2="${sy(p.y + p.err)}" stroke="#555" stroke-width="1"/>` : ''}
          <circle cx="${sx(p.x).toFixed(1)}" cy="${sy(p.y).toFixed(1)}" r="4" fill="#c03030" stroke="white" stroke-width="1"/>
        </g>`,
    )
    .join('');

  return svgFrame({
    title,
    children: `
    ${axes({ xMin, xMax, yMin, yMax, sx, sy })}
    <path d="${linePath}" fill="none" stroke="#3060c0" stroke-width="2"/>
    ${pointMarks}
    <text x="${W / 2}" y="${H - 15}" text-anchor="middle" font-size="13" fill="#333">${escape(xLabel)}</text>
    <text x="18" y="${PAD.top + PLOT_H / 2}" text-anchor="middle" font-size="13" fill="#333" transform="rotate(-90 18 ${PAD.top + PLOT_H / 2})">${escape(yLabel)}</text>
    <g font-size="11" fill="#444">
      <rect x="${W - 160}" y="${PAD.top - 5}" width="140" height="38" fill="white" stroke="#ccc"/>
      <line x1="${W - 150}" y1="${PAD.top + 5}" x2="${W - 120}" y2="${PAD.top + 5}" stroke="#3060c0" stroke-width="2"/>
      <text x="${W - 115}" y="${PAD.top + 9}">model</text>
      <circle cx="${W - 135}" cy="${PAD.top + 22}" r="4" fill="#c03030"/>
      <text x="${W - 115}" y="${PAD.top + 26}">measured ± 1σ</text>
    </g>`,
  });
}

function tornadoSvg({ title, rows }) {
  if (rows.length === 0) {
    return placeholder('sensitivity', 'No sensitivity data');
  }
  const maxAbs = Math.max(...rows.map((r) => Math.abs(r.elasticity)), 1e-3);
  const barH = 22;
  const totalH = 80 + rows.length * (barH + 10);
  const cx = W / 2;
  const halfW = PLOT_W / 2;
  const bars = rows
    .map((r, i) => {
      const y = 70 + i * (barH + 10);
      const w = (Math.abs(r.elasticity) / maxAbs) * halfW;
      const x = r.elasticity >= 0 ? cx : cx - w;
      const colour = r.elasticity >= 0 ? '#3060c0' : '#c03030';
      return `
        <rect x="${x.toFixed(1)}" y="${y}" width="${w.toFixed(1)}" height="${barH}" fill="${colour}"/>
        <text x="${PAD.left - 8}" y="${y + barH / 2 + 4}" text-anchor="end" font-size="12" fill="#333">${escape(r.input)}</text>
        <text x="${(r.elasticity >= 0 ? x + w + 4 : x - 4).toFixed(1)}" y="${y + barH / 2 + 4}" font-size="11" fill="#444" text-anchor="${r.elasticity >= 0 ? 'start' : 'end'}">${r.elasticity.toFixed(2)}</text>`;
    })
    .join('');
  return svgFrame({
    title,
    height: totalH,
    children: `
      <line x1="${cx}" y1="60" x2="${cx}" y2="${totalH - 10}" stroke="#888"/>
      ${bars}
      <text x="${W / 2}" y="${totalH - 5}" text-anchor="middle" font-size="12" fill="#444">elasticity (Δy/y ÷ Δx/x)</text>`,
  });
}

function axes({ xMin, xMax, yMin, yMax, sx, sy }) {
  const xTicks = niceTicks(xMin, xMax, 5);
  const yTicks = niceTicks(yMin, yMax, 5);
  const xAxis = xTicks
    .map(
      (t) =>
        `<g>
          <line x1="${sx(t)}" y1="${PAD.top + PLOT_H}" x2="${sx(t)}" y2="${PAD.top + PLOT_H + 5}" stroke="#888"/>
          <text x="${sx(t)}" y="${PAD.top + PLOT_H + 18}" text-anchor="middle" font-size="11" fill="#666">${t.toLocaleString()}</text>
        </g>`,
    )
    .join('');
  const yAxis = yTicks
    .map(
      (t) =>
        `<g>
          <line x1="${PAD.left - 5}" y1="${sy(t)}" x2="${PAD.left}" y2="${sy(t)}" stroke="#888"/>
          <line x1="${PAD.left}" y1="${sy(t)}" x2="${PAD.left + PLOT_W}" y2="${sy(t)}" stroke="#eee"/>
          <text x="${PAD.left - 8}" y="${sy(t) + 4}" text-anchor="end" font-size="11" fill="#666">${t.toLocaleString()}</text>
        </g>`,
    )
    .join('');
  return `
    <rect x="${PAD.left}" y="${PAD.top}" width="${PLOT_W}" height="${PLOT_H}" fill="white" stroke="#888"/>
    ${xAxis}${yAxis}`;
}

function niceTicks(a, b, n = 5) {
  const span = b - a || 1;
  const step = niceNumber(span / n, true);
  const min = Math.floor(a / step) * step;
  const max = Math.ceil(b / step) * step;
  const out = [];
  for (let v = min; v <= max + step / 2; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out.filter((v) => v >= a - step && v <= b + step);
}

function niceNumber(x, round) {
  const exp = Math.floor(Math.log10(x));
  const f = x / 10 ** exp;
  let nf;
  if (round) {
    if (f < 1.5) nf = 1;
    else if (f < 3) nf = 2;
    else if (f < 7) nf = 5;
    else nf = 10;
  } else {
    nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  }
  return nf * 10 ** exp;
}

function svgFrame({ title, children, height = H }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${height}" width="${W}" height="${height}" font-family="system-ui, -apple-system, sans-serif">
  <rect width="${W}" height="${height}" fill="white"/>
  <text x="${W / 2}" y="22" text-anchor="middle" font-size="15" font-weight="600" fill="#222">${escape(title)}</text>
  ${children}
</svg>`;
}

function placeholder(csv, title) {
  return svgFrame({
    title,
    children: `
    <text x="${W / 2}" y="${H / 2}" text-anchor="middle" font-size="14" fill="#888">
      docs/experiments/${csv} is empty — capture data and re-run
    </text>
    <text x="${W / 2}" y="${H / 2 + 24}" text-anchor="middle" font-size="12" fill="#aaa">
      node scripts/build-figures.mjs
    </text>`,
  });
}

function escape(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
