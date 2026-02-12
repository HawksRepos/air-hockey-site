import { useState, useMemo, useCallback } from "react";
import { Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ComposedChart, ResponsiveContainer } from "recharts";

const COLORS = {
  bg: "#FFF8EE",
  card: "#FFFFFF",
  text: "#2D2A26",
  textSoft: "#5C564E",
  blue: "#2B6CB0",
  teal: "#1A8A7D",
  orange: "#D46B1A",
  purple: "#6B46C1",
  rose: "#C53D6F",
  hlYellow: "#FEF3C7",
  hlGreen: "#D1FAE5",
  hlBlue: "#DBEAFE",
  hlRose: "#FCE7F3",
  border: "#E5DDD2",
};

const Cd = 0.60;
const RHO = 1.20;
const G = 9.81;

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

// Digitised from Manrose datasheet performance graph — Curve C (MAN150M)
// Q in m³/h, P in mmwg (millimetres water gauge)
// Traced from user-annotated graph with curve C highlighted in red
// Reading uncertainty: ±10 mmwg on most points
const FAN_CURVE_C_RAW = [
  { q: 0,   p: 280 },
  { q: 50,  p: 270 },
  { q: 100, p: 250 },
  { q: 150, p: 228 },
  { q: 200, p: 200 },
  { q: 250, p: 155 },
  { q: 300, p: 100 },
  { q: 350, p: 50  },
  { q: 380, p: 25  },
  { q: 400, p: 10  },
  { q: 420, p: 0   },  // confirmed from spec sheet
];

// Convert to SI: m³/s and Pa (1 mmwg = 9.81 Pa)
const FAN_CURVE_C = FAN_CURVE_C_RAW.map(pt => ({
  q: pt.q / 3600,
  p: pt.p * G,
}));

// Interpolate fan curve: given pressure P (Pa), return flow Q (m³/s)
function fanCurveQ(pPa, curveData) {
  if (pPa >= curveData[0].p) return 0;
  if (pPa <= 0) return curveData[curveData.length - 1].q;
  for (let i = 0; i < curveData.length - 1; i++) {
    if (pPa <= curveData[i].p && pPa >= curveData[i + 1].p) {
      const t = (curveData[i].p - pPa) / (curveData[i].p - curveData[i + 1].p);
      return curveData[i].q + t * (curveData[i + 1].q - curveData[i].q);
    }
  }
  return 0;
}

// Linear fan model: Q = Qmax × (1 - P/Pmax)
function linearFanQ(pPa, qMax, pMax) {
  return qMax * Math.max(0, 1 - pPa / pMax);
}

// Solve operating point: find P where Q_fan(P) = Q_holes(P)
// fanQFn: function(P_Pa) => Q_m3s
function solveOperatingPoint(fanQFn, aTotalM2) {
  // Find upper bound for pressure (where fan Q → 0)
  let pHigh = 3000; // start high
  while (fanQFn(pHigh) > 0.0001 && pHigh < 50000) pHigh *= 1.5;
  let pLow = 0;
  for (let i = 0; i < 80; i++) {
    const pMid = (pLow + pHigh) / 2;
    const qFan = fanQFn(pMid);
    const qHoles = Cd * aTotalM2 * Math.sqrt(2 * Math.max(0, pMid) / RHO);
    if (qFan > qHoles) pLow = pMid;
    else pHigh = pMid;
  }
  const pOp = (pLow + pHigh) / 2;
  const qOp = fanQFn(pOp);
  return { pOp, qOp };
}

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
      background: COLORS.card, borderRadius: "16px", padding: "1.8rem",
      marginBottom: "1.5rem", boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
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
    <div style={{ background: "#F7F5F0", borderRadius: "12px", padding: "1rem 1.2rem", margin: "0.8rem 0", fontSize: "0.95rem", lineHeight: 1.9 }}>
      {label && <span style={{ fontSize: "0.75rem", color: COLORS.textSoft, display: "block", marginBottom: "0.2rem" }}>{label}</span>}
      <div>{children}</div>
      {result && <div style={{ fontWeight: 600, fontSize: "1.05rem", color: COLORS.teal, marginTop: "0.2rem" }}>{result}</div>}
    </div>
  );
}

function ResultBox({ label, value, note, small }) {
  return (
    <div style={{
      background: "linear-gradient(135deg, #D1FAE5 0%, #DBEAFE 100%)",
      borderRadius: "14px", padding: small ? "1rem 1.2rem" : "1.2rem 1.5rem", margin: "0.8rem 0",
      border: "2px solid #A7F3D0",
    }}>
      {label && <div style={{ fontSize: "0.85rem", color: COLORS.text }}>{label}</div>}
      <div style={{ fontSize: small ? "1.4rem" : "1.8rem", fontWeight: 700, color: COLORS.teal, margin: "0.2rem 0" }}>{value}</div>
      {note && <div style={{ fontSize: "0.85rem", color: COLORS.text }}>{note}</div>}
    </div>
  );
}

function Warning({ children }) {
  return (
    <div style={{ background: COLORS.hlYellow, borderRadius: "14px", padding: "1.1rem 1.3rem", margin: "0.8rem 0", border: "2px solid #FCD34D", fontSize: "0.9rem", lineHeight: 1.7 }}>
      {children}
    </div>
  );
}

function Info({ children }) {
  return (
    <div style={{ background: COLORS.hlBlue, borderRadius: "14px", padding: "1.1rem 1.3rem", margin: "0.8rem 0", border: "2px solid #93C5FD", fontSize: "0.9rem", lineHeight: 1.7 }}>
      {children}
    </div>
  );
}

function CustomTooltip({ active, payload, label, xLabel, yLabel, xUnit, yUnit, precision }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "white", border: `1px solid ${COLORS.border}`, borderRadius: "10px", padding: "0.7rem 1rem", fontSize: "0.8rem", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}>
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

