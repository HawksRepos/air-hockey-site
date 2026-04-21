/**
 * Validity envelope badge — a single coloured pill that tells the user
 * whether the current inputs and operating point lie inside the range
 * we have actually validated the model against (see docs/MODEL.md §6).
 *
 * Three states:
 *   - green  "Inside validated envelope"
 *   - amber  "Extrapolated"   (soft-limit breach; still physically legal)
 *   - red    "Out of range"   (hard-limit breach or compressibility warning)
 *
 * Hover / tap reveals the list of specific findings so the reader can
 * see exactly which input is out of range and what the validated band is.
 */

import { useState } from 'react';
import { checkValidity } from '../physics/validity.js';
import { useTheme } from '../ThemeContext.jsx';

const STATUS_LABEL = {
  ok: 'Inside validated envelope',
  amber: 'Extrapolated',
  red: 'Out of validated range',
};

function statusColor(theme, status) {
  if (status === 'ok') return { fg: theme.success ?? '#2a7', bg: theme.hlGreen ?? '#e6ffef' };
  if (status === 'amber') return { fg: theme.warning ?? '#d90', bg: theme.hlYellow ?? '#fff4d0' };
  return { fg: theme.danger ?? '#c33', bg: theme.hlRose ?? '#ffecec' };
}

/**
 * @param {object} props
 * @param {object} props.inputs   The rig inputs passed to computeAirHockey.
 * @param {object} [props.result] Optional calc result — enables output-side
 *                                checks (plenum pressure, hole Mach, etc.).
 * @param {'sm'|'md'} [props.size='md']
 */
export function ValidityBadge({ inputs, result, size = 'md' }) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const { status, findings } = checkValidity(inputs, result);
  const { fg, bg } = statusColor(theme, status);
  const pad = size === 'sm' ? '0.15rem 0.55rem' : '0.3rem 0.8rem';
  const fontSize = size === 'sm' ? '0.72rem' : '0.82rem';

  return (
    <div
      style={{ position: 'relative', display: 'inline-block' }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label="Validity envelope — click for details"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.4rem',
          padding: pad,
          borderRadius: '999px',
          background: bg,
          color: fg,
          border: `1px solid ${fg}`,
          fontSize,
          fontWeight: 600,
          cursor: findings.length ? 'pointer' : 'default',
          letterSpacing: '0.01em',
        }}
      >
        <span
          aria-hidden
          style={{
            display: 'inline-block',
            width: '0.55em',
            height: '0.55em',
            borderRadius: '50%',
            background: fg,
          }}
        />
        {STATUS_LABEL[status]}
        {findings.length > 0 && (
          <span style={{ fontWeight: 500, opacity: 0.8 }}>({findings.length})</span>
        )}
      </button>
      {open && findings.length > 0 && (
        <div
          role="tooltip"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            minWidth: 260,
            maxWidth: 360,
            background: theme.surface,
            color: theme.text,
            border: `1px solid ${theme.border}`,
            borderRadius: 8,
            padding: '0.6rem 0.8rem',
            fontSize: '0.78rem',
            lineHeight: 1.45,
            boxShadow: '0 8px 22px rgba(0,0,0,0.25)',
            zIndex: 20,
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: '0.35rem', color: fg }}>
            {findings.length} finding{findings.length === 1 ? '' : 's'}
          </div>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
            {findings.map((f) => (
              <li key={f.key} style={{ padding: '0.15rem 0' }}>
                <strong>{f.label}</strong>: {formatValue(f.value, f.unit)} &mdash; validated{' '}
                {formatRange(f.validated, f.unit)}
                {f.status === 'red' && (
                  <span style={{ color: fg, fontWeight: 600 }}> (hard limit)</span>
                )}
              </li>
            ))}
          </ul>
          <div style={{ marginTop: '0.5rem', fontSize: '0.72rem', color: theme.textSoft }}>
            See <code>docs/MODEL.md</code> §6 for the full envelope.
          </div>
        </div>
      )}
    </div>
  );
}

function formatValue(v, unit) {
  if (!Number.isFinite(v)) return '—';
  const abs = Math.abs(v);
  const digits = abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
  return `${v.toFixed(digits)}${unit ? ` ${unit}` : ''}`;
}

function formatRange([min, max], unit) {
  const fmt = (x) =>
    Number.isFinite(x) ? (Math.abs(x) >= 100 ? x.toFixed(0) : x.toFixed(1)) : '∞';
  return `[${fmt(min)}, ${fmt(max)}]${unit ? ` ${unit}` : ''}`;
}
