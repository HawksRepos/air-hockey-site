import { useState, useMemo, useCallback } from "react";
import { Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ComposedChart, ResponsiveContainer } from "recharts";
import { Cd, RHO, G } from "./physics/constants.js";
import { fanCurveQ, linearFanQ } from "./physics/fanCurve.js";
import { FAN_CURVE_C, FAN_CURVE_C_RAW } from "./data/manroseMan150m.js";
import { computeAirHockey } from "./physics/computeAirHockey.js";
import { useTheme } from "./ThemeContext.jsx";
import { themes, defaultThemeId } from "./theme.js";

/** Map the shared theme tokens to the legacy COLORS keys used throughout
 *  this file. This lets us switch dark/light without renaming 200+ refs. */
function themeToColors(t) {
  return {
    bg: t.bg,
    card: t.surface,
    text: t.text,
    textSoft: t.textSoft,
    blue: t.accent,
    teal: t.teal ?? t.success,
    orange: t.orange ?? t.warning,
    purple: t.purple,
    rose: t.rose ?? t.danger,
    hlYellow: t.hlYellow,
    hlGreen: t.hlGreen,
    hlBlue: t.hlBlue,
    hlRose: t.hlRose,
    border: t.border,
  };
}

// Module-level COLORS used by helper components (Ref, Slider, Card, etc.)
// that are defined outside the main component. Updated each render.
let COLORS = themeToColors(themes[defaultThemeId]);

const REFS = [
  { id: 1, short: "Engineering ToolBox", title: "Orifice, Nozzle and Venturi Flow Rate Meters", url: "https://www.engineeringtoolbox.com/orifice-nozzle-venturi-d_590.html" },
  { id: 2, short: "Bird Precision", title: "BDS Sharp Edge Orifices — Discharge Coefficient", url: "https://birdprecision.com/publications/bds-sharp-edge-orifices/" },
  { id: 3, short: "Engineers Edge", title: "ISO Metric Drill Bit Size Table (ANSI/ASME B94.11M)", url: "https://www.engineersedge.com/drill_sizes.htm" },
  { id: 4, short: "TLC Direct", title: "Manrose MAN150M 150mm In-Line Centrifugal Fan — Specifications", url: "https://www.tlc-direct.co.uk/Products/MRMRK150M.html" },
  { id: 5, short: "Engineering ToolBox", title: "International Standard Atmosphere (ISA) — Air Properties", url: "https://www.engineeringtoolbox.com/international-standard-atmosphere-d_985.html" },
  { id: 6, short: "Utah State University", title: "Discharge Coefficient Performance of Venturi, Standard Concentric Orifice Plate, V-Cone, and Wedge Flow Meters", url: "https://digitalcommons.usu.edu/cgi/viewcontent.cgi?article=1865&context=etd" },
  { id: 7, short: "New Way Air Bearings", title: "Technical Report: Orifice vs Porous Media Air Bearings", url: "https://www.newwayairbearings.com/technology/technical-resources/new-way-techincal-reports/technical-report-1-orifice-vs-porous-media-air-bearings/" },
  { id: 8, short: "Ofgem", title: "Energy Price Cap Explained", url: "https://www.ofgem.gov.uk/information-consumers/energy-advice-households/energy-price-cap-explained" },
  { id: 9, short: "OpenStax", title: "University Physics — Bernoulli's Equation (Ch. 14.8)", url: "https://phys.libretexts.org/Bookshelves/University_Physics/University_Physics_(OpenStax)/Book%3A_University_Physics_I_-_Mechanics_Sound_Oscillations_and_Waves_(OpenStax)/14%3A_Fluid_Mechanics/14.08%3A_Bernoullis_Equation" },
  { id: 10, short: "CNC Cookbook", title: "G81, G73, G83: Drilling & Peck Drilling Canned Cycles", url: "https://www.cnccookbook.com/g81-g73-g83-drill-peck-canned-cycle/" },
  { id: 11, short: "UKAM", title: "Micro Drilling Guide — Deflection, Breakage & Feed Rate", url: "https://ukam.com/micro-drilling-guide/" },
  { id: 12, short: "THK", title: "Features of the LM Guide — Friction Coefficient", url: "https://tech.thk.com/en/products/pdf/en_b01_008.pdf" },
  { id: 13, short: "ISO 5167-1:2022", title: "Measurement of fluid flow by means of pressure differential devices inserted in circular cross-section conduits running full — Part 1: General principles", url: "https://www.iso.org/standard/79179.html" },
  { id: 14, short: "Lichtarowicz et al. 1965", title: "Discharge coefficients for incompressible non-cavitating flow through long orifices. J. Mech. Eng. Sci. 7(2):210–219.", url: "https://doi.org/10.1243/JMES_JOUR_1965_007_029_02" },
  { id: 15, short: "Idelchik 2007", title: "Handbook of Hydraulic Resistance, 3rd ed. — orifice and short-tube discharge coefficients (Ch. 4).", url: "https://www.begellhouse.com/ebook_platform/61df93de7adf5e0c.html" },
  { id: 16, short: "Hamrock 2004", title: "Fundamentals of Fluid Film Lubrication, 2nd ed. — Reynolds equation and air-bearing film theory (Ch. 7).", url: "https://www.routledge.com/Fundamentals-of-Fluid-Film-Lubrication/Hamrock-Schmid-Jacobson/p/book/9780824753719" },
];

function Ref({ n }) {
  const ref = REFS.find(r => r.id === n);
  if (!ref) return <sup>[{n}]</sup>;
  return (
    <a href={ref.url} target="_blank" rel="noopener noreferrer"
      style={{ fontSize: "0.65em", verticalAlign: "super", color: COLORS.blue, textDecoration: "none", fontWeight: 600, cursor: "pointer" }}
      title={`${ref.short}: ${ref.title}`}
    >[{n}]</a>
  );
}

// Fan curve, interpolation helpers, and operating-point solver are now
// imported from src/physics and src/data — see top of file.

function Slider({ label, unit, value, min, max, step, onChange, color = COLORS.teal, description }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div style={{ marginBottom: "1.2rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.3rem" }}>
        <span style={{ fontSize: "0.85rem", fontWeight: 500, color: COLORS.text }}>{label}</span>
        <span style={{ fontSize: "1.05rem", fontWeight: 700, color, fontVariantNumeric: "tabular-nums" }}>
          {typeof step === "number" && step < 1 ? value.toFixed(1) : value} {unit}
        </span>
      </div>
      {description && <div style={{ fontSize: "0.75rem", color: COLORS.textSoft, marginBottom: "0.4rem", lineHeight: 1.4 }}>{description}</div>}
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{
          width: "100%", height: "6px", borderRadius: "3px", outline: "none", cursor: "pointer",
          WebkitAppearance: "none", appearance: "none",
          background: `linear-gradient(to right, ${color} 0%, ${color} ${pct}%, #E5DDD2 ${pct}%, #E5DDD2 100%)`,
        }}
      />
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.7rem", color: COLORS.textSoft, marginTop: "0.15rem" }}>
        <span>{min}{unit}</span><span>{max}{unit}</span>
      </div>
    </div>
  );
}

function Card({ color, label, title, children }) {
  return (
    <div style={{
      background: COLORS.card, borderRadius: "16px", padding: "1.4rem 1.6rem",
      marginBottom: "1rem", boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
      borderLeft: `6px solid ${color}`,
    }}>
      {label && <div style={{ fontSize: "0.7rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color, marginBottom: "0.2rem" }}>{label}</div>}
      {title && <h2 style={{ fontSize: "1.2rem", fontWeight: 600, marginBottom: "1rem", color: COLORS.text }}>{title}</h2>}
      {children}
    </div>
  );
}

function Eq({ label, children, result }) {
  return (
    <div style={{ background: COLORS.card, borderRadius: "12px", padding: "1rem 1.2rem", margin: "0.8rem 0", fontSize: "0.95rem", lineHeight: 1.9 }}>
      {label && <span style={{ fontSize: "0.75rem", color: COLORS.textSoft, display: "block", marginBottom: "0.2rem" }}>{label}</span>}
      <div>{children}</div>
      {result && <div style={{ fontWeight: 600, fontSize: "1.05rem", color: COLORS.teal, marginTop: "0.2rem" }}>{result}</div>}
    </div>
  );
}

function ResultBox({ label, value, note, small }) {
  return (
    <div style={{
      background: `linear-gradient(135deg, ${COLORS.hlGreen}, ${COLORS.hlBlue})`,
      borderRadius: "14px", padding: small ? "1rem 1.2rem" : "1.2rem 1.5rem", margin: "0.8rem 0",
      border: `2px solid ${COLORS.teal}`,
    }}>
      {label && <div style={{ fontSize: "0.85rem", color: COLORS.text }}>{label}</div>}
      <div style={{ fontSize: small ? "1.4rem" : "1.8rem", fontWeight: 700, color: COLORS.teal, margin: "0.2rem 0" }}>{value}</div>
      {note && <div style={{ fontSize: "0.85rem", color: COLORS.text }}>{note}</div>}
    </div>
  );
}

function Info({ children }) {
  return (
    <div style={{ background: COLORS.hlBlue, borderRadius: "14px", padding: "1.1rem 1.3rem", margin: "0.8rem 0", border: `2px solid ${COLORS.blue}`, fontSize: "0.9rem", lineHeight: 1.7, color: COLORS.text }}>
      {children}
    </div>
  );
}

function CustomTooltip({ active, payload, label, xLabel, xUnit, yUnit, precision }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: "10px", padding: "0.7rem 1rem", fontSize: "0.8rem", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}>
      <div style={{ fontWeight: 600, marginBottom: "0.3rem" }}>{xLabel}: {typeof label === "number" ? label.toFixed(precision ?? 1) : label} {xUnit}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color }}>
          {p.name}: {typeof p.value === "number" ? p.value.toFixed(precision ?? 1) : p.value} {yUnit}
        </div>
      ))}
    </div>
  );
}