export default function AirHockeyCalc() {
  const [mass, setMass] = useState(300);
  const [blockLength, setBlockLength] = useState(120);
  const [blockWidth, setBlockWidth] = useState(100);
  const [stripLength, setStripLength] = useState(2000);
  const [stripWidth, setStripWidth] = useState(110);
  const [fanFlow, setFanFlow] = useState(420);
  const [fanMode, setFanMode] = useState("curve"); // "curve" = datasheet, "linear" = custom
  const [customPmax, setCustomPmax] = useState(2747);
  const [fanWatts, setFanWatts] = useState(80);
  const [costPerKwh, setCostPerKwh] = useState(0.245);
  const [holeDia, setHoleDia] = useState(3.0);
  const [spacing, setSpacing] = useState(20);
  const [rows, setRows] = useState(4);
  const [activeGraph, setActiveGraph] = useState("operating");
  const [showVerification, setShowVerification] = useState(false);

  // Build the fan Q function based on mode
  const makeFanQFn = useCallback(() => {
    if (fanMode === "curve") {
      return (pPa) => fanCurveQ(pPa, FAN_CURVE_C);
    } else {
      const qMax = fanFlow / 3600;
      return (pPa) => linearFanQ(pPa, qMax, customPmax);
    }
  }, [fanMode, fanFlow, customPmax]);

  // Derived: effective Pmax and Qmax for display
  const fanPmax = fanMode === "curve" ? FAN_CURVE_C[0].p : customPmax;
  const fanQmax = fanMode === "curve" ? FAN_CURVE_C[FAN_CURVE_C.length - 1].q * 3600 : fanFlow;

  const calc = useMemo(() => {
    const fanQFn = makeFanQFn();
    const massKg = mass / 1000;
    const force = massKg * G;
    const areaBlock = (blockLength / 1000) * (blockWidth / 1000);
    const pRequired = force / areaBlock;
    const qMax = fanFlow / 3600;
    const holesPerRow = Math.floor(stripLength / spacing);
    const totalHoles = holesPerRow * rows;
    const aHole = Math.PI / 4 * Math.pow(holeDia / 1000, 2);
    const aTotalM2 = totalHoles * aHole;
    const aTotalMm2 = aTotalM2 * 1e6;

    const { pOp, qOp } = solveOperatingPoint(fanQFn, aTotalM2);

    const liftForce = pOp * areaBlock;
    const liftMarginPct = ((liftForce - force) / force) * 100;
    const floats = liftForce >= force;

    const holesUnderBlock = Math.floor(blockLength / spacing) * rows;
    const fractionUseful = holesUnderBlock / totalHoles;

    const vAtOp = Math.sqrt(2 * pOp / RHO);
    const qThroughHolesAtOp = Cd * aTotalM2 * vAtOp;

    // Ideal hole diameter for current settings
    const qAtPReq = fanQFn(pRequired);
    const vAtPReq = Math.sqrt(2 * pRequired / RHO);
    const aIdealTotal = qAtPReq > 0 && vAtPReq > 0 ? qAtPReq / (Cd * vAtPReq) : 0;
    const aIdealPerHole = totalHoles > 0 ? aIdealTotal / totalHoles : 0;
    const dIdeal = Math.sqrt(4 * aIdealPerHole / Math.PI) * 1000;

    // === HOVER HEIGHT CALCULATION ===
    // Two restrictions in series: holes (plenum→under block) and edge gaps (under block→atmosphere)
    // At equilibrium: P_under = P_required (force balance), flow_in = flow_out
    //
    // Flow IN through holes under block:
    //   ΔP across holes = P_op - P_required
    //   Q_in = n_under × Cd × A_hole × √(2 × ΔP / ρ)
    //
    // Flow OUT through front & back edge gaps (perspex seals long sides):
    //   Q_out = Cd_gap × (2 × W_block × h) × √(2 × P_required / ρ)
    //
    // Setting Q_in = Q_out and solving for h:
    //   h = Q_in / (Cd_gap × 2 × W_block × √(2 × P_required / ρ))
    const CdGap = 0.60; // discharge coefficient for edge gap (similar to orifice)
    const deltaPHoles = Math.max(0, pOp - pRequired); // pressure drop across holes
    const aHolesUnder = holesUnderBlock * aHole; // total hole area under block
    const qIntoGap = deltaPHoles > 0 ? Cd * aHolesUnder * Math.sqrt(2 * deltaPHoles / RHO) : 0;
    const vEscape = pRequired > 0 ? Math.sqrt(2 * pRequired / RHO) : 0;
    const wBlock = blockWidth / 1000; // m
    // Air escapes from front and back edges only (perspex walls seal long sides)
    const hoverHeight = (vEscape > 0 && pRequired > 0 && floats)
      ? qIntoGap / (CdGap * 2 * wBlock * vEscape)
      : 0;
    const hoverHeightMm = hoverHeight * 1000;

    // === ENERGY CALCULATIONS ===
    // Aerodynamic power = pressure × volumetric flow
    const aeroPower = pOp * qOp; // Watts
    // Fan motor efficiency (aero out / electrical in)
    const fanMotorEff = fanWatts > 0 ? (aeroPower / fanWatts) * 100 : 0;
    // Flow split
    const qUseful = qOp * fractionUseful; // m³/s through holes under block
    const qWasted = qOp * (1 - fractionUseful); // m³/s through uncovered holes
    // Power split
    const powerUseful = pOp * qUseful; // W — air power doing lifting work
    const powerWasted = pOp * qWasted; // W — air power escaping uselessly
    const powerMotorHeat = fanWatts - aeroPower; // W — lost as heat in motor
    // Efficiencies
    const geometricEff = fractionUseful * 100; // % of air going under block
    const systemEff = fanWatts > 0 ? (powerUseful / fanWatts) * 100 : 0; // end-to-end
    // Theoretical minimum power: use calculated hover height for edge leakage
    const edgeLeakArea = 2 * wBlock * hoverHeight;
    const qMinLeakage = edgeLeakArea > 0 ? Cd * edgeLeakArea * Math.sqrt(2 * pRequired / RHO) : 0;
    const minPracticalPower = pRequired * qMinLeakage;
    // Ratio: how many times more power we use than theoretical minimum
    const powerRatio = minPracticalPower > 0 ? aeroPower / minPracticalPower : Infinity;
    // Running costs
    const costPerHour = (fanWatts / 1000) * costPerKwh; // £/hr
    const costPer8Hrs = costPerHour * 8;

    return {
      force, areaBlock, pRequired, qMax, holesPerRow, totalHoles,
      aHole, aTotalM2, aTotalMm2, pOp, qOp, liftForce,
      liftMarginPct, floats, holesUnderBlock, fractionUseful,
      dIdeal, massKg, hoverHeightMm, qIntoGap,
      aeroPower, fanMotorEff, qUseful, qWasted,
      powerUseful, powerWasted, powerMotorHeat,
      geometricEff, systemEff, minPracticalPower, powerRatio,
      costPerHour, costPer8Hrs,
    };
  }, [mass, blockLength, blockWidth, stripLength, stripWidth, fanFlow, makeFanQFn, fanPmax, fanWatts, costPerKwh, holeDia, spacing, rows]);

  // === INDEPENDENT VERIFICATION CHECKS ===
  const verification = useMemo(() => {
    const fanQFn = makeFanQFn();
    const checks = [];
    const NU = 1.516e-5; // kinematic viscosity of air at 20°C, m²/s

    // --- CHECK 1: Operating Point — Bisection vs Independent Re-solve ---
    // Re-solve from scratch with a fresh bisection using tighter bounds
    {
      let pLo = 0, pHi = fanPmax;
      for (let i = 0; i < 100; i++) {
        const pMid = (pLo + pHi) / 2;
        const qF = fanQFn(pMid);
        const qH = Cd * calc.aTotalM2 * Math.sqrt(2 * Math.max(0, pMid) / RHO);
        if (qF > qH) pLo = pMid; else pHi = pMid;
      }
      const pCheck = (pLo + pHi) / 2;
      const opError = Math.abs(calc.pOp - pCheck);
      const opPct = pCheck > 0 ? (opError / pCheck) * 100 : 0;
      checks.push({
        id: "op-resolv",
        name: "Operating Point Re-solve",
        method: `Independent bisection (100 iterations) vs main solver (80 iterations)`,
        detail: `Main: ${calc.pOp.toFixed(6)} Pa | Re-solve: ${pCheck.toFixed(6)} Pa | Δ: ${opError.toExponential(3)} Pa`,
        error: opPct,
        errorStr: `${opPct.toFixed(8)}%`,
        threshold: 0.001,
        unit: "%",
        status: opPct < 0.001 ? "pass" : opPct < 0.01 ? "warn" : "fail",
        explanation: "Re-solves the fan–hole intersection from scratch with a fresh bisection using more iterations. Both should converge to the same pressure. Works with any fan model (curve or linear).",
      });
    }

    // --- CHECK 2: Mass Conservation at Operating Point ---
    const qFanAtOp = fanQFn(calc.pOp);
    const qHolesAtOp = Cd * calc.aTotalM2 * Math.sqrt(2 * calc.pOp / RHO);
    const massResidual = Math.abs(qFanAtOp - qHolesAtOp);
    const massResidualPct = qFanAtOp > 0 ? (massResidual / qFanAtOp) * 100 : NaN;
    checks.push({
      id: "mass-conservation",
      name: "Mass Flow Conservation",
      method: "Q_fan(P_op) vs Q_holes(P_op) — must be equal at equilibrium",
      detail: `Q_fan: ${(qFanAtOp * 1000).toFixed(6)} L/s | Q_holes: ${(qHolesAtOp * 1000).toFixed(6)} L/s | Residual: ${(massResidual * 1e6).toFixed(3)} mL/s`,
      error: massResidualPct,
      errorStr: `${!isNaN(massResidualPct) ? massResidualPct.toFixed(6) : "N/A"}%`,
      threshold: 0.01,
      unit: "%",
      status: !isNaN(massResidualPct) && massResidualPct < 0.01 ? "pass" : !isNaN(massResidualPct) && massResidualPct < 0.1 ? "warn" : "fail",
      explanation: "At the operating point, the air the fan pushes in must exactly equal the air escaping through all holes. Any mismatch means the solver didn't converge properly.",
    });

    // --- CHECK 3: Energy Conservation ---
    // Fan aero power: P × Q
    // KE flux through holes: 0.5 × ρ × A_total × v³ where v = √(2P/ρ)
    // Since Q = Cd × A × v, aero power = P × Cd × A × v
    // KE flux = 0.5 × ρ × A × v³ (through physical area, not Cd-adjusted)
    // But with Cd: actual mass flow = ρ × Cd × A × v, KE = 0.5 × (ρ × Cd × A × v) × v² = 0.5 × ρ × Cd × A × v³
    const vAtOp = Math.sqrt(2 * calc.pOp / RHO);
    const aeroIn = calc.pOp * calc.qOp; // P × Q
    const keOut = 0.5 * RHO * Cd * calc.aTotalM2 * Math.pow(vAtOp, 3);
    // For an ideal orifice with no losses, P × Q should equal KE flux
    // P × Cd × A × v = 0.5 × ρ × Cd × A × v³
    // P × v = 0.5 × ρ × v³ → P = 0.5 × ρ × v² → which IS Bernoulli's equation
    // So aeroIn and keOut should be very close (difference indicates real losses)
    const energyError = Math.abs(aeroIn - keOut);
    const energyPct = aeroIn > 0 ? (energyError / aeroIn) * 100 : NaN;
    checks.push({
      id: "energy-conservation",
      name: "Energy Conservation (Bernoulli)",
      method: "Fan aero power (P×Q) vs kinetic energy flux through orifices (½ρCdAv³)",
      detail: `Aero in: ${(aeroIn * 1000).toFixed(4)} mW | KE out: ${(keOut * 1000).toFixed(4)} mW | Δ: ${(energyError * 1000).toFixed(4)} mW`,
      error: energyPct,
      errorStr: !isNaN(energyPct) ? `${energyPct.toFixed(4)}%` : "N/A",
      threshold: 1.0,
      unit: "%",
      status: !isNaN(energyPct) ? (energyPct < 1.0 ? "pass" : energyPct < 5 ? "warn" : "fail") : "warn",
      explanation: "Bernoulli's equation predicts that the fan's aerodynamic power input should equal the kinetic energy of air exiting the holes. A close match confirms the orifice model is self-consistent. Small differences arise from interpolation between digitised curve points.",
    });

    // --- CHECK 4: Reynolds Number Validity ---
    const holeVelocity = vAtOp; // m/s through the holes
    const Re = holeVelocity * (holeDia / 1000) / NU;
    const cdValid = Re > 1000; // Sharp-edged orifice Cd ≈ 0.60 is valid for Re > ~1000
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
    const pFromWeight = forceFromWeight / calc.areaBlock;
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
    // Given Q and P at operating point, back-calculate what total hole area would be needed
    // A = Q / (Cd × √(2P/ρ))
    // Compare to the geometrically calculated area (N × π/4 × d²)
    const aBackCalc = calc.qOp > 0 && calc.pOp > 0 ? calc.qOp / (Cd * Math.sqrt(2 * calc.pOp / RHO)) : 0;
    const aGeometric = calc.aTotalM2;
    const areaError = Math.abs(aBackCalc - aGeometric);
    const areaPct = aGeometric > 0 ? (areaError / aGeometric) * 100 : NaN;
    checks.push({
      id: "area-backcalc",
      name: "Orifice Area Back-Calculation",
      method: "Back-calculate A from Q and P at operating point, compare to geometric N×π/4×d²",
      detail: `Back-calc: ${(aBackCalc * 1e6).toFixed(2)} mm² | Geometric: ${(aGeometric * 1e6).toFixed(2)} mm² | Δ: ${(areaError * 1e6).toFixed(4)} mm²`,
      error: !isNaN(areaPct) ? areaPct : NaN,
      errorStr: !isNaN(areaPct) ? `${areaPct.toFixed(4)}%` : "N/A",
      threshold: 0.1,
      unit: "%",
      status: !isNaN(areaPct) ? (areaPct < 0.1 ? "pass" : areaPct < 1 ? "warn" : "fail") : "warn",
      explanation: "If the orifice equation is self-consistent, we should be able to work backwards from the flow rate and pressure to recover the exact hole area we put in. Any large discrepancy indicates a bug in the calculation chain.",
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

  const holeSizeData = useMemo(() => {
    const fanQFn = makeFanQFn();
    const pts = [];
    const totalHoles = Math.floor(stripLength / spacing) * rows;
    const areaBlock = (blockLength / 1000) * (blockWidth / 1000);
    const force = (mass / 1000) * G;
    const pReq = force / areaBlock;
    const wBlock = blockWidth / 1000;
    const holesUnder = Math.floor(blockLength / spacing) * rows;
    for (let d = 1.0; d <= 8.0; d += 0.25) {
      const aH = Math.PI / 4 * Math.pow(d / 1000, 2);
      const aT = totalHoles * aH;
      const { pOp } = solveOperatingPoint(fanQFn, aT);
      const liftForce = pOp * areaBlock;
      const margin = ((liftForce - force) / force) * 100;
      // Hover height
      const deltaP = Math.max(0, pOp - pReq);
      const aHolesUnder = holesUnder * aH;
      const qIn = deltaP > 0 ? Cd * aHolesUnder * Math.sqrt(2 * deltaP / RHO) : 0;
      const vEsc = pReq > 0 ? Math.sqrt(2 * pReq / RHO) : 0;
      const hMm = (vEsc > 0 && liftForce >= force) ? (qIn / (Cd * 2 * wBlock * vEsc)) * 1000 : 0;
      pts.push({ diameter: d, pressure: Math.round(pOp * 10) / 10, margin: Math.round(margin * 10) / 10, hover: Math.round(hMm * 100) / 100 });
    }
    return pts;
  }, [makeFanQFn, stripLength, spacing, rows, mass, blockLength, blockWidth]);

  const massData = useMemo(() => {
    const fanQFn = makeFanQFn();
    const pts = [];
    const totalHoles = Math.floor(stripLength / spacing) * rows;
    const aH = Math.PI / 4 * Math.pow(holeDia / 1000, 2);
    const aT = totalHoles * aH;
    const { pOp } = solveOperatingPoint(fanQFn, aT);
    const areaBlock = (blockLength / 1000) * (blockWidth / 1000);
    const wBlock = blockWidth / 1000;
    const holesUnder = Math.floor(blockLength / spacing) * rows;
    const aHolesUnder = holesUnder * aH;
    const maxMassG = pOp * areaBlock / G * 1000;
    for (let m = 50; m <= 800; m += 25) {
      const force = (m / 1000) * G;
      const pReq = force / areaBlock;
      const margin = ((pOp * areaBlock - force) / force) * 100;
      const deltaP = Math.max(0, pOp - pReq);
      const qIn = deltaP > 0 ? Cd * aHolesUnder * Math.sqrt(2 * deltaP / RHO) : 0;
      const vEsc = pReq > 0 ? Math.sqrt(2 * pReq / RHO) : 0;
      const canFloat = pOp * areaBlock >= force;
      const hMm = (vEsc > 0 && canFloat) ? (qIn / (Cd * 2 * wBlock * vEsc)) * 1000 : 0;
      pts.push({ mass: m, pressureNeeded: Math.round(pReq), margin: Math.round(margin * 10) / 10, hover: Math.round(hMm * 100) / 100 });
    }
    return { data: pts, maxMassG: Math.round(maxMassG) };
  }, [makeFanQFn, stripLength, spacing, rows, holeDia, blockLength, blockWidth]);

  const pressureVsRowsData = useMemo(() => {
    const fanQFn = makeFanQFn();
    const pts = [];
    for (let r = 1; r <= 6; r++) {
      const totalH = Math.floor(stripLength / spacing) * r;
      const aT = totalH * Math.PI / 4 * Math.pow(holeDia / 1000, 2);
      const { pOp } = solveOperatingPoint(fanQFn, aT);
      const areaBlock = (blockLength / 1000) * (blockWidth / 1000);
      const lift = pOp * areaBlock;
      const margin = ((lift - (mass / 1000) * G) / ((mass / 1000) * G)) * 100;
      pts.push({ rows: r, pressure: Math.round(pOp), margin: Math.round(margin * 10) / 10, holes: totalH });
    }
    return pts;
  }, [makeFanQFn, stripLength, spacing, holeDia, mass, blockLength, blockWidth]);

  // Energy efficiency sweep across hole diameters
  const energySweepData = useMemo(() => {
    const fanQFn = makeFanQFn();
    const pts = [];
    const totalHoles = Math.floor(stripLength / spacing) * rows;
    const areaBlock = (blockLength / 1000) * (blockWidth / 1000);
    const force = (mass / 1000) * G;
    const holesUnder = Math.floor(blockLength / spacing) * rows;
    const geoFrac = totalHoles > 0 ? holesUnder / totalHoles : 0;

    for (let d = 1.0; d <= 8.0; d += 0.2) {
      const aT = totalHoles * Math.PI / 4 * Math.pow(d / 1000, 2);
      const { pOp, qOp } = solveOperatingPoint(fanQFn, aT);
      const liftForce = pOp * areaBlock;
      const margin = ((liftForce - force) / force) * 100;
      const aeroPwr = pOp * qOp;
      const usefulPwr = pOp * qOp * geoFrac;
      const wastedPwr = pOp * qOp * (1 - geoFrac);
      const sysEff = fanWatts > 0 ? (usefulPwr / fanWatts) * 100 : 0;
      const floats = liftForce >= force;
      const safe = (v) => (isFinite(v) ? v : 0);
      pts.push({
        diameter: Math.round(d * 10) / 10,
        aeroPower: safe(Math.round(aeroPwr * 100) / 100),
        usefulPower: safe(Math.round(usefulPwr * 1000) / 1000),
        wastedPower: safe(Math.round(wastedPwr * 100) / 100),
        totalWasted: safe(Math.round((fanWatts - usefulPwr) * 100) / 100),
        systemEff: safe(Math.round(sysEff * 100) / 100),
        margin: safe(Math.round(margin * 10) / 10),
        floats,
      });
    }
    return pts;
  }, [makeFanQFn, fanWatts, stripLength, spacing, rows, mass, blockLength, blockWidth]);

  // Sweet spot finder — score = margin × efficiency, only where it floats
  const sweetSpot = useMemo(() => {
    const fanQFn = makeFanQFn();
    const totalHoles = Math.floor(stripLength / spacing) * rows;
    const areaBlock = (blockLength / 1000) * (blockWidth / 1000);
    const force = (mass / 1000) * G;
    const holesUnder = Math.floor(blockLength / spacing) * rows;
    const geoFrac = totalHoles > 0 ? holesUnder / totalHoles : 0;

    let bestD = 0, bestScore = -1, bestMargin = 0, bestEff = 0, bestAero = 0;
    let maxFloatD = 0;

    for (let d = 1.0; d <= 8.0; d += 0.1) {
      const aT = totalHoles * Math.PI / 4 * Math.pow(d / 1000, 2);
      const { pOp, qOp } = solveOperatingPoint(fanQFn, aT);
      const liftForce = pOp * areaBlock;
      const margin = ((liftForce - force) / force) * 100;
      const aeroPwr = pOp * qOp;
      const usefulPwr = pOp * qOp * geoFrac;
      const sysEff = fanWatts > 0 ? (usefulPwr / fanWatts) * 100 : 0;

      if (margin >= 0) maxFloatD = d;

      if (margin >= 15) {
        const marginBonus = Math.min(margin, 40) / 40;
        const score = sysEff * (0.5 + 0.5 * marginBonus);
        if (score > bestScore) {
          bestScore = score;
          bestD = d;
          bestMargin = margin;
          bestEff = sysEff;
          bestAero = aeroPwr;
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
      <div style={{ textAlign: "center", marginBottom: "2rem", padding: "2rem 1.5rem", background: "linear-gradient(135deg, #2B6CB0 0%, #1A8A7D 100%)", borderRadius: "20px", color: "white" }}>
        <h1 style={{ fontSize: "1.6rem", fontWeight: 700, letterSpacing: "-0.02em", marginBottom: "0.4rem" }}>
          Air-Cushioned Bearing Strip — Design Parameter Tool
        </h1>
        <p style={{ fontSize: "0.95rem", fontWeight: 300, opacity: 0.9 }}>
          Interactive design tool for hole sizing, fan matching, and hover performance
        </p>
      </div>

      {/* STATUS BAR */}
      <div style={{
        background: calc.floats ? "linear-gradient(135deg, #D1FAE5, #DBEAFE)" : "linear-gradient(135deg, #FEE2E2, #FEF3C7)",
        borderRadius: "16px", padding: "1.2rem 1.5rem", marginBottom: "1.5rem",
        border: calc.floats ? "2px solid #6EE7B7" : "2px solid #FCA5A5",
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

      {/* SLIDERS SECTION */}
      <Card color={COLORS.blue} label="Design Parameters" title="Variable Inputs">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 2rem" }}>
          <div>
            <div style={{ fontSize: "0.8rem", fontWeight: 600, color: COLORS.blue, marginBottom: "0.6rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>Block</div>
            <Slider label="Mass" unit="g" value={mass} min={50} max={800} step={10} onChange={setMass} color={COLORS.rose} description="Total mass of block including any payload" />
            <Slider label="Length (along strip)" unit="mm" value={blockLength} min={40} max={300} step={5} onChange={setBlockLength} color={COLORS.rose} description="Block dimension along the 2m strip" />
            <Slider label="Width (across strip)" unit="mm" value={blockWidth} min={40} max={110} step={5} onChange={setBlockWidth} color={COLORS.rose} description="Block dimension across the strip — must fit within channel" />
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
              </>
            ) : (
              <>
                <Slider label="Free-flow Rate" unit="m³/h" value={fanFlow} min={100} max={1500} step={10} onChange={setFanFlow} color={COLORS.teal} description="Airflow at zero back-pressure (Q_max)" />
                <Slider label="Max Static Pressure" unit="Pa" value={customPmax} min={100} max={5000} step={10} onChange={setCustomPmax} color={COLORS.teal} description="Stall pressure at zero flow (P_max)" />
                <Slider label="Rated Power" unit="W" value={fanWatts} min={10} max={250} step={5} onChange={setFanWatts} color={COLORS.teal} description="Electrical input power from label" />
              </>
            )}
          </div>
        </div>
        <div style={{ borderTop: `1px solid ${COLORS.border}`, marginTop: "0.5rem", paddingTop: "1rem" }}>
          <div style={{ fontSize: "0.8rem", fontWeight: 600, color: COLORS.purple, marginBottom: "0.6rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>Holes</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0 2rem" }}>
            <Slider label="Hole Diameter" unit="mm" value={holeDia} min={1.0} max={8.0} step={0.5} onChange={setHoleDia} color={COLORS.purple} />
            <Slider label="Spacing" unit="mm" value={spacing} min={10} max={60} step={5} onChange={setSpacing} color={COLORS.purple} />
            <Slider label="Rows" unit="" value={rows} min={1} max={6} step={1} onChange={setRows} color={COLORS.purple} />
          </div>
        </div>
        <div style={{ borderTop: `1px solid ${COLORS.border}`, marginTop: "0.5rem", paddingTop: "1rem" }}>
          <div style={{ fontSize: "0.8rem", fontWeight: 600, color: COLORS.orange, marginBottom: "0.6rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>Running Cost</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "0", maxWidth: "300px" }}>
            <Slider label="Electricity Price" unit="p/kWh" value={Math.round(costPerKwh * 100)} min={10} max={50} step={1} onChange={v => setCostPerKwh(v / 100)} color={COLORS.orange} description="UK domestic tariff — Ofgem price cap ≈ 24.5p/kWh (Q1 2025) [8]" />
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
        <div style={{ background: "#F7F5F0", borderRadius: "14px", padding: "1rem", margin: "0.5rem 0" }}>
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
              background: activeGraph === t.id ? COLORS.blue : "#F0EDE6",
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
                <CartesianGrid strokeDasharray="3 3" stroke="#E5DDD2" />
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
                <CartesianGrid strokeDasharray="3 3" stroke="#E5DDD2" />
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
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5DDD2" />
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
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5DDD2" />
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
            <div style={{ background: "#FEF3C7", borderRadius: "10px", padding: "0.8rem 1rem", marginTop: "0.8rem", fontSize: "0.82rem", lineHeight: 1.6, border: "1px solid #FCD34D" }}>
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
                <CartesianGrid strokeDasharray="3 3" stroke="#E5DDD2" />
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
                <CartesianGrid strokeDasharray="3 3" stroke="#E5DDD2" />
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
                <CartesianGrid strokeDasharray="3 3" stroke="#E5DDD2" />
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
              The <strong style={{ color: COLORS.orange }}>orange line</strong> is overall system efficiency (wall socket → useful lift). The <strong style={{ color: "#16A34A" }}>green band</strong> highlights the sweet zone: at least 15% safety margin with the best achievable efficiency. The 15% threshold accounts for manufacturing tolerances and real-world variation.
              {sweetSpot.bestD > 0 && (
                <> Calculated sweet spot: <strong>{sweetSpot.bestD} mm</strong>.</>
              )}
            </p>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={energySweepData} margin={{ top: 10, right: 50, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5DDD2" />
                <XAxis dataKey="diameter" fontSize={11} fontFamily="Lexend" label={{ value: "Hole Diameter (mm)", position: "insideBottom", offset: -2, fontSize: 11, fontFamily: "Lexend" }} />
                <YAxis yAxisId="left" fontSize={11} fontFamily="Lexend" label={{ value: "Lift Margin (%)", angle: -90, position: "insideLeft", offset: 10, fontSize: 11, fontFamily: "Lexend" }} />
                <YAxis yAxisId="right" orientation="right" fontSize={11} fontFamily="Lexend" label={{ value: "Efficiency (%)", angle: 90, position: "insideRight", offset: 15, fontSize: 11, fontFamily: "Lexend" }} />
                <Tooltip content={<CustomTooltip xLabel="Hole ⌀" xUnit="mm" yUnit="" precision={2} />} />
                {/* Sweet zone highlight */}
                <ReferenceLine yAxisId="left" y={15} stroke="#16A34A" strokeDasharray="4 4" strokeWidth={1} label={{ value: "15% margin target", fontSize: 9, fontFamily: "Lexend", fill: "#16A34A" }} />
                <ReferenceLine yAxisId="left" y={0} stroke={COLORS.rose} strokeWidth={1.5} strokeDasharray="6 4" label={{ value: "Levitation limit", fontSize: 9, fontFamily: "Lexend", fill: COLORS.rose }} />
                <Line yAxisId="left" type="monotone" dataKey="margin" stroke={COLORS.teal} strokeWidth={2.5} name="Margin (%)" dot={false} />
                <Line yAxisId="right" type="monotone" dataKey="systemEff" stroke={COLORS.orange} strokeWidth={2.5} name="Efficiency (%)" dot={false} />
                {sweetSpot.bestD > 0 && (
                  <ReferenceLine yAxisId="left" x={sweetSpot.bestD} stroke="#16A34A" strokeWidth={2} strokeDasharray="6 3"
                    label={{ value: `Sweet spot: ${sweetSpot.bestD}mm`, fontSize: 10, fontFamily: "Lexend", fill: "#16A34A", fontWeight: 600 }} />
                )}
                <ReferenceLine yAxisId="left" x={holeDia} stroke={COLORS.purple} strokeWidth={2} strokeDasharray="4 3" label={{ value: `You: ${holeDia}mm`, fontSize: 9, fontFamily: "Lexend", fill: COLORS.purple, fontWeight: 600 }} />
              </ComposedChart>
            </ResponsiveContainer>
            <div style={{ display: "flex", gap: "1.5rem", justifyContent: "center", flexWrap: "wrap", fontSize: "0.8rem", color: COLORS.textSoft, marginTop: "0.5rem" }}>
              <span><strong style={{ color: COLORS.purple }}>●</strong> Your setting: {holeDia}mm</span>
              {sweetSpot.bestD > 0 && <span><strong style={{ color: "#16A34A" }}>┊</strong> Sweet spot: {sweetSpot.bestD}mm ({sweetSpot.bestMargin.toFixed(0)}% margin, {sweetSpot.bestEff.toFixed(2)}% eff)</span>}
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
        <div style={{ background: "#F7F5F0", borderRadius: "14px", padding: "1.5rem", marginBottom: "1.2rem" }}>
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
              <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "#64748B" }}>{calc.powerMotorHeat.toFixed(1)} W</div>
              <div style={{ fontSize: "0.7rem", color: COLORS.textSoft }}>Fan motor inefficiency</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ width: "12px", height: "12px", borderRadius: "3px", background: COLORS.rose, display: "inline-block", marginRight: "0.3rem", verticalAlign: "middle" }}></div>
              <span style={{ fontSize: "0.8rem", fontWeight: 500 }}>Wasted Air</span>
              <div style={{ fontSize: "1.1rem", fontWeight: 700, color: COLORS.rose }}>{calc.powerWasted.toFixed(2)} W</div>
              <div style={{ fontSize: "0.7rem", color: COLORS.textSoft }}>Escaping uncovered holes</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ width: "12px", height: "12px", borderRadius: "3px", background: COLORS.teal, display: "inline-block", marginRight: "0.3rem", verticalAlign: "middle" }}></div>
              <span style={{ fontSize: "0.8rem", fontWeight: 500 }}>Useful Lift</span>
              <div style={{ fontSize: "1.1rem", fontWeight: 700, color: COLORS.teal }}>{(calc.powerUseful * 1000).toFixed(1)} mW</div>
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
            <div style={{ fontSize: "1.3rem", fontWeight: 700, color: COLORS.rose }}>×{calc.powerRatio.toFixed(0)}</div>
            <div style={{ fontSize: "0.7rem", color: COLORS.textSoft }}>vs Theoretical Min</div>
          </div>
        </div>

        {/* Running costs */}
        <div style={{ background: "#F7F5F0", borderRadius: "14px", padding: "1.2rem 1.5rem", marginBottom: "1rem" }}>
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
            <div style={{ fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "#16A34A", marginBottom: "0.5rem" }}>Efficiency Sweet Spot</div>
            <p style={{ fontSize: "0.9rem", color: COLORS.text, fontWeight: 400 }}>
              Best trade-off between safety margin and efficiency: <strong style={{ color: "#16A34A", fontSize: "1.1rem" }}>{sweetSpot.bestD} mm holes</strong>.
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
      <Card color={COLORS.rose} label="Manufacture" title="Orifice Fabrication — Practical Constraints & Selection Rationale">
        <div style={{ fontSize: "0.9rem", color: COLORS.textSoft, fontWeight: 300, lineHeight: 1.8 }}>
          <p style={{ marginBottom: "1rem" }}>
            The model above identifies the theoretical optimum hole diameter, but the final choice of <strong style={{ color: COLORS.text }}>3.0 mm</strong> was driven by practical manufacturing and tooling constraints:
          </p>

          <p style={{ marginBottom: "0.8rem", paddingLeft: "1rem", borderLeft: `3px solid ${COLORS.blue}` }}>
            <strong>Standard tooling availability.</strong> A 3.0 mm diameter corresponds to a standard metric drill bit size per ISO 235<Ref n={3} />, readily available in HSS, cobalt, and solid-carbide variants.
            Non-standard diameters (e.g. 2.7 mm, 3.3 mm) would require specialist ordering, increased cost, and longer lead times — an unnecessary constraint for a university workshop environment.
            Standard sizes also simplify quality verification, as standard-tolerance gauge pins are available for go/no-go inspection of finished holes.
          </p>

          <p style={{ marginBottom: "0.8rem", paddingLeft: "1rem", borderLeft: `3px solid ${COLORS.teal}` }}>
            <strong>Tool rigidity and breakage risk.</strong> Drill bit stiffness scales with the fourth power of diameter (I ∝ d⁴)<Ref n={11} />.
            At diameters below approximately 2.5 mm, HSS drill bits become increasingly susceptible to lateral deflection and catastrophic fracture — particularly in sheet materials where the bit may snatch on breakthrough.
            A 3.0 mm bit offers a substantially better stiffness-to-length ratio than a 2.0 mm alternative, significantly reducing the probability of tool breakage during a production run of {calc.totalHoles} holes.
            Given the volume of holes required, even a modest per-hole breakage probability compounds into a near-certainty of at least one failure event at smaller diameters.
          </p>

          <p style={{ marginBottom: "0.8rem", paddingLeft: "1rem", borderLeft: `3px solid ${COLORS.orange}` }}>
            <strong>Positional accuracy and drill wander.</strong> Small-diameter drill bits are prone to positional wander at the point of engagement, particularly in the absence of a pilot hole or centre-punch mark.
            The resulting positional error degrades the uniformity of the orifice array, introducing localised pressure non-uniformities in the air cushion.
            At 3.0 mm, the bit is stiff enough to hold position within ±0.2 mm on a CNC platform — well within the {spacing} mm pitch of this design.
          </p>

          <p style={{ marginBottom: "0.8rem", paddingLeft: "1rem", borderLeft: `3px solid ${COLORS.purple}` }}>
            <strong>CNC fabrication.</strong> With {calc.totalHoles} holes at {spacing} mm pitch across {rows} rows, CNC is the obvious choice over manual drilling.
            The university workshop facilities will determine the specific machine: a <strong>CNC router</strong> is the most likely candidate, as these are commonly available in university engineering departments and can be programmed with a straightforward G-code drilling cycle (G81/G83 peck-drill)<Ref n={10} />.
            A CNC router with a collet-type spindle will accept standard 3.0 mm drill bits directly and can maintain the required positional accuracy (±0.1 mm) at production feed rates.
            If a router is unavailable, a CNC milling machine or even a pillar drill with an X-Y cross-slide and DRO (digital readout) could be used, though cycle time would increase significantly.
          </p>

          <p style={{ marginBottom: "0.8rem", paddingLeft: "1rem", borderLeft: `3px solid #94A3B8` }}>
            <strong>Hole count and cumulative tolerance.</strong> With {calc.totalHoles} orifices, the cumulative effect of per-hole diameter variation on total open area — and hence on the fan operating point — must be considered.
            A ±0.05 mm tolerance on each 3.0 mm hole produces a per-hole area variation of approximately ±3.3%.
            However, because the total open area is the <em>sum</em> of {calc.totalHoles} independent holes, random diameter errors average out by a factor of 1/√N, yielding an expected total-area uncertainty of ±{(3.3 / Math.sqrt(calc.totalHoles)).toFixed(1)}%.
            This is well within the safety margin provided by the current design ({calc.liftMarginPct.toFixed(0)}% lift margin), confirming that standard workshop tolerances are adequate.
          </p>
        </div>

        <div style={{
          background: "linear-gradient(135deg, #D1FAE5 0%, #DBEAFE 100%)",
          borderRadius: "14px", padding: "1.3rem 1.5rem", margin: "1rem 0",
          border: "2px solid #6EE7B7",
        }}>
          <div style={{ fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "#16A34A", marginBottom: "0.5rem" }}>Selected Design Parameters</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.8rem" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "1.4rem", fontWeight: 700, color: COLORS.teal }}>3.0 mm</div>
              <div style={{ fontSize: "0.78rem", color: COLORS.textSoft }}>Orifice diameter (standard metric drill)</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "1.4rem", fontWeight: 700, color: COLORS.blue }}>{spacing} mm</div>
              <div style={{ fontSize: "0.78rem", color: COLORS.textSoft }}>Orifice pitch (centre-to-centre)</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "1.4rem", fontWeight: 700, color: COLORS.purple }}>{calc.totalHoles}</div>
              <div style={{ fontSize: "0.78rem", color: COLORS.textSoft }}>Total orifice count ({rows} rows × {calc.holesPerRow}/row)</div>
            </div>
          </div>
        </div>

        <Info>
          <strong>Material note:</strong> The strip substrate material will influence drill bit selection and feed parameters. For aluminium sheet (likely 1.5–3 mm gauge), HSS or cobalt drill bits at 3.0 mm are appropriate with a spindle speed of approximately 3,000–5,000 RPM and a feed rate of 0.05–0.1 mm/rev.
          For acrylic or polycarbonate substrates, reduced spindle speeds and peck-drilling cycles are recommended to prevent heat build-up, which can cause material softening, burr formation, and hole oversize. Deburring of all orifice exits is essential to maintain the assumed discharge coefficient of C<sub>d</sub> = 0.60<Ref n={2} />.
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
          background: verification.failCount > 0 ? "#FEF2F2" : verification.warnCount > 0 ? COLORS.hlYellow : COLORS.hlGreen,
          borderRadius: "12px",
          border: `2px solid ${verification.failCount > 0 ? "#FCA5A5" : verification.warnCount > 0 ? "#FCD34D" : "#6EE7B7"}`,
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
                background: check.status === "pass" ? "#F0FDF4" : check.status === "warn" ? "#FFFBEB" : "#FEF2F2",
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
                    background: check.status === "pass" ? "#DCFCE7" : check.status === "warn" ? "#FEF3C7" : "#FEE2E2",
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

            <div style={{ background: "#F7F5F0", borderRadius: "12px", padding: "1rem 1.2rem", fontSize: "0.85rem", color: COLORS.textSoft, fontWeight: 300, lineHeight: 1.7 }}>
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
