/**
 * Tornado chart: sensitivity of one output to every input, ±1 % perturbation.
 *
 * Bars are laid out symmetrically around a vertical zero line; positive
 * elasticity (output rises with input) points right, negative left.
 * Length scales with |elasticity| normalised to the strongest driver.
 *
 * Powered by `tornado()` from `src/physics/sensitivity.js` — the same
 * function that `build-figures.mjs` uses for the offline SVG, so the
 * on-site chart and the committed docs figure always agree.
 */

import { useMemo } from 'react';
import { tornado } from '../physics/sensitivity.js';

const W = 520;
const BAR_H = 22;

const INPUT_LABELS = {
  massG: 'Mass',
  blockLengthMm: 'Block length',
  blockWidthMm: 'Block width',
  stripLengthMm: 'Strip length',
  stripWidthMm: 'Strip width',
  holeDiaMm: 'Hole diameter',
  spacingMm: 'Hole spacing',
  stripThicknessMm: 'Strip thickness',
  fanFlowM3h: 'Fan free-blow Q',
  fanPmaxPa: 'Fan shut-off P',
  fanWatts: 'Fan rated power',
  fanAeroEfficiency: 'Fan η_aero',
};

/**
 * @param {object} props
 * @param {object} props.inputs       `computeAirHockey` inputs baseline.
 * @param {string} [props.output='hoverHeightMm']
 * @param {number} [props.topN=7]     Number of drivers to show.
 * @param {object} [props.theme]      Theme tokens.
 * @param {string} [props.title]
 */
export function SensitivityTornado({ inputs, output = 'hoverHeightMm', topN = 7, theme, title }) {
  const rows = useMemo(() => tornado(inputs, output).slice(0, topN), [inputs, output, topN]);
  const t = theme ?? {};
  const fg = t.text ?? '#1a1a1a';
  const muted = t.textSoft ?? '#666';
  const pos = t.accent ?? '#3170c7';
  const neg = t.danger ?? '#c03030';
  const border = t.border ?? '#c8c8c8';
  const panelBg = t.surfaceAlt ?? '#f4f5f8';

  const leftPad = 150;
  const rightPad = 60;
  const innerW = W - leftPad - rightPad;
  const halfW = innerW / 2;
  const cx = leftPad + halfW;

  const maxAbs = rows.reduce((m, r) => Math.max(m, Math.abs(r.elasticity)), 0) || 1;
  const H = 42 + rows.length * (BAR_H + 8) + 20;

  if (rows.length === 0) {
    return (
      <div style={{ color: muted, fontSize: '0.85rem', padding: '1rem' }}>
        No finite sensitivities at these inputs.
      </div>
    );
  }

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      role="img"
      aria-label={`Tornado chart of the top ${rows.length} drivers of ${output}`}
      style={{ display: 'block', maxWidth: 640, fontFamily: 'system-ui, sans-serif' }}
    >
      <rect x="1" y="1" width={W - 2} height={H - 2} rx="8" fill={panelBg} stroke={border} />
      <text x={W / 2} y="22" textAnchor="middle" fontSize="13" fontWeight="600" fill={fg}>
        {title ?? `Drivers of ${output} (±1 %)`}
      </text>

      <line x1={cx} y1="32" x2={cx} y2={H - 16} stroke={muted} strokeWidth="1" />
      <text x={cx} y={H - 4} textAnchor="middle" fontSize="10" fill={muted}>
        elasticity (Δy/y) ÷ (Δx/x)
      </text>

      {rows.map((r, i) => {
        const y = 38 + i * (BAR_H + 8);
        const w = (Math.abs(r.elasticity) / maxAbs) * halfW;
        const x = r.elasticity >= 0 ? cx : cx - w;
        const colour = r.elasticity >= 0 ? pos : neg;
        const label = INPUT_LABELS[r.input] ?? r.input;
        const valX = r.elasticity >= 0 ? x + w + 4 : x - 4;
        const valAnchor = r.elasticity >= 0 ? 'start' : 'end';
        return (
          <g key={r.input}>
            <text x={leftPad - 8} y={y + BAR_H / 2 + 4} textAnchor="end" fontSize="11" fill={fg}>
              {label}
            </text>
            <rect x={x} y={y} width={w} height={BAR_H} rx="3" fill={colour} opacity="0.85" />
            <text x={valX} y={y + BAR_H / 2 + 4} textAnchor={valAnchor} fontSize="10" fill={muted}>
              {r.elasticity.toFixed(2)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