const StripDiagram = ({ stripLength, stripWidth, blockLength, blockWidth, spacing, rows, holeDia }) => {
  const holesPerRow = Math.floor(stripLength / spacing);
  const totalHoles = holesPerRow * rows;
  const rowPositions = [];
  const rowGap = stripWidth / (rows + 1);
  for (let r = 1; r <= rows; r++) rowPositions.push(rowGap * r);
  const rowColors = [COLORS.blue, COLORS.teal, COLORS.purple, COLORS.orange, COLORS.rose, "#D97706"];
  const clearanceEach = (stripWidth - blockWidth) / 2;

  // === FULL STRIP OVERVIEW ===
  const oW = 700, oH = 130;
  const oM = { left: 50, right: 20, top: 22, bottom: 35 };
  const oDW = oW - oM.left - oM.right;
  const oDH = oH - oM.top - oM.bottom;
  const oSX = oDW / stripLength;
  const oSY = oDH / stripWidth;

  const maxOverview = 200;
  const oStep = Math.max(1, Math.ceil(holesPerRow / maxOverview));
  const oHoleR = Math.max(0.6, Math.min(1.8, oDH / stripWidth * (holeDia / 2) * 0.5));

  const blockStartX = stripLength * 0.15;
  const blockEndX = blockStartX + blockLength;
  const blockStartY = (stripWidth - blockWidth) / 2;

  // === ZOOMED INSET (true proportions) ===
  const zW = 700, zH = 240;
  const zM = { left: 50, right: 50, top: 30, bottom: 35 };
  const zDW = zW - zM.left - zM.right;
  const zDH = zH - zM.top - zM.bottom;
  const zWindowLength = Math.min(stripLength, blockLength * 3.5);
  const zWindowWidth = stripWidth;
  const zScaleX = zDW / zWindowLength;
  const zScaleY = zDH / zWindowWidth;
  const zScale = Math.min(zScaleX, zScaleY);
  const zActualW = zWindowLength * zScale;
  const zActualH = zWindowWidth * zScale;
  const zOffX = zM.left + (zDW - zActualW) / 2;
  const zOffY = zM.top + (zDH - zActualH) / 2;
  const zWindowStart = Math.max(0, Math.min(stripLength - zWindowLength, blockStartX + blockLength / 2 - zWindowLength / 2));

  const zFirstHole = Math.max(0, Math.floor(zWindowStart / spacing));
  const zLastHole = Math.min(holesPerRow - 1, Math.ceil((zWindowStart + zWindowLength) / spacing));
  const zHoleR = Math.max(1.5, Math.min(4, (holeDia / 2) * zScale * 0.8));

  return (
    <div>
      <div style={{ fontSize: "0.75rem", fontWeight: 600, color: COLORS.textSoft, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.3rem" }}>
        Full Strip Overview
      </div>
      <svg viewBox={`0 0 ${oW} ${oH}`} style={{ width: "100%", maxHeight: "130px", display: "block" }}>
        <rect x={oM.left} y={oM.top} width={oDW} height={oDH} rx="3" fill="#E8E4DC" stroke="#B0A999" strokeWidth="1" />
        <rect x={oM.left} y={oM.top - 3} width={oDW} height="3" rx="1.5" fill="#B8D4E3" opacity="0.7" />
        <rect x={oM.left} y={oM.top + oDH} width={oDW} height="3" rx="1.5" fill="#B8D4E3" opacity="0.7" />

        {rowPositions.map((ry, ri) => {
          const dots = [];
          for (let hi = 0; hi < holesPerRow; hi += oStep) {
            const hx = spacing / 2 + hi * spacing;
            if (hx > stripLength) break;
            dots.push(
              <circle key={`o${ri}-${hi}`} cx={oM.left + hx * oSX} cy={oM.top + ry * oSY} r={oHoleR} fill={rowColors[ri % 6]} opacity="0.55" />
            );
          }
          return dots;
        })}

        <rect
          x={oM.left + blockStartX * oSX} y={oM.top + blockStartY * oSY}
          width={blockLength * oSX} height={blockWidth * oSY}
          rx="2" fill="rgba(197,61,111,0.18)" stroke={COLORS.rose} strokeWidth="1.5" strokeDasharray="4 2"
        />
        <rect
          x={oM.left + zWindowStart * oSX} y={oM.top - 1}
          width={zWindowLength * oSX} height={oDH + 2}
          rx="2" fill="none" stroke={COLORS.blue} strokeWidth="1.5" strokeDasharray="3 2" opacity="0.6"
        />

        <text x={oM.left - 8} y={oM.top + oDH / 2} fontSize="8" fill={COLORS.textSoft} fontFamily="Lexend" textAnchor="middle" dominantBaseline="middle" transform={`rotate(-90 ${oM.left - 8} ${oM.top + oDH / 2})`}>
          {stripWidth}mm
        </text>
        <line x1={oM.left} y1={oM.top + oDH + 14} x2={oM.left + oDW} y2={oM.top + oDH + 14} stroke={COLORS.textSoft} strokeWidth="0.7" />
        <line x1={oM.left} y1={oM.top + oDH + 10} x2={oM.left} y2={oM.top + oDH + 18} stroke={COLORS.textSoft} strokeWidth="0.7" />
        <line x1={oM.left + oDW} y1={oM.top + oDH + 10} x2={oM.left + oDW} y2={oM.top + oDH + 18} stroke={COLORS.textSoft} strokeWidth="0.7" />
        <text x={oM.left + oDW / 2} y={oM.top + oDH + 26} fontSize="9" fill={COLORS.textSoft} fontFamily="Lexend" textAnchor="middle">
          {stripLength}mm — {holesPerRow} holes/row × {rows} rows = {totalHoles} holes total
        </text>
        <text x={oM.left + (zWindowStart + zWindowLength / 2) * oSX} y={oM.top - 7} fontSize="7" fill={COLORS.blue} fontFamily="Lexend" textAnchor="middle" fontWeight="500">
          ↓ zoomed below
        </text>
      </svg>

      <div style={{ fontSize: "0.75rem", fontWeight: 600, color: COLORS.blue, textTransform: "uppercase", letterSpacing: "0.08em", marginTop: "1rem", marginBottom: "0.3rem" }}>
        Zoomed View — True Proportions
      </div>
      <svg viewBox={`0 0 ${zW} ${zH}`} style={{ width: "100%", maxHeight: "260px", display: "block" }}>
        <rect x={zOffX} y={zOffY} width={zActualW} height={zActualH} rx="4" fill="#E8E4DC" stroke="#B0A999" strokeWidth="1.5" />
        <rect x={zOffX} y={zOffY - 5} width={zActualW} height="5" rx="2" fill="#B8D4E3" stroke="#7AAFCF" strokeWidth="0.5" opacity="0.8" />
        <rect x={zOffX} y={zOffY + zActualH} width={zActualW} height="5" rx="2" fill="#B8D4E3" stroke="#7AAFCF" strokeWidth="0.5" opacity="0.8" />
        <text x={zOffX + zActualW + 6} y={zOffY - 1} fontSize="8" fill="#7AAFCF" fontFamily="Lexend" dominantBaseline="middle" fontWeight="500">Perspex</text>
        <text x={zOffX + zActualW + 6} y={zOffY + zActualH + 4} fontSize="8" fill="#7AAFCF" fontFamily="Lexend" dominantBaseline="middle" fontWeight="500">Perspex</text>

        {clearanceEach > 0 && (
          <>
            <line x1={zOffX + (blockStartX + blockLength - zWindowStart) * zScale + 8} y1={zOffY}
              x2={zOffX + (blockStartX + blockLength - zWindowStart) * zScale + 8} y2={zOffY + clearanceEach * zScale}
              stroke="#7AAFCF" strokeWidth="1" />
            <text x={zOffX + (blockStartX + blockLength - zWindowStart) * zScale + 14} y={zOffY + clearanceEach * zScale / 2 + 3}
              fontSize="7" fill="#7AAFCF" fontFamily="Lexend" fontWeight="500">{clearanceEach.toFixed(1)}mm gap</text>
          </>
        )}

        {rowPositions.map((ry, ri) => {
          const dots = [];
          for (let hi = zFirstHole; hi <= zLastHole; hi++) {
            const hx = spacing / 2 + hi * spacing;
            const sx = zOffX + (hx - zWindowStart) * zScale;
            const sy = zOffY + ry * zScale;
            if (sx < zOffX - 2 || sx > zOffX + zActualW + 2) continue;
            const underBlock = hx >= blockStartX && hx <= blockEndX;
            dots.push(
              <circle key={`z${ri}-${hi}`} cx={sx} cy={sy} r={zHoleR}
                fill={rowColors[ri % 6]} opacity={underBlock ? 0.9 : 0.4}
                stroke={underBlock ? "white" : "none"} strokeWidth={underBlock ? 0.5 : 0}
              />
            );
          }
          return dots;
        })}

        {(() => {
          const bx = zOffX + Math.max(0, blockStartX - zWindowStart) * zScale;
          const by = zOffY + blockStartY * zScale;
          const bw = blockLength * zScale;
          const bh = blockWidth * zScale;
          return (
            <>
              <rect x={bx} y={by} width={bw} height={bh}
                rx="4" fill="rgba(197,61,111,0.12)" stroke={COLORS.rose} strokeWidth="2" strokeDasharray="6 3"
              />
              <text x={bx + bw / 2} y={by - 9} fontSize="10" fill={COLORS.rose} fontFamily="Lexend" textAnchor="middle" fontWeight="600">
                Block
              </text>
              <line x1={bx} y1={zOffY + zActualH + 14} x2={bx + bw} y2={zOffY + zActualH + 14} stroke={COLORS.rose} strokeWidth="0.8" />
              <line x1={bx} y1={zOffY + zActualH + 10} x2={bx} y2={zOffY + zActualH + 18} stroke={COLORS.rose} strokeWidth="0.8" />
              <line x1={bx + bw} y1={zOffY + zActualH + 10} x2={bx + bw} y2={zOffY + zActualH + 18} stroke={COLORS.rose} strokeWidth="0.8" />
              <text x={bx + bw / 2} y={zOffY + zActualH + 26} fontSize="9" fill={COLORS.rose} fontFamily="Lexend" textAnchor="middle" fontWeight="500">
                ← {blockLength}mm along strip →
              </text>
              <line x1={bx - 10} y1={by} x2={bx - 10} y2={by + bh} stroke={COLORS.rose} strokeWidth="0.8" />
              <line x1={bx - 14} y1={by} x2={bx - 6} y2={by} stroke={COLORS.rose} strokeWidth="0.8" />
              <line x1={bx - 14} y1={by + bh} x2={bx - 6} y2={by + bh} stroke={COLORS.rose} strokeWidth="0.8" />
              <text x={bx - 16} y={by + bh / 2} fontSize="8" fill={COLORS.rose} fontFamily="Lexend" textAnchor="middle" dominantBaseline="middle"
                transform={`rotate(-90 ${bx - 16} ${by + bh / 2})`} fontWeight="500">{blockWidth}mm</text>
            </>
          );
        })()}

        <line x1={zOffX + zActualW + 28} y1={zOffY} x2={zOffX + zActualW + 28} y2={zOffY + zActualH} stroke={COLORS.textSoft} strokeWidth="0.8" />
        <line x1={zOffX + zActualW + 24} y1={zOffY} x2={zOffX + zActualW + 32} y2={zOffY} stroke={COLORS.textSoft} strokeWidth="0.8" />
        <line x1={zOffX + zActualW + 24} y1={zOffY + zActualH} x2={zOffX + zActualW + 32} y2={zOffY + zActualH} stroke={COLORS.textSoft} strokeWidth="0.8" />
        <text x={zOffX + zActualW + 38} y={zOffY + zActualH / 2} fontSize="9" fill={COLORS.textSoft} fontFamily="Lexend" dominantBaseline="middle" fontWeight="500">
          {stripWidth}mm
        </text>

        {zLastHole > zFirstHole + 1 && (() => {
          const h1x = zOffX + (spacing / 2 + (zFirstHole + 2) * spacing - zWindowStart) * zScale;
          const h2x = zOffX + (spacing / 2 + (zFirstHole + 3) * spacing - zWindowStart) * zScale;
          const callY = zOffY + zActualH + 6;
          return (
            <>
              <line x1={h1x} y1={callY - 2} x2={h1x} y2={callY + 2} stroke={COLORS.orange} strokeWidth="0.8" />
              <line x1={h1x} y1={callY} x2={h2x} y2={callY} stroke={COLORS.orange} strokeWidth="0.8" />
              <line x1={h2x} y1={callY - 2} x2={h2x} y2={callY + 2} stroke={COLORS.orange} strokeWidth="0.8" />
              <text x={(h1x + h2x) / 2} y={callY - 4} fontSize="7" fill={COLORS.orange} fontFamily="Lexend" textAnchor="middle" fontWeight="600">{spacing}mm</text>
            </>
          );
        })()}
      </svg>

      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginTop: "0.5rem", fontSize: "0.75rem", color: COLORS.textSoft, justifyContent: "center" }}>
        <span>● <strong>Bright orifices</strong> = beneath carriage (contributing to lift)</span>
        <span>● <strong>Faded orifices</strong> = uncovered (discharging to atmosphere)</span>
        <span style={{ color: "#7AAFCF" }}>█ Perspex walls</span>
      </div>
    </div>
  );
};

