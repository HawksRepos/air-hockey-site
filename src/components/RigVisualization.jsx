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

import { useEffect, useMemo, useRef, useState } from 'react';
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
//        Live-metrics rail ← bottom strip with operating-point readouts
//
// VB_H deliberately tall (1.33 aspect) so the SVG fills typical landscape
// containers without leaving empty bands top/bottom. Internal Y positions
// were rebalanced to keep the carriage roughly in the upper third where it
// reads as the focal element.
const VB_W = 960;
const VB_H = 720;

// Margins keep content clear of hotspot labels. MX is the inset of the
// U-channel walls (and so the strip / plenum / hole pattern); RAIL_MX
// is a separate, smaller inset for the bottom metrics rail so the
// readout cards extend most of the canvas width. The two are decoupled
// so we can give the blower symbol real estate without shrinking the
// data display.
const MX = 100;
const RAIL_MX = 20;
// Strip sits a touch above centre — gives the carriage breathing room
// above and a comfortable plenum below without making either feel cramped.
const STRIP_Y = 380;
const STRIP_THICKNESS_PX = 14;
const PLENUM_BOTTOM = 580;

// Force-box placement (top-LEFT of the atmosphere band). Two stacked
// cards with arrow + value, well clear of the rig itself. Uses RAIL_MX
// so the box's left edge tracks the left edge of the metrics rail
// below it (visually consistent margin top-to-bottom).
const FORCE_BOX_W = 200;
const FORCE_BOX_H = 76;
const FORCE_BOX_X = RAIL_MX;
const FORCE_BOX_Y = 40;
const FORCE_BOX_GAP = 14;

// Idle hover oscillation — small, slow sinusoidal bobbing applied to the
// rendered gap when the carriage is floating. Amplitude is in the gap's
// own pixel coordinates so it scales with the exaggeration. Period is
// long enough that the motion reads as "settling" rather than vibration.
const HOVER_OSC_AMP_PX = 2.2;
const HOVER_OSC_PERIOD_S = 2.6;

// Residual contact gap shown when the carriage cannot maintain a true
// hover but is still being fed pressure from below — represents the
// micro-pocket that drags along the strip rather than a hard contact.
// Tuned in screen pixels because the physics film thickness is zero in
// this regime; this value is purely visual.
const RESIDUAL_GAP_PX = 4;

// Visible strip window — cropped tightly around the carriage so the
// block dominates the canvas instead of being a dot in a sea of holes.
// `block + 100 mm` shows ~2-3 holes of context on each side at default
// pitch, which is enough to read the vent vs film distinction without
// zooming out. The min keeps very small carriages legible.
const VISIBLE_STRIP_MIN_MM = 180;
const STRIP_BUFFER_MM = 100; // total — 50 mm on each side of the block

// Gap exaggeration — at real scale (~1 mm) the hover film is sub-pixel.
// At the new zoom level pxPerMm ~ 4-5, so 36× exaggeration easily hits
// the clamp; the clamp itself is what reads on screen.
const GAP_EXAGGERATION = 36;
const GAP_PX_MAX = 70;
const GAP_PX_MIN = 14;

