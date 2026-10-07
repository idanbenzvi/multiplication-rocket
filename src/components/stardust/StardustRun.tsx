import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { gameNow, gameTimeout, usePause } from '../../game/gameClock';
import { useGameStore } from '../../game/useGameStore';
import { getLevelConfig } from '../../game/levels';
import { buildStardust, tablePattern } from '../../game/bonusRounds';
import { sfx } from '../../audio/sfx';
import { haptics } from '../../audio/haptics';
import { useT } from '../../i18n/useLang';
import type { Strings } from '../../i18n/strings';
import { useProfiles } from '../../profiles/useProfiles';
import { useWarpCanvas } from '../useWarpCanvas';
import GradientText from '../reactbits/GradientText';
import { DEV_SOLVE_EVENT } from '../../dev/devMode';
import { Stardust } from './Stardust';
import { AuroraBackdrop } from './AuroraBackdrop';
import type { FluidApi } from './StardustFluid';

interface Props {
  onDone: (result: { fuelGain: number; answers: Array<{ factKey: string; correct: boolean }> }) => void;
  onBurst: (x: number, y: number, color: string) => void;
}

// Stardust Run: one times table as a path of stops (7 × 4 = 28, 7 × 5, …).
// Each question is the next stop; a right answer and the ship glides along
// an arc of swirling stardust to it, the stop lights up and stays lit, so
// the chain of answers builds up behind the ship. Every arc is labelled with
// the jump (+7): the next answer is always the last one plus the table. At
// the end the whole table is shown, the run's stops highlighted, with the
// table's pattern to remember.
type Phase = 'intro' | 'ask' | 'glide' | 'recap';

const INTRO_MS = 2600;
const GLIDE_MS = 1350;
const LIGHT_PAUSE_MS = 450; // after the last landing, before the recap
const RECAP_STEP_MS = 380; // the recap lights the stops one after another
const RECAP_HOLD_MS = 5000;

// stardust colors (linear RGB, roughly as bright as the fluid likes them)
const DUST: Array<[number, number, number]> = [
  [0.1, 0.45, 0.9],
  [0.45, 0.18, 0.95],
  [0.95, 0.62, 0.15],
  [0.9, 0.25, 0.65],
  [0.15, 0.8, 0.75],
];

interface Pt {
  x: number;
  y: number;
}

function layout(w: number, h: number, count: number): Pt[] {
  const narrow = w < 640;
  const x0 = w * (narrow ? 0.12 : 0.14);
  const x1 = w * (narrow ? 0.88 : 0.86);
  const baseY = h * (narrow ? 0.33 : 0.38);
  return Array.from({ length: count }, (_, i) => {
    const f = count === 1 ? 0 : i / (count - 1);
    return { x: x0 + (x1 - x0) * f, y: baseY + Math.sin(f * Math.PI * 1.5 + 0.4) * h * 0.035 };
  });
}

/** the hop between two stops: a quadratic arc rising above them */
function arcControl(a: Pt, b: Pt, h: number): Pt {
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - Math.min(h * 0.13, d * 0.65) };
}
function onArc(a: Pt, c: Pt, b: Pt, t: number): Pt {
  const u = 1 - t;
  return { x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y };
}
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function patternText(t: Strings, table: number): string {
  switch (tablePattern(table)) {
    case 'ends50':
      return t.patternEnds50;
    case 'digitSum9':
      return t.patternDigitSum9;
    case 'digits369':
      return t.patternDigits369;
    case 'tenMinus':
      return t.patternTenMinus(table);
    default:
      return t.patternEvenEnds([1, 2, 3, 4, 5].map((k) => (table * k) % 10).join(', '));
  }
}

// side view of the ship, nose to the right
function GliderShip({ size, avatar }: { size: number; avatar?: string }) {
  return (
    <div className="sd-ship-body" style={{ width: size * 1.6, height: size }}>
      <svg viewBox="-80 -50 160 100" width={size * 1.6} height={size}>
        <path d="M-30 -18 L-58 -42 L-44 -14 Z M-30 18 L-58 42 L-44 14 Z" fill="#ff9d76" stroke="#2b2033" strokeWidth="5" strokeLinejoin="round" />
        <path d="M-52 -20 Q10 -30 62 0 Q10 30 -52 20 Z" fill="#faf3e6" stroke="#2b2033" strokeWidth="6" strokeLinejoin="round" />
        <circle cx="14" cy="0" r="14" fill="#bfe6f5" stroke="#2b2033" strokeWidth="5" />
        <path d="M-52 -12 L-66 0 L-52 12 Z" fill="#6ad7ff" stroke="#2b2033" strokeWidth="4" strokeLinejoin="round" />
      </svg>
      {avatar && (
        <span className="sd-ship-avatar" style={{ fontSize: size * 0.26, left: `${(94 / 160) * 100}%` }}>
          {avatar}
        </span>
      )}
    </div>
  );
}

