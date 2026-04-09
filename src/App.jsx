import { useState, useMemo } from 'react';
import AirHockeyCalc from './AirHockeyCalc';
import PresentationView from './PresentationView';
import { dark, light } from './theme.js';
import { ThemeProvider } from './ThemeContext.jsx';
import { computeAirHockey } from './physics/computeAirHockey.js';

/**
 * Root component — owns ALL shared state so both views always agree.
 *
 * State lifted here:
 *   • Theme (dark/light)
 *   • Rig parameters (mass, carriage length, holes, spacing, etc.)
 *   • Fan parameters (preset key, mode, Q_max, P_max, power, η)
 *
 * Both PresentationView and AirHockeyCalc receive the same values
 * and setters, so switching between views preserves the configuration.
 */

// Defaults match the real rig as tested: Dewalt leaf blower, 2 mm
// holes laser-cut template, 110 mm acrylic carriage, 20 mm spacing.
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
  const [view, setView] = useState('presentation');
  const [isDark, setIsDark] = useState(true);
  const theme = isDark ? dark : light;
  const toggleTheme = () => setIsDark((v) => !v);

  // Rig state
  const [mass, setMass] = useState(DEFAULTS.mass);
  const [carriageLength, setCarriageLength] = useState(DEFAULTS.carriageLength);
  const [holeDia, setHoleDia] = useState(DEFAULTS.holeDia);
  const [spacing, setSpacing] = useState(DEFAULTS.spacing);
  const [stripThickness, setStripThickness] = useState(DEFAULTS.stripThickness);
  const [rows, setRows] = useState(DEFAULTS.rows);

  // Fan state
  const [fanPresetKey, setFanPresetKey] = useState(DEFAULT_FAN.presetKey);
  const [fanMode, setFanMode] = useState(DEFAULT_FAN.mode);
  const [fanFlowM3h, setFanFlowM3h] = useState(DEFAULT_FAN.flowM3h);
  const [fanPmaxPa, setFanPmaxPa] = useState(DEFAULT_FAN.pmaxPa);
  const [fanWatts, setFanWatts] = useState(DEFAULT_FAN.watts);
  const [fanAeroEff, setFanAeroEff] = useState(DEFAULT_FAN.aeroEff);

  // Shared calculation result — both views read from this.
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
    [mass, carriageLength, holeDia, spacing, rows, stripThickness,
     fanMode, fanFlowM3h, fanPmaxPa, fanWatts, fanAeroEff],
  );

  // Bundle everything into a single props object for convenience.
  const shared = {
    // Rig
    mass, setMass,
    carriageLength, setCarriageLength,
    holeDia, setHoleDia,
    spacing, setSpacing,
    stripThickness, setStripThickness,
    rows, setRows,
    // Fan
    fanPresetKey, setFanPresetKey,
    fanMode, setFanMode,
    fanFlowM3h, setFanFlowM3h,
    fanPmaxPa, setFanPmaxPa,
    fanWatts, setFanWatts,
    fanAeroEff, setFanAeroEff,
    // Computed
    calc,
    // Constants
    defaults: DEFAULTS,
    defaultFan: DEFAULT_FAN,
    // Theme
    isDark, onToggleTheme: toggleTheme,
  };

  return (
    <ThemeProvider value={theme}>
      {view === 'presentation' ? (
        <PresentationView
          onOpenDetailed={() => setView('detailed')}
          {...shared}
        />
      ) : (
        <AirHockeyCalc
          onBackToPresentation={() => setView('presentation')}
          {...shared}
        />
      )}
    </ThemeProvider>
  );
}
