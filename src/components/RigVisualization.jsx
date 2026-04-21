/**
 * Animated cross-section of the air-cushioned carriage rig.
 *
 * Reads the live `computeAirHockey` result and drives:
 *   • scale-accurate SVG geometry (hole pitch, carriage width, strip
 *     thickness — all proportional to the current slider state)
 *   • a particle animation whose emission rate, speed, and flow
 *     direction are all derived from model quantities, so a slider
 *     move immediately shows up in the flow
 *   • a pressure-field overlay under the carriage that reflects the
 *     model's plenum pressure
 *   • interactive hotspots (blower, duct, plenum, holes, film, edge
 *     gap, carriage) that on hover pop a callout with the relevant
 *     equation, live value, and citation links
 *
 * One dimension (the hover gap) is deliberately exaggerated because at
 * true scale it would be sub-pixel against the other dimensions. A
 * disclosed exaggeration factor is shown in the corner.
 *
 * Particle physics is intentionally approximate — the goal is to show
 * the right *regime* (high-speed jets through holes, lateral film flow,
 * edge venting) at the right *rates*, not to be a CFD solver.
 */

import { useEffect, useMemo, useState } from 'react';
import { findRef } from '../data/references.js';
import { RHO } from '../physics/constants.js';

// ── SVG viewbox constants ────────────────────────────────────────
// Vertical topology matches the physical rig:
//   (top) atmosphere / weight arrow
//        Carriage         ← sits on the film, above the strip
//        Edge-gap film    ← exaggerated for visibility
//        Strip (drilled)  ← floor of the open U-channel
//        Plenum           ← pressurised interior of the U-channel
//        Blower port      ← side inlet
const VB_W = 960;
const VB_H = 540;

// Margins keep content clear of hotspot labels.
const MX = 40;
const STRIP_Y = 200; // Top of the drilled strip (the "floor" the carriage sits on)
const STRIP_THICKNESS_PX = 14;
const PLENUM_BOTTOM = 500;

// Only this many mm of the real strip are shown (cropped centred on
// the carriage). Lets us preserve hole-pitch-to-carriage-width ratio
// without zooming out so far the carriage is a dot.
const VISIBLE_STRIP_MM = 480;

// Gap exaggeration — at real scale (~1 mm) the hover film is sub-pixel.
const GAP_EXAGGERATION = 20;

// Max particles in the pool. Scale based on viewport if needed later.
const PARTICLE_POOL_SIZE = 240;

/**
 * @param {object} props
 * @param {object} props.calc            `computeAirHockey(inputs)` result.
 * @param {object} props.inputs          The inputs used to produce `calc`
 *                                        (hole dia, spacing, rows, block/strip dims…).
 * @param {object} [props.theme]         Theme tokens.
 * @param {boolean} [props.compact=false] Shrink the canvas for tighter layouts.
 */