export function StardustRun({ onDone, onBurst }: Props) {
  const t = useT();
  const avatar = useProfiles((s) => s.profiles.find((p) => p.id === s.activeId)?.avatar);
  const run = useMemo(() => buildStardust(useGameStore.getState().progress), []);
  const base = useMemo(() => 100 / getLevelConfig(useGameStore.getState().progress.level).streakToLaunch, []);
  const { table, startM, steps } = run;
  const level = useGameStore((s) => s.progress.level);

  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const { w, h } = size;
  const stops = useMemo(() => layout(w, h, steps.length + 1), [w, h, steps.length]);
  const shipSize = Math.min(54, Math.min(w, h) * 0.1);

  const [phase, setPhase] = useState<Phase>('intro');
  const [step, setStep] = useState(0); // the question being asked: stop step+1
  const [lit, setLit] = useState(1); // stops lit so far (the start stop is lit)
  const [wrong, setWrong] = useState<number[]>([]);
  const [shake, setShake] = useState(0);
  const [right, setRight] = useState<number | null>(null);
  const [typed, setTyped] = useState('');
  const [recapLit, setRecapLit] = useState(0);
  const glideStart = useRef(0);
  const answers = useRef<Array<{ factKey: string; correct: boolean }>>([]);
  const firstTryRight = useRef(0);
  const [, setFrame] = useState(0);
  const timers = useRef<Array<() => void>>([]);
  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(gameTimeout(fn, ms));
  }, []);
  useEffect(() => () => timers.current.forEach((cancel) => cancel()), []);

  const warpSpeed = useRef(1.2);
  const warpRef = useRef<HTMLCanvasElement>(null);
  useWarpCanvas(warpRef, 0.4, warpSpeed);
  const fluid = useRef<FluidApi | null>(null);

  // where the ship is: parked over its stop, or on the arc to the next one
  const shipAt = useCallback(
    (now: number): { p: Pt; angle: number } => {
      const hover = (pt: Pt): Pt => ({ x: pt.x, y: pt.y - shipSize * 0.75 });
      if (phase === 'glide') {
        const raw = Math.min(1, (now - glideStart.current) / GLIDE_MS);
        const k = easeInOut(raw);
        const a = hover(stops[step]);
        const b = hover(stops[step + 1]);
        const c = arcControl(a, b, h);
        const p = onArc(a, c, b, k);
        const q = onArc(a, c, b, Math.min(1, k + 0.02));
        const angle = raw >= 1 ? 0 : (Math.atan2(q.y - p.y, q.x - p.x) * 180) / Math.PI;
        return { p, angle };
      }
      const at = hover(stops[Math.min(lit - 1, stops.length - 1)]);
      const bob = Math.sin(now / 520) * 4;
      return { p: { x: at.x, y: at.y + bob }, angle: Math.sin(now / 900) * 3 };
    },
    [phase, step, lit, stops, shipSize, h],
  );

  // every frame: re-render, and stir the stardust (the ship's wake, a gentle
  // current along the path, and the glide itself)
  const prevShip = useRef<Pt | null>(null);
  const tick = useRef(0);
  const current = useRef(0);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (usePause.getState().paused) return;
      const now = gameNow();
      const api = fluid.current;
      tick.current++;
      const color = DUST[Math.floor(tick.current / 8) % DUST.length];
      const { p } = shipAt(now);
      const prev = prevShip.current ?? p;
      prevShip.current = p;
      if (api) {
        const vx = p.x - prev.x;
        const vy = p.y - prev.y;
        if (phase === 'glide') {
          // the glide: a bright, fast wake straight from the engine
          api.splat(p.x - shipSize * 0.7, p.y, vx * 4, vy * 4, [color[0] * 0.16, color[1] * 0.16, color[2] * 0.16]);
        } else if (tick.current % 5 === 0) {
          // idling: a soft exhaust puff behind the ship
          api.splat(p.x - shipSize * 0.75, p.y + (Math.random() - 0.5) * 6, -6, (Math.random() - 0.5) * 3, [color[0] * 0.12, color[1] * 0.12, color[2] * 0.12]);
        }
        // the stream: a slow current flowing along the path, stop to stop
        if (tick.current % 2 === 0 && stops.length > 1) {
          current.current = (current.current + 0.012) % (stops.length - 1);
          const i = Math.floor(current.current);
          const f = current.current - i;
          const a = stops[i];
          const b = stops[i + 1];
          const x = a.x + (b.x - a.x) * f;
          const y = a.y + (b.y - a.y) * f;
          const c = DUST[(i + 1) % DUST.length];
          api.splat(x, y + (Math.random() - 0.5) * 8, (b.x - a.x) * 0.05, (b.y - a.y) * 0.05, [c[0] * 0.22, c[1] * 0.22, c[2] * 0.22]);
        }
      }
      setFrame((n) => (n + 1) % 1_000_000);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [shipAt, phase, stops, shipSize]);

  /** a burst of stardust (and the game's sparkle) at a stop */
  const burst = useCallback(
    (pt: Pt, strength = 1) => {
      const api = fluid.current;
      if (api) {
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2 + Math.random() * 0.5;
          const c = DUST[k % DUST.length];
          api.splat(pt.x, pt.y, Math.cos(a) * 12 * strength, Math.sin(a) * 12 * strength, [c[0] * 0.3, c[1] * 0.3, c[2] * 0.3]);
        }
      }
      onBurst(pt.x, pt.y, '#ffd77a');
    },
    [onBurst],
  );

  // intro card → first question
  useEffect(() => {
    const cancel = gameTimeout(() => {
      warpSpeed.current = 0.25;
      setPhase('ask');
    }, INTRO_MS);
    return cancel;
  }, []);

  const finish = useCallback(() => {
    setPhase('recap');
    sfx.constellation();
    haptics.correct(6);
    const all = steps.length + 1;
    for (let k = 1; k <= all; k++) {
      later(() => {
        setRecapLit(k);
        sfx.pick(Math.min(3, k));
        burst(stops[k - 1], 0.7);
      }, k * RECAP_STEP_MS);
    }
    later(() => onDone({ fuelGain: base * 0.6 * firstTryRight.current, answers: answers.current }), all * RECAP_STEP_MS + RECAP_HOLD_MS);
  }, [steps.length, later, burst, stops, onDone, base]);

  const guess = useCallback(
    (value: number) => {
      if (phase !== 'ask' || right !== null) return;
      const s = steps[step];
      const ok = value === s.answer;
      setTyped('');
      if (wrong.length === 0) {
        answers.current.push({ factKey: s.factKey, correct: ok });
        if (ok) firstTryRight.current++;
      }
      if (!ok) {
        sfx.wrong();
        haptics.thump();
        setWrong((ws) => (ws.includes(value) ? ws : [...ws, value]));
        setShake((n) => n + 1);
        return;
      }
      sfx.correct(step + 1, false);
      haptics.correct(step + 1);
      setRight(value);
      later(() => {
        glideStart.current = gameNow();
        setPhase('glide');
        sfx.wormhole();
      }, 280);
      later(() => {
        // landed: light the stop
        setLit(step + 2);
        burst(stops[step + 1]);
        sfx.pick(Math.min(3, step + 1));
        setRight(null);
        setWrong([]);
        // the last stop: a breath, then the recap (the ship stays parked)
        if (step + 1 >= steps.length) later(finish, LIGHT_PAUSE_MS);
        else {
          setStep(step + 1);
          setPhase('ask');
        }
      }, 280 + GLIDE_MS);
    },
    [phase, right, steps, step, wrong.length, later, burst, stops, finish],
  );

  // dev mode: Shift+G answers the current stop
  useEffect(() => {
    const solve = () => guess(steps[step].answer);
    window.addEventListener(DEV_SOLVE_EVENT, solve);
    return () => window.removeEventListener(DEV_SOLVE_EVENT, solve);
  }, [guess, steps, step]);

  // keyboards: type the number and press Enter
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (phase !== 'ask') return;
      if (/^[0-9]$/.test(e.key)) setTyped((v) => (v.length >= 3 ? v : v + e.key));
      else if (e.key === 'Backspace') setTyped((v) => v.slice(0, -1));
      else if (e.key === 'Enter' && typed) guess(Number(typed));
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [phase, typed, guess]);

  // ---- render ----
  const now = gameNow();
  const ship = shipAt(now);
  const cur = steps[step];
  const prevValue = table * (startM + step);
  const lowest = Math.max(...stops.map((s) => s.y));
  const panelTop = lowest + Math.min(76, h * 0.09);

  return (
    <div className="stardust">
      <canvas ref={warpRef} className="battle-warp" />
      <AuroraBackdrop level={level} />
      <Stardust apiRef={fluid} />

      {/* the path, the hops already made (+7 each), and the next one, dashed */}
      <svg className="sd-path" width={w} height={h} aria-hidden="true" direction="ltr">
        <polyline points={stops.map((s) => `${s.x},${s.y}`).join(' ')} className="sd-track" />
        {stops.slice(0, -1).map((a, i) => {
          const b = stops[i + 1];
          const c = arcControl(a, b, h);
          const done = i + 1 < lit;
          const next = i + 1 === lit && phase !== 'recap';
          if (!done && !next) return null;
          const mid = onArc(a, c, b, 0.5);
          return (
            <g key={i} className={done ? 'sd-hop is-done' : 'sd-hop is-next'}>
              <path d={`M${a.x},${a.y} Q${c.x},${c.y} ${b.x},${b.y}`} />
              <text x={mid.x} y={mid.y - 10}>+{table}</text>
            </g>
          );
        })}
      </svg>

      {stops.map((s, i) => {
        const m = startM + i;
        const isLit = i < lit;
        const target = i === lit && phase === 'ask';
        const glow = phase === 'recap' && i < recapLit;
        return (
          <div
            key={i}
            className={`sd-stop ${isLit ? 'is-lit' : ''} ${target ? 'is-target' : ''} ${glow ? 'is-recap' : ''}`}
            style={{ left: s.x, top: s.y }}
            dir="ltr"
          >
            <span className="sd-stop-dot">{isLit ? table * m : '?'}</span>
            <span className="sd-stop-fact">
              {table} × {m}
            </span>
          </div>
        );
      })}

      <div className="sd-ship" style={{ left: ship.p.x, top: ship.p.y, rotate: `${ship.angle}deg` }}>
        <GliderShip size={shipSize} avatar={avatar} />
      </div>

      <div className="battle-header">
        <span className="battle-title">✨ {t.stardustTitle}</span>
        <span className="battle-cannons-text">{t.stardustJumps(Math.min(steps.length, step + 1), steps.length)}</span>
      </div>

      {phase === 'intro' && (
        <div className="round-card" style={{ top: panelTop }}>
          <GradientText className="round-card-title" colors={['#ffd77a', '#ffffff', '#b18cff', '#6ad7ff', '#ffd77a']} animationSpeed={3}>
            ✨ {t.stardustTitle}
          </GradientText>
          <div className="round-card-text">{t.stardustIntro(table)}</div>
        </div>
      )}

      {phase === 'ask' && cur && (
        <div className="sd-panel" style={{ top: panelTop }}>
          <div className="sd-question" dir="ltr">
            {table} × {cur.m} = <span className="sd-question-blank">{typed || '?'}</span>
          </div>
          <div className={`sd-hint ${wrong.length ? 'is-on' : ''}`} dir="auto">
            {wrong.length ? t.stardustHint(prevValue, table) : ' '}
          </div>
          <div key={shake} className={`sd-choices ${shake ? 'is-shaking' : ''}`} dir="ltr">
            {cur.choices.map((c) => (
              <button
                key={c}
                type="button"
                className={`sd-choice ${wrong.includes(c) ? 'is-wrong' : ''} ${right === c ? 'is-right' : ''}`}
                disabled={wrong.includes(c) || right !== null}
                onClick={() => guess(c)}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      )}

      {phase === 'recap' && (
        <div className="round-card sd-recap" style={{ top: panelTop }}>
          <GradientText className="round-card-title" colors={['#7ee08f', '#6ad7ff', '#ffd77a', '#7ee08f']} animationSpeed={2}>
            {t.stardustWin}
          </GradientText>
          <div className="sd-recap-label">{t.stardustRemember(table)}</div>
          <div className="sd-recap-table" dir="ltr">
            {Array.from({ length: 10 }, (_, k) => k + 1).map((m) => {
              const inRun = m >= startM && m <= startM + steps.length;
              return (
                <span key={m} className={inRun ? 'is-run' : ''}>
                  {table * m}
                </span>
              );
            })}
          </div>
          <div className="sd-recap-pattern" dir="auto">
            {patternText(t, table)}
          </div>
        </div>
      )}
    </div>
  );
}