export default function AirHockeyCalc({
  onBackToPresentation, themeId, changeTheme, themeOrder: themeOrderProp,
  // Shared rig state from App.jsx
  mass, setMass, carriageLength, setCarriageLength,
  holeDia, setHoleDia, spacing, setSpacing,
  stripThickness, setStripThickness, rows, setRows,
  // Shared fan state from App.jsx
  fanMode, setFanMode, fanFlowM3h, setFanFlowM3h,
  fanPmaxPa, setFanPmaxPa, fanWatts, setFanWatts,
  fanAeroEff, setFanAeroEff,
  // Shared calculation result from App.jsx
  calc, defaults,
}) {
  // Derive COLORS from the active theme. Helper components defined
  // outside this function reference the module-level COLORS, which we
  // keep in sync via a ref + update pattern that avoids the React
  // compiler's ban on module-variable mutation during render.
  const currentTheme = useTheme();
  const colorsRef = useMemo(() => themeToColors(currentTheme), [currentTheme]);
  // eslint-disable-next-line react-hooks/globals
  COLORS = colorsRef;

  // Alias shared state to the old variable names used throughout this file.
  const blockLength = carriageLength;
  const setBlockLength = setCarriageLength;
  const blockWidth = defaults.blockWidth;
  const stripLength = defaults.stripLength;
  const stripWidth = defaults.stripWidth;
  const fanFlow = fanFlowM3h;
  const setFanFlow = setFanFlowM3h;
  const customPmax = fanPmaxPa;
  const setCustomPmax = setFanPmaxPa;
  const costPerKwh = defaults.costPerKwh;

  const [activeGraph, setActiveGraph] = useState("operating");
  const [showVerification, setShowVerification] = useState(false);

  // Build the fan Q function based on mode — used by charts and verification.
  const makeFanQFn = useCallback(() => {
    if (fanMode === "curve") {
      return (pPa) => fanCurveQ(pPa, FAN_CURVE_C);
    } else {
      const qMax = fanFlow / 3600;
      return (pPa) => linearFanQ(pPa, qMax, customPmax);
    }
  }, [fanMode, fanFlow, customPmax]);

  // Derived: effective Pmax for display & chart axes.
  const fanPmax = fanMode === "curve" ? FAN_CURVE_C[0].p : customPmax;

  // === INDEPENDENT VERIFICATION CHECKS ===
  const verification = useMemo(() => {
    const checks = [];
    const NU = 1.516e-5; // kinematic viscosity of air at 20°C, m²/s

    // --- CHECK 1: Solver Convergence ---
    // The solver reports its own residual (|Q_fan − Q_system| at the
    // returned operating point). A small residual confirms convergence.
    {
      const residual = calc.opResidual;
      const residualPct = calc.qOp > 0 ? (residual / calc.qOp) * 100 : 0;
      const limitNote = calc.powerLimited ? " (power-clamped)" : calc.stallLimited ? " (stall-clamped)" : "";
      checks.push({
        id: "solver-convergence",
        name: "Solver Convergence",
        method: `Residual |Q_fan − Q_system| at P_op = ${calc.pOp.toFixed(2)} Pa${limitNote}`,
        detail: `Residual: ${(residual * 1e6).toFixed(3)} mL/s (${residualPct.toFixed(6)}%) | Iterations: ${calc.opIterations}`,
        error: residualPct,
        errorStr: `${residualPct.toFixed(6)}%`,
        threshold: 0.01,
        unit: "%",
        status: residualPct < 0.01 ? "pass" : residualPct < 0.1 ? "warn" : "fail",
        explanation: "The bisection solver finds the pressure where fan supply equals system demand. The residual should be vanishingly small. Power-clamped or stall-clamped operating points may show a slightly larger residual because the system is constrained, not at the pure intersection.",
      });
    }

    // --- CHECK 2: Independent Recalculation ---
    // Run computeAirHockey() again with the same inputs to verify the
    // result is deterministic (same inputs → same outputs).
    {
      const reCalc = computeAirHockey({
        massG: mass, blockLengthMm: blockLength, blockWidthMm: blockWidth,
        stripLengthMm: stripLength, stripWidthMm: stripWidth,
        holeDiaMm: holeDia, spacingMm: spacing, rows,
        stripThicknessMm: stripThickness, fanMode, fanFlowM3h: fanFlow,
        fanPmaxPa: customPmax, fanWatts, fanAeroEfficiency: fanAeroEff,
        costPerKwh,
      });
      const pError = Math.abs(calc.pOp - reCalc.pOp);
      const pPct = calc.pOp > 0 ? (pError / calc.pOp) * 100 : 0;
      checks.push({
        id: "determinism",
        name: "Calculation Determinism",
        method: "Re-run the full calculation with identical inputs and compare P_op",
        detail: `Original: ${calc.pOp.toFixed(6)} Pa | Re-calc: ${reCalc.pOp.toFixed(6)} Pa | Δ: ${pError.toExponential(3)} Pa`,
        error: pPct,
        errorStr: `${pPct.toFixed(8)}%`,
        threshold: 0.001,
        unit: "%",
        status: pPct < 0.001 ? "pass" : pPct < 0.01 ? "warn" : "fail",
        explanation: "Runs the entire calculation pipeline a second time with the same inputs. The result must be identical — any difference would indicate non-determinism or floating-point instability in the solver.",
      });
    }

    // --- CHECK 3: Fan energy budget ---
    // The fan's aerodynamic output P × Q must not exceed its rated
    // electrical input P_elec — that would imply η > 100 %, which is
    // physically impossible for any real fan.  The operating-point
    // solver clamps to η_aero · P_elec, so this check should always
    // report a healthy ratio; a failure would indicate the clamp was
    // bypassed or the fan curve was edited inconsistently.
    const vAtOp = Math.sqrt(2 * calc.pOp / RHO);
    const aeroOut = calc.pOp * calc.qOp; // P × Q [W]
    const energyRatio = fanWatts > 0 ? aeroOut / fanWatts : NaN;
    const energyPct = !isNaN(energyRatio) ? energyRatio * 100 : NaN;
    checks.push({
      id: "energy-budget",
      name: "Fan Energy Budget (η ≤ 100 %)",
      method: "Aerodynamic power output P_op × Q_op must not exceed rated electrical input P_elec",
      detail: `Aero out: ${aeroOut.toFixed(2)} W | Rated in: ${fanWatts} W | η_aero = ${!isNaN(energyPct) ? energyPct.toFixed(1) + " %" : "N/A"}`,
      error: !isNaN(energyPct) ? energyPct : NaN,
      errorStr: !isNaN(energyPct) ? `${energyPct.toFixed(1)}%` : "N/A",
      threshold: 100,
      unit: "%",
      status: !isNaN(energyRatio) ? (energyRatio <= 0.95 ? "pass" : energyRatio <= 1.0 ? "warn" : "fail") : "warn",
      explanation: !isNaN(energyRatio) && energyRatio > 1.0
        ? "Calculated aerodynamic output exceeds the fan's rated electrical input. This is physically impossible and indicates that the digitised fan curve overstates the fan, the rated power input is wrong, or the operating point is being driven beyond the fan's actual envelope. Real-world performance will be lower."
        : "Aerodynamic power output is within the fan's electrical input — the operating point is energetically feasible. Real fans dissipate the difference as motor heat and shaft losses, so a healthy ratio is well below 100 %.",
    });

    // --- CHECK 4: Reynolds Number Validity ---
    const holeVelocity = vAtOp; // m/s through the holes
    const Re = holeVelocity * (holeDia / 1000) / NU;
    // Cd = 0.60 (legacy) is valid for Re > ~1000; the corrected model
    // looks Cd up from the t/d table and the Re check still applies.
    checks.push({
      id: "reynolds",
      name: "Reynolds Number (Cd Validity)",
      method: `Re = v × d / ν = ${holeVelocity.toFixed(1)} × ${(holeDia / 1000).toFixed(4)} / ${NU.toExponential(3)}`,
      detail: `Re = ${Re.toFixed(0)} | Cd = 0.60 is valid for Re > ~1,000 (turbulent orifice flow)`,
      error: Re,
      errorStr: `Re = ${Re.toFixed(0)}`,
      threshold: 1000,
      unit: "",
      status: Re > 2000 ? "pass" : Re > 500 ? "warn" : "fail",
      explanation: Re > 2000
        ? "Flow through the holes is well into the turbulent regime. Our Cd = 0.60 assumption for sharp-edged orifices is valid here."
        : Re > 500
        ? "Flow is transitional. Cd may vary between 0.55–0.65 depending on exact hole geometry. Results are approximate but reasonable."
        : "Flow may be laminar. The orifice equation with Cd = 0.60 becomes less accurate. Consider using a larger hole diameter or validating Cd experimentally.",
    });

    // --- CHECK 5: Pressure Unit Round-Trip ---
    // Pa → mmH2O → Pa should be identity
    const pOriginal = calc.pRequired;
    const mmH2O = pOriginal / (1000 * G) * 1000; // Pa / (ρ_water × g) in mm
    const pRoundTrip = mmH2O / 1000 * 1000 * G; // back to Pa
    const unitError = Math.abs(pOriginal - pRoundTrip);
    const unitPct = pOriginal > 0 ? (unitError / pOriginal) * 100 : 0;
    checks.push({
      id: "unit-roundtrip",
      name: "Unit Conversion Round-Trip",
      method: `Pa → mmH₂O → Pa: ${pOriginal.toFixed(4)} → ${mmH2O.toFixed(4)} mmH₂O → ${pRoundTrip.toFixed(4)} Pa`,
      detail: `Error: ${unitError.toExponential(4)} Pa (${unitPct.toExponential(2)}%)`,
      error: unitPct,
      errorStr: `${unitPct.toExponential(2)}%`,
      threshold: 1e-10,
      unit: "%",
      status: unitPct < 1e-8 ? "pass" : unitPct < 0.001 ? "warn" : "fail",
      explanation: "A simple sanity check: converting pressure to millimetres of water column and back should produce the original number. Tests for floating-point or unit-factor errors in the model.",
    });

    // --- CHECK 6: Force Balance Verification ---
    // Method A: P × A (what we use)
    // Method B: Recalculate from weight → required P → compare to operating P
    const forceFromWeight = calc.massKg * G;
    const forceFromPressure = calc.pOp * calc.areaBlock;
    // The margin should match what we calculated
    const marginFromForces = ((forceFromPressure - forceFromWeight) / forceFromWeight) * 100;
    const marginError = Math.abs(marginFromForces - calc.liftMarginPct);
    checks.push({
      id: "force-balance",
      name: "Force Balance Cross-Check",
      method: "Independent recalculation: weight → P_required → compare to P_operating → margin",
      detail: `Weight: ${forceFromWeight.toFixed(4)} N | Lift: ${forceFromPressure.toFixed(4)} N | Margin: ${marginFromForces.toFixed(4)}% vs ${calc.liftMarginPct.toFixed(4)}%`,
      error: marginError,
      errorStr: `Δ ${marginError.toFixed(6)}%`,
      threshold: 0.001,
      unit: "%",
      status: marginError < 0.001 ? "pass" : marginError < 0.1 ? "warn" : "fail",
      explanation: "Recalculates lift margin from scratch using weight and pressure independently, then compares to the margin the main calculator reports. Tests for errors in the force/pressure/area chain.",
    });

    // --- CHECK 7: Orifice Area Back-Calculation ---
    // Given Q_op and P_op, back-calculate total hole area using the
    // *dynamic* discharge coefficient (Re-corrected Cd from the model).
    // This now uses calc.cd instead of the fixed constant, so it stays
    // consistent with the operating-point solver.
    const effectiveCd = calc.cd;
    const aBackCalc = calc.qOp > 0 && calc.pOp > 0 ? calc.qOp / (effectiveCd * Math.sqrt(2 * calc.pOp / RHO)) : 0;
    const aGeometric = calc.aTotalM2;
    const areaError = Math.abs(aBackCalc - aGeometric);
    const areaPct = aGeometric > 0 ? (areaError / aGeometric) * 100 : NaN;
    // Note: with the power clamp and split-flow model the back-calculated
    // area may differ from the geometric area because the operating point
    // is constrained by the fan power budget, not just the orifice equation.
    // A discrepancy < 10 % is acceptable when the power clamp is active.
    const areaThreshold = calc.powerLimited ? 10 : 1;
    checks.push({
      id: "area-backcalc",
      name: "Orifice Area Back-Calculation",
      method: `Back-calculate A from Q and P at operating point using dynamic Cd = ${effectiveCd.toFixed(3)}, compare to geometric N×π/4×d²`,
      detail: `Back-calc: ${(aBackCalc * 1e6).toFixed(2)} mm² | Geometric: ${(aGeometric * 1e6).toFixed(2)} mm² | Δ: ${(areaError * 1e6).toFixed(2)} mm²${calc.powerLimited ? " (power-limited — mismatch expected)" : ""}`,
      error: !isNaN(areaPct) ? areaPct : NaN,
      errorStr: !isNaN(areaPct) ? `${areaPct.toFixed(2)}%` : "N/A",
      threshold: areaThreshold,
      unit: "%",
      status: !isNaN(areaPct) ? (areaPct < areaThreshold ? "pass" : areaPct < areaThreshold * 5 ? "warn" : "fail") : "warn",
      explanation: calc.powerLimited
        ? "The operating point is constrained by the fan power budget, so Q_op is lower than what the orifice equation alone would predict. The back-calculated area differs from geometric because the system isn't at the pure orifice equilibrium — this is expected when the power clamp is active."
        : "Back-calculates total hole area from Q and P at the operating point using the dynamic (Re-corrected) discharge coefficient. A close match confirms the orifice model is self-consistent.",
    });

    // --- SUMMARY ---
    const passCount = checks.filter(c => c.status === "pass").length;
    const warnCount = checks.filter(c => c.status === "warn").length;
    const failCount = checks.filter(c => c.status === "fail").length;

    return { checks, passCount, warnCount, failCount, total: checks.length };
  }, [calc, makeFanQFn, fanPmax, fanWatts, holeDia]);

  const fanCurveData = useMemo(() => {
    const fanQFn = makeFanQFn();
    const pts = [];
    const pMaxDisplay = fanPmax * 1.05;
    for (let p = 0; p <= pMaxDisplay; p += pMaxDisplay / 100) {
      const qFan = fanQFn(p);
      const totalHoles = Math.floor(stripLength / spacing) * rows;
      const aT = totalHoles * Math.PI / 4 * Math.pow(holeDia / 1000, 2);
      const qHoles = p > 0 ? Cd * aT * Math.sqrt(2 * p / RHO) : 0;
      pts.push({ pressure: Math.round(p * 10) / 10, fanFlow: qFan * 1000, holeFlow: qHoles * 1000 });
    }
    return pts;
  }, [makeFanQFn, fanPmax, stripLength, spacing, rows, holeDia]);

  // Sweep chart helper — varies one parameter, holds the rest at the
  // current calculator state, and runs the same computeAirHockey()
  // pipeline as the headline numbers.
  const sweepBase = useMemo(
    () => ({
      massG: mass,
      blockLengthMm: blockLength,
      blockWidthMm: blockWidth,
      stripLengthMm: stripLength,
      stripWidthMm: stripWidth,
      holeDiaMm: holeDia,
      spacingMm: spacing,
      rows,
      stripThicknessMm: stripThickness,
      fanMode,
      fanFlowM3h: fanFlow,
      fanPmaxPa: customPmax,
      fanWatts,
      fanAeroEfficiency: fanAeroEff,
      costPerKwh,
    }),
    [mass, blockLength, blockWidth, stripLength, stripWidth, holeDia, spacing,
     rows, stripThickness, fanMode, fanFlow, customPmax, fanWatts, fanAeroEff, costPerKwh],
  );

  const holeSizeData = useMemo(() => {
    const pts = [];
    for (let d = 1.0; d <= 8.0; d += 0.25) {
      const r = computeAirHockey({ ...sweepBase, holeDiaMm: d });
      pts.push({
        diameter: d,
        pressure: Math.round(r.pOp * 10) / 10,
        margin: Math.round(r.pressureHeadroomPct * 10) / 10,
        hover: Math.round(r.hoverHeightMm * 100) / 100,
      });
    }
    return pts;
  }, [sweepBase]);

  const massData = useMemo(() => {
    const pts = [];
    let maxMassG = 0;
    for (let m = 50; m <= 800; m += 25) {
      const r = computeAirHockey({ ...sweepBase, massG: m });
      pts.push({
        mass: m,
        pressureNeeded: Math.round(r.pRequired),
        margin: Math.round(r.pressureHeadroomPct * 10) / 10,
        hover: Math.round(r.hoverHeightMm * 100) / 100,
      });
      if (r.floats) maxMassG = m;
    }
    return { data: pts, maxMassG };
  }, [sweepBase]);

  const pressureVsRowsData = useMemo(() => {
    const pts = [];
    for (let r = 1; r <= 6; r += 1) {
      const result = computeAirHockey({ ...sweepBase, rows: r });
      pts.push({
        rows: r,
        pressure: Math.round(result.pOp),
        margin: Math.round(result.pressureHeadroomPct * 10) / 10,
        holes: result.totalHoles,
      });
    }
    return pts;
  }, [sweepBase]);

  // Energy efficiency sweep across hole diameters
  const energySweepData = useMemo(() => {
    const pts = [];
    const safe = (v) => (Number.isFinite(v) ? v : 0);
    for (let d = 1.0; d <= 8.0; d += 0.2) {
      const r = computeAirHockey({ ...sweepBase, holeDiaMm: d });
      pts.push({
        diameter: Math.round(d * 10) / 10,
        aeroPower: safe(Math.round(r.aeroPower * 100) / 100),
        usefulPower: safe(Math.round(r.powerUseful * 1000) / 1000),
        wastedPower: safe(Math.round(r.powerWasted * 100) / 100),
        totalWasted: safe(Math.round((fanWatts - r.powerUseful) * 100) / 100),
        systemEff: safe(Math.round(r.systemEff * 100) / 100),
        margin: safe(Math.round(r.pressureHeadroomPct * 10) / 10),
        floats: r.floats,
      });
    }
    return pts;
  }, [sweepBase, fanWatts]);

  // Sweet spot finder — score = margin × efficiency, only where it floats
  const sweetSpot = useMemo(() => {
    let bestD = 0, bestScore = -1, bestMargin = 0, bestEff = 0, bestAero = 0;
    let maxFloatD = 0;

    for (let d = 1.0; d <= 8.0; d += 0.1) {
      const r = computeAirHockey({ ...sweepBase, holeDiaMm: d });
      const margin = r.pressureHeadroomPct;
      if (margin >= 0) maxFloatD = d;
      if (margin >= 15) {
        const marginBonus = Math.min(margin, 40) / 40;
        const score = r.systemEff * (0.5 + 0.5 * marginBonus);
        if (score > bestScore) {
          bestScore = score;
          bestD = d;
          bestMargin = margin;
          bestEff = r.systemEff;
          bestAero = r.aeroPower;
        }
      }
    }
    return { bestD: Math.round(bestD * 10) / 10, bestMargin, bestEff, bestAero, maxFloatD: Math.round(maxFloatD * 10) / 10 };
  }, [makeFanQFn, fanWatts, stripLength, spacing, rows, mass, blockLength, blockWidth]);

  const graphTabs = [
    { id: "operating", label: "Fan Operating Point" },
    { id: "holesize", label: "Hole Size Effect" },
    { id: "hover", label: "📏 Hover Height" },
    { id: "energy", label: "⚡ Energy & Efficiency" },
    { id: "sweetspot", label: "🎯 Sweet Spot" },
    { id: "mass", label: "Weight Capacity" },
    { id: "rows", label: "Rows Effect" },
  ];

  return (
    <div style={{ fontFamily: "'Lexend', system-ui, sans-serif", background: COLORS.bg, minHeight: "100vh", padding: "1.5rem 1rem", maxWidth: "860px", margin: "0 auto", color: COLORS.text, lineHeight: 1.7 }}>
      <link href="https://fonts.googleapis.com/css2?family=Lexend:wght@300;400;500;600;700&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ marginBottom: "2rem", padding: "1.2rem 1.5rem", background: "linear-gradient(135deg, #2B6CB0 0%, #1A8A7D 100%)", borderRadius: "20px", color: "white", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: "0.4rem" }}>
          {onBackToPresentation && (
            <button
              onClick={onBackToPresentation}
              style={{
                padding: "0.4rem 0.9rem", borderRadius: "8px",
                border: "1.5px solid rgba(255,255,255,0.4)",
                background: "rgba(255,255,255,0.12)", color: "white",
                fontFamily: "inherit", fontSize: "0.8rem", fontWeight: 600,
                cursor: "pointer", whiteSpace: "nowrap",
              }}
            >
              ← Live Demo
            </button>
          )}
          {changeTheme && (
            <select
              value={themeId}
              onChange={(e) => changeTheme(e.target.value)}
              style={{
                padding: "0.35rem 0.5rem", borderRadius: "6px",
                border: "1.5px solid rgba(255,255,255,0.4)",
                background: "rgba(255,255,255,0.12)", color: "white",
                fontFamily: "inherit", fontSize: "0.75rem",
                cursor: "pointer",
              }}
            >
              {(themeOrderProp || []).map((id) => (
                <option key={id} value={id} style={{ color: "#000" }}>
                  {id === 'dracula' ? 'Dracula' : id === 'oneDark' ? 'One Dark' : id === 'minDark' ? 'Min Dark' : 'Light'}
                </option>
              ))}
            </select>
          )}
        </div>
        <div style={{ textAlign: "center", flex: 1 }}>
          <h1 style={{ fontSize: "1.4rem", fontWeight: 700, letterSpacing: "-0.02em", marginBottom: "0.2rem" }}>
            Air-Cushioned Bearing Strip — Design Parameter Tool
          </h1>
          <p style={{ fontSize: "0.85rem", fontWeight: 300, opacity: 0.9, margin: 0 }}>
            Interactive design tool for hole sizing, fan matching, and hover performance
          </p>
        </div>
      </div>

      {/* STATUS BAR */}
      <div style={{
        background: calc.floats ? `linear-gradient(135deg, ${COLORS.hlGreen}, ${COLORS.hlBlue})` : `linear-gradient(135deg, ${COLORS.hlRose}, ${COLORS.hlYellow})`,
        borderRadius: "16px", padding: "1.2rem 1.5rem", marginBottom: "1.5rem",
        border: `2px solid ${calc.floats ? COLORS.teal : COLORS.rose}`,
        display: "flex", flexWrap: "wrap", gap: "1rem", alignItems: "center", justifyContent: "center",
      }}>
        <div style={{ textAlign: "center", flex: "1 1 140px" }}>
          <div style={{ fontSize: "0.7rem", textTransform: "uppercase", fontWeight: 600, letterSpacing: "0.08em", color: COLORS.textSoft }}>Status</div>
          <div style={{ fontSize: "1.4rem", fontWeight: 700, color: calc.floats ? COLORS.teal : COLORS.rose }}>
            {calc.floats ? "Levitation Achieved" : "Insufficient Pressure"}
          </div>
        </div>
        <div style={{ textAlign: "center", flex: "1 1 100px" }}>
          <div style={{ fontSize: "0.7rem", textTransform: "uppercase", fontWeight: 600, letterSpacing: "0.08em", color: COLORS.textSoft }}>Plenum Pressure</div>
          <div style={{ fontSize: "1.3rem", fontWeight: 700, color: COLORS.blue }}>{calc.pOp.toFixed(0)} Pa</div>
        </div>
        <div style={{ textAlign: "center", flex: "1 1 100px" }}>
          <div style={{ fontSize: "0.7rem", textTransform: "uppercase", fontWeight: 600, letterSpacing: "0.08em", color: COLORS.textSoft }}>Need</div>
          <div style={{ fontSize: "1.3rem", fontWeight: 700, color: COLORS.orange }}>{calc.pRequired.toFixed(0)} Pa</div>
        </div>
        <div style={{ textAlign: "center", flex: "1 1 100px" }}>
          <div style={{ fontSize: "0.7rem", textTransform: "uppercase", fontWeight: 600, letterSpacing: "0.08em", color: COLORS.textSoft }}>Lift Margin</div>
          <div style={{ fontSize: "1.3rem", fontWeight: 700, color: calc.liftMarginPct > 10 ? COLORS.teal : calc.liftMarginPct > 0 ? COLORS.orange : COLORS.rose }}>
            {calc.liftMarginPct > 0 ? "+" : ""}{calc.liftMarginPct.toFixed(0)}%
          </div>
        </div>
        <div style={{ textAlign: "center", flex: "1 1 100px" }}>
          <div style={{ fontSize: "0.7rem", textTransform: "uppercase", fontWeight: 600, letterSpacing: "0.08em", color: COLORS.textSoft }}>Hover Height</div>
          <div style={{ fontSize: "1.3rem", fontWeight: 700, color: calc.hoverHeightMm > 0.5 ? COLORS.blue : calc.hoverHeightMm > 0 ? COLORS.orange : COLORS.rose }}>
            {calc.floats ? `${calc.hoverHeightMm.toFixed(1)} mm` : "—"}
          </div>
        </div>
        <div style={{ textAlign: "center", flex: "1 1 100px" }}>
          <div style={{ fontSize: "0.7rem", textTransform: "uppercase", fontWeight: 600, letterSpacing: "0.08em", color: COLORS.textSoft }}>Efficiency</div>
          <div style={{ fontSize: "1.3rem", fontWeight: 700, color: COLORS.orange }}>{calc.systemEff.toFixed(2)}%</div>
        </div>
      </div>

      {/* MODEL INFO STRIP */}
      <div style={{
        background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: "12px",
        padding: "0.9rem 1.2rem", marginBottom: "1.5rem",
        display: "flex", flexWrap: "wrap", alignItems: "center", gap: "1.2rem",
        fontSize: "0.82rem", color: COLORS.textSoft,
      }}>
        <span>
          Cd ={" "}
          <strong style={{ color: COLORS.purple }}>{calc.cd.toFixed(3)}</strong>{" "}
          (geometric {calc.cdGeometric.toFixed(3)} × Re correction,
          t/d = {(stripThickness / holeDia).toFixed(2)})
        </span>
        <span>·</span>
        <span>
          Aero output{" "}
          <strong style={{ color: calc.powerLimited ? COLORS.orange : COLORS.teal }}>
            {calc.aeroPower.toFixed(1)} W
          </strong>{" "}
          / {(fanAeroEff * 100).toFixed(0)} % × {fanWatts} W cap
        </span>
        {calc.powerLimited && (
          <span style={{
            padding: "0.2rem 0.5rem", borderRadius: "6px",
            background: COLORS.orange + "22", color: COLORS.orange, fontWeight: 600,
          }}>
            POWER-LIMITED
          </span>
        )}
      </div>

      {/* SLIDERS SECTION */}
      <Card color={COLORS.blue} label="Design Parameters" title="Variable Inputs">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 2rem" }}>
          <div>
            <div style={{ fontSize: "0.8rem", fontWeight: 600, color: COLORS.blue, marginBottom: "0.6rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>Block</div>
            <Slider label="Mass" unit="g" value={mass} min={50} max={800} step={10} onChange={setMass} color={COLORS.rose} description="Total mass of block including any payload" />
            <Slider label="Length (along strip)" unit="mm" value={blockLength} min={40} max={300} step={5} onChange={setBlockLength} color={COLORS.blue} description="Block dimension along the 2m strip" />
            <Slider label="Width (across strip)" unit="mm" value={blockWidth} min={40} max={110} step={5} onChange={() => {}} color={COLORS.blue} description="Fixed at 100 mm for this rig — matches the channel width minus perspex wall clearance" />
          </div>
          <div>
            <div style={{ fontSize: "0.8rem", fontWeight: 600, color: COLORS.teal, marginBottom: "0.6rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>Fan</div>
            {/* Fan model toggle */}
            <div style={{ marginBottom: "1rem" }}>
              <div style={{ fontSize: "0.85rem", fontWeight: 500, color: COLORS.text, marginBottom: "0.4rem" }}>Fan Model</div>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                {[
                  { id: "curve", label: "MAN150M (Datasheet)", desc: "Digitised from Manrose performance graph" },
                  { id: "linear", label: "Custom (Linear)", desc: "Enter your own Q_max and P_max" },
                ].map(mode => (
                  <button key={mode.id} onClick={() => setFanMode(mode.id)} style={{
                    flex: 1, padding: "0.5rem", borderRadius: "8px", border: `2px solid ${fanMode === mode.id ? COLORS.teal : COLORS.border}`,
                    background: fanMode === mode.id ? COLORS.teal + "18" : COLORS.card, cursor: "pointer", textAlign: "left",
                    transition: "all 0.2s",
                  }}>
                    <div style={{ fontSize: "0.8rem", fontWeight: 600, color: fanMode === mode.id ? COLORS.teal : COLORS.text }}>{mode.label}</div>
                    <div style={{ fontSize: "0.7rem", color: COLORS.textSoft, marginTop: "0.2rem" }}>{mode.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {fanMode === "curve" ? (
              <>
                <div style={{ background: COLORS.teal + "12", borderRadius: "8px", padding: "0.7rem 0.9rem", marginBottom: "1rem", border: `1px solid ${COLORS.teal}30`, fontSize: "0.78rem", lineHeight: 1.5 }}>
                  <strong style={{ color: COLORS.teal }}>📊 Using real fan curve</strong> — Digitised {FAN_CURVE_C_RAW.length} points from Manrose datasheet (Curve C).
                  P<sub>max</sub> ≈ {FAN_CURVE_C_RAW[0].p} mmwg ({Math.round(FAN_CURVE_C_RAW[0].p * G)} Pa),
                  Q<sub>max</sub> = {FAN_CURVE_C_RAW[FAN_CURVE_C_RAW.length-1].q} m³/h.
                  Pressure is <em>calculated</em> from the curve — not a free parameter.
                </div>
                <Slider label="Rated Power" unit="W" value={fanWatts} min={10} max={250} step={5} onChange={setFanWatts} color={COLORS.teal} description="Electrical input power — 80 W nominal per manufacturer datasheet" />
                <Slider label="Aero Efficiency" unit="%" value={Math.round(fanAeroEff * 100)} min={10} max={60} step={1} onChange={(v) => setFanAeroEff(v / 100)} color={COLORS.teal} description="Maximum P_aero / P_electrical the fan can sustain. Small AC duct fans typically achieve 25–35 %; calibrate against measured performance." />
              </>
            ) : (
              <>
                <Slider label="Free-flow Rate" unit="m³/h" value={fanFlow} min={100} max={1500} step={10} onChange={setFanFlow} color={COLORS.teal} description="Airflow at zero back-pressure (Q_max)" />
                <Slider label="Max Static Pressure" unit="Pa" value={customPmax} min={100} max={5000} step={10} onChange={setCustomPmax} color={COLORS.teal} description="Stall pressure at zero flow (P_max)" />
                <Slider label="Rated Power" unit="W" value={fanWatts} min={10} max={250} step={5} onChange={setFanWatts} color={COLORS.teal} description="Electrical input power from label" />
                <Slider label="Aero Efficiency" unit="%" value={Math.round(fanAeroEff * 100)} min={10} max={60} step={1} onChange={(v) => setFanAeroEff(v / 100)} color={COLORS.teal} description="Maximum P_aero / P_electrical the fan can sustain. Small AC duct fans typically achieve 25–35 %." />
              </>
            )}
          </div>
        </div>
        <div style={{ borderTop: `1px solid ${COLORS.border}`, marginTop: "0.5rem", paddingTop: "1rem" }}>
          <div style={{ fontSize: "0.8rem", fontWeight: 600, color: COLORS.purple, marginBottom: "0.6rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>Holes</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "0 1.5rem" }}>
            <Slider label="Hole Diameter" unit="mm" value={holeDia} min={1.0} max={8.0} step={0.5} onChange={setHoleDia} color={COLORS.purple} />
            <Slider label="Spacing" unit="mm" value={spacing} min={10} max={60} step={5} onChange={setSpacing} color={COLORS.orange} />
            <Slider label="Rows" unit="" value={rows} min={1} max={6} step={1} onChange={setRows} color={COLORS.rose} />
            <Slider label="Plate Thickness" unit="mm" value={stripThickness} min={0.5} max={10} step={0.5} onChange={setStripThickness} color={COLORS.teal} description="Thickness of the strip the holes are drilled through. Used to compute Cd from t/d in the corrected model." />
          </div>
        </div>
        <div style={{ borderTop: `1px solid ${COLORS.border}`, marginTop: "0.5rem", paddingTop: "1rem" }}>
          <div style={{ fontSize: "0.8rem", fontWeight: 600, color: COLORS.orange, marginBottom: "0.6rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>Running Cost</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "0", maxWidth: "300px" }}>
            <Slider label="Electricity Price" unit="p/kWh" value={Math.round(costPerKwh * 100)} min={10} max={50} step={1} onChange={() => {}} color={COLORS.orange} description="UK domestic tariff — Ofgem price cap ≈ 24.5p/kWh (Q1 2025) [8]" />
          </div>
        </div>
      </Card>

      {/* DIAGRAM */}
      <Card color={COLORS.teal} label="Layout" title="Strip & Block Diagram">
        <p style={{ fontSize: "0.9rem", color: COLORS.textSoft, fontWeight: 300, marginBottom: "0.5rem" }}>
          The block's <strong style={{ color: COLORS.rose }}>{blockLength} mm length</strong> runs along the strip.
          Its <strong style={{ color: COLORS.rose }}>{blockWidth} mm width</strong> fits within the {stripWidth} mm channel, leaving {stripWidth - blockWidth} mm total clearance ({((stripWidth - blockWidth) / 2).toFixed(1)} mm each side) for the perspex walls.
          The overview shows the full {stripLength} mm strip; the zoomed view shows the block area at <strong>true proportions</strong>.
        </p>
        <div style={{ background: COLORS.card, borderRadius: "14px", padding: "1rem", margin: "0.5rem 0" }}>
          <StripDiagram
            stripLength={stripLength} stripWidth={stripWidth}
            blockLength={blockLength} blockWidth={blockWidth}
            spacing={spacing} rows={rows} holeDia={holeDia}
          />
        </div>
        <Info>
          <strong>Perspex side-walls</strong> (shown in light blue) seal both long edges, so air can only escape from the front and back of the block. This halves the leakage perimeter compared to no walls, roughly doubling the pressure under the block for the same fan output.
        </Info>
      </Card>

      {/* CALCULATION WALKTHROUGH */}
      <Card color={COLORS.orange} label="Stage 1 → 2" title="Force & Pressure Required">
        <Eq label="Weight force = mass × gravity">
          F = {(mass / 1000).toFixed(3)} kg × 9.81 m/s²
          <span style={{ fontWeight: 600, color: COLORS.teal }}> = {calc.force.toFixed(2)} N</span>
        </Eq>
        <Eq label={`Cushion pressure needed = force ÷ block area (${blockLength}×${blockWidth}mm)`}>
          P = {calc.force.toFixed(2)} N ÷ {(calc.areaBlock * 1e6).toFixed(0)} mm²
          <span style={{ fontWeight: 600, color: COLORS.teal }}> = {calc.pRequired.toFixed(1)} Pa</span>
        </Eq>
        <p style={{ fontSize: "0.85rem", color: COLORS.textSoft, fontWeight: 300, marginTop: "0.5rem" }}>
          {calc.pRequired.toFixed(0)} Pa is about {(calc.pRequired / 9.81).toFixed(1)} mm water gauge (mmwg). {calc.pRequired < fanPmax ? "The fan can reach this pressure — the design is feasible at this stage." : "This exceeds the fan's max pressure — it can't produce enough lift under these conditions."}
        </p>
      </Card>

      <Card color={COLORS.purple} label="Stage 3 → 4" title="Fan + Holes → Operating Point">
        <p style={{ fontSize: "0.9rem", color: COLORS.textSoft, fontWeight: 300 }}>
          The fan pushes air in; the holes let air out. The pressure where these two balance is the <strong>operating point</strong> — the actual pressure inside the strip. This is solved numerically by bisection, finding where fan output equals total hole leakage.
        </p>
        <Eq label="Total holes">
          {calc.holesPerRow} per row × {rows} rows = <span style={{ fontWeight: 600, color: COLORS.teal }}>{calc.totalHoles} holes</span>
        </Eq>
        <Eq label="Total open area">
          {calc.totalHoles} × π/4 × ({holeDia}mm)² = <span style={{ fontWeight: 600, color: COLORS.teal }}>{calc.aTotalMm2.toFixed(0)} mm²</span>
        </Eq>
        <Eq label="Operating point (solved numerically)">
          Plenum pressure settles at <span style={{ fontWeight: 600, color: COLORS.teal }}>{calc.pOp.toFixed(1)} Pa</span>
          {" "}with flow <span style={{ fontWeight: 600, color: COLORS.teal }}>{(calc.qOp * 1000).toFixed(1)} L/s</span>
        </Eq>
        <ResultBox
          label={calc.floats ? "Lift force exceeds weight" : "Lift force is less than weight"}
          value={`${calc.liftForce.toFixed(2)} N vs ${calc.force.toFixed(2)} N needed`}
          note={calc.floats ? `+${calc.liftMarginPct.toFixed(0)}% safety margin — the block floats` : `Not enough pressure — try smaller holes or fewer rows`}
        />
        {calc.floats && (
          <Eq label="Estimated hover height (orifice model for edge gaps)">
            Air gap ≈ <span style={{ fontWeight: 600, color: COLORS.blue }}>{calc.hoverHeightMm.toFixed(2)} mm</span>
            {" "}— air enters through {calc.holesUnderBlock} holes, escapes from front &amp; back edges ({blockWidth}mm × 2)
          </Eq>
        )}
        {calc.dIdeal > 0 && (
          <Info>
            <strong>Ideal hole diameter</strong> for these settings (where operating pressure exactly equals required pressure): <strong>{calc.dIdeal.toFixed(1)} mm</strong>. Go smaller for more margin, larger for more airflow. In practice, choose a diameter well below this to allow for manufacturing tolerances.
          </Info>
        )}
      </Card>

      {/* GRAPHS */}
      <Card color={COLORS.blue} label="Analysis" title="Design Graphs">
        <p style={{ fontSize: "0.9rem", color: COLORS.textSoft, fontWeight: 300, marginBottom: "1rem" }}>
          These graphs update live as parameters change. Each one shows how a single design variable affects system performance — useful for understanding trade-offs and justifying the final design choices.
        </p>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1.2rem" }}>
          {graphTabs.map(t => (
            <button key={t.id} onClick={() => setActiveGraph(t.id)} style={{
              padding: "0.5rem 1rem", borderRadius: "10px", border: "none", cursor: "pointer",
              fontFamily: "'Lexend', sans-serif", fontSize: "0.8rem", fontWeight: activeGraph === t.id ? 600 : 400,
              background: activeGraph === t.id ? COLORS.blue : COLORS.border,
              color: activeGraph === t.id ? "white" : COLORS.textSoft,
              transition: "all 0.2s ease",
            }}>{t.label}</button>
          ))}
        </div>

        {activeGraph === "operating" && (
          <div>
            <p style={{ fontSize: "0.85rem", color: COLORS.textSoft, fontWeight: 300, marginBottom: "0.8rem" }}>
              The <strong style={{ color: COLORS.blue }}>blue curve</strong> is the fan{fanMode === "curve" ? " (digitised from the Manrose MAN150M datasheet, Curve C)" : " (linear model)"} — it delivers high airflow at low pressure, but flow drops as back-pressure increases.
              The <strong style={{ color: COLORS.rose }}>pink curve</strong> is the total leakage through all {calc.totalHoles} holes, calculated from the orifice equation Q = C<sub>d</sub>·A·√(2ΔP/ρ)<Ref n={1} />.
              Where the curves <strong>cross</strong> is the operating point: the pressure that actually develops inside the strip.
            </p>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={fanCurveData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
                <XAxis dataKey="pressure" fontSize={11} fontFamily="Lexend" label={{ value: "Pressure (Pa)", position: "insideBottom", offset: -2, fontSize: 11, fontFamily: "Lexend" }} />
                <YAxis fontSize={11} fontFamily="Lexend" label={{ value: "Flow (L/s)", angle: -90, position: "insideLeft", offset: 10, fontSize: 11, fontFamily: "Lexend" }} />
                <Tooltip content={<CustomTooltip xLabel="Pressure" xUnit="Pa" yUnit="L/s" precision={1} />} />
                <Line type="monotone" dataKey="fanFlow" stroke={COLORS.blue} strokeWidth={2.5} name="Fan output" dot={false} />
                <Line type="monotone" dataKey="holeFlow" stroke={COLORS.rose} strokeWidth={2.5} name="Hole leakage" dot={false} />
                <ReferenceLine x={calc.pRequired} stroke={COLORS.orange} strokeDasharray="6 4" strokeWidth={1.5} label={{ value: `Need ${calc.pRequired.toFixed(0)} Pa`, fontSize: 10, fontFamily: "Lexend", fill: COLORS.orange }} />
                <ReferenceLine x={Math.round(calc.pOp)} stroke={COLORS.teal} strokeWidth={2} strokeDasharray="4 3" label={{ value: `Op: ${calc.pOp.toFixed(0)} Pa`, fontSize: 9, fontFamily: "Lexend", fill: COLORS.teal, fontWeight: 600 }} />
              </ComposedChart>
            </ResponsiveContainer>
            <div style={{ textAlign: "center", fontSize: "0.8rem", color: COLORS.textSoft, marginTop: "0.3rem" }}>
              <strong style={{ color: COLORS.teal }}>●</strong> Operating point: {calc.pOp.toFixed(0)} Pa ({(calc.pOp / G).toFixed(1)} mmwg), {(calc.qOp * 1000).toFixed(1)} L/s ({(calc.qOp * 3600).toFixed(0)} m³/h)
              &nbsp;&nbsp;|&nbsp;&nbsp;
              <strong style={{ color: COLORS.orange }}>┊</strong> Minimum pressure needed: {calc.pRequired.toFixed(0)} Pa
            </div>
          </div>
        )}

        {activeGraph === "holesize" && (
          <div>
            <p style={{ fontSize: "0.85rem", color: COLORS.textSoft, fontWeight: 300, marginBottom: "0.8rem" }}>
              <strong>Smaller holes = higher pressure = more lift.</strong> But too small and airflow becomes restricted — the air cushion gets thinner and less stiff.
              The <strong style={{ color: COLORS.orange }}>orange dashed line</strong> is 0% margin — below it, the block won't float.
            </p>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={holeSizeData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
                <XAxis dataKey="diameter" fontSize={11} fontFamily="Lexend" label={{ value: "Hole Diameter (mm)", position: "insideBottom", offset: -2, fontSize: 11, fontFamily: "Lexend" }} />
                <YAxis yAxisId="left" fontSize={11} fontFamily="Lexend" label={{ value: "Plenum Pressure (Pa)", angle: -90, position: "insideLeft", offset: 10, fontSize: 11, fontFamily: "Lexend" }} />
                <YAxis yAxisId="right" orientation="right" fontSize={11} fontFamily="Lexend" label={{ value: "Lift Margin (%)", angle: 90, position: "insideRight", offset: 10, fontSize: 11, fontFamily: "Lexend" }} />
                <Tooltip content={<CustomTooltip xLabel="Hole ⌀" xUnit="mm" yUnit="" precision={1} />} />
                <Line yAxisId="left" type="monotone" dataKey="pressure" stroke={COLORS.blue} strokeWidth={2.5} name="Pressure (Pa)" dot={false} />
                <Line yAxisId="right" type="monotone" dataKey="margin" stroke={COLORS.teal} strokeWidth={2.5} name="Margin (%)" dot={false} />
                <ReferenceLine yAxisId="right" y={0} stroke={COLORS.orange} strokeDasharray="6 4" strokeWidth={1.5} label={{ value: "Levitation threshold", fontSize: 9, fontFamily: "Lexend", fill: COLORS.orange }} />
                <ReferenceLine yAxisId="left" x={holeDia} stroke={COLORS.purple} strokeWidth={2} strokeDasharray="4 3" label={{ value: `${holeDia}mm`, fontSize: 9, fontFamily: "Lexend", fill: COLORS.purple, fontWeight: 600 }} />
              </ComposedChart>
            </ResponsiveContainer>
            <div style={{ textAlign: "center", fontSize: "0.8rem", color: COLORS.textSoft, marginTop: "0.3rem" }}>
              <strong style={{ color: COLORS.purple }}>●</strong> Current: {holeDia}mm holes → {calc.pOp.toFixed(0)} Pa, {calc.liftMarginPct > 0 ? "+" : ""}{calc.liftMarginPct.toFixed(0)}% margin
            </div>
          </div>
        )}

        {activeGraph === "hover" && (
          <div>
            <p style={{ fontSize: "0.85rem", color: COLORS.textSoft, fontWeight: 300, marginBottom: "0.8rem" }}>
              The block floats at a height where the air escaping from the front and back edge gaps balances the air flowing in through the holes beneath it.
              Heavier blocks need more pressure underneath, which leaves less pressure drop across the holes — so less air flows in and the gap shrinks.
              {calc.floats && <> Current estimate: <strong style={{ color: COLORS.blue }}>~{calc.hoverHeightMm.toFixed(1)} mm</strong> hover height.</>}
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <div>
                <div style={{ fontSize: "0.75rem", fontWeight: 600, color: COLORS.textSoft, marginBottom: "0.3rem", textAlign: "center" }}>Hover Height vs Mass</div>
                <ResponsiveContainer width="100%" height={280}>
                  <ComposedChart data={massData.data} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
                    <XAxis dataKey="mass" fontSize={11} fontFamily="Lexend" label={{ value: "Block Mass (g)", position: "insideBottom", offset: -2, fontSize: 11, fontFamily: "Lexend" }} />
                    <YAxis fontSize={11} fontFamily="Lexend" label={{ value: "Hover Height (mm)", angle: -90, position: "insideLeft", offset: 10, fontSize: 11, fontFamily: "Lexend" }} />
                    <Tooltip content={<CustomTooltip xLabel="Mass" xUnit="g" yUnit="mm" precision={2} />} />
                    <Line type="monotone" dataKey="hover" stroke={COLORS.blue} strokeWidth={2.5} name="Hover height (mm)" dot={false} />
                    <ReferenceLine x={mass} stroke={COLORS.rose} strokeWidth={2} strokeDasharray="4 3" label={{ value: `${mass}g`, fontSize: 9, fontFamily: "Lexend", fill: COLORS.rose, fontWeight: 600 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <div>
                <div style={{ fontSize: "0.75rem", fontWeight: 600, color: COLORS.textSoft, marginBottom: "0.3rem", textAlign: "center" }}>Hover Height vs Hole Diameter</div>
                <ResponsiveContainer width="100%" height={280}>
                  <ComposedChart data={holeSizeData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
                    <XAxis dataKey="diameter" fontSize={11} fontFamily="Lexend" label={{ value: "Hole Diameter (mm)", position: "insideBottom", offset: -2, fontSize: 11, fontFamily: "Lexend" }} />
                    <YAxis fontSize={11} fontFamily="Lexend" label={{ value: "Hover Height (mm)", angle: -90, position: "insideLeft", offset: 10, fontSize: 11, fontFamily: "Lexend" }} />
                    <Tooltip content={<CustomTooltip xLabel="Hole ⌀" xUnit="mm" yUnit="mm" precision={2} />} />
                    <Line type="monotone" dataKey="hover" stroke={COLORS.blue} strokeWidth={2.5} name="Hover height (mm)" dot={false} />
                    <ReferenceLine x={holeDia} stroke={COLORS.purple} strokeWidth={2} strokeDasharray="4 3" label={{ value: `${holeDia}mm`, fontSize: 9, fontFamily: "Lexend", fill: COLORS.purple, fontWeight: 600 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div style={{ textAlign: "center", fontSize: "0.8rem", color: COLORS.textSoft, marginTop: "0.5rem" }}>
              Current estimate: <strong style={{ color: COLORS.blue }}>{calc.hoverHeightMm.toFixed(2)} mm</strong> gap
              &nbsp;&nbsp;|&nbsp;&nbsp;
              Flow under block: {(calc.qIntoGap * 1000).toFixed(1)} L/s
            </div>
            <div style={{ background: COLORS.hlYellow, borderRadius: "10px", padding: "0.8rem 1rem", marginTop: "0.8rem", fontSize: "0.82rem", lineHeight: 1.6, border: `1px solid ${COLORS.orange}` }}>
              <strong>Model limitations:</strong> This uses an orifice model (C<sub>d</sub> = 0.60<Ref n={2} />) for the edge gaps, which doesn't account for the viscous resistance of air flowing laterally under the block before escaping.
              At very small gap heights, viscous effects dominate and the orifice model overestimates flow.
              The true hover height is likely <strong>somewhat lower</strong> than shown — treat this as an upper bound. Useful for comparing different configurations, but verify experimentally with feeler gauges or displacement sensors.
            </div>
          </div>
        )}

        {activeGraph === "mass" && (
          <div>
            <p style={{ fontSize: "0.85rem", color: COLORS.textSoft, fontWeight: 300, marginBottom: "0.8rem" }}>
              With the current hole pattern, the strip produces <strong>{calc.pOp.toFixed(0)} Pa</strong>. This graph shows how much weight that can support.
              The <strong style={{ color: COLORS.rose }}>maximum floatable mass</strong> is about <strong>{massData.maxMassG} g</strong> — beyond that, there isn't enough pressure to lift it.
            </p>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={massData.data} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
                <XAxis dataKey="mass" fontSize={11} fontFamily="Lexend" label={{ value: "Block Mass (g)", position: "insideBottom", offset: -2, fontSize: 11, fontFamily: "Lexend" }} />
                <YAxis fontSize={11} fontFamily="Lexend" label={{ value: "Lift Margin (%)", angle: -90, position: "insideLeft", offset: 10, fontSize: 11, fontFamily: "Lexend" }} />
                <Tooltip content={<CustomTooltip xLabel="Mass" xUnit="g" yUnit="%" precision={0} />} />
                <Line type="monotone" dataKey="margin" stroke={COLORS.teal} strokeWidth={2.5} name="Margin" dot={false} />
                <ReferenceLine y={0} stroke={COLORS.orange} strokeDasharray="6 4" strokeWidth={1.5} label={{ value: "Levitation limit", fontSize: 9, fontFamily: "Lexend", fill: COLORS.orange }} />
                <ReferenceLine x={mass} stroke={COLORS.rose} strokeWidth={2} strokeDasharray="4 3" label={{ value: `${mass}g`, fontSize: 9, fontFamily: "Lexend", fill: COLORS.rose, fontWeight: 600 }} />
              </ComposedChart>
            </ResponsiveContainer>
            <div style={{ textAlign: "center", fontSize: "0.8rem", color: COLORS.textSoft, marginTop: "0.3rem" }}>
              <strong style={{ color: COLORS.rose }}>●</strong> Current: {mass}g → {calc.liftMarginPct > 0 ? "+" : ""}{calc.liftMarginPct.toFixed(0)}% margin
              &nbsp;&nbsp;|&nbsp;&nbsp; Max capacity ≈ {massData.maxMassG}g
            </div>
          </div>
        )}

        {activeGraph === "rows" && (
          <div>
            <p style={{ fontSize: "0.85rem", color: COLORS.textSoft, fontWeight: 300, marginBottom: "0.8rem" }}>
              <strong>More rows = more holes = more leakage = lower pressure.</strong> But more rows also gives a more even air cushion across the block's width.
              The trade-off: enough rows for good coverage, but not so many that pressure drops below the lift threshold.
            </p>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={pressureVsRowsData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
                <XAxis dataKey="rows" fontSize={11} fontFamily="Lexend" label={{ value: "Number of Rows", position: "insideBottom", offset: -2, fontSize: 11, fontFamily: "Lexend" }} />
                <YAxis yAxisId="left" fontSize={11} fontFamily="Lexend" label={{ value: "Plenum Pressure (Pa)", angle: -90, position: "insideLeft", offset: 10, fontSize: 11, fontFamily: "Lexend" }} />
                <YAxis yAxisId="right" orientation="right" fontSize={11} fontFamily="Lexend" label={{ value: "Margin (%)", angle: 90, position: "insideRight", offset: 10, fontSize: 11, fontFamily: "Lexend" }} />
                <Tooltip content={<CustomTooltip xLabel="Rows" xUnit="" yUnit="" precision={0} />} />
                <Line yAxisId="left" type="monotone" dataKey="pressure" stroke={COLORS.blue} strokeWidth={2.5} name="Pressure (Pa)" dot={{ r: 4, fill: COLORS.blue }} />
                <Line yAxisId="right" type="monotone" dataKey="margin" stroke={COLORS.teal} strokeWidth={2.5} name="Margin (%)" dot={{ r: 4, fill: COLORS.teal }} />
                <ReferenceLine yAxisId="right" y={0} stroke={COLORS.orange} strokeDasharray="6 4" strokeWidth={1.5} />
                <ReferenceLine yAxisId="left" x={rows} stroke={COLORS.purple} strokeDasharray="4 4" strokeWidth={1.5} />
              </ComposedChart>
            </ResponsiveContainer>
            <div style={{ textAlign: "center", fontSize: "0.8rem", color: COLORS.textSoft, marginTop: "0.3rem" }}>
              <strong style={{ color: COLORS.purple }}>┊</strong> Current: {rows} rows ({calc.totalHoles} holes) → {calc.pOp.toFixed(0)} Pa
            </div>
          </div>
        )}

        {activeGraph === "energy" && (
          <div>
            <p style={{ fontSize: "0.85rem", color: COLORS.textSoft, fontWeight: 300, marginBottom: "0.8rem" }}>
              Shows how power is distributed as hole size changes. The <strong style={{ color: COLORS.rose }}>red line</strong> is wasted power (air through uncovered holes + motor heat). The <strong style={{ color: COLORS.teal }}>green line</strong> is the small fraction actually doing useful lifting work.
              Bigger holes = more airflow = more waste. This is inherent to air-bearing designs where most holes are uncovered.
            </p>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={energySweepData} margin={{ top: 10, right: 50, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
                <XAxis dataKey="diameter" fontSize={11} fontFamily="Lexend" label={{ value: "Hole Diameter (mm)", position: "insideBottom", offset: -2, fontSize: 11, fontFamily: "Lexend" }} />
                <YAxis yAxisId="left" fontSize={11} fontFamily="Lexend" label={{ value: "Power (W)", angle: -90, position: "insideLeft", offset: 10, fontSize: 11, fontFamily: "Lexend" }} />
                <YAxis yAxisId="right" orientation="right" fontSize={11} fontFamily="Lexend" label={{ value: "System Efficiency (%)", angle: 90, position: "insideRight", offset: 15, fontSize: 11, fontFamily: "Lexend" }} />
                <Tooltip content={<CustomTooltip xLabel="Hole ⌀" xUnit="mm" yUnit="" precision={2} />} />
                <Line yAxisId="left" type="monotone" dataKey="totalWasted" stroke={COLORS.rose} strokeWidth={2.5} name="Wasted (W)" dot={false} />
                <Line yAxisId="left" type="monotone" dataKey="aeroPower" stroke={COLORS.blue} strokeWidth={2} name="Aero power (W)" dot={false} strokeDasharray="4 3" />
                <Line yAxisId="left" type="monotone" dataKey="usefulPower" stroke={COLORS.teal} strokeWidth={2.5} name="Useful (W)" dot={false} />
                <Line yAxisId="right" type="monotone" dataKey="systemEff" stroke={COLORS.orange} strokeWidth={2.5} name="Efficiency (%)" dot={false} />
                <ReferenceLine yAxisId="left" x={holeDia} stroke={COLORS.purple} strokeWidth={2} strokeDasharray="4 3" label={{ value: `Current: ${holeDia}mm`, fontSize: 9, fontFamily: "Lexend", fill: COLORS.purple, fontWeight: 600 }} />
              </ComposedChart>
            </ResponsiveContainer>
            <div style={{ textAlign: "center", fontSize: "0.8rem", color: COLORS.textSoft, marginTop: "0.3rem" }}>
              <strong style={{ color: COLORS.purple }}>●</strong> Current: {holeDia}mm → {calc.aeroPower.toFixed(1)}W aero, {calc.powerUseful.toFixed(3)}W useful, {calc.systemEff.toFixed(2)}% efficient
            </div>
          </div>
        )}

        {activeGraph === "sweetspot" && (
          <div>
            <p style={{ fontSize: "0.85rem", color: COLORS.textSoft, fontWeight: 300, marginBottom: "0.8rem" }}>
              The <strong style={{ color: COLORS.teal }}>green line</strong> is lift margin — needs to stay above zero to float.
              The <strong style={{ color: COLORS.orange }}>orange line</strong> is overall system efficiency (wall socket → useful lift). The <strong style={{ color: COLORS.teal }}>green band</strong> highlights the sweet zone: at least 15% safety margin with the best achievable efficiency. The 15% threshold accounts for manufacturing tolerances and real-world variation.
              {sweetSpot.bestD > 0 && (
                <> Calculated sweet spot: <strong>{sweetSpot.bestD} mm</strong>.</>
              )}
            </p>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={energySweepData} margin={{ top: 10, right: 50, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
                <XAxis dataKey="diameter" fontSize={11} fontFamily="Lexend" label={{ value: "Hole Diameter (mm)", position: "insideBottom", offset: -2, fontSize: 11, fontFamily: "Lexend" }} />
                <YAxis yAxisId="left" fontSize={11} fontFamily="Lexend" label={{ value: "Lift Margin (%)", angle: -90, position: "insideLeft", offset: 10, fontSize: 11, fontFamily: "Lexend" }} />
                <YAxis yAxisId="right" orientation="right" fontSize={11} fontFamily="Lexend" label={{ value: "Efficiency (%)", angle: 90, position: "insideRight", offset: 15, fontSize: 11, fontFamily: "Lexend" }} />
                <Tooltip content={<CustomTooltip xLabel="Hole ⌀" xUnit="mm" yUnit="" precision={2} />} />
                {/* Sweet zone highlight */}
                <ReferenceLine yAxisId="left" y={15} stroke={COLORS.teal} strokeDasharray="4 4" strokeWidth={1} label={{ value: "15% margin target", fontSize: 9, fontFamily: "Lexend", fill: COLORS.teal }} />
                <ReferenceLine yAxisId="left" y={0} stroke={COLORS.rose} strokeWidth={1.5} strokeDasharray="6 4" label={{ value: "Levitation limit", fontSize: 9, fontFamily: "Lexend", fill: COLORS.rose }} />
                <Line yAxisId="left" type="monotone" dataKey="margin" stroke={COLORS.teal} strokeWidth={2.5} name="Margin (%)" dot={false} />
                <Line yAxisId="right" type="monotone" dataKey="systemEff" stroke={COLORS.orange} strokeWidth={2.5} name="Efficiency (%)" dot={false} />
                {sweetSpot.bestD > 0 && (
                  <ReferenceLine yAxisId="left" x={sweetSpot.bestD} stroke={COLORS.teal} strokeWidth={2} strokeDasharray="6 3"
                    label={{ value: `Sweet spot: ${sweetSpot.bestD}mm`, fontSize: 10, fontFamily: "Lexend", fill: COLORS.teal, fontWeight: 600 }} />
                )}
                <ReferenceLine yAxisId="left" x={holeDia} stroke={COLORS.purple} strokeWidth={2} strokeDasharray="4 3" label={{ value: `You: ${holeDia}mm`, fontSize: 9, fontFamily: "Lexend", fill: COLORS.purple, fontWeight: 600 }} />
              </ComposedChart>
            </ResponsiveContainer>
            <div style={{ display: "flex", gap: "1.5rem", justifyContent: "center", flexWrap: "wrap", fontSize: "0.8rem", color: COLORS.textSoft, marginTop: "0.5rem" }}>
              <span><strong style={{ color: COLORS.purple }}>●</strong> Your setting: {holeDia}mm</span>
              {sweetSpot.bestD > 0 && <span><strong style={{ color: COLORS.teal }}>┊</strong> Sweet spot: {sweetSpot.bestD}mm ({sweetSpot.bestMargin.toFixed(0)}% margin, {sweetSpot.bestEff.toFixed(2)}% eff)</span>}
              <span><strong style={{ color: COLORS.rose }}>┊</strong> Max floatable: {sweetSpot.maxFloatD}mm</span>
            </div>
          </div>
        )}
      </Card>
      <Card color={COLORS.teal} label="Theory" title="How It Works">
        <div style={{ fontSize: "0.9rem", color: COLORS.textSoft, fontWeight: 300 }}>
          <p style={{ marginBottom: "1rem" }}>
            The strip is a <strong>sealed channel with holes drilled in the top surface</strong><Ref n={7} />. The fan pumps air in at one end; the only way out is through the holes. This creates a pressurised plenum — the pressure inside depends on how easily air can escape through the holes.
          </p>
          <p style={{ marginBottom: "1rem" }}>
            <strong>Hole size controls the pressure.</strong> Smaller holes restrict airflow more (Q ∝ d² for a given ΔP)<Ref n={1} />, so pressure builds higher inside the strip. Larger holes let air escape easily, keeping pressure low. The hole diameter is the primary variable controlling how much pressure the system develops.
          </p>
          <p style={{ marginBottom: "1rem" }}>
            When the block is placed on the strip, it <strong>covers some holes</strong> and creates a small gap at its front and back edges. Air pushing up through the covered holes gets trapped under the block, creating a high-pressure cushion. If that pressure × the block's area exceeds its weight, <strong>it floats</strong>.
          </p>
          <p style={{ marginBottom: "1rem" }}>
            The perspex side-walls act as <strong>air seals along both long edges</strong>. Without them, air would escape sideways and the cushion would collapse. With perspex, air can only escape from the front and back edges — roughly halving the leakage area and significantly increasing the pressure under the block.
          </p>
          <p style={{ marginBottom: "0.5rem" }}>
            The system is <strong>inherently self-stabilising</strong><Ref n={7} />. If the block tilts, one side drops closer to the holes — that side's gap shrinks, less air escapes, local pressure increases, and the block is pushed back level. This natural negative-feedback loop is a key property of externally pressurised air bearings and is why no active control is needed.
          </p>
        </div>
        <Info>
          <strong>Using real fan data:</strong> The MAN150M fan curve<Ref n={4} /> (Curve C from the Manrose datasheet) was digitised into {FAN_CURVE_C_RAW.length} data points.
          P<sub>max</sub> ≈ {FAN_CURVE_C_RAW[0].p} mmwg ({Math.round(FAN_CURVE_C_RAW[0].p * G)} Pa) at zero flow;
          Q<sub>max</sub> = {FAN_CURVE_C_RAW[FAN_CURVE_C_RAW.length-1].q} m³/h at zero back-pressure; rated power: 80 W.
          The operating pressure is <em>calculated from the curve</em> — not a free parameter.
          The real curve is concave (pressure drops slowly at first, then plunges near free-delivery), which a simple linear model can't capture.
        </Info>
      </Card>

      {/* ENERGY BREAKDOWN */}
      <Card color={COLORS.orange} label="Energy" title="Where Does the Power Go?">
        <p style={{ fontSize: "0.9rem", color: COLORS.textSoft, fontWeight: 300, marginBottom: "1rem" }}>
          The fan draws <strong>{fanWatts} W</strong> from the wall. Here's where every watt ends up:
        </p>

        {/* Power flow sankey-style breakdown */}
        <div style={{ background: COLORS.card, borderRadius: "14px", padding: "1.5rem", marginBottom: "1.2rem" }}>
          <div style={{ fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: COLORS.textSoft, marginBottom: "1rem" }}>Power Flow: Wall Socket → Lifting the Block</div>

          {/* Bar visualization */}
          <div style={{ position: "relative", height: "40px", borderRadius: "8px", overflow: "hidden", marginBottom: "0.8rem", display: "flex" }}>
            <div style={{ width: `${Math.max(1, (calc.powerMotorHeat / fanWatts) * 100)}%`, background: "#94A3B8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.7rem", color: "white", fontWeight: 600, minWidth: "30px" }}>
              {((calc.powerMotorHeat / fanWatts) * 100).toFixed(0)}%
            </div>
            <div style={{ width: `${Math.max(1, (calc.powerWasted / fanWatts) * 100)}%`, background: COLORS.rose, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.7rem", color: "white", fontWeight: 600, minWidth: "30px" }}>
              {((calc.powerWasted / fanWatts) * 100).toFixed(0)}%
            </div>
            <div style={{ width: `${Math.max(1, (calc.powerUseful / fanWatts) * 100)}%`, background: COLORS.teal, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.7rem", color: "white", fontWeight: 600, minWidth: "30px" }}>
              {calc.systemEff.toFixed(1)}%
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.8rem" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ width: "12px", height: "12px", borderRadius: "3px", background: "#94A3B8", display: "inline-block", marginRight: "0.3rem", verticalAlign: "middle" }}></div>
              <span style={{ fontSize: "0.8rem", fontWeight: 500 }}>Motor Heat</span>
              <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "#64748B" }}>{calc.powerMotorHeat.toFixed(1)} W <span style={{ fontSize: "0.8rem", fontWeight: 500 }}>({((calc.powerMotorHeat / calc.fanElectricalDraw) * 100).toFixed(0)}%)</span></div>
              <div style={{ fontSize: "0.7rem", color: COLORS.textSoft }}>Fan motor inefficiency</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ width: "12px", height: "12px", borderRadius: "3px", background: COLORS.rose, display: "inline-block", marginRight: "0.3rem", verticalAlign: "middle" }}></div>
              <span style={{ fontSize: "0.8rem", fontWeight: 500 }}>Wasted Air</span>
              <div style={{ fontSize: "1.1rem", fontWeight: 700, color: COLORS.rose }}>{calc.powerWasted.toFixed(2)} W <span style={{ fontSize: "0.8rem", fontWeight: 500 }}>({((calc.powerWasted / calc.fanElectricalDraw) * 100).toFixed(0)}%)</span></div>
              <div style={{ fontSize: "0.7rem", color: COLORS.textSoft }}>Escaping uncovered holes</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ width: "12px", height: "12px", borderRadius: "3px", background: COLORS.teal, display: "inline-block", marginRight: "0.3rem", verticalAlign: "middle" }}></div>
              <span style={{ fontSize: "0.8rem", fontWeight: 500 }}>Useful Lift</span>
              <div style={{ fontSize: "1.1rem", fontWeight: 700, color: COLORS.teal }}>{(calc.powerUseful * 1000).toFixed(1)} mW <span style={{ fontSize: "0.8rem", fontWeight: 500 }}>({calc.systemEff.toFixed(2)}%)</span></div>
              <div style={{ fontSize: "0.7rem", color: COLORS.textSoft }}>Air under the block</div>
            </div>
          </div>
        </div>

        {/* Key efficiency numbers */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "0.8rem", marginBottom: "1.2rem" }}>
          <div style={{ background: COLORS.hlBlue, borderRadius: "12px", padding: "0.8rem", textAlign: "center" }}>
            <div style={{ fontSize: "1.3rem", fontWeight: 700, color: COLORS.blue }}>{calc.fanMotorEff.toFixed(1)}%</div>
            <div style={{ fontSize: "0.7rem", color: COLORS.textSoft }}>Fan Motor Efficiency</div>
          </div>
          <div style={{ background: COLORS.hlGreen, borderRadius: "12px", padding: "0.8rem", textAlign: "center" }}>
            <div style={{ fontSize: "1.3rem", fontWeight: 700, color: COLORS.teal }}>{calc.geometricEff.toFixed(1)}%</div>
            <div style={{ fontSize: "0.7rem", color: COLORS.textSoft }}>Air Under Block</div>
          </div>
          <div style={{ background: COLORS.hlYellow, borderRadius: "12px", padding: "0.8rem", textAlign: "center" }}>
            <div style={{ fontSize: "1.3rem", fontWeight: 700, color: COLORS.orange }}>{calc.systemEff.toFixed(2)}%</div>
            <div style={{ fontSize: "0.7rem", color: COLORS.textSoft }}>End-to-End Efficiency</div>
          </div>
          <div style={{ background: COLORS.hlRose, borderRadius: "12px", padding: "0.8rem", textAlign: "center" }}>
            <div style={{ fontSize: "1.3rem", fontWeight: 700, color: COLORS.rose }}>{calc.fanElectricalDraw.toFixed(1)} W</div>
            <div style={{ fontSize: "0.7rem", color: COLORS.textSoft }}>Total Power Draw</div>
          </div>
        </div>

        {/* Running costs */}
        <div style={{ background: COLORS.card, borderRadius: "14px", padding: "1.2rem 1.5rem", marginBottom: "1rem" }}>
          <div style={{ fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: COLORS.textSoft, marginBottom: "0.6rem" }}>Running Cost</div>
          <div style={{ display: "flex", gap: "2rem", flexWrap: "wrap" }}>
            <div>
              <span style={{ fontSize: "1.3rem", fontWeight: 700, color: COLORS.text }}>{(calc.costPerHour * 100).toFixed(2)}p</span>
              <span style={{ fontSize: "0.85rem", color: COLORS.textSoft, marginLeft: "0.3rem" }}>per hour</span>
            </div>
            <div>
              <span style={{ fontSize: "1.3rem", fontWeight: 700, color: COLORS.text }}>£{calc.costPer8Hrs.toFixed(2)}</span>
              <span style={{ fontSize: "0.85rem", color: COLORS.textSoft, marginLeft: "0.3rem" }}>for 8 hours</span>
            </div>
            <div>
              <span style={{ fontSize: "1.3rem", fontWeight: 700, color: COLORS.text }}>£{(calc.costPerHour * 24 * 365).toFixed(2)}</span>
              <span style={{ fontSize: "0.85rem", color: COLORS.textSoft, marginLeft: "0.3rem" }}>per year (24/7)</span>
            </div>
          </div>
        </div>

        {/* Why is it so bad? */}
        <div style={{ fontSize: "0.9rem", color: COLORS.textSoft, fontWeight: 300, lineHeight: 1.8 }}>
          <p style={{ marginBottom: "0.8rem" }}>
            <strong style={{ color: COLORS.text }}>Why is the efficiency so low?</strong> Three compounding losses:
          </p>
          <p style={{ marginBottom: "0.8rem", paddingLeft: "1rem", borderLeft: `3px solid #94A3B8` }}>
            <strong>Motor heat ({((calc.powerMotorHeat / fanWatts) * 100).toFixed(0)}% lost)</strong> — small centrifugal fans have low motor efficiency.
            Only ~{calc.fanMotorEff.toFixed(0)}% of the {fanWatts} W electrical input converts to air movement. The rest is friction, copper losses, and heat in the motor windings.
          </p>
          <p style={{ marginBottom: "0.8rem", paddingLeft: "1rem", borderLeft: `3px solid ${COLORS.rose}` }}>
            <strong>Geometric waste ({((1 - calc.fractionUseful) * 100).toFixed(0)}% of airflow)</strong> — the block only covers {calc.holesUnderBlock} of {calc.totalHoles} holes.
            The other {calc.totalHoles - calc.holesUnderBlock} holes are wide open — air rushes through them doing nothing useful.
            This is the fundamental cost of a continuous air track where the block can slide anywhere along its length.
          </p>
          <p style={{ marginBottom: "0.8rem", paddingLeft: "1rem", borderLeft: `3px solid ${COLORS.teal}` }}>
            <strong>Cushion leakage</strong> — even the air under the block escapes through the front and back edge gaps. In steady state, <em>all</em> the air escapes.
            The block isn't held up by a column of air — it's held up by the <em>pressure difference</em> that exists because of restricted flow through tiny holes. Continuous energy input is required to maintain it.
          </p>
        </div>

        {/* Sweet spot recommendation */}
        {sweetSpot.bestD > 0 && (
          <div style={{
            background: "linear-gradient(135deg, #D1FAE5 0%, #DBEAFE 100%)",
            borderRadius: "14px", padding: "1.3rem 1.5rem", margin: "1rem 0",
            border: "2px solid #6EE7B7",
          }}>
            <div style={{ fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: COLORS.teal, marginBottom: "0.5rem" }}>Efficiency Sweet Spot</div>
            <p style={{ fontSize: "0.9rem", color: COLORS.text, fontWeight: 400 }}>
              Best trade-off between safety margin and efficiency: <strong style={{ color: COLORS.teal, fontSize: "1.1rem" }}>{sweetSpot.bestD} mm holes</strong>.
              This gives {sweetSpot.bestMargin.toFixed(0)}% lift margin with {sweetSpot.bestEff.toFixed(2)}% system efficiency
              ({sweetSpot.bestAero.toFixed(1)} W aerodynamic power).
              {holeDia !== sweetSpot.bestD && (
                <span> Currently set to {holeDia} mm — try adjusting to {sweetSpot.bestD} mm to see the difference.</span>
              )}
            </p>
            <p style={{ fontSize: "0.85rem", color: COLORS.textSoft, fontWeight: 300, marginTop: "0.5rem" }}>
              Maximum hole size before the block stops floating: <strong>{sweetSpot.maxFloatD} mm</strong>.
            </p>
          </div>
        )}

        <Info>
          <strong>Context:</strong> An efficiency of {calc.systemEff.toFixed(2)}% is typical for air-bearing systems — they are designed for <em>friction elimination</em>, not energy efficiency.
          The value is in near-zero friction movement, not in watts saved. A ball-bearing linear guide would draw zero power at rest but introduces rolling friction (μ ≈ 0.003–0.005)<Ref n={12} /> and stick-slip behaviour that this system eliminates entirely.
        </Info>
      </Card>

      {/* MANUFACTURING CONSIDERATIONS */}
      <Card color={COLORS.rose} label="Manufacture" title="Orifice Fabrication — Design Rationale & Method">
        <div style={{ fontSize: "0.9rem", color: COLORS.textSoft, fontWeight: 300, lineHeight: 1.8 }}>
          <p style={{ marginBottom: "1rem" }}>
            The final choice of <strong style={{ color: COLORS.text }}>{holeDia} mm</strong> holes at <strong style={{ color: COLORS.text }}>{spacing} mm</strong> pitch was driven by the balance between aerodynamic performance (smaller holes build more plenum pressure for a given fan power) and practical manufacturing constraints:
          </p>

          <p style={{ marginBottom: "0.8rem", paddingLeft: "1rem", borderLeft: `3px solid ${COLORS.blue}` }}>
            <strong>Standard tooling.</strong> A {holeDia} mm diameter corresponds to a standard metric drill bit size per ISO 235<Ref n={3} />, readily available in HSS and cobalt variants. Standard sizes simplify procurement and allow go/no-go gauge-pin inspection of finished holes.
          </p>

          <p style={{ marginBottom: "0.8rem", paddingLeft: "1rem", borderLeft: `3px solid ${COLORS.teal}` }}>
            <strong>Tool rigidity.</strong> Drill bit stiffness scales with the fourth power of diameter (I ∝ d⁴)<Ref n={11} />. At {holeDia} mm the bit is stiff enough for reliable hand-drilling through {stripThickness} mm acrylic without excessive wander or breakage risk, though care is still needed — peck-drilling and low feed rates are recommended.
          </p>

          <p style={{ marginBottom: "0.8rem", paddingLeft: "1rem", borderLeft: `3px solid ${COLORS.orange}` }}>
            <strong>Laser-cut template method.</strong> With {calc.totalHoles} holes at {spacing} mm pitch across {rows} rows, positional accuracy is critical. Rather than CNC drilling (which would require machine booking and setup time in the university workshop), we laser-cut a thin MDF template with precisely located {holeDia} mm guide holes at {spacing} mm centres. The template was clamped to the acrylic strip and used as a drill guide, ensuring consistent spacing to within ±0.5 mm across the full {stripLength} mm length. This approach is faster, cheaper, and more accessible than CNC while delivering adequate positional accuracy for this application.
          </p>

          <p style={{ marginBottom: "0.8rem", paddingLeft: "1rem", borderLeft: `3px solid ${COLORS.purple}` }}>
            <strong>Hole count and cumulative tolerance.</strong> With {calc.totalHoles} orifices, random per-hole diameter variation averages out by 1/√N. A ±0.05 mm tolerance on each {holeDia} mm hole gives ±{((0.05 / holeDia) * 200).toFixed(1)}% per-hole area variation, but the total-area uncertainty is only ±{((0.05 / holeDia) * 200 / Math.sqrt(calc.totalHoles)).toFixed(1)}% — well within the {calc.liftMarginPct.toFixed(0)}% pressure headroom.
          </p>

          <p style={{ marginBottom: "0.8rem", paddingLeft: "1rem", borderLeft: `3px solid #94A3B8` }}>
            <strong>Material.</strong> The strip is {stripThickness} mm acrylic sheet. Acrylic drills cleanly at low speeds with standard HSS bits, though peck-drilling is recommended to prevent heat build-up and burr formation. All hole exits were deburred to maintain a clean orifice edge, which preserves the discharge coefficient close to the sharp-edged orifice value<Ref n={2} />.
          </p>
        </div>

        <div style={{
          background: `linear-gradient(135deg, ${COLORS.hlGreen}, ${COLORS.hlBlue})`,
          borderRadius: "14px", padding: "1.3rem 1.5rem", margin: "1rem 0",
          border: `2px solid ${COLORS.teal}`,
        }}>
          <div style={{ fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: COLORS.teal, marginBottom: "0.5rem" }}>Selected Design Parameters</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "0.8rem" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "1.4rem", fontWeight: 700, color: COLORS.teal }}>{holeDia} mm</div>
              <div style={{ fontSize: "0.78rem", color: COLORS.textSoft }}>Orifice diameter</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "1.4rem", fontWeight: 700, color: COLORS.blue }}>{spacing} mm</div>
              <div style={{ fontSize: "0.78rem", color: COLORS.textSoft }}>Orifice pitch</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "1.4rem", fontWeight: 700, color: COLORS.purple }}>{calc.totalHoles}</div>
              <div style={{ fontSize: "0.78rem", color: COLORS.textSoft }}>{rows} rows × {calc.holesPerRow}/row</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "1.4rem", fontWeight: 700, color: COLORS.orange }}>{blockLength} mm</div>
              <div style={{ fontSize: "0.78rem", color: COLORS.textSoft }}>Carriage length</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "1.4rem", fontWeight: 700, color: COLORS.rose }}>{stripThickness} mm</div>
              <div style={{ fontSize: "0.78rem", color: COLORS.textSoft }}>Strip thickness</div>
            </div>
          </div>
        </div>

        <Info>
          <strong>Fabrication method:</strong> Holes were drilled manually using a {holeDia} mm HSS drill bit through a laser-cut MDF template clamped to the {stripThickness} mm acrylic strip. The template ensured {spacing} mm centre-to-centre spacing across all {rows} rows. Peck-drilling at low speed prevented heat-related burring. All exits were deburred with a countersink to maintain the assumed sharp-edged orifice discharge coefficient (Cd = {calc.cdGeometric.toFixed(2)} geometric, {calc.cd.toFixed(2)} effective after Re correction)<Ref n={2} /><Ref n={14} />.
        </Info>
      </Card>

      {/* VERIFICATION CHECKS */}
      <Card color={COLORS.purple} label="Verification" title="Independent Cross-Checks">
        <p style={{ fontSize: "0.9rem", color: COLORS.textSoft, fontWeight: 300, marginBottom: "1rem" }}>
          Each check uses a <strong>different mathematical method</strong> to verify the same result. If the main calculation has a bug, the cross-check will catch it. All checks update live as you move the sliders.
        </p>

        {/* Summary bar */}
        <div style={{
          display: "flex", gap: "1rem", marginBottom: "1.2rem", padding: "1rem 1.2rem",
          background: verification.failCount > 0 ? COLORS.hlRose : verification.warnCount > 0 ? COLORS.hlYellow : COLORS.hlGreen,
          borderRadius: "12px",
          border: `2px solid ${verification.failCount > 0 ? COLORS.rose : verification.warnCount > 0 ? COLORS.orange : COLORS.teal}`,
          alignItems: "center", justifyContent: "center", flexWrap: "wrap",
        }}>
          <div style={{ textAlign: "center" }}>
            <span style={{ fontSize: "1.8rem", fontWeight: 700, color: verification.failCount > 0 ? COLORS.rose : verification.warnCount > 0 ? COLORS.orange : COLORS.teal }}>
              {verification.passCount}/{verification.total}
            </span>
            <span style={{ fontSize: "0.9rem", color: COLORS.textSoft, marginLeft: "0.5rem" }}>checks passed</span>
          </div>
          {verification.warnCount > 0 && (
            <span style={{ fontSize: "0.85rem", color: COLORS.orange, fontWeight: 500 }}>⚠ {verification.warnCount} warning{verification.warnCount > 1 ? "s" : ""}</span>
          )}
          {verification.failCount > 0 && (
            <span style={{ fontSize: "0.85rem", color: COLORS.rose, fontWeight: 500 }}>✗ {verification.failCount} failed</span>
          )}
        </div>

        {/* Toggle detail view */}
        <button
          onClick={() => setShowVerification(!showVerification)}
          style={{
            width: "100%", padding: "0.8rem", background: "none",
            border: `1px solid ${COLORS.border}`, borderRadius: "10px",
            cursor: "pointer", fontSize: "0.85rem", fontWeight: 500,
            color: COLORS.blue, fontFamily: "Lexend",
            display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem",
          }}
        >
          {showVerification ? "▼ Hide detailed checks" : "▶ Show detailed checks"}
        </button>

        {showVerification && (
          <div style={{ marginTop: "1rem", display: "flex", flexDirection: "column", gap: "0.8rem" }}>
            {verification.checks.map((check) => (
              <div key={check.id} style={{
                background: check.status === "pass" ? COLORS.hlGreen : check.status === "warn" ? COLORS.hlYellow : COLORS.hlRose,
                border: `1px solid ${check.status === "pass" ? "#BBF7D0" : check.status === "warn" ? "#FDE68A" : "#FECACA"}`,
                borderRadius: "12px", padding: "1rem 1.2rem",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.4rem" }}>
                  <div style={{ fontSize: "0.9rem", fontWeight: 600, color: COLORS.text }}>
                    <span style={{ marginRight: "0.4rem" }}>
                      {check.status === "pass" ? "✅" : check.status === "warn" ? "⚠️" : "❌"}
                    </span>
                    {check.name}
                  </div>
                  <div style={{
                    fontSize: "0.75rem", fontWeight: 600, padding: "0.15rem 0.6rem", borderRadius: "6px",
                    background: check.status === "pass" ? COLORS.hlGreen : check.status === "warn" ? COLORS.hlYellow : COLORS.hlRose,
                    color: check.status === "pass" ? "#166534" : check.status === "warn" ? "#92400E" : "#991B1B",
                  }}>
                    {check.status === "pass" ? "PASS" : check.status === "warn" ? "WARN" : "FAIL"}
                  </div>
                </div>
                <div style={{ fontSize: "0.78rem", color: COLORS.textSoft, fontWeight: 400, marginBottom: "0.3rem" }}>
                  <strong>Method:</strong> {check.method}
                </div>
                <div style={{ fontSize: "0.78rem", color: COLORS.text, fontFamily: "monospace", background: "rgba(255,255,255,0.5)", borderRadius: "6px", padding: "0.4rem 0.6rem", marginBottom: "0.4rem", lineHeight: 1.5, wordBreak: "break-all" }}>
                  {check.detail}
                </div>
                <div style={{ fontSize: "0.78rem", color: COLORS.textSoft, fontWeight: 300, fontStyle: "italic", lineHeight: 1.5 }}>
                  {check.explanation}
                </div>
              </div>
            ))}

            <div style={{ background: COLORS.card, borderRadius: "12px", padding: "1rem 1.2rem", fontSize: "0.85rem", color: COLORS.textSoft, fontWeight: 300, lineHeight: 1.7 }}>
              <strong style={{ color: COLORS.text }}>How to read these:</strong> Each check solves the same physics problem two different ways and compares the answers.
              <strong style={{ color: "#166534" }}> PASS</strong> means agreement within floating-point precision.
              <strong style={{ color: "#92400E" }}> WARN</strong> means slight deviation — usually a boundary condition or interpolation artefact, not a bug.
              <strong style={{ color: "#991B1B" }}> FAIL</strong> would indicate an error in the calculation chain. The Reynolds number check
              is different — it validates that the assumed C<sub>d</sub> = 0.60<Ref n={6} /> is appropriate for the flow regime at the current hole size (Re {">"} 1000 for turbulent orifice flow).
            </div>
          </div>
        )}
      </Card>

      {/* REFERENCES */}
      <Card color="#64748B" label="Sources" title="References">
        <p style={{ fontSize: "0.85rem", color: COLORS.textSoft, fontWeight: 300, marginBottom: "1rem" }}>
          Sources used in the design and calculations. Numbered citations [n] throughout the page link back here. Click any URL to go to the source.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
          {REFS.map(ref => (
            <div key={ref.id} style={{ display: "flex", gap: "0.8rem", fontSize: "0.85rem", lineHeight: 1.6 }}>
              <span style={{ fontWeight: 700, color: COLORS.blue, minWidth: "2rem", textAlign: "right", flexShrink: 0 }}>[{ref.id}]</span>
              <span style={{ color: COLORS.textSoft }}>
                <strong style={{ color: COLORS.text }}>{ref.short}</strong> — {ref.title}.{" "}
                <a href={ref.url} target="_blank" rel="noopener noreferrer"
                  style={{ color: COLORS.blue, wordBreak: "break-all", fontSize: "0.8rem" }}>
                  {ref.url}
                </a>
              </span>
            </div>
          ))}
        </div>
      </Card>

      {/* FOOTER */}
      <div style={{ textAlign: "center", padding: "1.5rem", fontSize: "0.8rem", color: COLORS.textSoft, fontWeight: 300 }}>
        <p>Air-Cushioned Floating Carriage — Design Parameter Analysis Tool</p>
        <p style={{ marginTop: "0.3rem" }}>Model assumptions: C<sub>d</sub> = 0.60 (sharp-edged orifice, Re {">"} 1000)<Ref n={2} /> · ρ<sub>air</sub> = 1.20 kg/m³ (ISA sea-level, 20°C)<Ref n={5} /> · Piecewise-linear interpolation of digitised fan curve · Incompressible flow · Bernoulli equation<Ref n={9} /></p>
        <p style={{ marginTop: "0.3rem" }}>Fan data: Manrose MAN150M<Ref n={4} />, 80 W rated, Curve C digitised at {FAN_CURVE_C_RAW.length} points (P<sub>max</sub> ≈ {FAN_CURVE_C_RAW[0].p} mmwg, Q<sub>max</sub> = {FAN_CURVE_C_RAW[FAN_CURVE_C_RAW.length-1].q} m³/h). Reading uncertainty: ±10 mmwg.</p>
      </div>
    </div>
  );
}
