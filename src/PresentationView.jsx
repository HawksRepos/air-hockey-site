/**
 * Presentation Mode — full-screen, TV-friendly view designed for live
 * audience interaction.  A hero banner answers "does it float?" at a
 * glance, big sliders drive the most relevant design parameters, and a
 * single large chart shows one parametric sweep at a time.
 *
 * Physics is delegated to computeAirHockey() so this view always agrees
 * with the detailed analysis page.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { computeAirHockey } from './physics/computeAirHockey.js';
import { fanCurveQ } from './physics/fanCurve.js';
import { FAN_CURVE_C } from './data/manroseMan150m.js';
import { useTheme } from './ThemeContext.jsx';
import { ValidityBadge } from './components/ValidityBadge.jsx';
import { RigVisualization } from './components/RigVisualization.jsx';

const STRIP_INPUTS = {
  blockWidthMm: 100,
  stripLengthMm: 2000,
  stripWidthMm: 110,
  costPerKwh: 0.245,
};

const FAN_PRESETS = {
  manrose: {
    label: 'Manrose MAN150M (AC centrifugal)',
    fanMode: 'curve',
    fanFlowM3h: 420,
    fanPmaxPa: 2747,
    fanWatts: 80,
    fanAeroEfficiency: 0.3,
    notes: '150 mm in-line centrifugal, mains-powered. Good pressure, moderate flow.',
  },
  dewalt: {
    label: 'Dewalt DCMBL562N (18V leaf blower)',
    fanMode: 'linear',
    fanFlowM3h: 762, // 450 CFM = 12.7 m³/min (from datasheet)
    fanPmaxPa: 1200, // Estimated from ½ρv² at 200 km/h nozzle speed × ~65 %
    fanWatts: 300, // 18V brushless, ~17A typical draw
    fanAeroEfficiency: 0.2,
    notes:
      '450 CFM, 200 km/h nozzle speed. Much higher flow and power than the Manrose (60 W aero vs 24 W), but lower peak pressure (~1200 Pa vs 2747 Pa). Estimated P_max from nozzle dynamic pressure ½ρv² ≈ 1855 Pa × 65 %.',
  },
  custom: {
    label: 'Custom (enter your own)',
    fanMode: 'linear',
    fanFlowM3h: 420,
    fanPmaxPa: 2000,
    fanWatts: 100,
    fanAeroEfficiency: 0.3,
    notes: '',
  },
};

const TABS = [
  {
    id: 'diagram',
    label: 'Diagram',
    sub: 'Live cross-section — watch how the blower, holes, film, and hover gap respond to the sliders. Hover any region for the equation. [1, 2, 4]',
  },
  {
    id: 'mass',
    label: 'Mass Sweep',
    sub: 'How heavy can the carriage get before it stops floating? [1, 2, 3]',
  },
  {
    id: 'hole',
    label: 'Hole Diameter',
    sub: 'Drilling bigger holes lowers plenum pressure — find the sweet spot. [1, 2, 3]',
  },
  {
    id: 'fan',
    label: 'Fan Operating Point',
    sub: 'Where the fan supply curve crosses the system demand curve. [1, 5]',
  },
  {
    id: 'hover',
    label: 'Hover Height',
    sub: 'Predicted air gap between the carriage and the strip surface vs load. [4]',
  },
  {
    id: 'power',
    label: 'Power & Cost',
    sub: 'How much of the fan power actually lifts the carriage — and what it costs to run. [1, 5]',
  },
];

/**
 * Top-down schematic of a section of the strip with the carriage placed
 * over it.  Holes inside the carriage footprint are highlighted; holes
 * outside it leak straight to atmosphere and are drawn dimmer.
 */
function CarriagePattern({
  carriageLengthMm,
  carriageWidthMm = 100,
  stripWidthMm = 110,
  spacingMm = 20,
  rows = 4,
  holeDiaMm = 3.5,
}) {
  // Show a window of strip wide enough to give a bit of context.
  const viewLengthMm = Math.max(carriageLengthMm + 80, 240);
  const padding = 14;
  const pxPerMm = 260 / viewLengthMm; // sidebar width budget ≈ 260 px
  const wPx = viewLengthMm * pxPerMm + padding * 2;
  const hPx = stripWidthMm * pxPerMm + padding * 2 + 18; // +18 for label

  const carriageX0 = padding + ((viewLengthMm - carriageLengthMm) / 2) * pxPerMm;
  const carriageY0 = padding + ((stripWidthMm - carriageWidthMm) / 2) * pxPerMm;
  const carriageWPx = carriageLengthMm * pxPerMm;
  const carriageHPx = carriageWidthMm * pxPerMm;

  // Hole positions: rows distributed evenly across the strip width.
  const holes = [];
  const holesAcrossWindow = Math.floor(viewLengthMm / spacingMm);
  const xStart = padding + ((viewLengthMm - holesAcrossWindow * spacingMm) / 2) * pxPerMm;
  for (let row = 0; row < rows; row += 1) {
    const yMm = ((row + 0.5) * stripWidthMm) / rows;
    const yPx = padding + yMm * pxPerMm;
    for (let col = 0; col <= holesAcrossWindow; col += 1) {
      const xPx = xStart + col * spacingMm * pxPerMm;
      const inside =
        xPx >= carriageX0 &&
        xPx <= carriageX0 + carriageWPx &&
        yPx >= carriageY0 &&
        yPx <= carriageY0 + carriageHPx;
      holes.push({ x: xPx, y: yPx, inside });
    }
  }

  const coveredCount = holes.filter((h) => h.inside).length;

  return (
    <div>
      <svg
        width="100%"
        viewBox={`0 0 ${wPx} ${hPx - 18}`}
        role="img"
        aria-label={`Top-down view: ${carriageLengthMm} by ${carriageWidthMm} mm carriage on a ${stripWidthMm} mm strip with ${rows} rows of ${holeDiaMm} mm holes spaced ${spacingMm} mm apart`}
        style={{ display: 'block' }}
      >
        <rect
          x={padding}
          y={padding}
          width={viewLengthMm * pxPerMm}
          height={stripWidthMm * pxPerMm}
          fill="#252F3A"
          stroke="#3A4654"
          strokeWidth={1}
          rx={3}
        />
        {holes.map((h, i) => (
          <circle
            key={i}
            cx={h.x}
            cy={h.y}
            r={Math.max(2, (holeDiaMm / 2) * pxPerMm)}
            fill={h.inside ? '#34D399' : '#5BA3F0'}
            opacity={h.inside ? 0.95 : 0.35}
          />
        ))}
        <rect
          x={carriageX0}
          y={carriageY0}
          width={carriageWPx}
          height={carriageHPx}
          fill="#A78BFA"
          fillOpacity={0.18}
          stroke="#A78BFA"
          strokeWidth={2}
          rx={4}
        />
      </svg>
      <div
        style={{
          fontSize: '0.68rem',
          color: '#A8B3BE',
          textAlign: 'center',
          marginTop: '0.2rem',
        }}
      >
        {carriageLengthMm} × {carriageWidthMm} mm · {coveredCount} / {holes.length} holes covered
      </div>
    </div>
  );
}

