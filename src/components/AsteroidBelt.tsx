import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildFactPool, pickNextFact } from '../game/facts';
import { getLevelConfig } from '../game/levels';
import { buildRow, clearsNeeded, LANES, rowDuration, type Row } from '../game/asteroidBelt';
import { bump, kick } from '../game/flight';
import { useGameStore } from '../game/useGameStore';
import { sfx } from '../audio/sfx';
import { useT } from '../i18n/useLang';
import { rocketSvg } from './scene/illustrations';
import { colorForLevel } from './scene/palette';
import GradientText from './reactbits/GradientText';

interface Props {
  level: number;
  onComplete: () => void;
  onBurst: (x: number, y: number, color: string, scale?: number) => void;
}

type Phase = 'intro' | 'playing' | 'breakout';
type RowStatus = 'incoming' | 'cleared' | 'hit';

interface Shot {
  id: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
  hit: boolean;
}

// ---- timings (ms) ----
const INTRO_MS = 2400;
const SHOT_TRAVEL_MS = 150;
const SHOT_COOLDOWN_MS = 320;
const AFTER_CLEAR_MS = 1000;
const AFTER_HIT_MS = 1600;
const BREAKOUT_MS = 2400;
const WRONG_HINT_MS = 1600;

// ---- field geometry (fractions of the viewport) ----
const HORIZON_Y = 0.26; // where rows appear
const IMPACT_Y = 0.62; // where a row reaches the ship's prism
const SHIP_Y = 0.79;
const FIELD_MAX_W = 920;
const PASS_P = 1.35; // cleared rows keep flying past the ship until here

function useViewport() {
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return size;
}

// Deterministic jagged outline per rock, so it doesn't re-randomize on
// every frame's re-render.
function rockPath(seed: number): string {
  let s = seed * 9301 + 49297;
  const rand = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const points = 11;
  const pts: string[] = [];
  for (let i = 0; i < points; i++) {
    const a = (i / points) * Math.PI * 2;
    const r = 0.8 + rand() * 0.2;
    pts.push(`${(Math.cos(a) * r).toFixed(3)},${(Math.sin(a) * r).toFixed(3)}`);
  }
  return `M${pts.join('L')}Z`;
}

const ROCK_TINTS = ['#9c8574', '#8d8a96', '#a3876a', '#7f8c8a'];
const RAY_COLORS = ['#ff6ad5', '#ffd77a', '#6ad7ff'];
const CHIPS = Array.from({ length: 9 }, (_, i) => {
  const a = (i / 9) * Math.PI * 2 + 0.3;
  return { dx: Math.cos(a), dy: Math.sin(a), r: 0.12 + (i % 3) * 0.05 };
});

