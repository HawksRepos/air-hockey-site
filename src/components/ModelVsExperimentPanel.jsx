/**
 * Model-vs-experiment panel for hover-vs-mass.
 *
 * Reads the aggregated rig dataset from `src/data/experiments.js`
 * (itself loaded at build time from `docs/experiments/hover_vs_mass.csv`)
 * and overlays the model's prediction curve using the same
 * `computeAirHockey` pipeline the rest of the site uses.
 *
 * Two rendering states:
 *   (a) No real rows yet → a polite "awaiting data" notice with a
 *       pointer to the capture protocol. The site still builds and
 *       deploys in this state.
 *   (b) Real data present → scatter + error bars for measurements,
 *       smooth line for the model, residual statistics in a footer.
 */

import { useMemo } from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  ErrorBar,
  Legend,
  Line,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { computeAirHockey } from '../physics/computeAirHockey.js';
import { HOVER_VS_MASS_AGGREGATED } from '../data/experiments.js';

/**
 * @param {object} props
 * @param {object} props.baseInputs   Rig configuration used for the
 *                                    prediction sweep (all fields of
 *                                    computeAirHockey EXCEPT massG).
 * @param {object} [props.theme]      Optional theme tokens.
 * @param {number} [props.nPoints=60]
 */
export function ModelVsExperimentPanel({ baseInputs, theme = {}, nPoints = 60 }) {
  const { modelCurve, measured, residualStats, massMin, massMax } = useMemo(() => {
    const rows = HOVER_VS_MASS_AGGREGATED;
    if (rows.length === 0) {
      // No data yet — sweep across the validated range so the curve
      // still gives context.
      const curve = [];
      for (let m = 50; m <= 700; m += (700 - 50) / nPoints) {
        const r = computeAirHockey({ ...baseInputs, massG: m });
        curve.push({ mass: m, model: r.hoverHeightMm });
      }
      return {
        modelCurve: curve,
        measured: [],
        residualStats: null,
        massMin: 50,
        massMax: 700,
      };
    }
    const masses = rows.map((r) => r.mass_g);
    const lo = Math.min(...masses) * 0.9;
    const hi = Math.max(...masses) * 1.1;
    const curve = [];
    for (let m = lo; m <= hi; m += (hi - lo) / nPoints) {
      const r = computeAirHockey({ ...baseInputs, massG: m });
      curve.push({ mass: m, model: r.hoverHeightMm });
    }
    const points = rows.map((r) => {
      const predicted = computeAirHockey({ ...baseInputs, massG: r.mass_g }).hoverHeightMm;
      return {
        mass: r.mass_g,
        measured: r.mean_mm,
        err: r.std_mm,
        predicted,
        residual: predicted - r.mean_mm,
      };
    });
    // RMS residual, mean bias.
    const n = points.length;
    const sumSq = points.reduce((s, p) => s + p.residual * p.residual, 0);
    const sum = points.reduce((s, p) => s + p.residual, 0);
    return {
      modelCurve: curve,
      measured: points,
      residualStats: {
        n,
        rms: Math.sqrt(sumSq / n),
        bias: sum / n,
      },
      massMin: lo,
      massMax: hi,
    };
  }, [baseInputs, nPoints]);

  const fg = theme.text ?? '#1a1a1a';
  const muted = theme.textSoft ?? '#666';
  const accent = theme.accent ?? '#3170c7';
  const measuredColour = theme.orange ?? '#d97a30';
  const border = theme.border ?? '#c8c8c8';
  const panelBg = theme.surfaceAlt ?? '#f4f5f8';

  const hasData = measured.length > 0;

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif' }}>
      {!hasData && (
        <div
          style={{
            padding: '0.7rem 1rem',
            borderRadius: 8,
            background: panelBg,
            border: `1px dashed ${border}`,
            color: muted,
            fontSize: '0.8rem',
            marginBottom: '0.8rem',
            lineHeight: 1.5,
          }}
          role="note"
        >
          <strong style={{ color: fg }}>Awaiting rig measurements.</strong> The scatter overlay
          appears automatically once <code>docs/experiments/hover_vs_mass.csv</code> gains real rows
          (see <code>docs/experiments/rig_config.md</code> for the capture protocol). The line below
          is the current model prediction across the validated mass range.
        </div>
      )}
      <div style={{ width: '100%', height: 280 }}>
        <ResponsiveContainer>
          <ComposedChart margin={{ top: 12, right: 20, left: 0, bottom: 30 }} data={modelCurve}>
            <CartesianGrid stroke={border} strokeDasharray="3 3" />
            <XAxis
              type="number"
              dataKey="mass"
              domain={[massMin, massMax]}
              stroke={muted}
              label={{
                value: 'Mass (g)',
                position: 'insideBottom',
                offset: -15,
                fill: muted,
              }}
            />
            <YAxis
              type="number"
              stroke={muted}
              label={{
                value: 'Hover height (mm)',
                angle: -90,
                position: 'insideLeft',
                offset: 16,
                fill: muted,
              }}
            />
            <Tooltip
              contentStyle={{
                background: panelBg,
                border: `1px solid ${border}`,
                borderRadius: 6,
                color: fg,
                fontSize: 12,
              }}
              formatter={(v) => (Number.isFinite(v) ? `${v.toFixed(2)} mm` : v)}
            />
            <Legend wrapperStyle={{ color: muted, paddingBottom: 2 }} />
            <Line
              type="monotone"
              dataKey="model"
              stroke={accent}
              strokeWidth={2.2}
              dot={false}
              name="Model prediction"
              isAnimationActive={false}
            />
            {hasData && (
              <Scatter
                data={measured}
                dataKey="measured"
                fill={measuredColour}
                name="Measured (mean ± σ)"
                shape="circle"
                isAnimationActive={false}
              >
                <ErrorBar dataKey="err" width={4} stroke={measuredColour} strokeWidth={1.2} />
              </Scatter>
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {residualStats && (
        <div
          style={{
            marginTop: '0.6rem',
            padding: '0.5rem 0.8rem',
            borderRadius: 6,
            background: panelBg,
            fontSize: '0.78rem',
            color: fg,
            display: 'flex',
            gap: '1.4rem',
            flexWrap: 'wrap',
          }}
        >
          <span>
            <span style={{ color: muted }}>Points:</span> <strong>{residualStats.n}</strong>
          </span>
          <span>
            <span style={{ color: muted }}>RMS residual:</span>{' '}
            <strong>{residualStats.rms.toFixed(2)} mm</strong>
          </span>
          <span>
            <span style={{ color: muted }}>Mean bias:</span>{' '}
            <strong>
              {(residualStats.bias > 0 ? '+' : '') + residualStats.bias.toFixed(2)} mm
            </strong>
          </span>
          <span style={{ color: muted }}>(positive bias = model over-predicts hover)</span>
        </div>
      )}
    </div>
  );
}