/** Tracks the viewport width so the layout can switch breakpoints. */
function useViewportWidth() {
  const [w, setW] = useState(() => (typeof window === 'undefined' ? 1280 : window.innerWidth));
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onResize = () => setW(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return w;
}

/** Unit map for tooltip value formatting. */
const UNIT_MAP = {
  pOp: 'Pa',
  pRequired: 'Pa',
  pressure: 'Pa',
  mass: 'g',
  diameter: 'mm',
  headroom: '%',
  hover: 'mm',
  fanFlow: 'm³/h',
  systemFlow: 'm³/h',
  aero: 'W',
  useful: 'W',
  wasted: 'W',
  motorHeat: 'W',
  sysEff: '%',
};

function num(v, dp = 1) {
  if (!Number.isFinite(v)) return '—';
  return v.toLocaleString('en-GB', {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  });
}

/** Round a maximum value up to a "nice" axis ceiling so the Y-axis
 *  doesn't jump around as slider values change. */
function niceMax(raw) {
  if (!Number.isFinite(raw) || raw <= 0) return 10;
  const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
  const nice = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
  const norm = raw / magnitude;
  for (const n of nice) {
    if (n >= norm) return n * magnitude;
  }
  return 10 * magnitude;
}

function BigSlider({ label, desc, value, min, max, step, onChange, unit, color }) {
  const C = useTheme();
  color = color ?? C.accent;
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <label
      style={{
        display: 'block',
        marginBottom: '0.9rem',
        cursor: 'pointer',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: desc ? '0.1rem' : '0.3rem',
        }}
      >
        <span style={{ fontSize: '0.92rem', fontWeight: 500, color: C.textSoft }}>{label}</span>
        <span
          style={{
            fontSize: '1.35rem',
            fontWeight: 700,
            color,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {num(value, step < 1 ? 1 : 0)}{' '}
          <span style={{ fontSize: '0.85rem', color: C.textSoft }}>{unit}</span>
        </span>
      </div>
      {desc && (
        <div
          style={{
            fontSize: '0.62rem',
            color: C.textSoft,
            lineHeight: 1.35,
            marginBottom: '0.25rem',
            opacity: 0.75,
          }}
        >
          {desc}
        </div>
      )}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{
          width: '100%',
          height: '10px',
          appearance: 'none',
          background: `linear-gradient(to right, ${color} 0%, ${color} ${pct}%, ${C.surfaceAlt} ${pct}%, ${C.surfaceAlt} 100%)`,
          borderRadius: '5px',
          outline: 'none',
          cursor: 'pointer',
        }}
      />
    </label>
  );
}

function Stat({ label, value, unit, color }) {
  const C = useTheme();
  const c = color ?? C.accent;
  return (
    <div>
      <div
        style={{
          fontSize: '0.66rem',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          color: C.textSoft,
          marginBottom: '0.15rem',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 'clamp(1.15rem, 2vw, 1.5rem)',
          fontWeight: 700,
          color: c,
          fontVariantNumeric: 'tabular-nums',
          lineHeight: 1.1,
        }}
      >
        {value}
        {unit && (
          <span
            style={{
              fontSize: 'clamp(0.8rem, 1.4vw, 0.95rem)',
              color: C.textSoft,
              marginLeft: '0.25rem',
            }}
          >
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}

const PRESETS = {
  default: {
    label: 'Our Rig (Default)',
    mass: 400,
    carriageLength: 110,
    holeDia: 2.0,
    spacing: 20,
    stripThickness: 2.0,
    rows: 4,
  },
  maxLift: {
    label: 'Maximum Lift',
    mass: 300,
    carriageLength: 200,
    holeDia: 1.5,
    spacing: 10,
    stripThickness: 3.0,
    rows: 4,
  },
  efficient: {
    label: 'Most Efficient',
    mass: 300,
    carriageLength: 120,
    holeDia: 2.5,
    spacing: 15,
    stripThickness: 3.0,
    rows: 3,
  },
  safe: {
    label: 'Max Safety Margin',
    mass: 300,
    carriageLength: 250,
    holeDia: 1.0,
    spacing: 8,
    stripThickness: 3.0,
    rows: 6,
  },
};

export default function PresentationView({
  onOpenDetailed: _onOpenDetailed,
  themeId,
  changeTheme,
  themeOrder: themeOrderProp,
  // Shared rig state from App.jsx
  mass,
  setMass,
  carriageLength,
  setCarriageLength,
  holeDia,
  setHoleDia,
  spacing,
  setSpacing,
  stripThickness,
  setStripThickness,
  rows,
  setRows,
  // Shared fan state from App.jsx
  fanPresetKey,
  setFanPresetKey,
  fanMode,
  setFanMode,
  fanFlowM3h,
  setFanFlowM3h,
  fanPmaxPa,
  setFanPmaxPa,
  fanWatts,
  setFanWatts,
  fanAeroEff,
  setFanAeroEff,
  // Shared calculation result from App.jsx
  calc,
}) {
  const C = useTheme();
  const viewportW = useViewportWidth();
  const isNarrow = viewportW < 900;
  const [activeTab, setActiveTab] = useState('diagram');
  const [showFanSettings, setShowFanSettings] = useState(false);

  const applyFanPreset = (key) => {
    const p = FAN_PRESETS[key];
    if (!p) return;
    setFanPresetKey(key);
    setFanMode(p.fanMode);
    setFanFlowM3h(p.fanFlowM3h);
    setFanPmaxPa(p.fanPmaxPa);
    setFanWatts(p.fanWatts);
    setFanAeroEff(p.fanAeroEfficiency);
  };

  const applyPreset = (key) => {
    const p = PRESETS[key];
    if (!p) return;
    setMass(p.mass);
    setCarriageLength(p.carriageLength);
    setHoleDia(p.holeDia);
    setSpacing(p.spacing);
    setStripThickness(p.stripThickness);
    setRows(p.rows);
  };

  // calc is received from App.jsx as a prop — single source of truth.
  // Build a fanInputs object for the sweep memos to use.
  const fanInputs = useMemo(
    () => ({
      ...STRIP_INPUTS,
      fanMode,
      fanFlowM3h,
      fanPmaxPa,
      fanWatts,
      fanAeroEfficiency: fanAeroEff,
    }),
    [fanMode, fanFlowM3h, fanPmaxPa, fanWatts, fanAeroEff],
  );

  // === SWEEP DATA ===
  const massSweep = useMemo(() => {
    const pts = [];
    for (let m = 50; m <= 1500; m += 25) {
      const r = computeAirHockey({
        ...fanInputs,
        massG: m,
        blockLengthMm: carriageLength,
        holeDiaMm: holeDia,
        spacingMm: spacing,
        stripThicknessMm: stripThickness,
        rows,
      });
      const pOp = Math.round(r.pOp);
      const pReqEff = Math.round(r.pRequiredEffective);
      // For shading between lines: green where pOp > pRequired, red where pRequired > pOp.
      // Stacked areas: transparent base at line value, then band height on top.
      pts.push({
        mass: m,
        pRequired: pReqEff,
        pOp,
        // Green stacked pair: base=pRequired, band=gap height (only when floating)
        greenBase: pReqEff,
        greenBand: Math.max(0, pOp - pReqEff),
        // Red stacked pair: base=pOp, band=gap height (only when failing)
        redBase: pOp,
        redBand: Math.max(0, pReqEff - pOp),
        headroom: Math.round(r.pressureHeadroomPct * 10) / 10,
        floats: r.floats ? 1 : 0,
        hover: r.floats ? Math.round(r.hoverHeightMm * 100) / 100 : 0,
      });
    }
    return pts;
  }, [fanInputs, carriageLength, holeDia, spacing, stripThickness, rows]);

  // The mass at which floating fails — interpolated for a precise crossover.
  const failMass = useMemo(() => {
    for (let i = 1; i < massSweep.length; i++) {
      const prev = massSweep[i - 1];
      const curr = massSweep[i];
      const prevMargin = prev.pOp - prev.pRequired;
      const currMargin = curr.pOp - curr.pRequired;
      if (currMargin <= 0 && prevMargin > 0) {
        const t = prevMargin / (prevMargin - currMargin);
        return prev.mass + t * (curr.mass - prev.mass);
      }
    }
    return null;
  }, [massSweep]);

  const energySweep = useMemo(() => {
    const pts = [];
    for (let d = 1; d <= 8; d += 0.25) {
      const r = computeAirHockey({
        ...fanInputs,
        massG: mass,
        blockLengthMm: carriageLength,
        holeDiaMm: d,
        spacingMm: spacing,
        stripThicknessMm: stripThickness,
        rows,
      });
      pts.push({
        diameter: d,
        useful: Math.round(r.powerUseful * 1000) / 1000,
        wasted: Math.round(r.powerWasted * 100) / 100,
        motorHeat: Math.max(0, Math.round(r.powerMotorHeat * 100) / 100),
      });
    }
    return pts;
  }, [fanInputs, mass, carriageLength, spacing, stripThickness, rows]);

  const holeSweep = useMemo(() => {
    const pts = [];
    for (let d = 1; d <= 8; d += 0.25) {
      const r = computeAirHockey({
        ...fanInputs,
        massG: mass,
        blockLengthMm: carriageLength,
        holeDiaMm: d,
        spacingMm: spacing,
        stripThicknessMm: stripThickness,
        rows,
      });
      const pOp = Math.round(r.pOp);
      // Use the effective required pressure (accounts for coverage penalty)
      // so the chart matches the hero "floats / doesn't float" decision.
      const pReqEff = Math.round(r.pRequiredEffective);
      pts.push({
        diameter: d,
        pOp,
        pRequired: pReqEff,
        greenBase: pReqEff,
        greenBand: Math.max(0, pOp - pReqEff),
        redBase: pOp,
        redBand: Math.max(0, pReqEff - pOp),
      });
    }
    return pts;
  }, [fanInputs, mass, carriageLength, spacing, stripThickness, rows]);

  // Fan supply curve and system demand curve for the Operating Point tab
  // Hover height vs mass sweep.
  const hoverSweep = useMemo(() => {
    const pts = [];
    for (let m = 50; m <= 1500; m += 25) {
      const r = computeAirHockey({
        ...fanInputs,
        massG: m,
        blockLengthMm: carriageLength,
        holeDiaMm: holeDia,
        spacingMm: spacing,
        stripThicknessMm: stripThickness,
        rows,
      });
      const h = r.floats ? Math.round(r.hoverHeightMm * 100) / 100 : 0;
      pts.push({
        mass: m,
        hover: h,
        hoverGreen: r.floats ? h : 0,
        hoverRed: r.floats ? 0 : h, // fills from 0 when sinking (area extends to show deficit)
      });
    }
    return pts;
  }, [fanInputs, carriageLength, holeDia, spacing, stripThickness, rows]);

  // Fan Operating Point chart: sweep P from 0 to stall to plot both curves.
  const fanChartData = useMemo(() => {
    const stall = fanPmaxPa * 1.05;
    const RHO = 1.2;
    const aHole = (Math.PI / 4) * (holeDia / 1000) ** 2;
    const totalHoles = Math.floor(2000 / spacing) * rows;
    const aTotal = totalHoles * aHole;

    const fanQ =
      fanMode === 'curve'
        ? (p) => fanCurveQ(p, FAN_CURVE_C)
        : (() => {
            const qMax = fanFlowM3h / 3600;
            return (p) => qMax * Math.max(0, 1 - p / fanPmaxPa);
          })();

    const points = [];
    for (let i = 0; i <= 60; i += 1) {
      const p = (i / 60) * stall;
      points.push({
        pressure: Math.round(p),
        fanFlow: Math.round(fanQ(p) * 3600),
        systemFlow: p > 0 ? Math.round(calc.cd * aTotal * Math.sqrt((2 * p) / RHO) * 3600) : 0,
      });
    }
    return points;
  }, [fanInputs, fanMode, fanFlowM3h, fanPmaxPa, holeDia, spacing, rows, calc.cd]);

  // === STABLE Y-AXIS DOMAINS (prevents jumpy rescaling) ===
  const massYMax = useMemo(() => {
    const maxP = massSweep.reduce((m, p) => Math.max(m, p.pOp, p.pRequired), 0);
    return niceMax(maxP);
  }, [massSweep]);

  const holeYMax = useMemo(() => {
    const maxP = holeSweep.reduce((m, p) => Math.max(m, p.pOp, p.pRequired), 0);
    return niceMax(maxP);
  }, [holeSweep]);

  const hoverYMax = useMemo(() => {
    const maxH = hoverSweep.reduce((m, p) => Math.max(m, p.hover), 0);
    return niceMax(maxH);
  }, [hoverSweep]);

  const powerYMax = useMemo(() => {
    const maxW = energySweep.reduce((m, p) => Math.max(m, p.useful + p.wasted + p.motorHeat), 0);
    return niceMax(maxW);
  }, [energySweep]);

  // === RENDER ===
  // On wide screens we lock the layout to 100vh and let the sidebar
  // scroll internally so the chart always fits in the first fold; on
  // narrow viewports the page just scrolls normally.
  const fitToViewport = !isNarrow;
  return (
    <div
      style={{
        background: C.bg,
        color: C.text,
        minHeight: '100vh',
        height: fitToViewport ? '100vh' : 'auto',
        display: fitToViewport ? 'flex' : 'block',
        flexDirection: 'column',
        overflow: fitToViewport ? 'hidden' : 'visible',
        fontFamily: "'Lexend', system-ui, sans-serif",
      }}
    >
      <link
        href="https://fonts.googleapis.com/css2?family=Lexend:wght@300;400;500;600;700&display=swap"
        rel="stylesheet"
      />

      {/* HEADER BAR */}
      <header
        style={{
          flex: 'none',
          padding: '0.4rem clamp(1rem, 3vw, 2rem)',
          borderBottom: `1px solid ${C.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1rem',
          position: 'relative',
        }}
      >
        {/* Centred title */}
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              fontSize: 'clamp(1rem, 2.4vw, 1.4rem)',
              fontWeight: 700,
              letterSpacing: '-0.02em',
              lineHeight: 1.2,
            }}
          >
            Air-Cushioned Carriage — Live Demonstration
          </div>
          <div
            style={{
              fontSize: 'clamp(0.68rem, 1.2vw, 0.78rem)',
              color: C.textSoft,
              marginTop: '0.1rem',
            }}
          >
            Move the sliders to see how the design parameters affect levitation in real time.
          </div>
        </div>
        {/* Controls — pinned right */}
        <div
          style={{
            display: 'flex',
            gap: '0.4rem',
            alignItems: 'center',
            position: 'absolute',
            right: 'clamp(1rem, 3vw, 2rem)',
          }}
        >
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.3rem',
              fontSize: '0.72rem',
              color: C.textSoft,
              cursor: 'pointer',
            }}
          >
            Theme
            <select
              value={themeId}
              onChange={(e) => changeTheme(e.target.value)}
              style={{
                padding: '0.3rem 0.35rem',
                borderRadius: '6px',
                border: `1.5px solid ${C.border}`,
                background: C.surfaceAlt,
                color: C.text,
                fontFamily: 'inherit',
                fontSize: '0.72rem',
                cursor: 'pointer',
              }}
            >
              {(themeOrderProp || []).map((id) => (
                <option key={id} value={id}>
                  {id === 'dracula'
                    ? 'Dracula'
                    : id === 'oneDark'
                      ? 'One Dark'
                      : id === 'minDark'
                        ? 'Min Dark'
                        : 'Light'}
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={() => setShowFanSettings((v) => !v)}
            title="Fan Settings"
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              border: `1.5px solid ${showFanSettings ? C.accent : C.border}`,
              background: showFanSettings ? `${C.accent}22` : 'transparent',
              color: showFanSettings ? C.accent : C.textSoft,
              fontSize: '1.1rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
            }}
          >
            ⚙
          </button>
        </div>
      </header>

      {/* FAN SETTINGS — collapsible */}
      {showFanSettings && (
        <div
          style={{
            flex: 'none',
            padding: 'clamp(0.6rem, 1.4vw, 1rem) clamp(1rem, 3vw, 2rem)',
            borderBottom: `1px solid ${C.border}`,
            background: C.surface,
          }}
        >
          <div
            style={{
              maxWidth: '100%',
              margin: '0 auto',
              display: 'grid',
              gridTemplateColumns: isNarrow ? '1fr' : 'auto 1fr 1fr 1fr 1fr',
              gap: '0.8rem 1.2rem',
              alignItems: 'end',
              fontSize: '0.82rem',
            }}
          >
            <div>
              <div
                style={{
                  fontSize: '0.68rem',
                  color: C.textSoft,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  marginBottom: '0.25rem',
                }}
              >
                Fan Preset
              </div>
              <select
                value={fanPresetKey}
                onChange={(e) => applyFanPreset(e.target.value)}
                style={{
                  padding: '0.4rem 0.5rem',
                  borderRadius: '6px',
                  border: `1px solid ${C.border}`,
                  background: C.surfaceAlt,
                  color: C.text,
                  fontFamily: 'inherit',
                  fontSize: '0.78rem',
                  cursor: 'pointer',
                  width: '100%',
                }}
              >
                {Object.entries(FAN_PRESETS).map(([key, p]) => (
                  <option key={key} value={key}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div
                style={{
                  fontSize: '0.68rem',
                  color: C.textSoft,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  marginBottom: '0.25rem',
                }}
              >
                Q<sub>max</sub> (m³/h)
              </div>
              <input
                type="number"
                value={fanFlowM3h}
                min={10}
                max={3000}
                step={10}
                onChange={(e) => {
                  setFanFlowM3h(Number(e.target.value));
                  setFanPresetKey('custom');
                }}
                style={{
                  padding: '0.4rem',
                  borderRadius: '6px',
                  border: `1px solid ${C.border}`,
                  background: C.surfaceAlt,
                  color: C.text,
                  fontFamily: 'inherit',
                  fontSize: '0.82rem',
                  width: '100%',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div>
              <div
                style={{
                  fontSize: '0.68rem',
                  color: C.textSoft,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  marginBottom: '0.25rem',
                }}
              >
                P<sub>max</sub> (Pa)
              </div>
              <input
                type="number"
                value={fanPmaxPa}
                min={10}
                max={10000}
                step={10}
                onChange={(e) => {
                  setFanPmaxPa(Number(e.target.value));
                  setFanPresetKey('custom');
                }}
                style={{
                  padding: '0.4rem',
                  borderRadius: '6px',
                  border: `1px solid ${C.border}`,
                  background: C.surfaceAlt,
                  color: C.text,
                  fontFamily: 'inherit',
                  fontSize: '0.82rem',
                  width: '100%',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div>
              <div
                style={{
                  fontSize: '0.68rem',
                  color: C.textSoft,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  marginBottom: '0.25rem',
                }}
              >
                Power (W)
              </div>
              <input
                type="number"
                value={fanWatts}
                min={1}
                max={2000}
                step={5}
                onChange={(e) => {
                  setFanWatts(Number(e.target.value));
                  setFanPresetKey('custom');
                }}
                style={{
                  padding: '0.4rem',
                  borderRadius: '6px',
                  border: `1px solid ${C.border}`,
                  background: C.surfaceAlt,
                  color: C.text,
                  fontFamily: 'inherit',
                  fontSize: '0.82rem',
                  width: '100%',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div>
              <div
                style={{
                  fontSize: '0.68rem',
                  color: C.textSoft,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  marginBottom: '0.25rem',
                }}
              >
                η aero (%)
              </div>
              <input
                type="number"
                value={Math.round(fanAeroEff * 100)}
                min={5}
                max={60}
                step={1}
                onChange={(e) => {
                  setFanAeroEff(Number(e.target.value) / 100);
                  setFanPresetKey('custom');
                }}
                style={{
                  padding: '0.4rem',
                  borderRadius: '6px',
                  border: `1px solid ${C.border}`,
                  background: C.surfaceAlt,
                  color: C.text,
                  fontFamily: 'inherit',
                  fontSize: '0.82rem',
                  width: '100%',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>
          {FAN_PRESETS[fanPresetKey]?.notes && (
            <div
              style={{
                maxWidth: '100%',
                margin: '0.5rem auto 0',
                fontSize: '0.78rem',
                color: C.textSoft,
              }}
            >
              {FAN_PRESETS[fanPresetKey].notes}
            </div>
          )}
        </div>
      )}

      {/* HERO STATUS — single inline row */}
      <section
        style={{
          flex: 'none',
          padding: '0.4rem clamp(1rem, 3vw, 2rem)',
          borderBottom: `1px solid ${C.border}`,
          background: calc.floats
            ? `linear-gradient(135deg, ${C.success}15, ${C.accent}15)`
            : `linear-gradient(135deg, ${C.danger}25, ${C.warning}15)`,
        }}
        aria-live="polite"
      >
        <div
          style={{
            maxWidth: '100%',
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-evenly',
            flexWrap: 'wrap',
            gap: 'clamp(0.8rem, 2vw, 2rem)',
          }}
        >
          {/* Status — inline with stats, not above */}
          <Stat
            label="Status"
            value={calc.floats ? 'FLOATING' : 'NOT FLOATING'}
            color={calc.floats ? C.success : C.danger}
          />
          <Stat label="Plenum" value={num(calc.pOp, 0)} unit="Pa" color={C.accent} />
          <Stat label="Required" value={num(calc.pRequired, 0)} unit="Pa" color={C.warning} />
          <Stat
            label="Headroom"
            value={`${calc.pressureHeadroomPct >= 0 ? '+' : ''}${num(calc.pressureHeadroomPct, 0)}%`}
            color={
              calc.pressureHeadroomPct > 30
                ? C.success
                : calc.pressureHeadroomPct > 0
                  ? C.warning
                  : C.danger
            }
          />
          <Stat
            label="Hover gap"
            value={calc.floats ? num(calc.hoverHeightMm, 2) : '—'}
            unit={calc.floats ? 'mm' : ''}
            color={C.purple}
          />
          <Stat
            label="Aero power"
            value={num(calc.aeroPower, 1)}
            unit="W"
            color={calc.aeroPower > 80 ? C.danger : C.teal}
          />
          <Stat
            label="Float limit"
            value={failMass ? num(failMass, 0) : '> 1500'}
            unit="g"
            color={C.warning}
          />
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              gap: '0.2rem',
            }}
          >
            <div
              style={{
                fontSize: '0.58rem',
                color: C.textSoft,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
              }}
            >
              Validity
            </div>
            <ValidityBadge
              inputs={{
                massG: mass,
                blockLengthMm: carriageLength,
                blockWidthMm: STRIP_INPUTS.blockWidthMm,
                stripLengthMm: STRIP_INPUTS.stripLengthMm,
                stripWidthMm: STRIP_INPUTS.stripWidthMm,
                holeDiaMm: holeDia,
                spacingMm: spacing,
                stripThicknessMm: stripThickness,
                rows,
                fanWatts,
              }}
              result={calc}
              size="sm"
            />
          </div>
        </div>
      </section>

      {/* MAIN: SLIDERS + CHART */}
      <main
        style={{
          flex: fitToViewport ? 1 : 'none',
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: isNarrow ? '1fr' : 'minmax(260px, 320px) 1fr minmax(260px, 360px)',
          gap: 'clamp(0.8rem, 1.6vw, 1.2rem)',
          padding: 'clamp(0.8rem, 1.6vw, 1.2rem) clamp(1rem, 3vw, 2rem)',
          maxWidth: '100%',
          width: '100%',
          margin: '0 auto',
          boxSizing: 'border-box',
        }}
      >
        {/* SLIDERS */}
        <aside
          style={{
            background: C.surface,
            border: `1px solid ${C.border}`,
            borderRadius: '14px',
            padding: 'clamp(0.9rem, 1.6vw, 1.3rem)',
            // On wide screens, the sidebar fills the available main height
            // and scrolls internally if its content overflows.
            height: fitToViewport ? '100%' : 'auto',
            overflowY: fitToViewport ? 'auto' : 'visible',
            minHeight: 0,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '0.4rem',
              marginBottom: '0.7rem',
            }}
          >
            <select
              onChange={(e) => applyPreset(e.target.value)}
              defaultValue=""
              style={{
                padding: '0.3rem 0.4rem',
                borderRadius: '5px',
                border: `1px solid ${C.border}`,
                background: C.surfaceAlt,
                color: C.text,
                fontFamily: 'inherit',
                fontSize: '0.72rem',
                cursor: 'pointer',
              }}
            >
              <option value="" disabled>
                Presets…
              </option>
              {Object.entries(PRESETS).map(([key, p]) => (
                <option key={key} value={key}>
                  {p.label}
                </option>
              ))}
            </select>
            <button
              onClick={() => applyPreset('default')}
              title="Reset to defaults"
              style={{
                padding: '0.3rem 0.5rem',
                borderRadius: '5px',
                border: `1px solid ${C.border}`,
                background: C.surfaceAlt,
                color: C.textSoft,
                fontFamily: 'inherit',
                fontSize: '0.72rem',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              Reset
            </button>
          </div>
          <BigSlider
            label="Carriage mass"
            value={mass}
            min={50}
            max={1500}
            step={1}
            onChange={setMass}
            unit="g"
            color={C.danger}
            desc="Increases the required plenum pressure proportionally. Heavier carriages need more lift force (F = mg) and will eventually exceed the fan's pressure capacity."
          />
          <BigSlider
            label="Carriage length"
            value={carriageLength}
            min={40}
            max={300}
            step={1}
            onChange={setCarriageLength}
            unit="mm"
            color={C.accent}
            desc="A longer carriage covers more holes, improving geometric efficiency but also increasing the load-bearing area and reducing the required pressure per unit area."
          />
          <BigSlider
            label="Hole diameter"
            value={holeDia}
            min={1}
            max={8}
            step={0.05}
            onChange={setHoleDia}
            unit="mm"
            color={C.purple}
            desc="Larger holes increase total flow area and reduce plenum pressure. Beyond a threshold, the pressure drops below the minimum needed to support the carriage."
          />
          <BigSlider
            label="Hole spacing"
            value={spacing}
            min={5}
            max={60}
            step={1}
            onChange={setSpacing}
            unit="mm"
            color={C.orange}
            desc="Wider spacing means fewer holes overall — higher pressure per hole but reduced total flow. Too few holes can throttle the fan beyond its stable operating range."
          />
          <BigSlider
            label="Plate thickness"
            value={stripThickness}
            min={0.5}
            max={6}
            step={0.1}
            onChange={setStripThickness}
            unit="mm"
            color={C.teal}
            desc="Affects the discharge coefficient Cd via the t/d ratio. Thicker plates act as short tubes rather than sharp orifices, slightly increasing Cd and flow resistance."
          />
          <BigSlider
            label="Number of rows"
            value={rows}
            min={1}
            max={6}
            step={1}
            onChange={setRows}
            unit=""
            color={C.rose}
            desc="More rows across the strip width increase total flow area, lowering plenum pressure. Also affects how evenly the air cushion distributes beneath the carriage."
          />
          {/* Top-down schematic */}
          <div
            style={{
              marginTop: '0.8rem',
              padding: '0.6rem 0.6rem 0.4rem',
              background: C.bg,
              border: `1px solid ${C.border}`,
              borderRadius: '10px',
            }}
          >
            <div
              style={{
                fontSize: '0.7rem',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                color: C.textSoft,
                marginBottom: '0.2rem',
              }}
            >
              Hole pattern (top view)
            </div>
            <CarriagePattern
              carriageLengthMm={carriageLength}
              rows={rows}
              holeDiaMm={holeDia}
              spacingMm={spacing}
            />
          </div>
          {/* Floating limit moved to header stats bar */}
        </aside>

        {/* CHART AREA */}
        <section
          style={{
            background: C.surface,
            border: `1px solid ${C.border}`,
            borderRadius: '14px',
            padding: 'clamp(0.9rem, 1.6vw, 1.3rem)',
            display: 'flex',
            flexDirection: 'column',
            height: fitToViewport ? '100%' : 'auto',
            minHeight: fitToViewport ? 0 : '380px',
            overflow: 'hidden',
            minWidth: 0,
          }}
        >
          {/* TABS — horizontal scroll on narrow screens to avoid wrapping */}
          <div
            style={{
              display: 'flex',
              gap: '0.4rem',
              marginBottom: '0.4rem',
              overflowX: 'auto',
              WebkitOverflowScrolling: 'touch',
              flexShrink: 0,
              paddingBottom: '0.2rem',
            }}
          >
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                style={{
                  padding: isNarrow ? '0.45rem 0.7rem' : '0.55rem 1rem',
                  borderRadius: '8px',
                  border: `1.5px solid ${activeTab === t.id ? C.accent : C.border}`,
                  background: activeTab === t.id ? `${C.accent}1c` : 'transparent',
                  color: activeTab === t.id ? C.accent : C.textSoft,
                  fontFamily: 'inherit',
                  fontWeight: 600,
                  fontSize: isNarrow ? '0.78rem' : '0.9rem',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
          {!isNarrow && (
            <div
              style={{
                fontSize: '0.85rem',
                color: C.textSoft,
                marginBottom: '0.3rem',
              }}
            >
              {TABS.find((t) => t.id === activeTab)?.sub}
            </div>
          )}
          {activeTab === 'mass' && (
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '1.2rem',
                fontSize: '0.82rem',
                marginBottom: '0.8rem',
              }}
            >
              <span style={{ color: C.purple }}>
                ● <strong>Now:</strong> {mass} g
              </span>
              <span style={{ color: C.success, opacity: 0.8 }}>■ Green = floating</span>
              <span style={{ color: C.danger, opacity: 0.8 }}>■ Red = failing</span>
            </div>
          )}
          {activeTab === 'hole' && (
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '1.2rem',
                fontSize: '0.82rem',
                marginBottom: '0.8rem',
              }}
            >
              <span style={{ color: C.purple }}>
                ● <strong>Now:</strong> {holeDia.toFixed(1)} mm
              </span>
              <span style={{ color: C.success, opacity: 0.8 }}>■ Green = floating</span>
              <span style={{ color: C.danger, opacity: 0.8 }}>■ Red = failing</span>
            </div>
          )}
          {activeTab === 'fan' && (
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '1.2rem',
                fontSize: '0.82rem',
                marginBottom: '0.8rem',
              }}
            >
              <span style={{ color: C.success }}>
                ● <strong>Operating point:</strong> {Math.round(calc.pOp)} Pa,{' '}
                {(calc.qOp * 3600).toFixed(0)} m³/h
              </span>
            </div>
          )}
          {activeTab === 'hover' && (
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '1.2rem',
                fontSize: '0.82rem',
                marginBottom: '0.8rem',
              }}
            >
              <span style={{ color: C.purple }}>
                ● <strong>Now:</strong> {mass} g →{' '}
                {calc.floats ? calc.hoverHeightMm.toFixed(2) + ' mm' : 'sinks'}
              </span>
              <span style={{ color: C.success, opacity: 0.8 }}>■ Green = floating</span>
              <span style={{ color: C.danger, opacity: 0.8 }}>■ Red = failing</span>
            </div>
          )}
          {activeTab === 'power' && (
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '1.2rem',
                fontSize: '0.82rem',
                marginBottom: '0.8rem',
              }}
            >
              <span style={{ color: C.text }}>
                ● <strong>Total draw:</strong> {calc.fanElectricalDraw.toFixed(1)} W
              </span>
              <span style={{ color: C.orange }}>
                ● <strong>Motor heat:</strong> {calc.powerMotorHeat.toFixed(1)} W (
                {((calc.powerMotorHeat / calc.fanElectricalDraw) * 100).toFixed(0)}%)
              </span>
              <span style={{ color: C.danger }}>
                ● <strong>Wasted air:</strong> {calc.powerWasted.toFixed(1)} W (
                {((calc.powerWasted / calc.fanElectricalDraw) * 100).toFixed(0)}%)
              </span>
              <span style={{ color: C.teal }}>
                ● <strong>Useful lift:</strong> {(calc.powerUseful * 1000).toFixed(1)} mW (
                {calc.systemEff.toFixed(2)}%)
              </span>
            </div>
          )}

          <div
            style={{
              flex: 1,
              minHeight: isNarrow ? '320px' : 0,
              display: 'flex',
              flexDirection: 'column',
              minWidth: 0,
              overflowY: activeTab === 'diagram' ? 'auto' : 'hidden',
            }}
          >
            {activeTab === 'diagram' ? (
              <RigVisualization
                calc={calc}
                inputs={{
                  massG: mass,
                  blockLengthMm: carriageLength,
                  blockWidthMm: STRIP_INPUTS.blockWidthMm,
                  stripLengthMm: STRIP_INPUTS.stripLengthMm,
                  stripWidthMm: STRIP_INPUTS.stripWidthMm,
                  holeDiaMm: holeDia,
                  spacingMm: spacing,
                  rows,
                  stripThicknessMm: stripThickness,
                  fanWatts,
                  fanAeroEff,
                }}
                theme={C}
              />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                {activeTab === 'mass' ? (
                  <ComposedChart
                    key="mass"
                    data={massSweep}
                    margin={
                      isNarrow
                        ? { top: 10, right: 10, left: 0, bottom: 30 }
                        : { top: 50, right: 30, left: 20, bottom: 50 }
                    }
                  >
                    <CartesianGrid stroke={C.border} strokeDasharray="3 3" />
                    <XAxis
                      dataKey="mass"
                      type="number"
                      domain={[50, 1500]}
                      stroke={C.textSoft}
                      tickCount={10}
                      label={{
                        value: 'Carriage mass (g)',
                        position: 'insideBottom',
                        offset: -15,
                        fill: C.textSoft,
                      }}
                    />
                    <YAxis
                      stroke={C.textSoft}
                      domain={[0, massYMax]}
                      label={{
                        value: 'Pressure (Pa)',
                        angle: -90,
                        position: 'insideLeft',
                        offset: 10,
                        fill: C.textSoft,
                      }}
                    />
                    <Tooltip
                      contentStyle={{
                        background: C.surfaceAlt,
                        border: `1px solid ${C.border}`,
                        borderRadius: '8px',
                        color: C.text,
                      }}
                      labelFormatter={(v) => `Mass: ${v} g`}
                      formatter={(value, name, props) => {
                        const unit = UNIT_MAP[props.dataKey] || '';
                        return [
                          `${typeof value === 'number' ? value.toLocaleString('en-GB', { maximumFractionDigits: 0 }) : value} ${unit}`,
                          name,
                        ];
                      }}
                    />
                    {!isNarrow && (
                      <Legend
                        verticalAlign="top"
                        align="right"
                        wrapperStyle={{ color: C.textSoft, paddingBottom: '0.5rem' }}
                      />
                    )}
                    {/* Green band: transparent base at pRequired, green fill for the gap above */}
                    <Area
                      type="linear"
                      dataKey="greenBase"
                      stackId="green"
                      fill="transparent"
                      stroke="none"
                      isAnimationActive={false}
                      legendType="none"
                      tooltipType="none"
                    />
                    <Area
                      type="linear"
                      dataKey="greenBand"
                      stackId="green"
                      fill={C.success}
                      fillOpacity={0.2}
                      stroke="none"
                      isAnimationActive={false}
                      legendType="none"
                      tooltipType="none"
                    />
                    {/* Red band: transparent base at pOp, red fill for the gap above */}
                    <Area
                      type="linear"
                      dataKey="redBase"
                      stackId="red"
                      fill="transparent"
                      stroke="none"
                      isAnimationActive={false}
                      legendType="none"
                      tooltipType="none"
                    />
                    <Area
                      type="linear"
                      dataKey="redBand"
                      stackId="red"
                      fill={C.danger}
                      fillOpacity={0.2}
                      stroke="none"
                      isAnimationActive={false}
                      legendType="none"
                      tooltipType="none"
                    />
                    <Line
                      type="monotone"
                      dataKey="pOp"
                      stroke={C.accent}
                      strokeWidth={2.5}
                      dot={false}
                      name="Plenum pressure"
                      isAnimationActive={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="pRequired"
                      stroke={C.warning}
                      strokeWidth={2.5}
                      strokeDasharray="6 4"
                      dot={false}
                      name="Required pressure"
                      isAnimationActive={false}
                    />
                    <ReferenceLine x={mass} stroke={C.purple} strokeWidth={2} />
                    {failMass && (
                      <ReferenceLine
                        x={failMass}
                        stroke={C.danger}
                        strokeWidth={2}
                        strokeDasharray="4 4"
                      />
                    )}
                  </ComposedChart>
                ) : activeTab === 'hole' ? (
                  <ComposedChart
                    key="hole"
                    data={holeSweep}
                    margin={
                      isNarrow
                        ? { top: 10, right: 10, left: 0, bottom: 30 }
                        : { top: 50, right: 30, left: 20, bottom: 50 }
                    }
                  >
                    <CartesianGrid stroke={C.border} strokeDasharray="3 3" />
                    <XAxis
                      dataKey="diameter"
                      type="number"
                      domain={[1, 8]}
                      stroke={C.textSoft}
                      label={{
                        value: 'Hole diameter (mm)',
                        position: 'insideBottom',
                        offset: -15,
                        fill: C.textSoft,
                      }}
                    />
                    <YAxis
                      stroke={C.textSoft}
                      domain={[0, holeYMax]}
                      label={{
                        value: 'Pressure (Pa)',
                        angle: -90,
                        position: 'insideLeft',
                        offset: 10,
                        fill: C.textSoft,
                      }}
                    />
                    <Tooltip
                      contentStyle={{
                        background: C.surfaceAlt,
                        border: `1px solid ${C.border}`,
                        borderRadius: '8px',
                        color: C.text,
                      }}
                      labelFormatter={(v) => `Hole diameter: ${v} mm`}
                      formatter={(value, name, props) => {
                        const unit = UNIT_MAP[props.dataKey] || '';
                        return [
                          `${typeof value === 'number' ? value.toLocaleString('en-GB', { maximumFractionDigits: 0 }) : value} ${unit}`,
                          name,
                        ];
                      }}
                    />
                    {!isNarrow && (
                      <Legend
                        verticalAlign="top"
                        align="right"
                        wrapperStyle={{ color: C.textSoft, paddingBottom: '0.5rem' }}
                      />
                    )}
                    {/* Green band: transparent base at pRequired, green fill for gap above */}
                    <Area
                      type="linear"
                      dataKey="greenBase"
                      stackId="green"
                      fill="transparent"
                      stroke="none"
                      isAnimationActive={false}
                      legendType="none"
                      tooltipType="none"
                    />
                    <Area
                      type="linear"
                      dataKey="greenBand"
                      stackId="green"
                      fill={C.success}
                      fillOpacity={0.2}
                      stroke="none"
                      isAnimationActive={false}
                      legendType="none"
                      tooltipType="none"
                    />
                    {/* Red band: transparent base at pOp, red fill for gap above */}
                    <Area
                      type="linear"
                      dataKey="redBase"
                      stackId="red"
                      fill="transparent"
                      stroke="none"
                      isAnimationActive={false}
                      legendType="none"
                      tooltipType="none"
                    />
                    <Area
                      type="linear"
                      dataKey="redBand"
                      stackId="red"
                      fill={C.danger}
                      fillOpacity={0.2}
                      stroke="none"
                      isAnimationActive={false}
                      legendType="none"
                      tooltipType="none"
                    />
                    <Line
                      type="monotone"
                      dataKey="pOp"
                      stroke={C.accent}
                      strokeWidth={2.5}
                      dot={false}
                      name="Plenum pressure"
                      isAnimationActive={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="pRequired"
                      stroke={C.warning}
                      strokeWidth={2.5}
                      strokeDasharray="6 4"
                      dot={false}
                      name="Required pressure"
                      isAnimationActive={false}
                    />
                    <ReferenceLine x={holeDia} stroke={C.purple} strokeWidth={2} />
                  </ComposedChart>
                ) : activeTab === 'fan' ? (
                  <ComposedChart
                    key="fan"
                    data={fanChartData}
                    margin={
                      isNarrow
                        ? { top: 10, right: 10, left: 0, bottom: 30 }
                        : { top: 50, right: 30, left: 20, bottom: 50 }
                    }
                  >
                    <CartesianGrid stroke={C.border} strokeDasharray="3 3" />
                    <XAxis
                      dataKey="pressure"
                      type="number"
                      domain={[0, Math.round(fanPmaxPa * 1.05)]}
                      stroke={C.textSoft}
                      label={{
                        value: 'Pressure (Pa)',
                        position: 'insideBottom',
                        offset: -15,
                        fill: C.textSoft,
                      }}
                    />
                    <YAxis
                      stroke={C.textSoft}
                      label={{
                        value: 'Flow (m³/h)',
                        angle: -90,
                        position: 'insideLeft',
                        offset: 10,
                        fill: C.textSoft,
                      }}
                    />
                    <Tooltip
                      contentStyle={{
                        background: C.surfaceAlt,
                        border: `1px solid ${C.border}`,
                        borderRadius: '8px',
                        color: C.text,
                      }}
                      labelFormatter={(v) => `Pressure: ${v} Pa`}
                      formatter={(value, name, props) => {
                        const unit = UNIT_MAP[props.dataKey] || '';
                        return [
                          `${typeof value === 'number' ? value.toLocaleString('en-GB', { maximumFractionDigits: 2 }) : value} ${unit}`,
                          name,
                        ];
                      }}
                    />
                    {!isNarrow && (
                      <Legend
                        verticalAlign="top"
                        align="right"
                        wrapperStyle={{ color: C.textSoft, paddingBottom: '0.5rem' }}
                      />
                    )}
                    <Line
                      type="monotone"
                      dataKey="fanFlow"
                      stroke={C.accent}
                      strokeWidth={3}
                      dot={false}
                      name={`Fan supply (${FAN_PRESETS[fanPresetKey]?.label ?? 'Custom'})`}
                    />
                    <Line
                      type="monotone"
                      dataKey="systemFlow"
                      stroke={C.purple}
                      strokeWidth={3}
                      dot={false}
                      name="System demand (holes)"
                    />
                    <ReferenceLine x={Math.round(calc.pOp)} stroke={C.success} strokeWidth={2} />
                  </ComposedChart>
                ) : activeTab === 'hover' ? (
                  <ComposedChart
                    key="hover"
                    data={hoverSweep}
                    margin={
                      isNarrow
                        ? { top: 10, right: 10, left: 0, bottom: 30 }
                        : { top: 50, right: 30, left: 20, bottom: 50 }
                    }
                  >
                    <CartesianGrid stroke={C.border} strokeDasharray="3 3" />
                    <XAxis
                      dataKey="mass"
                      type="number"
                      domain={[50, 1500]}
                      stroke={C.textSoft}
                      tickCount={10}
                      label={{
                        value: 'Carriage mass (g)',
                        position: 'insideBottom',
                        offset: -15,
                        fill: C.textSoft,
                      }}
                    />
                    <YAxis
                      stroke={C.textSoft}
                      domain={[0, hoverYMax]}
                      label={{
                        value: 'Hover height (mm)',
                        angle: -90,
                        position: 'insideLeft',
                        offset: 10,
                        fill: C.textSoft,
                      }}
                    />
                    <Tooltip
                      contentStyle={{
                        background: C.surfaceAlt,
                        border: `1px solid ${C.border}`,
                        borderRadius: '8px',
                        color: C.text,
                      }}
                      labelFormatter={(v) => `Mass: ${v} g`}
                      formatter={(value, name, props) => {
                        const unit = UNIT_MAP[props.dataKey] || '';
                        return [
                          `${typeof value === 'number' ? value.toLocaleString('en-GB', { maximumFractionDigits: 2 }) : value} ${unit}`,
                          name,
                        ];
                      }}
                    />
                    {!isNarrow && (
                      <Legend
                        verticalAlign="top"
                        align="right"
                        wrapperStyle={{ color: C.textSoft, paddingBottom: '0.5rem' }}
                      />
                    )}
                    {/* Green band: area under hover curve (same stacked-area
                      approach as mass/hole charts — hover above threshold) */}
                    <Area
                      type="linear"
                      dataKey="hoverGreen"
                      fill={C.success}
                      fillOpacity={0.2}
                      stroke="none"
                      isAnimationActive={false}
                      legendType="none"
                      tooltipType="none"
                    />
                    {/* Red background beyond fail mass — hover is 0 so
                      there's no gap between lines to fill; use ReferenceArea */}
                    {failMass && (
                      <ReferenceArea x1={failMass} x2={1500} fill={C.danger} fillOpacity={0.12} />
                    )}
                    {/* Hover curve on top */}
                    <Line
                      type="monotone"
                      dataKey="hover"
                      stroke={C.accent}
                      strokeWidth={2.5}
                      dot={false}
                      name="Hover height"
                      isAnimationActive={false}
                    />
                    <ReferenceLine x={mass} stroke={C.purple} strokeWidth={2} />
                    {failMass && (
                      <ReferenceLine
                        x={failMass}
                        stroke={C.danger}
                        strokeWidth={1.5}
                        strokeDasharray="4 4"
                      />
                    )}
                  </ComposedChart>
                ) : (
                  <ComposedChart
                    key="power"
                    data={energySweep}
                    margin={
                      isNarrow
                        ? { top: 10, right: 10, left: 0, bottom: 30 }
                        : { top: 50, right: 30, left: 20, bottom: 50 }
                    }
                  >
                    <CartesianGrid stroke={C.border} strokeDasharray="3 3" />
                    <XAxis
                      dataKey="diameter"
                      type="number"
                      domain={[1, 8]}
                      stroke={C.textSoft}
                      label={{
                        value: 'Hole diameter (mm)',
                        position: 'insideBottom',
                        offset: -15,
                        fill: C.textSoft,
                      }}
                    />
                    <YAxis
                      stroke={C.textSoft}
                      domain={[0, powerYMax]}
                      label={{
                        value: 'Electrical draw (W)',
                        angle: -90,
                        position: 'insideLeft',
                        offset: 10,
                        fill: C.textSoft,
                      }}
                    />
                    <Tooltip
                      content={({ active, payload, label: dia }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0]?.payload;
                        if (!d) return null;
                        const total = d.useful + d.wasted + d.motorHeat;
                        const pct = (v) => (total > 0 ? ((v / total) * 100).toFixed(0) : '0');
                        return (
                          <div
                            style={{
                              background: C.surfaceAlt,
                              border: `1px solid ${C.border}`,
                              borderRadius: '8px',
                              padding: '0.6rem 0.8rem',
                              color: C.text,
                              fontSize: '0.82rem',
                              lineHeight: 1.6,
                            }}
                          >
                            <div style={{ fontWeight: 600, marginBottom: '0.3rem' }}>
                              Hole size: {num(dia, 2)} mm
                            </div>
                            <div style={{ fontWeight: 600, marginBottom: '0.3rem' }}>
                              Total draw: {num(total, 1)} W
                            </div>
                            <div style={{ color: C.orange }}>
                              Motor heat: {num(d.motorHeat, 2)} W ({pct(d.motorHeat)}%)
                            </div>
                            <div style={{ color: C.danger }}>
                              Wasted air: {num(d.wasted, 2)} W ({pct(d.wasted)}%)
                            </div>
                            <div style={{ color: C.teal }}>
                              Useful lift: {num(d.useful, 3)} W ({pct(d.useful)}%)
                            </div>
                          </div>
                        );
                      }}
                    />
                    {!isNarrow && (
                      <Legend
                        verticalAlign="top"
                        align="right"
                        wrapperStyle={{ color: C.textSoft, paddingBottom: '0.5rem' }}
                      />
                    )}
                    <ReferenceLine x={holeDia} stroke={C.purple} strokeWidth={2} />
                    {/* Stacked areas: useful + wasted air + motor heat = total electrical draw.
                      Strokes removed — they misalign at stack boundaries when the
                      bottom segment (useful lift, milliwatts) is near-zero height. */}
                    <Area
                      type="linear"
                      dataKey="useful"
                      stackId="power"
                      stroke={C.teal}
                      strokeWidth={1.5}
                      fill={C.teal}
                      fillOpacity={0.7}
                      name="Useful lift"
                      isAnimationActive={false}
                    />
                    <Area
                      type="linear"
                      dataKey="wasted"
                      stackId="power"
                      stroke={C.danger}
                      strokeWidth={1.5}
                      fill={C.danger}
                      fillOpacity={0.25}
                      name="Wasted air (uncovered holes)"
                      isAnimationActive={false}
                    />
                    <Area
                      type="linear"
                      dataKey="motorHeat"
                      stackId="power"
                      stroke={C.orange}
                      strokeWidth={1.5}
                      fill={C.orange}
                      fillOpacity={0.25}
                      name="Motor heat"
                      isAnimationActive={false}
                    />
                  </ComposedChart>
                )}
              </ResponsiveContainer>
            )}
          </div>
          {activeTab === 'power' && (
            <div
              style={{
                marginTop: '0.6rem',
                paddingTop: '0.6rem',
                borderTop: `1px solid ${C.border}`,
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'center',
                gap: 'clamp(0.8rem, 2vw, 1.6rem)',
                fontSize: '0.85rem',
              }}
            >
              <span style={{ color: C.textSoft }}>
                Running cost at{' '}
                <strong style={{ color: C.text }}>
                  {(STRIP_INPUTS.costPerKwh * 100).toFixed(1)} p/kWh
                </strong>
                :
              </span>
              <span style={{ color: C.text }}>
                <strong style={{ color: C.warning }}>
                  {(calc.costPerHour * 100).toFixed(2)} p
                </strong>{' '}
                / hour
              </span>
              <span style={{ color: C.text }}>
                <strong style={{ color: C.warning }}>£{calc.costPer8Hrs.toFixed(2)}</strong> / 8 hr
                day
              </span>
              <span style={{ color: C.text }}>
                <strong style={{ color: C.warning }}>
                  £{(calc.costPerHour * 24 * 365).toFixed(0)}
                </strong>{' '}
                / year (24 × 365)
              </span>
            </div>
          )}
        </section>

        {/* REFERENCES */}
        {!isNarrow && (
          <aside
            style={{
              background: C.surface,
              border: `1px solid ${C.border}`,
              borderRadius: '14px',
              padding: '0.9rem 1rem',
              height: fitToViewport ? '100%' : 'auto',
              overflowY: fitToViewport ? 'auto' : 'visible',
              minHeight: 0,
              fontSize: '0.68rem',
              lineHeight: 1.5,
              color: C.textSoft,
            }}
          >
            {/* Section heading helper */}
            {(() => {
              const heading = (text) => (
                <div
                  style={{
                    fontSize: '0.65rem',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                    color: C.text,
                    marginBottom: '0.35rem',
                    marginTop: '0.7rem',
                    borderBottom: `1px solid ${C.border}`,
                    paddingBottom: '0.2rem',
                  }}
                >
                  {text}
                </div>
              );
              const li = { marginBottom: '0.4rem' };
              return (
                <>
                  {heading('Sources')}
                  <ol style={{ margin: 0, paddingLeft: '1.1rem' }}>
                    <li style={li}>
                      ISO 5167-1:2022.{' '}
                      <em>Measurement of fluid flow by means of pressure differential devices.</em>
                    </li>
                    <li style={li}>
                      Lichtarowicz, A.; Duggins, R. K.; Markland, E. (1965). Discharge coefficients
                      for incompressible non-cavitating flow through long orifices.{' '}
                      <em>J. Mech. Eng. Sci.</em> 7(2):210–219.
                    </li>
                    <li style={li}>
                      Idelchik, I. E. (2007). <em>Handbook of Hydraulic Resistance</em>, 3rd ed.,
                      Begell House. §4.
                    </li>
                    <li style={li}>
                      Hamrock, B. J. (2004). <em>Fundamentals of Fluid Film Lubrication</em>, 2nd
                      ed., CRC Press. Ch. 7.
                    </li>
                    <li style={li}>
                      Çengel, Y. A.; Cimbala, J. M. <em>Fluid Mechanics</em>, McGraw-Hill. Ch. 14
                      (fan stall and minimum stable flow).
                    </li>
                    <li style={li}>
                      Engineering ToolBox. <em>Air properties at standard conditions</em> (ISA
                      tables).
                    </li>
                  </ol>

                  {heading('Equations Used')}
                  <ul style={{ margin: 0, paddingLeft: '1rem', listStyle: 'none' }}>
                    <li style={li}>
                      <strong>Orifice flow</strong> [1, 3]
                      <br />Q = C<sub>d</sub> · A · √(2ΔP / ρ)
                    </li>
                    <li style={li}>
                      <strong>Discharge coeff.</strong> [2]
                      <br />C<sub>d</sub> = f(t/d), Re ≳ 2000
                    </li>
                    <li style={li}>
                      <strong>Hover height</strong> [4]
                      <br />h = ∛(3μLQ / WP)
                      <br />
                      <span style={{ fontSize: '0.6rem' }}>
                        (Reynolds lubrication, parallel-plate film)
                      </span>
                    </li>
                    <li style={li}>
                      <strong>Operating point</strong> [1]
                      <br />Q<sub>fan</sub>(P) = Q<sub>uncovered</sub>(P) + Q<sub>covered</sub>(P −
                      P<sub>film</sub>)
                    </li>
                    <li style={li}>
                      <strong>Min. stable flow</strong> [5]
                      <br />Q<sub>min</sub> = 15% of Q<sub>free-blow</sub>
                    </li>
                    <li style={li}>
                      <strong>Aero power</strong>
                      <br />P<sub>aero</sub> = ΔP · Q
                    </li>
                    <li style={li}>
                      <strong>Electrical draw</strong> [5]
                      <br />P<sub>elec</sub> = P<sub>aero</sub> / η<sub>aero</sub>
                    </li>
                    <li style={li}>
                      <strong>Motor heat</strong>
                      <br />P<sub>heat</sub> = P<sub>elec</sub> − P<sub>aero</sub>
                    </li>
                    <li style={li}>
                      <strong>Useful power</strong>
                      <br />P<sub>useful</sub> = ΔP · Q · (n<sub>covered</sub> / n<sub>total</sub>)
                    </li>
                    <li style={li}>
                      <strong>Wasted power</strong>
                      <br />P<sub>waste</sub> = ΔP · Q · (1 − n<sub>covered</sub> / n
                      <sub>total</sub>)
                    </li>
                  </ul>

                  {heading('Constants (20 °C, 1 atm)')}
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.64rem' }}>
                    <tbody>
                      <tr>
                        <td style={{ padding: '0.15rem 0' }}>
                          ρ<sub>air</sub>
                        </td>
                        <td>1.2 kg/m³</td>
                        <td style={{ color: C.textSoft }}>[6]</td>
                      </tr>
                      <tr>
                        <td style={{ padding: '0.15rem 0' }}>
                          μ<sub>air</sub>
                        </td>
                        <td>1.81 × 10⁻⁵ Pa·s</td>
                        <td style={{ color: C.textSoft }}>[6]</td>
                      </tr>
                      <tr>
                        <td style={{ padding: '0.15rem 0' }}>
                          ν<sub>air</sub>
                        </td>
                        <td>1.516 × 10⁻⁵ m²/s</td>
                        <td style={{ color: C.textSoft }}>[6]</td>
                      </tr>
                      <tr>
                        <td style={{ padding: '0.15rem 0' }}>g</td>
                        <td>9.81 m/s²</td>
                        <td></td>
                      </tr>
                      <tr>
                        <td style={{ padding: '0.15rem 0' }}>
                          η<sub>idle</sub>
                        </td>
                        <td>40% of rated</td>
                        <td style={{ color: C.textSoft }}>[5]</td>
                      </tr>
                    </tbody>
                  </table>
                </>
              );
            })()}
          </aside>
        )}
      </main>

      <footer
        style={{
          flex: 'none',
          padding: 'clamp(0.5rem, 1.2vw, 0.8rem) clamp(1rem, 3vw, 2rem)',
          textAlign: 'center',
          color: C.textSoft,
          fontSize: '0.75rem',
          borderTop: `1px solid ${C.border}`,
        }}
      >
        Fan:{' '}
        <strong style={{ color: C.text }}>{FAN_PRESETS[fanPresetKey]?.label ?? 'Custom'}</strong> ·
        C<sub>d</sub> = <strong style={{ color: C.text }}>{calc.cd.toFixed(3)}</strong>{' '}
        <span style={{ opacity: 0.6 }}>[2]</span> · ρ ={' '}
        <strong style={{ color: C.text }}>1.2 kg/m³</strong>{' '}
        <span style={{ opacity: 0.6 }}>[6]</span> · μ ={' '}
        <strong style={{ color: C.text }}>1.81×10⁻⁵ Pa·s</strong>{' '}
        <span style={{ opacity: 0.6 }}>[6]</span> · Holes:{' '}
        <strong style={{ color: C.text }}>{calc.holesUnderBlock}</strong> / {calc.totalHoles}{' '}
        covered · Coverage:{' '}
        <strong style={{ color: C.text }}>{(calc.coverageFactor * 100).toFixed(0)} %</strong>
      </footer>
    </div>
  );
}