export function AsteroidBelt({ level, onComplete, onBurst }: Props) {
  const t = useT();
  const { w, h } = useViewport();
  const needed = useMemo(() => clearsNeeded(level), [level]);
  const rocketSrc = useMemo(
    () => `data:image/svg+xml;utf8,${encodeURIComponent(rocketSvg(colorForLevel(level)))}`,
    [level],
  );

  const [phase, setPhase] = useState<Phase>('intro');
  const [row, setRow] = useState<Row | null>(null);
  const [status, setStatus] = useState<RowStatus>('incoming');
  const [lane, setLane] = useState(1);
  const [clears, setClears] = useState(0);
  const [missedLane, setMissedLane] = useState<number | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [wrongHint, setWrongHint] = useState(false);
  const [shots, setShots] = useState<Shot[]>([]);
  const [, setFrame] = useState(0);

  // Timing lives in refs: it's read every animation frame.
  const rowStart = useRef(0);
  const rowMs = useRef(rowDuration(0, false));
  const statusAt = useRef(0);
  const missedThisRow = useRef(false);
  const consecutive = useRef(0);
  const lastShot = useRef(0);
  const nextId = useRef(1);
  const timers = useRef<number[]>([]);
  // Drawn ship position, eased toward its lane each frame (so what's drawn,
  // where the laser leaves from, and the bank angle all agree).
  const shipDrawX = useRef<number | null>(null);
  const lastFrame = useRef(performance.now());

  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  }, []);
  useEffect(() => () => timers.current.forEach(window.clearTimeout), []);

  // ---- geometry helpers (pixels) ----
  const fieldW = Math.min(w, FIELD_MAX_W);
  const fieldLeft = (w - fieldW) / 2;
  const laneX = (i: number) => fieldLeft + fieldW * (0.125 + 0.25 * i);
  const rockMax = Math.min(fieldW * 0.2, 150);
  const progressOf = (now: number) => (now - rowStart.current) / rowMs.current;
  const rockAt = (i: number, p: number) => {
    const eased = Math.pow(Math.min(p, PASS_P), 1.35); // speeds up as it nears: perspective
    const cx = w / 2;
    const x = cx + (laneX(i) - cx) * (0.25 + 0.75 * Math.min(eased, 1.2));
    const y = h * (HORIZON_Y + (IMPACT_Y - HORIZON_Y) * eased);
    const size = rockMax * (0.28 + 0.72 * Math.min(eased, 1.25));
    return { x, y, size };
  };
  const targetShipX = laneX(lane);
  const frameNow = performance.now();
  // Loose cap: on slow devices the slide should still finish in real time.
  const frameDt = Math.min(0.25, (frameNow - lastFrame.current) / 1000);
  lastFrame.current = frameNow;
  if (shipDrawX.current === null) shipDrawX.current = targetShipX;
  const prevShipX = shipDrawX.current;
  shipDrawX.current += (targetShipX - shipDrawX.current) * (1 - Math.exp(-18 * frameDt));
  if (Math.abs(targetShipX - shipDrawX.current) < 0.5) shipDrawX.current = targetShipX;
  const shipX = shipDrawX.current;
  const bank = Math.max(-18, Math.min(18, ((shipX - prevShipX) / Math.max(frameDt, 0.001)) * 0.02));
  const shipY = h * SHIP_Y;
  const prismY = shipY - Math.min(110, h * 0.13);

  // ---- rows ----
  const spawnRow = useCallback(() => {
    const { progress } = useGameStore.getState();
    const cfg = getLevelConfig(progress.level);
    const pool = buildFactPool(cfg.factorRange[0], cfg.factorRange[1]);
    const fact = pickNextFact(pool, progress.mastery, row?.factKey);
    const next = buildRow(nextId.current++, fact);
    missedThisRow.current = false;
    rowMs.current = rowDuration(consecutive.current, false);
    rowStart.current = performance.now();
    setRow(next);
    setStatus('incoming');
    setMissedLane(null);
    setShowAnswer(false);
  }, [row?.factKey]);

  // intro → first row
  useEffect(() => {
    const id = window.setTimeout(() => {
      setPhase('playing');
      spawnRow();
    }, INTRO_MS);
    return () => window.clearTimeout(id);
    // once, on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const recordMiss = useCallback(() => {
    if (!row || missedThisRow.current) return;
    missedThisRow.current = true;
    consecutive.current = 0;
    useGameStore.getState().recordBeltAnswer(row.factKey, false);
  }, [row]);

  const advance = useCallback(
    (clearsNow: number) => {
      if (clearsNow >= needed) {
        setPhase('breakout');
        setRow(null);
        sfx.milestone(15);
        kick(1.1);
        for (let i = 0; i < 10; i++) {
          later(
            () => onBurst(w * (0.15 + Math.random() * 0.7), h * (0.2 + Math.random() * 0.45), RAY_COLORS[i % 3], 3 + Math.random() * 2),
            i * 120,
          );
        }
        later(onComplete, BREAKOUT_MS);
      } else {
        spawnRow();
      }
    },
    [needed, later, onBurst, onComplete, spawnRow, w, h],
  );

  // ---- the frame loop: move rocks, detect a row reaching the ship ----
  useEffect(() => {
    if (phase !== 'playing') return;
    let raf = 0;
    const loop = () => {
      const now = performance.now();
      if (row && status === 'incoming' && progressOf(now) >= 1) {
        setStatus('hit');
        statusAt.current = now;
        setShowAnswer(true);
        sfx.impact();
        bump();
        recordMiss();
        later(spawnRow, AFTER_HIT_MS);
      }
      setFrame((f) => (f + 1) % 1_000_000);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase, row, status, recordMiss, spawnRow, later]);

  // Outside the playing phase nothing else re-renders per frame, so keep the
  // ship's steering animation running on its own while it's still moving.
  useEffect(() => {
    if (phase === 'playing') return;
    let raf = 0;
    const loop = () => {
      setFrame((f) => (f + 1) % 1_000_000);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  // ---- controls ----
  const steer = useCallback((dir: -1 | 1) => {
    setLane((l) => Math.max(0, Math.min(LANES - 1, l + dir)));
  }, []);

  const fire = useCallback(() => {
    const now = performance.now();
    if (phase !== 'playing' || !row || status !== 'incoming') return;
    if (now - lastShot.current < SHOT_COOLDOWN_MS) return;
    lastShot.current = now;
    const target = rockAt(lane, progressOf(now));
    const hit = lane === row.correctLane;
    const shot: Shot = { id: now, from: { x: shipX, y: prismY }, to: { x: target.x, y: target.y }, hit };
    setShots((s) => [...s, shot]);
    later(() => setShots((s) => s.filter((x) => x.id !== shot.id)), 420);
    sfx.laser();

    later(() => {
      if (hit) {
        const clearsNow = clears + 1;
        setClears(clearsNow);
        setStatus('cleared');
        statusAt.current = performance.now();
        consecutive.current += 1;
        if (!missedThisRow.current) useGameStore.getState().recordBeltAnswer(row.factKey, true);
        sfx.explode(clearsNow);
        kick(0.35);
        onBurst(target.x, target.y, '#ffd77a', 3.5);
        later(() => onBurst(target.x, target.y, '#ff6ad5', 2.5), 90);
        later(() => advance(clearsNow), AFTER_CLEAR_MS);
      } else {
        sfx.deflect();
        bump();
        setMissedLane(row.correctLane);
        setWrongHint(true);
        later(() => setWrongHint(false), WRONG_HINT_MS);
        // Give extra time to steer to the right rock, without the row jumping:
        // keep the current progress and stretch what's left of it.
        if (!missedThisRow.current) {
          const p = progressOf(performance.now());
          rowMs.current = rowDuration(consecutive.current, true);
          rowStart.current = performance.now() - p * rowMs.current;
        }
        recordMiss();
      }
    }, SHOT_TRAVEL_MS);
    // rockAt/progressOf derive from refs and layout
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, row, status, lane, clears, shipX, prismY, later, onBurst, advance, recordMiss]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key;
      if (k === 'ArrowLeft' || k === 'a' || k === 'A') steer(-1);
      else if (k === 'ArrowRight' || k === 'd' || k === 'D') steer(1);
      else if (k === ' ' || k === 'Enter' || k === 'ArrowUp' || k === 'w' || k === 'W') fire();
      else return;
      e.preventDefault();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [steer, fire]);

  // ---- render ----
  const now = performance.now();
  const p = row ? progressOf(now) : 0;
  const passP = status === 'incoming' ? p : Math.min(PASS_P, p + (now - statusAt.current) / 900);

  return (
    <div className="belt" dir="ltr">
      <div className="belt-header" dir="auto">
        <span className="belt-title">☄️ {t.beltTitle}</span>
        <span className="belt-progress">
          {Array.from({ length: needed }, (_, i) => (
            <span key={i} className={`belt-pip ${i < clears ? 'is-on' : ''}`} />
          ))}
          <span className="belt-progress-text">{t.beltProgress(clears, needed)}</span>
        </span>
        {showAnswer && row && (
          <bdi dir="ltr" className="belt-answer">
            {t.beltAnswerWas(row.x, row.y, row.x * row.y)}
          </bdi>
        )}
        {wrongHint && !showAnswer && <span className="belt-hint">{t.beltWrongLane}</span>}
      </div>

      {phase === 'intro' && (
        <div className="belt-intro">
          <GradientText className="belt-intro-title" colors={['#ffd77a', '#ff9d76', '#c9a4de', '#ffd77a']} animationSpeed={3}>
            ☄️ {t.beltTitle}
          </GradientText>
          <div className="belt-intro-text" dir="auto">{t.beltIntro}</div>
          <div className="belt-intro-keys" dir="auto">{t.beltKeys}</div>
        </div>
      )}

      {phase === 'breakout' && (
        <div className="belt-intro belt-breakout">
          <GradientText className="belt-intro-title" colors={['#7ee08f', '#6ad7ff', '#ff6ad5', '#7ee08f']} animationSpeed={2}>
            {t.beltBreakout}
          </GradientText>
        </div>
      )}

      {/* lane guides converging to the horizon */}
      <svg className="belt-lanes" width={w} height={h}>
        {Array.from({ length: LANES + 1 }, (_, i) => {
          const bx = fieldLeft + fieldW * (i / LANES);
          const tx = w / 2 + (bx - w / 2) * 0.25;
          return <line key={i} x1={tx} y1={h * HORIZON_Y} x2={bx} y2={h * 0.96} />;
        })}
      </svg>

      {row &&
        row.values.map((value, i) => {
          const pos = rockAt(i, status === 'incoming' ? p : passP);
          const exploding = status === 'cleared' && i === row.correctLane;
          const passing = status !== 'incoming' && !exploding;
          const glow = missedLane === i || (status === 'hit' && i === row.correctLane);
          const style = {
            left: pos.x,
            top: pos.y,
            width: pos.size,
            height: pos.size,
            opacity: passing ? Math.max(0, 1 - (passP - 1) / (PASS_P - 1)) : 1,
          };
          return (
            <div
              key={`${row.id}-${i}`}
              className={`rock ${exploding ? 'is-exploding' : ''} ${glow ? 'is-answer' : ''}`}
              style={style}
            >
              {!exploding && (
                <svg className="rock-shape" viewBox="-1.1 -1.1 2.2 2.2" style={{ animationDuration: `${7 + i * 2}s` }}>
                  <defs>
                    <radialGradient id={`rg-${row.id}-${i}`} cx="35%" cy="30%" r="80%">
                      <stop offset="0%" stopColor="#d9c8b4" />
                      <stop offset="55%" stopColor={ROCK_TINTS[i % ROCK_TINTS.length]} />
                      <stop offset="100%" stopColor="#4a3d36" />
                    </radialGradient>
                  </defs>
                  <path d={rockPath(row.id * 10 + i)} fill={`url(#rg-${row.id}-${i})`} stroke="#2b2033" strokeWidth="0.07" strokeLinejoin="round" />
                  <circle cx="-0.32" cy="-0.2" r="0.14" fill="#00000030" />
                  <circle cx="0.35" cy="0.3" r="0.1" fill="#00000030" />
                  <circle cx="0.1" cy="-0.45" r="0.07" fill="#00000030" />
                </svg>
              )}
              {exploding &&
                CHIPS.map((c, k) => (
                  <span
                    key={k}
                    className="rock-chip"
                    style={
                      {
                        '--dx': `${c.dx * pos.size * 1.4}px`,
                        '--dy': `${c.dy * pos.size * 1.4}px`,
                        width: pos.size * c.r * 2,
                        height: pos.size * c.r * 2,
                        background: ROCK_TINTS[k % ROCK_TINTS.length],
                      } as React.CSSProperties
                    }
                  />
                ))}
              <span className="rock-number" style={{ fontSize: Math.max(14, pos.size * 0.34) }}>
                {value}
              </span>
            </div>
          );
        })}

      {/* laser: ship → prism, then three spectral rays fanning onto the target */}
      <svg className="belt-shots" width={w} height={h}>
        {shots.map((s) => (
          <g key={s.id} className={`shot ${s.hit ? 'is-hit' : 'is-deflect'}`}>
            <line x1={shipX} y1={shipY - 30} x2={s.from.x} y2={s.from.y + 10} stroke="#ffffff" strokeWidth={5} />
            {RAY_COLORS.map((color, k) => (
              <line
                key={k}
                x1={s.from.x + (k - 1) * 6}
                y1={s.from.y - 26}
                x2={s.to.x + (k - 1) * 14}
                y2={s.to.y}
                stroke={color}
                strokeWidth={4}
              />
            ))}
          </g>
        ))}
      </svg>

      {/* the ship, its prism (holding the drill), and touch controls */}
      <div
        className="belt-ship"
        style={{ left: shipX, top: shipY, transform: `translate(-50%, -50%) rotate(${bank}deg)` }}
        onClick={fire}
        role="button"
        aria-label={t.fire}
      >
        <img src={rocketSrc} alt="" />
      </div>
      <div className="belt-prism" style={{ left: shipX, top: prismY }}>
        <svg viewBox="0 0 160 110" className="belt-prism-glass">
          <defs>
            <linearGradient id="prism-g" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.55" />
              <stop offset="45%" stopColor="#b18cff" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#6ad7ff" stopOpacity="0.45" />
            </linearGradient>
          </defs>
          <path d="M80 4 L156 104 L4 104 Z" fill="url(#prism-g)" stroke="#e8e0ff" strokeWidth="3" strokeLinejoin="round" />
        </svg>
        {row && phase === 'playing' && (
          <span className="belt-prism-drill">
            {row.x} × {row.y}
          </span>
        )}
      </div>

      <div className="belt-controls">
        <button type="button" className="belt-btn" onClick={() => steer(-1)} aria-label={t.steerLeft}>
          ◀
        </button>
        <button type="button" className="belt-btn belt-fire" onClick={fire} aria-label={t.fire}>
          🔥 {t.fire}
        </button>
        <button type="button" className="belt-btn" onClick={() => steer(1)} aria-label={t.steerRight}>
          ▶
        </button>
      </div>
    </div>
  );
}
