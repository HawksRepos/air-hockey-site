/**
 * Fabrication-spec / BOM card — renders the output of
 * `src/physics/bom.js` as a compact design summary an engineer or
 * machinist can read before cutting material.
 *
 * This is the "Print to PDF" money-shot: the table below reads as a
 * one-page spec on paper thanks to `@media print` in `index.html`.
 */

import { useMemo } from 'react';
import { fabricationSpec } from '../physics/bom.js';

const fmtMoney = (n) =>
  n < 1 ? `£${n.toFixed(2)}` : n < 100 ? `£${n.toFixed(2)}` : `£${Math.round(n)}`;
const fmtMinutes = (n) =>
  n >= 60 ? `${Math.floor(n / 60)} h ${Math.round(n % 60)} min` : `${Math.round(n)} min`;

/** Hoisted row component — outside the parent so React and ESLint are happy. */
function Row({ label, children, highlight, muted, fg }) {
  return (
    <tr>
      <th
        scope="row"
        style={{
          textAlign: 'left',
          padding: '0.35rem 0.7rem',
          fontWeight: 500,
          color: muted,
          fontSize: '0.8rem',
          verticalAlign: 'top',
        }}
      >
        {label}
      </th>
      <td
        style={{
          padding: '0.35rem 0.7rem',
          color: fg,
          fontSize: '0.86rem',
          fontWeight: highlight ? 600 : 400,
        }}
      >
        {children}
      </td>
    </tr>
  );
}

/**
 * @param {object} props
 * @param {object} props.rig            Geometry inputs to computeAirHockey.
 * @param {object} [props.rates]        Override default workshop rates.
 * @param {object} [props.theme]        Theme tokens.
 * @param {string} [props.fanSummary]   One-line description of the fan choice.
 */
export function FabricationSpec({ rig, rates, theme = {}, fanSummary }) {
  const spec = useMemo(() => fabricationSpec(rig, rates), [rig, rates]);

  const fg = theme.text ?? '#1a1a1a';
  const muted = theme.textSoft ?? '#666';
  const accent = theme.accent ?? '#3170c7';
  const border = theme.border ?? '#c8c8c8';
  const panelBg = theme.surfaceAlt ?? '#f4f5f8';
  const warn = theme.warning ?? '#d90';

  return (
    <section
      aria-label="Fabrication specification"
      style={{
        border: `1px solid ${border}`,
        borderRadius: 10,
        overflow: 'hidden',
        background: panelBg,
      }}
    >
      <div
        style={{
          padding: '0.6rem 1rem',
          borderBottom: `1px solid ${border}`,
          background: theme.surface ?? '#fff',
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: '0.6rem',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div
            style={{
              fontSize: '0.72rem',
              color: muted,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}
          >
            Fabrication
          </div>
          <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600, color: fg }}>
            Design specification
          </h3>
        </div>
        <div style={{ color: muted, fontSize: '0.78rem', textAlign: 'right' }}>
          Estimate &mdash; overrides in <code>DEFAULT_RATES</code>
        </div>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          <Row label="Strip" muted={muted} fg={fg}>
            {spec.stripDimsMm.length} &times; {spec.stripDimsMm.width} &times;{' '}
            {spec.stripDimsMm.thickness} mm acrylic &mdash;{' '}
            <span style={{ color: muted }}>{spec.stripAreaM2.toFixed(3)} m²</span>
          </Row>
          <Row label="Carriage" muted={muted} fg={fg}>
            {spec.carriageDimsMm.length} &times; {spec.carriageDimsMm.width} mm acrylic &mdash;{' '}
            <span style={{ color: muted }}>{spec.carriageAreaM2.toFixed(3)} m²</span>
          </Row>
          <Row label="Hole grid" highlight muted={muted} fg={fg}>
            {spec.holesPerRow} holes × {rig.rows} rows ={' '}
            <strong style={{ color: accent }}>{spec.totalHoles}</strong> total (
            {spec.holesUnderBlock} under the carriage at any time)
          </Row>
          <Row label="Hole spacing" muted={muted} fg={fg}>
            {rig.spacingMm} mm along strip &middot; {spec.rowPitchMm.toFixed(1)} mm row pitch across
          </Row>
          <Row label="Drill size" highlight muted={muted} fg={fg}>
            target <strong>{spec.drillTargetMm.toFixed(1)} mm</strong> &rarr; use{' '}
            <strong style={{ color: accent }}>{spec.drill.toFixed(1)} mm</strong> ISO metric (
            nearest stocked, rounded up)
            {spec.drillExceedsStocked && (
              <span style={{ color: warn, marginLeft: '0.4rem' }}>
                &mdash; exceeds workshop stock, verify availability
              </span>
            )}
          </Row>
          {fanSummary && (
            <Row label="Fan" muted={muted} fg={fg}>
              {fanSummary}
            </Row>
          )}
          <Row label="Material area" muted={muted} fg={fg}>
            {spec.materialAreaM2.toFixed(3)} m² at £{spec.rates.acrylicPerM2GBP}/m² ={' '}
            <strong>{fmtMoney(spec.materialCostGBP)}</strong>
          </Row>
          <Row label="Build time" muted={muted} fg={fg}>
            {fmtMinutes(spec.setupMinutes)} setup + {fmtMinutes(spec.drillMinutes)} drilling (
            {spec.rates.secondsPerHole} s/hole) ={' '}
            <strong>{fmtMinutes(spec.totalBuildMinutes)}</strong>
          </Row>
          <Row label="Labour cost" muted={muted} fg={fg}>
            £{spec.rates.labourPerHourGBP}/h × {(spec.totalBuildMinutes / 60).toFixed(2)} h ={' '}
            <strong>{fmtMoney(spec.labourCostGBP)}</strong>
          </Row>
          <Row label="Total (material + labour)" highlight muted={muted} fg={fg}>
            <strong style={{ color: accent, fontSize: '1.02em' }}>
              {fmtMoney(spec.totalCostGBP)}
            </strong>{' '}
            <span style={{ color: muted, fontSize: '0.78rem' }}>
              (excludes fan, fasteners, adhesive)
            </span>
          </Row>
        </tbody>
      </table>
    </section>
  );
}