// Max particles in the pool. Larger pool lets the mist read as a haze
// rather than a sparse stream of dots, especially with the density slider
// turned up.
const PARTICLE_POOL_SIZE = 720;

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
  const [density, setDensity] = useState(1.4);
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
    const stripVisibleMm = Math.max(VISIBLE_STRIP_MIN_MM, inputs.blockLengthMm + STRIP_BUFFER_MM);
    const pxPerMm = (VB_W - MX * 2) / stripVisibleMm;
    const stripY = STRIP_Y;
    const stripH = STRIP_THICKNESS_PX;

    // Carriage sits on the air film *above* the strip. The visualisation
    // models a continuous transition: when the model says we just float
    // we draw the calculated hover; when the model fails (mass exceeds
    // the lift the fan can sustain) we don't slam the carriage flush
    // against the strip — in reality a small residual pocket persists
    // for a while and the carriage drags rather than scrapes. The
    // residual gap shown is purely visual; physics still reports h = 0.
    const blockW = inputs.blockLengthMm * pxPerMm;
    const blockH = Math.max(86, 4 * pxPerMm);
    const blockX = VB_W / 2 - blockW / 2;
    let gapPx;
    if (calc.floats) {
      gapPx = Math.max(
        GAP_PX_MIN,
        Math.min(GAP_PX_MAX, (calc.hoverHeightMm || 0.6) * GAP_EXAGGERATION * pxPerMm),
      );
    } else {
      // Smooth fall-off: how far below the float threshold are we?
      // headroom = 0% is the floor of "still floating"; -100% is fully
      // overcome. We map [-50, 0] → [residual, GAP_PX_MIN] so the gap
      // doesn't snap shut the moment headroom dips negative.
      const headroom = calc.pressureHeadroomPct ?? -100;
      const t = Math.min(1, Math.max(0, (headroom + 50) / 50)); // 0..1
      gapPx = RESIDUAL_GAP_PX + t * (GAP_PX_MIN - RESIDUAL_GAP_PX);
    }
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

  // Subtle hover bobbing — a small sinusoidal offset on the rendered gap
  // when the carriage is floating. Tracks elapsed sim time so it can be
  // paused with the controls and slowed/sped via the speed slider.
  const [hoverOscPx, setHoverOscPx] = useState(0);

  // Derived emission / velocity from model Q, P.
  const emission = useMemo(() => {
    const qHole = geom.holes.length > 0 ? calc.qOp / geom.holes.length : 0;
    // Hole exit velocity from Bernoulli.
    const vHole = Math.sqrt((2 * Math.max(0, calc.pOp)) / RHO);
    // Base emission per second per hole. The mist now spawns a small
    // burst per "tick" (see seedParticles) so this number is for ticks,
    // not raw particle counts — keep it modest.
    const emissionPerSec = 4 + Math.min(16, vHole / 4);
    // Film lateral velocity: order-of-magnitude from Q/(W·h).
    const hM = Math.max(0.0001, (calc.hoverHeightMm ?? 1) / 1000);
    const wM = inputs.blockWidthMm / 1000;
    const vFilm = (calc.qIntoGap ?? 0) / (wM * hM * 2); // split between two edges
    // Uncovered holes always vent to atmosphere from a still-pressurised
    // plenum, regardless of whether the carriage floats. So their flow
    // does NOT throttle when the carriage drops — only the covered
    // holes do, because their downstream pocket has partially collapsed.
    // Covered-hole flow scales smoothly with how far the headroom has
    // gone negative: at full headroom they pass freely; once the
    // pressure deficit exceeds ~50 % the seal is near-total and only a
    // trickle escapes around the carriage edge.
    const headroom = calc.pressureHeadroomPct ?? -100;
    const seal = Math.min(1, Math.max(0, -headroom / 50)); // 0..1, 1 = fully sealed
    const coveredFlowFactor = calc.floats ? 1 : Math.max(0.08, 1 - seal * 0.92);
    return { qHole, vHole, emissionPerSec, vFilm, coveredFlowFactor };
  }, [calc, inputs.blockWidthMm, geom.holes.length]);

  // Refs let the rAF loop read the *latest* dynamic values without the
  // effect itself having to re-subscribe. Without this, every slider
  // change re-runs the effect, resets `emitAccumulator`, and causes
  // visible flicker as the emission stream restarts mid-frame. Refs are
  // updated in a layout effect so the rAF always sees current values
  // before the next frame paints.
  const emissionRef = useRef(emission);
  const geomRef = useRef(geom);
  const densityRef = useRef(density);
  const speedRef = useRef(speed);
  useEffect(() => {
    emissionRef.current = emission;
    geomRef.current = geom;
    densityRef.current = density;
    speedRef.current = speed;
  });

  // Animation loop. Effect deps are intentionally minimal — only `paused`
  // and `pool`. Everything else flows in via refs so slider drags don't
  // tear down the rAF and reset particle emission.
  useEffect(() => {
    if (paused) return undefined;
    let raf = 0;
    let last = performance.now();
    let lastTick = last;
    let emitAccumulator = 0;
    let simTime = 0; // seconds of sim time accumulated while unpaused

    const step = (now) => {
      const e = emissionRef.current;
      const g = geomRef.current;
      const d = densityRef.current;
      const s = speedRef.current;
      const dtMs = Math.min(64, now - last);
      last = now;
      const dt = (dtMs / 1000) * s; // seconds of sim per frame
      simTime += dt;

      // Emit from covered holes (produce under-block flow) and uncovered
      // holes (produce vents / nearby capture streams). Each tick spawns
      // a small *burst* of particles around the chosen hole so the jet
      // reads as a turbulent mist column rather than a single thread.
      // Total emission rate depends only on the still-pressurised plenum,
      // not on whether the carriage is floating — uncovered holes
      // continue to vent freely regardless. Covered holes are filtered
      // probabilistically below so a sinking carriage gradually starves
      // the under-block plume.
      const burstSize = 3;
      emitAccumulator += e.emissionPerSec * d * dt * g.holes.length;
      while (emitAccumulator >= 1) {
        emitAccumulator -= 1;
        const h = g.holes[Math.floor(Math.random() * g.holes.length)];
        if (!h) break;
        // When the pocket has collapsed, covered holes barely leak —
        // probabilistically drop emissions from them so the visual
        // matches the physics (seal nearly complete).
        if (h.covered && Math.random() > e.coveredFlowFactor) continue;
        for (let b = 0; b < burstSize; b += 1) {
          const slot = pool.find((p) => !p.alive);
          if (!slot) break;
          seedParticle(slot, h, e, g, b / burstSize);
        }
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
        if (p.phase === 'jet' && p.y <= g.blockBottom - 1 && p.covered) {
          p.phase = 'film';
          const midX = g.blockX + g.blockW / 2;
          const toRight = p.x > midX;
          const vf = Math.min(10, Math.max(2, e.vFilm * 40));
          p.vx = toRight ? vf : -vf;
          p.vy = (Math.random() - 0.5) * 0.3;
        }
        // Once past the block edge in the film, vent into atmosphere.
        if (p.phase === 'film' && (p.x < g.blockX - 2 || p.x > g.blockX + g.blockW + 2)) {
          p.phase = 'vent';
          p.vy = 0.4 + Math.random() * 0.4; // drift *down* slightly toward the strip surface
          p.vx *= 0.6;
          p.life = Math.min(p.life, p.age + 0.9);
        }
        // Jet particles from UNCOVERED holes vent to atmosphere directly.
        if (p.phase === 'jet' && !p.covered && p.y < g.stripY - 40) {
          p.phase = 'vent';
          p.vy *= 0.4;
          p.life = Math.min(p.life, p.age + 0.8);
        }
        // Off-canvas cleanup.
        if (p.x < -10 || p.x > VB_W + 10 || p.y < -10 || p.y > VB_H + 10) p.alive = false;
      }

      // Throttled snapshot at ~20 Hz — copy the mutable pool into
      // state so the render reads from state, not the ref. Bobbing
      // offset is computed from the unpaused simTime so it stops with
      // the controls and tracks the speed slider.
      if (now - lastTick > 48) {
        lastTick = now;
        setSnapshot(pool.slice());
        const phase = (2 * Math.PI * simTime) / HOVER_OSC_PERIOD_S;
        setHoverOscPx(Math.sin(phase) * HOVER_OSC_AMP_PX);
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [paused, pool]);

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
          {/* Impeller spin — the blower's inner cross uses this animation
              so it visually rotates like a real centrifugal fan. The
              speed slider scales the period; pause halts it. */}
          <style>{`
            @keyframes rigviz-impeller-spin {
              from { transform: rotate(0deg); }
              to { transform: rotate(360deg); }
            }
          `}</style>
        </defs>

        {/* Atmosphere background */}
        <rect x="0" y="0" width={VB_W} height={h} fill={surface} />

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
        <Blower
          accent={warm}
          label={fg}
          centreY={(geom.plenumTop + geom.plenumBottom) / 2}
          paused={paused}
          speed={speed}
        />
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

        {/* Under-block film (between top of strip and bottom of carriage).
            Idle bobbing offset shifts the film top with the carriage so
            the film visually stretches/compresses as the carriage moves. */}
        {showPressure && calc.floats && (
          <rect
            x={geom.blockX}
            y={geom.blockBottom - hoverOscPx}
            width={geom.blockW}
            height={geom.gapPx + hoverOscPx}
            fill="url(#rigviz-film-gradient)"
            opacity="0.9"
          />
        )}

        {/* Particles rendered as a gas/steam plume — puffs grow and fade
            with age, all filtered through a gaussian blur so the group
            reads as a continuous haze rather than a cloud of dots.
            Drawn BEFORE the carriage so the carriage's opaque rect
            paints over any particle that drifts inside its footprint —
            the carriage reads as a solid sectioned block, not a
            translucent shape with gas passing through it. */}
        {showParticles && (
          <g filter="url(#rigviz-steam-blur)">
            {snapshot.map((p, i) => {
              if (!p.alive) return null;
              const ageRatio = Math.min(1, p.age / p.life);
              const r = 1.8 + ageRatio * 4.4 + (p.phase === 'vent' ? 0.8 : 0);
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

        {/* Carriage — vertical position bobs subtly when floating to
            convey the live-system feel of a real air bearing settling.
            Opaque fill so it occludes any gas particles drawn underneath
            it (see note on the particle layer above). */}
        <g>
          <rect
            x={geom.blockX}
            y={geom.blockY - (calc.floats ? hoverOscPx : 0)}
            width={geom.blockW}
            height={geom.blockH}
            rx="3"
            fill={surface}
            stroke={fg}
            strokeWidth="1.5"
          />
          <text
            x={geom.blockX + geom.blockW / 2}
            y={geom.blockY + geom.blockH / 2 + 6 - (calc.floats ? hoverOscPx : 0)}
            textAnchor="middle"
            fontSize="16"
            fill={fg}
            fontWeight="600"
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
            y={(geom.blockBottom + geom.stripY) / 2 + 5}
            fontSize="14"
            fill={fg}
            fontWeight="700"
          >
            h = {(calc.hoverHeightMm ?? 0).toFixed(2)} mm
          </text>
        </g>

        {/* Pressure value labels */}
        <g style={{ pointerEvents: 'none' }}>
          {/* Plenum pressure — vertically centred in the plenum band so
              it sits visually within the volume it describes, with a
              soft pill backing so the particle haze can't wash it out. */}
          {(() => {
            const plenumMidY = (geom.plenumTop + geom.plenumBottom) / 2;
            const pillW = 240;
            const pillH = 70;
            return (
              <g>
                <rect
                  x={VB_W / 2 - pillW / 2}
                  y={plenumMidY - pillH / 2}
                  width={pillW}
                  height={pillH}
                  rx="10"
                  fill={surface}
                  stroke={accent}
                  strokeOpacity="0.5"
                  strokeWidth="1"
                  opacity="0.94"
                />
                <text
                  x={VB_W / 2}
                  y={plenumMidY - 10}
                  fontSize="11"
                  fill={muted}
                  textAnchor="middle"
                  letterSpacing="1"
                  fontWeight="700"
                >
                  PLENUM PRESSURE
                </text>
                <text
                  x={VB_W / 2}
                  y={plenumMidY + 18}
                  fontSize="24"
                  fill={fg}
                  textAnchor="middle"
                  fontWeight="700"
                >
                  P = {Math.round(calc.pOp)} Pa
                </text>
              </g>
            );
          })()}
          {/* Film pressure sits IN the exaggerated gap — only when the
              gap is tall enough to fit the text, otherwise we drop the
              label and rely on the hover callout. */}
          {calc.floats && geom.gapPx >= 18 && (
            <text
              x={geom.blockX + geom.blockW / 2}
              y={geom.blockBottom + geom.gapPx / 2 + 5}
              fontSize="13"
              textAnchor="middle"
              fill={accent}
              fontWeight="700"
            >
              film P = {Math.round(calc.pRequired)} Pa
            </text>
          )}
        </g>

        {/* Force-balance side panel — rendered AFTER the particle plume
            so the gas haze can't wash out the values. Two stacked cards
            (Weight on top, Lift below) with a Floats / Sinks status
            banner. */}
        <ForceBoxes
          calc={calc}
          fg={fg}
          muted={muted}
          danger={danger}
          success={success}
          border={border}
          panelBg={panelBg}
        />

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

        {/* Live-metrics rail — five cards at the bottom of the canvas:
            four operating-point readouts and one colour-legend card. The
            cards are pure SVG (no DOM overlays) so they scale with the
            zoomable viewBox and screenshot cleanly. */}
        <MetricsRail
          calc={calc}
          inputs={inputs}
          y={h - 130}
          theme={{ fg, muted, accent, warm, success, danger, border, panelBg }}
        />

        {/* Hover-for-equation hint — kept since the hotspots aren't
            visually obvious. The "not to scale" caveat was removed: at
            this aspect ratio readers immediately see the gap is
            illustrative, and stating an exaggeration factor is
            meaningless without knowing the viewer's display size. */}
        <text
          x={RAIL_MX}
          y={h - 12}
          fontSize="11"
          fill={muted}
          fontStyle="italic"
          style={{ pointerEvents: 'none' }}
        >
          hover any region for its equation and live values
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
            style={{ width: 70 }}
          />
          <span style={{ width: 32, textAlign: 'right' }}>{speed.toFixed(2)}×</span>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ color: muted }}>density</span>
          <input
            type="range"
            min={0.5}
            max={3}
            step={0.25}
            value={density}
            onChange={(e) => setDensity(Number(e.target.value))}
            style={{ width: 70 }}
          />
          <span style={{ width: 32, textAlign: 'right' }}>{density.toFixed(2)}×</span>
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

function Blower({ accent, label, centreY, paused = false, speed = 1 }) {
  // Substantial centrifugal-fan glyph that lives in its own column on
  // the left of the canvas, well clear of the U-channel wall (MX). The
  // duct then carries the air across the gap into the plenum, which
  // reads as "supply ➜ rig" rather than "blob touching wall".
  const r = 38;
  const cx = r + 6;
  const cy = centreY ?? 280;
  // Tie spin period to the speed slider — clamp to a range that's
  // visibly spinning but never fast enough to alias into a blur.
  const period = Math.max(0.35, 1.1 / Math.max(0.25, speed));
  return (
    <g>
      {/* Housing — outer disc + a thicker inner annulus reads as a real
          centrifugal blower volute rather than just a coloured circle. */}
      <circle cx={cx} cy={cy} r={r} fill={accent} opacity="0.92" />
      <circle cx={cx} cy={cy} r={r - 4} fill="none" stroke="#fff" strokeWidth="1.5" opacity="0.6" />
      <circle
        cx={cx}
        cy={cy}
        r={r - 11}
        fill="none"
        stroke="#fff"
        strokeWidth="1.3"
        opacity="0.85"
      />
      {/* Impeller: drawn at local origin and rotated by CSS animation.
          Six straight blades scaled to the new larger radius. */}
      <g transform={`translate(${cx} ${cy})`}>
        <g
          style={{
            animation: `rigviz-impeller-spin ${period}s linear infinite`,
            animationPlayState: paused ? 'paused' : 'running',
            transformOrigin: '0 0',
          }}
        >
          <path
            d="M0,-22 L0,22 M-22,0 L22,0 M-15.6,-15.6 L15.6,15.6 M15.6,-15.6 L-15.6,15.6"
            stroke="#fff"
            strokeWidth="1.8"
            opacity="0.95"
          />
          <circle r="3.5" fill="#fff" opacity="0.95" />
        </g>
      </g>
      <text x={cx} y={cy + r + 16} textAnchor="middle" fontSize="13" fill={label} fontWeight="600">
        Blower
      </text>
    </g>
  );
}

function Duct({ accent, targetY }) {
  // Start just outside the blower housing and push the arrowhead past
  // the U-channel wall so the inlet flare is unmistakable. The visible
  // duct length is now substantial because the blower has its own
  // column on the left of the canvas, separated from the plenum.
  const startX = 88;
  const endX = MX + 30;
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
 * Force-balance side panel: two stacked cards in the upper-right of the
 * SVG that show the carriage weight (down, red) and the film lift force
 * (up, green) with their values, plus a status banner reporting the
 * float state. Pulled out of the diagram itself because the in-line
 * free-body arrows clashed with the carriage label and the dimension
 * tick marks at the larger zoom level.
 */
function ForceBoxes({ calc, fg, muted, danger, success, border, panelBg }) {
  const wN = Math.max(0, calc.force ?? 0);
  const fN = Math.max(0, calc.maxLiftForce ?? 0);

  const cards = [
    {
      title: 'Weight (W)',
      formula: 'W = m · g',
      value: fmtN(wN),
      colour: danger,
      arrow: 'down',
    },
    {
      title: 'Lift (F = P · A)',
      formula: 'F = P_op · A_block',
      value: fmtN(fN),
      colour: success,
      arrow: 'up',
    },
  ];

  return (
    <g style={{ pointerEvents: 'none' }}>
      {cards.map((c, i) => {
        const x = FORCE_BOX_X;
        const y = FORCE_BOX_Y + i * (FORCE_BOX_H + FORCE_BOX_GAP);
        const arrowMid = y + FORCE_BOX_H / 2;
        const arrowHead = c.arrow === 'down' ? arrowMid + 16 : arrowMid - 16;
        const arrowTail = c.arrow === 'down' ? arrowMid - 16 : arrowMid + 16;
        const markerId = c.arrow === 'down' ? 'rigviz-arrow-down' : 'rigviz-arrow-up';
        return (
          <g key={c.title}>
            <rect
              x={x}
              y={y}
              width={FORCE_BOX_W}
              height={FORCE_BOX_H}
              rx="8"
              fill={panelBg}
              stroke={c.colour}
              strokeWidth="1.5"
              opacity="0.96"
            />
            {/* Coloured stripe on the left edge keeps the up/down sense
                obvious even at a glance. */}
            <rect x={x} y={y} width="4" height={FORCE_BOX_H} rx="2" fill={c.colour} />
            {/* Arrow column on the left, 36 px in from the stripe. */}
            <line
              x1={x + 36}
              y1={arrowTail}
              x2={x + 36}
              y2={arrowHead}
              stroke={c.colour}
              strokeWidth="3.2"
              markerEnd={`url(#${markerId})`}
            />
            <text
              x={x + 64}
              y={y + 22}
              fontSize="11"
              fill={muted}
              fontWeight="700"
              letterSpacing="0.4"
            >
              {c.title.toUpperCase()}
            </text>
            <text x={x + 64} y={y + 46} fontSize="20" fill={fg} fontWeight="700">
              {c.value}
            </text>
            <text
              x={x + 64}
              y={y + 64}
              fontSize="11"
              fill={muted}
              fontFamily="ui-monospace, Menlo, monospace"
            >
              {c.formula}
            </text>
          </g>
        );
      })}

      {/* Border stroke around the whole panel area helps it read as a
          single grouped UI element rather than scattered shapes. The
          float / headroom status banner that previously sat below the
          two cards was removed because the same information is in the
          page-header status row (STATUS + HEADROOM columns). */}
      <rect
        x={FORCE_BOX_X - 12}
        y={FORCE_BOX_Y - 16}
        width={FORCE_BOX_W + 24}
        height={2 * FORCE_BOX_H + FORCE_BOX_GAP + 30}
        rx="12"
        fill="none"
        stroke={border}
        strokeWidth="1"
        strokeDasharray="3 4"
        opacity="0.55"
      />
    </g>
  );
}

function fmtN(n) {
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 10) return `${n.toFixed(1)} N`;
  return `${n.toFixed(2)} N`;
}

/**
 * Live operating-point readouts at the bottom of the diagram. Five
 * equal-width cards: four metric tiles + one colour legend. Cards are
 * SVG-native so the whole rail scales with the viewBox.
 */
function MetricsRail({ calc, inputs, y, theme }) {
  const { fg, muted, accent, warm, success, danger, border, panelBg } = theme;
  // Rail uses its own (smaller) margin so the readout cards span almost
  // the full canvas width — independent of the rig diagram's MX above.
  const G_X = RAIL_MX;
  const W_AVAIL = VB_W - RAIL_MX * 2;
  const N = 5;
  const gap = 10;
  const cardW = (W_AVAIL - gap * (N - 1)) / N;
  const cardH = 100;

  const qOpM3h = (calc.qOp ?? 0) * 3600;
  const qFreeBlowM3h = (calc.qMax ?? 0) * 3600;
  const qFraction = qFreeBlowM3h > 0 ? (qOpM3h / qFreeBlowM3h) * 100 : 0;
  // Threshold mass: lift force at the operating point divided by g.
  const thresholdKg = (calc.maxLiftForce ?? 0) / 9.81;
  // Power budget = aero efficiency × electrical rating.
  const powerBudget =
    (inputs.fanAeroEff ?? inputs.fanAeroEfficiency ?? 0.2) * (inputs.fanWatts ?? 1);
  const powerUsedPct =
    powerBudget > 0 ? Math.min(999, ((calc.aeroPower ?? 0) / powerBudget) * 100) : 0;

  const cards = [
    {
      label: 'Plenum P',
      value: `${Math.round(calc.pOp ?? 0)} Pa`,
      sub: `${((calc.pOp ?? 0) / 98.0665).toFixed(1)} cmH₂O`,
      colour: accent,
    },
    {
      label: 'Flow Q',
      value: `${Math.round(qOpM3h)} m³/h`,
      sub: `${qFraction.toFixed(0)}% of free-blow`,
      colour: success,
    },
    {
      label: 'Lift capacity',
      value: fmtN(calc.maxLiftForce ?? 0),
      sub: `${thresholdKg.toFixed(2)} kg max`,
      colour: calc.floats ? success : danger,
    },
    {
      label: 'Aero power',
      value: `${Math.round(calc.aeroPower ?? 0)} W`,
      sub: `${powerUsedPct.toFixed(0)}% of ${Math.round(powerBudget)} W budget`,
      colour: warm,
    },
  ];

  return (
    <g style={{ pointerEvents: 'none' }}>
      {cards.map((c, i) => {
        const x = G_X + i * (cardW + gap);
        return (
          <g key={c.label} transform={`translate(${x} ${y})`}>
            <rect
              width={cardW}
              height={cardH}
              rx="8"
              fill={panelBg}
              stroke={border}
              strokeWidth="1"
              opacity="0.95"
            />
            {/* Coloured accent stripe along the top of each card. */}
            <rect width={cardW} height="3" rx="1.5" fill={c.colour} opacity="0.9" />
            <text x="14" y="26" fontSize="11" fill={muted} fontWeight="600" letterSpacing="0.5">
              {c.label.toUpperCase()}
            </text>
            <text x="14" y="58" fontSize="22" fill={fg} fontWeight="700">
              {c.value}
            </text>
            <text x="14" y="80" fontSize="11" fill={muted}>
              {c.sub}
            </text>
          </g>
        );
      })}
      {/* Legend card — last cell of the rail */}
      <g transform={`translate(${G_X + 4 * (cardW + gap)} ${y})`}>
        <rect
          width={cardW}
          height={cardH}
          rx="8"
          fill={panelBg}
          stroke={border}
          strokeWidth="1"
          opacity="0.95"
        />
        <rect width={cardW} height="3" rx="1.5" fill={muted} opacity="0.6" />
        <text x="14" y="26" fontSize="11" fill={muted} fontWeight="600" letterSpacing="0.5">
          LEGEND
        </text>
        <circle cx="22" cy="44" r="4" fill={success} />
        <text x="34" y="48" fontSize="11" fill={fg}>
          under-block film
        </text>
        <circle cx="22" cy="62" r="4" fill={warm} />
        <text x="34" y="66" fontSize="11" fill={fg}>
          vented (wasted)
        </text>
        <circle cx="22" cy="80" r="4" fill={accent} />
        <text x="34" y="84" fontSize="11" fill={fg}>
          lateral film flow
        </text>
      </g>
    </g>
  );
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

function seedParticle(p, hole, emission, geom, burstFraction = 0) {
  p.alive = true;
  // Wider lateral spawn so the jet emerges as a fan/mist instead of a
  // pencil-thin line. Bumped at the new zoom level (pxPerMm ~4) so the
  // spray visibly spreads several mm rather than just a hole's width.
  const lateralOffset = (Math.random() - 0.5) * 22 + (burstFraction - 0.5) * 14;
  p.x = hole.x + lateralOffset;
  // Particles originate at the TOP surface of the strip (the side the
  // carriage sits on) and move UP into the film / atmosphere. The
  // plenum is below the strip — we only render the exit side.
  p.y = geom.stripY - 1 + Math.random() * 0.6;
  const vBase = Math.max(2, Math.min(8, emission.vHole / 6));
  // Jet fan: lateral velocity scales with how far off-axis we spawned,
  // plus a healthy random component so off-axis particles really spray
  // outward and the plume reads as a wide cone.
  p.vx = lateralOffset * 0.3 + (Math.random() - 0.5) * 3.0;
  p.vy = -vBase * (0.85 + Math.random() * 0.3);
  p.age = 0;
  // Longer life lets the spray reach further before fading, which now
  // matters because each particle has further to travel at the zoom-in.
  p.life = hole.covered ? 2.8 : 1.6;
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
      x: 0,
      y: plenumCentreY - 44,
      w: 88,
      h: 96,
      refs: [17, 4],
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
      x: 88,
      y: plenumCentreY - 14,
      w: MX - 58,
      h: 28,
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
      refs: [16, 9],
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