export function RigVisualization({ calc, inputs, theme = {}, compact = false }) {
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [showPressure, setShowPressure] = useState(true);
  const [showParticles, setShowParticles] = useState(true);
  const [hover, setHover] = useState(null); // {id, x, y}

  // ── Theme tokens ────────────────────────────────────────────────
  const fg = theme.text ?? '#1a1a1a';
  const muted = theme.textSoft ?? '#7a8296';
  const accent = theme.accent ?? '#5aa3e0';
  const warm = theme.orange ?? '#d9913a';
  const success = theme.success ?? '#5cb97c';
  const danger = theme.danger ?? '#d96a6a';
  const border = theme.border ?? '#2a3a5c';
  const panelBg = theme.surfaceAlt ?? '#1f2b47';
  const surface = theme.surface ?? '#16213e';

  // ── Geometry derived from the live inputs ───────────────────────
  const geom = useMemo(() => {
    const stripVisibleMm = VISIBLE_STRIP_MM;
    const pxPerMm = (VB_W - MX * 2) / stripVisibleMm;
    const stripY = STRIP_Y;
    const stripH = STRIP_THICKNESS_PX;

    // Carriage sits on the air film *above* the strip. When the model
    // says the carriage can't float, we drop it flush onto the strip
    // (gap = 0) so the visualisation matches the h = 0.00 mm readout.
    const blockW = inputs.blockLengthMm * pxPerMm;
    const blockH = Math.max(46, 4 * pxPerMm);
    const blockX = VB_W / 2 - blockW / 2;
    const gapPx = calc.floats
      ? Math.max(4, Math.min(28, (calc.hoverHeightMm || 0.6) * GAP_EXAGGERATION * pxPerMm))
      : 0;
    // Carriage top is gapPx + blockH above the top of the strip.
    const blockBottom = stripY - gapPx; // bottom of carriage (top of film)
    const blockY = blockBottom - blockH; // top of carriage

    // Plenum fills everything from just below the strip down to the floor.
    const plenumTop = stripY + stripH;
    const plenumBottom = PLENUM_BOTTOM;

    // Holes visible in the crop — integer number of pitches from centre,
    // clipped to the visible window.
    const pitch = inputs.spacingMm;
    const centreMm = stripVisibleMm / 2;
    const firstHoleMm = centreMm - pitch * Math.floor(centreMm / pitch);
    const holes = [];
    for (let m = firstHoleMm; m <= stripVisibleMm; m += pitch) {
      const x = MX + m * pxPerMm;
      holes.push({ xMm: m, x, covered: x >= blockX && x <= blockX + blockW });
    }

    return {
      stripVisibleMm,
      pxPerMm,
      stripY,
      stripH,
      plenumTop,
      plenumBottom,
      blockX,
      blockY,
      blockW,
      blockH,
      blockBottom,
      gapPx,
      holes,
    };
  }, [inputs, calc.hoverHeightMm, calc.floats]);

  // ── Particle system ─────────────────────────────────────────────
  // The pool array is an identity-stable state value that we mutate
  // in-place inside the rAF loop (cheap — 240 object allocations only
  // happen once, on mount). A separate throttled `snapshot` state
  // holds the shallow copy the render reads; React thus never sees
  // the pool change identity and doesn't re-run effects on every frame.
  const [pool] = useState(() => new Array(PARTICLE_POOL_SIZE).fill(null).map(() => makeDead()));
  const [snapshot, setSnapshot] = useState(/** @type {Array<ReturnType<typeof makeDead>>} */ ([]));

  // Derived emission / velocity from model Q, P.
  const emission = useMemo(() => {
    const qHole = geom.holes.length > 0 ? calc.qOp / geom.holes.length : 0;
    // Hole exit velocity from Bernoulli.
    const vHole = Math.sqrt((2 * Math.max(0, calc.pOp)) / RHO);
    // Emissions-per-second per hole: scale so ~10 × #holes particles/s total
    // at default inputs — visible flow without overwhelming.
    const emissionPerSec = 3 + Math.min(14, vHole / 4);
    // Film lateral velocity: order-of-magnitude from Q/(W·h).
    const hM = Math.max(0.0001, (calc.hoverHeightMm ?? 1) / 1000);
    const wM = inputs.blockWidthMm / 1000;
    const vFilm = (calc.qIntoGap ?? 0) / (wM * hM * 2); // split between two edges
    return { qHole, vHole, emissionPerSec, vFilm };
  }, [calc, inputs.blockWidthMm, geom.holes.length]);

  // Animation loop.
  useEffect(() => {
    if (paused) return undefined;
    let raf = 0;
    let last = performance.now();
    let lastTick = last;
    let emitAccumulator = 0;

    const step = (now) => {
      const dtMs = Math.min(64, now - last);
      last = now;
      const dt = (dtMs / 1000) * speed; // seconds of sim per frame

      // Emit from covered holes (produce under-block flow) and uncovered
      // holes (produce vents / nearby capture streams).
      emitAccumulator += emission.emissionPerSec * dt * geom.holes.length;
      while (emitAccumulator >= 1) {
        emitAccumulator -= 1;
        const h = geom.holes[Math.floor(Math.random() * geom.holes.length)];
        if (!h) break;
        const slot = pool.find((p) => !p.alive);
        if (!slot) break;
        seedParticle(slot, h, emission, geom);
      }

      // Advance alive particles.
      for (const p of pool) {
        if (!p.alive) continue;
        // Light turbulence on jet particles so the plume wavers like a
        // real gas column instead of rising as straight lines.
        if (p.phase === 'jet') {
          p.vx += (Math.random() - 0.5) * 0.35 * dt * 60;
          p.vy *= 0.985; // slight deceleration as the jet entrains air
        } else if (p.phase === 'film') {
          p.vy += (Math.random() - 0.5) * 0.15 * dt * 60;
        }
        p.x += p.vx * dt * 60;
        p.y += p.vy * dt * 60;
        p.age += dt;
        if (p.age > p.life) {
          p.alive = false;
          continue;
        }
        // Phase transitions in the under-carriage film: once a particle
        // has risen into the gap zone, deflect laterally toward the
        // nearest edge where the pressure gradient drives the flow.
        if (p.phase === 'jet' && p.y <= geom.blockBottom - 1 && p.covered) {
          p.phase = 'film';
          const midX = geom.blockX + geom.blockW / 2;
          const toRight = p.x > midX;
          const vf = Math.min(10, Math.max(2, emission.vFilm * 40));
          p.vx = toRight ? vf : -vf;
          p.vy = (Math.random() - 0.5) * 0.3;
        }
        // Once past the block edge in the film, vent into atmosphere.
        if (p.phase === 'film' && (p.x < geom.blockX - 2 || p.x > geom.blockX + geom.blockW + 2)) {
          p.phase = 'vent';
          p.vy = 0.4 + Math.random() * 0.4; // drift *down* slightly toward the strip surface
          p.vx *= 0.6;
          p.life = Math.min(p.life, p.age + 0.9);
        }
        // Jet particles from UNCOVERED holes vent to atmosphere directly.
        if (p.phase === 'jet' && !p.covered && p.y < geom.stripY - 40) {
          p.phase = 'vent';
          p.vy *= 0.4;
          p.life = Math.min(p.life, p.age + 0.8);
        }
        // Off-canvas cleanup.
        if (p.x < -10 || p.x > VB_W + 10 || p.y < -10 || p.y > VB_H + 10) p.alive = false;
      }

      // Throttled snapshot at ~20 Hz — copy the mutable pool into
      // state so the render reads from state, not the ref.
      if (now - lastTick > 48) {
        lastTick = now;
        setSnapshot(pool.slice());
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [paused, speed, emission, geom]);

  // ── Hover callouts ──────────────────────────────────────────────
  const zones = useMemo(
    () => buildHoverZones(geom, calc, inputs, emission),
    [geom, calc, inputs, emission],
  );

  const hoverZone = hover ? zones.find((z) => z.id === hover.id) : null;

  const h = compact ? VB_H * 0.75 : VB_H;

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: compact ? 280 : 360,
        background: surface,
        borderRadius: 12,
        border: `1px solid ${border}`,
        overflow: 'hidden',
        fontFamily: 'system-ui, sans-serif',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <svg
        viewBox={`0 0 ${VB_W} ${h}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ display: 'block', flex: 1, width: '100%', height: '100%' }}
        role="img"
        aria-label="Animated cross-section of the air-cushioned carriage rig with live flow visualisation"
      >
        <defs>
          {/* Pressure gradient: strongest near the bottom of the plenum
              (where the blower injects), fading upward toward the strip. */}
          <linearGradient id="rigviz-plenum-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={accent} stopOpacity="0.1" />
            <stop offset="100%" stopColor={accent} stopOpacity="0.55" />
          </linearGradient>
          <linearGradient id="rigviz-film-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={accent} stopOpacity="0.05" />
            <stop offset="50%" stopColor={accent} stopOpacity="0.45" />
            <stop offset="100%" stopColor={accent} stopOpacity="0.05" />
          </linearGradient>
          <radialGradient id="rigviz-hole-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={accent} stopOpacity="0.9" />
            <stop offset="100%" stopColor={accent} stopOpacity="0" />
          </radialGradient>
          {/* Gas/steam blur — applied to the particle <g> so the whole
              plume softens to a gaseous haze rather than distinct dots. */}
          <filter
            id="rigviz-steam-blur"
            x="-20%"
            y="-20%"
            width="140%"
            height="140%"
            colorInterpolationFilters="sRGB"
          >
            <feGaussianBlur stdDeviation="1.4" />
          </filter>
        </defs>

        {/* Atmosphere background */}
        <rect x="0" y="0" width={VB_W} height={h} fill={surface} />

        {/* Atmosphere label — faint tag above the strip to distinguish
            the upper region from the (pressurised) plenum below. */}
        <text
          x={MX + 12}
          y={24}
          fontSize="10"
          fill={muted}
          fontStyle="italic"
          style={{ pointerEvents: 'none' }}
        >
          atmosphere · P ≈ 0 gauge
        </text>

        {/* Plenum (inside the U-channel, below the strip) */}
        <rect
          x={MX}
          y={geom.plenumTop}
          width={VB_W - MX * 2}
          height={geom.plenumBottom - geom.plenumTop}
          fill="url(#rigviz-plenum-gradient)"
          stroke={accent}
          strokeWidth="1"
          strokeDasharray="3 4"
          opacity="0.9"
        />

        {/* U-channel walls — thin lines on either side */}
        <line
          x1={MX}
          y1={geom.plenumTop}
          x2={MX}
          y2={geom.plenumBottom}
          stroke={border}
          strokeWidth="3"
        />
        <line
          x1={VB_W - MX}
          y1={geom.plenumTop}
          x2={VB_W - MX}
          y2={geom.plenumBottom}
          stroke={border}
          strokeWidth="3"
        />
        {/* U-channel floor */}
        <line
          x1={MX}
          y1={geom.plenumBottom}
          x2={VB_W - MX}
          y2={geom.plenumBottom}
          stroke={border}
          strokeWidth="3"
        />

        {/* Blower + duct, injecting into the plenum from the side */}
        <Blower accent={warm} label={fg} centreY={(geom.plenumTop + geom.plenumBottom) / 2} />
        <Duct accent={accent} targetY={(geom.plenumTop + geom.plenumBottom) / 2} />

        {/* Strip (drilled floor of the open side of the U — the surface
            the carriage rides on). Holes go all the way through, so we
            render them as short vertical slots. */}
        <rect
          x={MX}
          y={geom.stripY}
          width={VB_W - MX * 2}
          height={geom.stripH}
          fill={panelBg}
          stroke={border}
          strokeWidth="1"
        />
        {geom.holes.map((holeData) => (
          <g key={holeData.xMm}>
            <rect
              x={holeData.x - 2}
              y={geom.stripY}
              width={4}
              height={geom.stripH}
              fill={holeData.covered ? success : warm}
              opacity="0.9"
            />
            {showPressure && (
              <ellipse
                cx={holeData.x}
                cy={geom.stripY}
                rx={6}
                ry={2.5}
                fill="url(#rigviz-hole-glow)"
                opacity="0.55"
              />
            )}
          </g>
        ))}

        {/* Under-block film (between top of strip and bottom of carriage) */}
        {showPressure && calc.floats && (
          <rect
            x={geom.blockX}
            y={geom.blockBottom}
            width={geom.blockW}
            height={geom.gapPx}
            fill="url(#rigviz-film-gradient)"
            opacity="0.9"
          />
        )}

        {/* Carriage */}
        <g>
          <rect
            x={geom.blockX}
            y={geom.blockY}
            width={geom.blockW}
            height={geom.blockH}
            rx="3"
            fill={surface}
            stroke={fg}
            strokeWidth="1.5"
          />
          <text
            x={geom.blockX + geom.blockW / 2}
            y={geom.blockY + geom.blockH / 2 + 4}
            textAnchor="middle"
            fontSize="12"
            fill={fg}
            fontWeight="500"
            style={{ pointerEvents: 'none' }}
          >
            Carriage ({inputs.blockLengthMm} × {inputs.blockWidthMm} mm)
          </text>
        </g>

        <defs>
          {/* Arrow markers — apex aligned with marker local +X so that
              orient="auto" makes the arrowhead point along the line
              direction (toward the line's end). Geometry is identical;
              two IDs exist only so we can fill them in different colours. */}
          <marker
            id="rigviz-arrow-down"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="8"
            markerHeight="8"
            orient="auto"
          >
            <path d="M0,0 L10,5 L0,10 z" fill={danger} />
          </marker>
          <marker
            id="rigviz-arrow-up"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="8"
            markerHeight="8"
            orient="auto"
          >
            <path d="M0,0 L10,5 L0,10 z" fill={success} />
          </marker>
        </defs>

        {/* Free-body force arrows — weight (W) down on top face, lift (F)
            up on bottom face of the carriage. Arrow lengths scale with
            magnitude so at-a-glance you can see the balance. */}
        <ForceArrows geom={geom} calc={calc} fg={fg} danger={danger} success={success} />

        {/* Hover height callout — measures the film gap (between the
            carriage bottom and the strip top). */}
        <g style={{ pointerEvents: 'none' }}>
          <line
            x1={geom.blockX + geom.blockW + 6}
            y1={geom.blockBottom}
            x2={geom.blockX + geom.blockW + 6}
            y2={geom.stripY}
            stroke={muted}
            strokeWidth="1"
          />
          <line
            x1={geom.blockX + geom.blockW + 2}
            y1={geom.blockBottom}
            x2={geom.blockX + geom.blockW + 10}
            y2={geom.blockBottom}
            stroke={muted}
            strokeWidth="1"
          />
          <line
            x1={geom.blockX + geom.blockW + 2}
            y1={geom.stripY}
            x2={geom.blockX + geom.blockW + 10}
            y2={geom.stripY}
            stroke={muted}
            strokeWidth="1"
          />
          <text
            x={geom.blockX + geom.blockW + 14}
            y={(geom.blockBottom + geom.stripY) / 2 + 4}
            fontSize="11"
            fill={fg}
            fontWeight="600"
          >
            h = {(calc.hoverHeightMm ?? 0).toFixed(2)} mm
          </text>
        </g>

        {/* Particles rendered as a gas/steam plume — puffs grow and fade
            with age, all filtered through a gaussian blur so the group
            reads as a continuous haze rather than a cloud of dots. */}
        {showParticles && (
          <g filter="url(#rigviz-steam-blur)">
            {snapshot.map((p, i) => {
              if (!p.alive) return null;
              const ageRatio = Math.min(1, p.age / p.life);
              // Puffs expand as they age and entrain air.
              const r = 1.3 + ageRatio * 3.2 + (p.phase === 'vent' ? 0.6 : 0);
              // Soft fade — quadratic so edges don't look like sharp circles.
              const op = (1 - ageRatio) * (1 - ageRatio) * 0.85;
              const fill =
                p.phase === 'vent'
                  ? muted
                  : p.phase === 'film'
                    ? accent
                    : p.covered
                      ? success
                      : warm;
              return <circle key={i} cx={p.x} cy={p.y} r={r} fill={fill} opacity={op} />;
            })}
          </g>
        )}

        {/* Pressure value labels */}
        <g style={{ pointerEvents: 'none' }}>
          {/* Plenum label sits inside the plenum volume, bottom-left */}
          <text x={MX + 12} y={geom.plenumBottom - 30} fontSize="12" fill={fg} fontWeight="600">
            Plenum
          </text>
          <text x={MX + 12} y={geom.plenumBottom - 14} fontSize="11" fill={muted}>
            P = {Math.round(calc.pOp)} Pa
          </text>
          {/* Film pressure sits IN the exaggerated gap — only when the
              gap is tall enough to fit the text, otherwise we drop the
              label and rely on the hover callout. */}
          {calc.floats && geom.gapPx >= 14 && (
            <text
              x={geom.blockX + geom.blockW / 2}
              y={geom.blockBottom + geom.gapPx / 2 + 4}
              fontSize="10.5"
              textAnchor="middle"
              fill={accent}
              fontWeight="700"
            >
              film P = {Math.round(calc.pRequired)} Pa
            </text>
          )}
        </g>

        {/* Hover hotspots (transparent, last layer so they catch pointer) */}
        {zones.map((z) => (
          <rect
            key={z.id}
            x={z.x}
            y={z.y}
            width={z.w}
            height={z.h}
            fill="transparent"
            onMouseEnter={(e) => setHover({ id: z.id, x: e.clientX, y: e.clientY })}
            onMouseMove={(e) => setHover({ id: z.id, x: e.clientX, y: e.clientY })}
            onMouseLeave={() => setHover(null)}
            style={{ cursor: 'help' }}
          />
        ))}

        {/* Legend */}
        <g transform={`translate(${VB_W - 220}, ${h - 66})`} style={{ pointerEvents: 'none' }}>
          <rect width="210" height="58" rx="6" fill={panelBg} stroke={border} opacity="0.95" />
          <circle cx="14" cy="14" r="3" fill={success} />
          <text x="24" y="17" fontSize="10" fill={fg}>
            flow into under-block film
          </text>
          <circle cx="14" cy="30" r="3" fill={warm} />
          <text x="24" y="33" fontSize="10" fill={fg}>
            vented flow (wasted)
          </text>
          <circle cx="14" cy="46" r="3" fill={accent} />
          <text x="24" y="49" fontSize="10" fill={fg}>
            lateral film flow
          </text>
        </g>

        {/* Caveat */}
        <text
          x={MX + 10}
          y={h - 12}
          fontSize="10"
          fill={muted}
          fontStyle="italic"
          style={{ pointerEvents: 'none' }}
        >
          Hover gap shown at {GAP_EXAGGERATION}× actual size for visibility · hover any region for
          the equation
        </text>
      </svg>

      {/* Callout card */}
      {hoverZone && (
        <HoverCallout
          zone={hoverZone}
          calc={calc}
          inputs={inputs}
          emission={emission}
          position={hover}
          theme={theme}
        />
      )}

      {/* Controls */}
      <div
        style={{
          position: 'absolute',
          top: 8,
          right: 10,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: panelBg,
          padding: '0.3rem 0.55rem',
          borderRadius: 6,
          border: `1px solid ${border}`,
          fontSize: 11,
          color: fg,
        }}
        data-print="hide"
      >
        <button
          type="button"
          onClick={() => setPaused((v) => !v)}
          aria-label={paused ? 'Play animation' : 'Pause animation'}
          style={{
            border: 'none',
            background: paused ? success : accent,
            color: '#fff',
            padding: '0.2rem 0.6rem',
            borderRadius: 4,
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          {paused ? '▶ play' : '❚❚ pause'}
        </button>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ color: muted }}>speed</span>
          <input
            type="range"
            min={0.25}
            max={2}
            step={0.25}
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            style={{ width: 80 }}
          />
          <span style={{ width: 28, textAlign: 'right' }}>{speed.toFixed(2)}×</span>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input
            type="checkbox"
            checked={showParticles}
            onChange={(e) => setShowParticles(e.target.checked)}
          />
          particles
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input
            type="checkbox"
            checked={showPressure}
            onChange={(e) => setShowPressure(e.target.checked)}
          />
          pressure
        </label>
      </div>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────

function Blower({ accent, label, centreY }) {
  const cx = 22;
  const cy = centreY ?? 280;
  return (
    <g>
      <circle cx={cx} cy={cy} r="18" fill={accent} opacity="0.88" />
      <circle cx={cx} cy={cy} r="12" fill="none" stroke="#fff" strokeWidth="1.3" opacity="0.85" />
      <path
        d={`M${cx},${cy - 10} L${cx},${cy + 10} M${cx - 10},${cy} L${cx + 10},${cy} M${cx - 7},${cy - 7} L${cx + 7},${cy + 7} M${cx + 7},${cy - 7} L${cx - 7},${cy + 7}`}
        stroke="#fff"
        strokeWidth="1.2"
        opacity="0.9"
      />
      <text x={cx} y={cy + 34} textAnchor="middle" fontSize="10" fill={label}>
        Blower
      </text>
    </g>
  );
}

function Duct({ accent, targetY }) {
  const startX = 40;
  const endX = MX + 30; // push past the wall so the inlet flare is visible
  const y = targetY ?? 280;
  const path = `M ${startX} ${y} L ${endX} ${y}`;
  return (
    <>
      {/* Soft halo */}
      <path
        d={path}
        stroke={accent}
        strokeWidth="14"
        fill="none"
        opacity="0.28"
        strokeLinecap="round"
      />
      {/* Solid stroke */}
      <path d={path} stroke={accent} strokeWidth="3" fill="none" strokeLinecap="round" />
      {/* Arrow tip at the plenum entry */}
      <path
        d={`M ${endX - 2} ${y - 6} L ${endX + 8} ${y} L ${endX - 2} ${y + 6} Z`}
        fill={accent}
        opacity="0.85"
      />
    </>
  );
}

/**
 * Free-body-style force arrows overlaid on the carriage cross-section.
 * Arrows emanate FROM the body in the direction of the force (standard
 * FBD convention):
 *   - W (weight) — tail at block's BOTTOM face, arrowhead extends DOWN
 *     through the film/strip into the plenum.
 *   - F = P·A (film lift) — tail at block's TOP face, arrowhead extends
 *     UP into the atmosphere band.
 * Arrow lengths scale with force magnitude so the balance reads at a
 * glance. A floats / does-not-float status strip sits in the atmosphere.
 */
function ForceArrows({ geom, calc, fg, danger, success }) {
  const wN = Math.max(0, calc.force ?? 0);
  const fN = Math.max(0, calc.maxLiftForce ?? 0);
  const fMax = Math.max(wN, fN, 0.01);
  // Arrows extend through the strip/atmosphere so numeric labels placed
  // near the midpoint always clear those bands.
  const MAX_LEN = 110;
  const MIN_LEN = 64;
  const wLen = Math.max(MIN_LEN, (wN / fMax) * MAX_LEN);
  const fLen = Math.max(MIN_LEN, (fN / fMax) * MAX_LEN);

  // Stack arrows ~22% from the left edge of the block so they sit
  // beside the centre label rather than through it.
  const armX = geom.blockX + Math.min(28, Math.max(18, geom.blockW * 0.22));

  // Arrows POINT AT the carriage in the direction of each force, so
  // the arrowhead lands on the block face and the shaft extends away
  // into open space (atmosphere for W, plenum for F).
  //   W (weight, DOWN): tail high in atmosphere, head at block top.
  //   F (lift,  UP):    tail deep in plenum,    head at block bottom.
  const wTailY = geom.blockY - wLen;
  const wHeadY = geom.blockY;

  const fTailY = geom.blockBottom + fLen;
  const fHeadY = geom.blockBottom;

  return (
    <g style={{ pointerEvents: 'none' }}>
      {/* Weight arrow — comes down from atmosphere onto the block top */}
      <line
        x1={armX}
        y1={wTailY}
        x2={armX}
        y2={wHeadY}
        stroke={danger}
        strokeWidth="2.4"
        markerEnd="url(#rigviz-arrow-down)"
      />
      <text x={armX + 9} y={(wTailY + wHeadY) / 2 + 4} fontSize="11" fill={fg} fontWeight="700">
        W = {fmtN(wN)}
      </text>

      {/* Lift arrow — comes up from plenum onto the block bottom */}
      <line
        x1={armX}
        y1={fTailY}
        x2={armX}
        y2={fHeadY}
        stroke={success}
        strokeWidth="2.4"
        markerEnd="url(#rigviz-arrow-up)"
      />
      <text x={armX + 9} y={(fTailY + fHeadY) / 2 + 4} fontSize="11" fill={fg} fontWeight="700">
        F = P·A = {fmtN(fN)}
      </text>

      {/* Status banner — sits in the atmosphere band, near the top. */}
      <g transform={`translate(${MX + 10}, 36)`}>
        <rect
          x="0"
          y="0"
          width="210"
          height="22"
          rx="4"
          fill={calc.floats ? `${success}22` : `${danger}22`}
          stroke={calc.floats ? success : danger}
          strokeWidth="1"
        />
        <text x="10" y="15" fontSize="11" fontWeight="700" fill={calc.floats ? success : danger}>
          {calc.floats
            ? `Floats · ${calc.pressureHeadroomPct?.toFixed?.(0) ?? '0'}% headroom`
            : `Does not float · ${fmtN(wN - fN)} short`}
        </text>
      </g>
    </g>
  );
}

function fmtN(n) {
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 10) return `${n.toFixed(1)} N`;
  return `${n.toFixed(2)} N`;
}

function HoverCallout({ zone, calc, inputs, emission, position, theme }) {
  const fg = theme.text ?? '#1a1a1a';
  const muted = theme.textSoft ?? '#7a8296';
  const border = theme.border ?? '#2a3a5c';
  const surface = theme.surface ?? '#16213e';
  const accent = theme.accent ?? '#5aa3e0';

  const body = zone.render({ calc, inputs, emission });
  const refs = zone.refs ?? [];

  return (
    <div
      role="tooltip"
      style={{
        position: 'fixed',
        left: Math.min(window.innerWidth - 340, (position?.x ?? 0) + 14),
        top: Math.min(window.innerHeight - 240, (position?.y ?? 0) + 14),
        width: 320,
        background: surface,
        color: fg,
        border: `1px solid ${border}`,
        borderRadius: 8,
        padding: '0.7rem 0.9rem',
        fontSize: '0.82rem',
        lineHeight: 1.5,
        boxShadow: '0 12px 28px rgba(0,0,0,0.4)',
        zIndex: 50,
        pointerEvents: 'auto',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: '0.3rem', color: accent }}>{zone.title}</div>
      {body}
      {refs.length > 0 && (
        <div
          style={{
            marginTop: '0.5rem',
            paddingTop: '0.4rem',
            borderTop: `1px solid ${border}`,
            fontSize: '0.75rem',
            color: muted,
          }}
        >
          References:{' '}
          {refs.map((id, i) => {
            const r = findRef(id);
            if (!r) return null;
            return (
              <span key={id}>
                <a
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: accent, textDecoration: 'none', fontWeight: 600 }}
                >
                  [{id}]
                </a>
                {i < refs.length - 1 && ' '}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Particle helpers ─────────────────────────────────────────────

function makeDead() {
  return {
    alive: false,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    age: 0,
    life: 1,
    phase: 'jet',
    covered: false,
  };
}

function seedParticle(p, hole, emission, geom) {
  p.alive = true;
  p.x = hole.x + (Math.random() - 0.5) * 3;
  // Particles originate at the TOP surface of the strip (the side the
  // carriage sits on) and move UP into the film / atmosphere. The
  // plenum is below the strip — we only render the exit side.
  p.y = geom.stripY - 1;
  const vBase = Math.max(2, Math.min(8, emission.vHole / 6));
  p.vx = (Math.random() - 0.5) * 0.3;
  p.vy = -vBase;
  p.age = 0;
  p.life = hole.covered ? 2.2 : 1.2;
  p.phase = 'jet';
  p.covered = hole.covered;
}

// ── Hover zones ──────────────────────────────────────────────────

function buildHoverZones(geom, calc, inputs, emission) {
  const plenumCentreY = (geom.plenumTop + geom.plenumBottom) / 2;
  const zones = [
    {
      id: 'blower',
      title: 'Centrifugal blower (Dewalt)',
      x: 2,
      y: plenumCentreY - 20,
      w: 40,
      h: 56,
      refs: [17, 10],
      render: ({ inputs: i }) => (
        <>
          <p style={{ margin: '0 0 0.35rem' }}>
            Supplies a mass flow at a pressure given by its Q–P characteristic curve. Electrical
            input: <strong>{i.fanWatts} W</strong>; achievable aero efficiency limits the actual
            plenum pressure.
          </p>
          <Formula>η_aero · P_elec = P · Q</Formula>
        </>
      ),
    },
    {
      id: 'duct',
      title: 'Duct / inlet',
      x: 42,
      y: plenumCentreY - 10,
      w: MX - 38,
      h: 20,
      refs: [15],
      render: () => (
        <>
          <p style={{ margin: '0 0 0.35rem' }}>
            Couples the blower to the plenum. In an open-gutter rig, K ≈ 0 (no sealed duct); in
            ducted setups, ΔP_loss = K·½ρv² is subtracted from the fan's delivered pressure.
          </p>
          <Formula>ΔP_loss = K · ½ρv² (K = 0 for this rig)</Formula>
        </>
      ),
    },
    {
      id: 'plenum',
      title: 'Plenum (inside the U-channel)',
      x: MX + 4,
      y: geom.plenumTop + 4,
      w: VB_W - MX * 2 - 8,
      h: geom.plenumBottom - geom.plenumTop - 8,
      refs: [1, 13],
      render: ({ calc: c }) => (
        <>
          <p style={{ margin: '0 0 0.35rem' }}>
            Effectively well-mixed volume at plenum pressure{' '}
            <strong>P = {Math.round(c.pOp)} Pa</strong>. The pressure difference P − P_atm drives
            flow through every hole above — the strip forms the ceiling of the plenum.
          </p>
          <Formula>Q_total = Σ_holes Cd · A · √(2ΔP/ρ)</Formula>
        </>
      ),
    },
    {
      id: 'hole',
      title: 'Hole array',
      x: MX,
      y: geom.stripY - 4,
      w: VB_W - MX * 2,
      h: geom.stripH + 8,
      refs: [14, 15, 2],
      render: ({ calc: c, inputs: i }) => (
        <>
          <p style={{ margin: '0 0 0.35rem' }}>
            <strong>{Math.round(i.stripLengthMm / i.spacingMm) * i.rows} total holes</strong> at{' '}
            {i.holeDiaMm} mm diameter, {i.spacingMm} mm pitch × {i.rows} rows. Each hole acts as a
            short-tube orifice with Cd dependent on t/d ratio and Reynolds number.
          </p>
          <Formula>
            Cd = {c.cdGeometric.toFixed(2)}
            <sub>geom</sub> × Re/(Re+1000) = {c.cd.toFixed(2)}
          </Formula>
          <Formula>
            v_hole = √(2P/ρ) ≈ {emission.vHole.toFixed(1)} m/s (M = {(c.holeMach ?? 0).toFixed(2)})
          </Formula>
        </>
      ),
    },
    {
      id: 'film',
      title: 'Under-carriage film',
      x: geom.blockX,
      y: geom.blockBottom - 2,
      w: geom.blockW,
      h: geom.gapPx + 4,
      refs: [16, 7],
      render: ({ calc: c }) => (
        <>
          <p style={{ margin: '0 0 0.35rem' }}>
            Thin viscous layer supporting the carriage. Film pressure{' '}
            <strong>P_film = mg/A = {Math.round(c.pRequired)} Pa</strong>. The Reynolds lubrication
            equation gives hover height as a cube-root of inflow rate.
          </p>
          <Formula>h = ∛(3μL·Q_in / (W·P_film)) = {(c.hoverHeightMm ?? 0).toFixed(2)} mm</Formula>
        </>
      ),
    },
    {
      id: 'edge',
      title: 'Edge gap (vent to atmosphere)',
      x: geom.blockX - 30,
      y: geom.blockBottom - 2,
      w: 30,
      h: geom.gapPx + 4,
      refs: [16, 9],
      render: ({ calc: c }) => (
        <>
          <p style={{ margin: '0 0 0.35rem' }}>
            Air escapes out the sides to atmosphere over the leaking perimeter. The gap height
            self-adjusts so out-flow equals in-flow — a steady-state balance.
          </p>
          <Formula>Q_out = Cd_gap · L_perim · h · √(2P_film/ρ)</Formula>
          <Formula>Q_in ≈ {((c.qIntoGap ?? 0) * 1000).toFixed(2)} L/s</Formula>
        </>
      ),
    },
    {
      id: 'carriage',
      title: 'Carriage (floating mass)',
      x: geom.blockX,
      y: geom.blockY,
      w: geom.blockW,
      h: geom.blockH,
      refs: [9],
      render: ({ calc: c, inputs: i }) => (
        <>
          <p style={{ margin: '0 0 0.35rem' }}>
            Force balance: weight <strong>W = mg = {c.force.toFixed(2)} N</strong> vs lift{' '}
            <strong>F = P · A = {c.maxLiftForce.toFixed(2)} N</strong>.{' '}
            {c.floats ? (
              <>
                Floats with <strong>{c.pressureHeadroomPct.toFixed(0)}%</strong> pressure headroom.
              </>
            ) : (
              <>
                Does not float — short <strong>{(c.force - c.maxLiftForce).toFixed(2)} N</strong>.
              </>
            )}
          </p>
          <Formula>
            W = m · g = {i.massG / 1000} × 9.81 = {c.force.toFixed(2)} N
          </Formula>
        </>
      ),
    },
  ];
  return zones;
}

function Formula({ children }) {
  return (
    <div
      style={{
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: '0.78rem',
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        padding: '0.25rem 0.45rem',
        borderRadius: 4,
        margin: '0.2rem 0',
      }}
    >
      {children}
    </div>
  );
}
