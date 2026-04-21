import { useState, useMemo, useEffect, useCallback } from 'react';
import AirHockeyCalc from './AirHockeyCalc';
import PresentationView from './PresentationView';
import { themes, themeOrder, defaultThemeId } from './theme.js';
import { ThemeProvider } from './ThemeContext.jsx';
import { computeAirHockey } from './physics/computeAirHockey.js';

// ── Persistence helpers ──────────────────────────────────────────
function loadStored(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v !== null ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}

function store(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // quota exceeded — silently ignore
  }
}

// ── View from URL hash ───────────────────────────────────────────
function viewFromHash() {
  return window.location.hash === '#detailed' ? 'detailed' : 'presentation';
}

// ── Defaults matching the real rig ───────────────────────────────
const DEFAULTS = {
  mass: 400,
  carriageLength: 110,
  blockWidth: 100,
  holeDia: 2.0,
  spacing: 20,
  stripThickness: 2.0,
  rows: 4,
  stripLength: 2000,
  stripWidth: 110,
  costPerKwh: 0.245,
};

const DEFAULT_FAN = {
  presetKey: 'dewalt',
  mode: 'linear',
  flowM3h: 762,
  pmaxPa: 1200,
  watts: 300,
  aeroEff: 0.2,
};

export default function App() {
  // ── View routing via URL hash ──────────────────────────────────
  const [view, setView] = useState(viewFromHash);
  useEffect(() => {
    const onHash = () => setView(viewFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const navigate = useCallback((v) => {
    window.location.hash = v === 'detailed' ? '#detailed' : '#presentation';
  }, []);

  // ── Theme (persisted in localStorage) ──────────────────────────
  const [themeId, setThemeId] = useState(() => loadStored('themeId', defaultThemeId));
  const theme = themes[themeId] ?? themes[defaultThemeId];
  const changeTheme = useCallback((id) => {
    setThemeId(id);
    store('themeId', id);
  }, []);

  // Sync <body> background so no white leaks outside the app container.
  useEffect(() => {
    document.body.style.background = theme.bg;
  }, [theme.bg]);

  // ── Rig state ──────────────────────────────────────────────────
  const [mass, setMass] = useState(DEFAULTS.mass);
  const [carriageLength, setCarriageLength] = useState(DEFAULTS.carriageLength);
  const [holeDia, setHoleDia] = useState(DEFAULTS.holeDia);
  const [spacing, setSpacing] = useState(DEFAULTS.spacing);
  const [stripThickness, setStripThickness] = useState(DEFAULTS.stripThickness);
  const [rows, setRows] = useState(DEFAULTS.rows);

  // ── Fan state ──────────────────────────────────────────────────
  const [fanPresetKey, setFanPresetKey] = useState(DEFAULT_FAN.presetKey);
  const [fanMode, setFanMode] = useState(DEFAULT_FAN.mode);
  const [fanFlowM3h, setFanFlowM3h] = useState(DEFAULT_FAN.flowM3h);
  const [fanPmaxPa, setFanPmaxPa] = useState(DEFAULT_FAN.pmaxPa);
  const [fanWatts, setFanWatts] = useState(DEFAULT_FAN.watts);
  const [fanAeroEff, setFanAeroEff] = useState(DEFAULT_FAN.aeroEff);

  // ── Shared calculation result ──────────────────────────────────
  const calc = useMemo(
    () =>
      computeAirHockey({
        massG: mass,
        blockLengthMm: carriageLength,
        blockWidthMm: DEFAULTS.blockWidth,
        stripLengthMm: DEFAULTS.stripLength,
        stripWidthMm: DEFAULTS.stripWidth,
        holeDiaMm: holeDia,
        spacingMm: spacing,
        rows,
        stripThicknessMm: stripThickness,
        fanMode,
        fanFlowM3h,
        fanPmaxPa,
        fanWatts,
        fanAeroEfficiency: fanAeroEff,
        costPerKwh: DEFAULTS.costPerKwh,
      }),
    [
      mass,
      carriageLength,
      holeDia,
      spacing,
      rows,
      stripThickness,
      fanMode,
      fanFlowM3h,
      fanPmaxPa,
      fanWatts,
      fanAeroEff,
    ],
  );

  // ── Props bundle ───────────────────────────────────────────────
  const shared = {
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
    calc,
    defaults: DEFAULTS,
    defaultFan: DEFAULT_FAN,
    // Theme
    themeId,
    changeTheme,
    themeOrder,
  };

  return (
    <ThemeProvider value={theme}>
      {view === 'presentation' ? (
        <PresentationView onOpenDetailed={() => navigate('detailed')} {...shared} />
      ) : (
        <AirHockeyCalc onBackToPresentation={() => navigate('presentation')} {...shared} />
      )}
    </ThemeProvider>
  );
}
