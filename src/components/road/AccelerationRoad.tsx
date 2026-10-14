import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { gameNow, gameTimeout, usePause } from '../../game/gameClock';
import { useGameStore } from '../../game/useGameStore';
import { getLevelConfig } from '../../game/levels';
import { buildRoad, ROAD_JUMPS } from '../../game/bonusRounds';
import { kick } from '../../game/flight';
import { sfx } from '../../audio/sfx';
import { haptics } from '../../audio/haptics';
import { useT } from '../../i18n/useLang';
import { activeMission, useProfiles } from '../../profiles/useProfiles';
import { useWarpCanvas } from '../useWarpCanvas';
import { SpaceRipple } from '../SpaceRipple';
import GradientText from '../reactbits/GradientText';
import { GliderShip } from '../stardust/StardustRun';
import { DEV_SOLVE_EVENT } from '../../dev/devMode';
import './road.css';

interface Props {
  onDone: (result: { fuelGain: number; answers: Array<{ factKey: string; correct: boolean }> }) => void;
  onBurst: (x: number, y: number, color: string) => void;
}

// Acceleration Road: a glowing rainbow road of floating slabs, seen from
// above at an angle, runs from the bottom-left corner to the middle of the
// screen, with holes in it. Every right answer doubles the number (2, 4, 8,
// 16, 32) and the ship's energy, and the ship jumps the next hole, and every
// jump is twice as long as the one before (holes of 1, 2, 4 and 8 slabs):
// ×2 you can see. After the fourth it reaches the middle, turns upward and
// blasts off with a motion-blur trail and a space-time ripple.
type Phase = 'intro' | 'ask' | 'jump' | 'charge' | 'blast' | 'summary';

const INTRO_MS = 2600;
const CHARGE_MS = 1100;
const BLAST_MS = 2000;
const SUMMARY_MS = 4600;
/** the first jump is this many slabs; each one after it doubles */
const JUMP_UNIT = 2;
const START_TILE = 3;
/** where the ship stands before each jump, and where the last one lands: the middle of the screen */
const PADS = Array.from({ length: ROAD_JUMPS + 1 }, (_, k) => START_TILE + JUMP_UNIT * (2 ** k - 1));
const END_TILE = PADS[ROAD_JUMPS];
/** the road carries on past the middle, fading out */
const BEYOND = 9;
/** across the road, on screen: up and to the left, so the slabs read as an isometric floor */
const ACROSS = { x: -0.78, y: -0.62 };

interface Geo {
  ax: number;
  ay: number;
  dx: number;
  dy: number;
  tile: number;
  width: number;
  thick: number;
}

// The ship starts near the bottom-left corner (the road comes in from
// beyond it) and the last jump lands in the middle of the screen.
function geometry(w: number, h: number): Geo {
  const sx = 0.1 * w;
  const sy = 0.88 * h;
  const len = Math.hypot(0.5 * w - sx, 0.5 * h - sy);
  const tile = len / (END_TILE - PADS[0]);
  const dx = (0.5 * w - sx) / len;
  const dy = (0.5 * h - sy) / len;
  return {
    ax: sx - dx * tile * (PADS[0] + 0.5),
    ay: sy - dy * tile * (PADS[0] + 0.5),
    dx,
    dy,
    tile,
    width: Math.min(110, Math.max(46, tile * 2.6)),
    thick: Math.max(6, Math.min(16, tile * 0.5)),
  };
}

interface Pt {
  x: number;
  y: number;
}

/** a point on the road: u slabs along it, v across it (-0.5 the right edge … 0.5 the left), z up */
function onRoad(g: Geo, u: number, v = 0, z = 0): Pt {
  return { x: g.ax + g.dx * g.tile * u + ACROSS.x * g.width * v, y: g.ay + g.dy * g.tile * u + ACROSS.y * g.width * v - z };
}

/** the holes (each jump's hole is half its length: 1, 2, 4, 8 slabs, nudged at random) and a few boost pads */
function makeRoad() {
  const holes = new Set<number>();
  PADS.slice(0, -1).forEach((pad, k) => {
    const len = JUMP_UNIT * 2 ** k;
    const shift = len >= 8 ? Math.floor(Math.random() * 3) - 1 : 0;
    const start = pad + Math.max(1, Math.floor(len / 4)) + shift;
    for (let i = 0; i < len / 2; i++) holes.add(start + i);
  });
  for (let u = END_TILE + 2; u < END_TILE + BEYOND; u++) if (Math.random() < 0.2) holes.add(u);
  const boosts = new Set<number>();
  for (let u = 1; u < END_TILE; u++) if (!holes.has(u) && !PADS.includes(u) && Math.random() < 0.22) boosts.add(u);
  return { holes, boosts };
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  hue: number;
  size: number;
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function quad(ctx: CanvasRenderingContext2D, pts: Pt[], fill: string) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (const p of pts.slice(1)) ctx.lineTo(p.x, p.y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

export function AccelerationRoad({ onDone, onBurst }: Props) {
  const t = useT();
  const avatar = useProfiles((s) => s.profiles.find((p) => p.id === s.activeId)?.avatar);
  const run = useMemo(() => buildRoad(useGameStore.getState().progress, activeMission()), []);
  const road = useMemo(makeRoad, []);
  const base = useMemo(() => 100 / getLevelConfig(useGameStore.getState().progress.level).streakToLaunch, []);
  const adding = run.mission === 'add';

  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const { w, h } = size;
  const g = useMemo(() => geometry(w, h), [w, h]);
  const shipSize = Math.max(40, Math.min(76, g.tile * 2.4));

  const [phase, setPhase] = useState<Phase>('intro');
  const [step, setStep] = useState(0); // the jump being asked about
  const [wrong, setWrong] = useState<number[]>([]);
  const [right, setRight] = useState<number | null>(null);
  const [typed, setTyped] = useState('');
  const [rippleAt, setRippleAt] = useState(0);
  const phaseStart = useRef(gameNow());
  const answers = useRef<Array<{ factKey: string; correct: boolean }>>([]);
  const firstTry = useRef(0);
  const [, setFrame] = useState(0);
  const timers = useRef<Array<() => void>>([]);
  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(gameTimeout(fn, ms));
  }, []);
  useEffect(() => () => timers.current.forEach((cancel) => cancel()), []);

  const warpRef = useRef<HTMLCanvasElement>(null);
  const warpSpeed = useRef(1.4);
  useWarpCanvas(warpRef, 0.5, warpSpeed);
  const roadRef = useRef<HTMLCanvasElement>(null);

  const go = useCallback((p: Phase) => {
    phaseStart.current = gameNow();
    setPhase(p);
  }, []);

  /** how long jump k takes: the long ones take a little longer */
  const jumpMs = (k: number) => 650 + 170 * k;

  // the ship's pose: where it is, which way it points (degrees), how hard its engines burn (0-4+)
  const roadAngle = (Math.atan2(g.dy, g.dx) * 180) / Math.PI;
  const pose = (now: number): { p: Pt; angle: number; energy: number } => {
    const tp = (now - phaseStart.current) / 1000;
    const hover = shipSize * 0.42 + Math.sin(now / 420) * 3;
    const center = onRoad(g, END_TILE + 0.5, 0, shipSize * 0.42);
    switch (phase) {
      case 'intro': {
        const k = easeInOut(Math.min(1, tp / (INTRO_MS / 1000)));
        return { p: onRoad(g, -4 + (PADS[0] + 4.5) * k, 0, hover), angle: roadAngle, energy: 0.5 };
      }
      case 'jump': {
        const k = Math.min(1, tp / (jumpMs(step) / 1000));
        const e = easeInOut(k);
        const from = PADS[step] + 0.5;
        const to = PADS[step + 1] + 0.5;
        const len = to - from;
        const lift = Math.sin(Math.PI * e) * g.tile * (1.4 + len * 0.42);
        const p = onRoad(g, from + len * e, 0, hover + lift);
        const e2 = easeInOut(Math.min(1, k + 0.03));
        const q = onRoad(g, from + len * e2, 0, hover + Math.sin(Math.PI * e2) * g.tile * (1.4 + len * 0.42));
        const angle = k >= 1 ? roadAngle : (Math.atan2(q.y - p.y, q.x - p.x) * 180) / Math.PI;
        return { p, angle, energy: step + 1.5 };
      }
      case 'charge': {
        const k = easeInOut(Math.min(1, tp / (CHARGE_MS / 1000)));
        return { p: { x: center.x + (Math.random() - 0.5) * 3 * k, y: center.y }, angle: roadAngle + (-90 - roadAngle) * k, energy: 4 + k * 2 };
      }
      case 'blast':
      case 'summary': {
        const tb = phase === 'summary' ? 9 : tp;
        return { p: { x: center.x, y: center.y - tb * tb * h * 0.6 }, angle: -90, energy: 8 };
      }
      default:
        return { p: onRoad(g, PADS[step] + 0.5, 0, hover), angle: roadAngle, energy: step };
    }
  };
  const poseRef = useRef(pose);
  poseRef.current = pose;
  const holesAhead = useRef<number[]>([]);
  holesAhead.current = phase === 'ask' || phase === 'intro' ? [...road.holes].filter((u) => u > PADS[step] && u < PADS[step + 1]) : [];

  // every frame: draw the road and the engine sparks, and re-render the ship
  const sparks = useRef<Spark[]>([]);
  useEffect(() => {
    const canvas = roadRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (usePause.getState().paused) {
        last = now;
        return;
      }
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const W = window.innerWidth;
      const H = window.innerHeight;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const geo = geometry(W, H);
      const time = gameNow() / 1000;

      // the road, far slabs first so nearer ones paint over them
      for (let u = END_TILE + BEYOND - 1; u >= 0; u--) {
        if (road.holes.has(u)) {
          if (holesAhead.current.includes(u)) {
            // the hole to jump next: a red warning outline
            const pts = [onRoad(geo, u, -0.5), onRoad(geo, u + 1, -0.5), onRoad(geo, u + 1, 0.5), onRoad(geo, u, 0.5)];
            ctx.setLineDash([5, 5]);
            ctx.strokeStyle = `rgba(255, 90, 130, ${0.35 + 0.3 * Math.sin(time * 6)})`;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
            ctx.closePath();
            ctx.stroke();
            ctx.setLineDash([]);
          }
          continue;
        }
        const fade = u >= END_TILE ? Math.max(0, 1 - (u - END_TILE) / BEYOND) : 1;
        const hue = (u * 21 + time * 80) % 360;
        const a = onRoad(geo, u, -0.5);
        const b = onRoad(geo, u + 1, -0.5);
        const c = onRoad(geo, u + 1, 0.5);
        const d = onRoad(geo, u, 0.5);
        const down = (p: Pt) => ({ x: p.x, y: p.y + geo.thick });
        // the right side wall, and the front wall where the road breaks off
        quad(ctx, [a, b, down(b), down(a)], `hsla(${hue}, 85%, 24%, ${fade})`);
        if (u === 0 || road.holes.has(u - 1)) quad(ctx, [a, d, down(d), down(a)], `hsla(${hue}, 85%, 33%, ${fade})`);
        // the glowing top, with a darker inset so each slab reads on its own
        ctx.shadowColor = `hsla(${hue}, 100%, 60%, ${fade})`;
        ctx.shadowBlur = 14;
        quad(ctx, [a, b, c, d], `hsla(${hue}, 95%, 56%, ${0.9 * fade})`);
        ctx.shadowBlur = 0;
        const mid = { x: (a.x + c.x) / 2, y: (a.y + c.y) / 2 };
        const inset = (p: Pt) => ({ x: p.x + (mid.x - p.x) * 0.2, y: p.y + (mid.y - p.y) * 0.2 });
        quad(ctx, [a, b, c, d].map(inset), `hsla(${hue}, 90%, 44%, ${0.5 * fade})`);
        // rails along both edges
        ctx.strokeStyle = `hsla(${hue}, 100%, 86%, ${fade})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(c.x, c.y);
        ctx.stroke();
        if (road.boosts.has(u)) {
          // a boost pad: a glowing chevron pointing along the road
          const tip = onRoad(geo, u + 0.75);
          const l = onRoad(geo, u + 0.3, 0.22);
          const r = onRoad(geo, u + 0.3, -0.22);
          ctx.strokeStyle = `rgba(255, 255, 255, ${(0.55 + 0.45 * Math.sin(time * 8 + u)) * fade})`;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(l.x, l.y);
          ctx.lineTo(tip.x, tip.y);
          ctx.lineTo(r.x, r.y);
          ctx.stroke();
        }
      }

      // the engines: sparks streaming from the tail; the stream doubles with each jump
      const { p, angle, energy } = poseRef.current(gameNow());
      const rad = (angle * Math.PI) / 180;
      const back = { x: -Math.cos(rad), y: -Math.sin(rad) };
      const tail = { x: p.x + back.x * shipSize * 0.62, y: p.y + back.y * shipSize * 0.62 };
      const rate = Math.min(420, 22 * 2 ** energy);
      for (let n = rate * dt; n > 0; n--) {
        if (n < 1 && Math.random() > n) break;
        const speed = 90 + Math.random() * 120 + energy * 30;
        sparks.current.push({
          x: tail.x,
          y: tail.y,
          vx: back.x * speed + (Math.random() - 0.5) * 60,
          vy: back.y * speed + (Math.random() - 0.5) * 60,
          life: 1,
          hue: (time * 120 + Math.random() * 60) % 360,
          size: 1.5 + Math.random() * 2 + energy * 0.35,
        });
      }
      ctx.globalCompositeOperation = 'lighter';
      sparks.current = sparks.current.filter((s) => {
        s.life -= dt * 1.7;
        if (s.life <= 0) return false;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        ctx.fillStyle = `hsla(${s.hue}, 100%, 65%, ${s.life})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size * (0.5 + s.life * 0.5), 0, Math.PI * 2);
        ctx.fill();
        return true;
      });
      ctx.globalCompositeOperation = 'source-over';
      setFrame((f) => (f + 1) % 1_000_000);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [road, shipSize]);

  // intro: the ship rolls up to the first hole
  useEffect(() => {
    const cancel = gameTimeout(() => {
      warpSpeed.current = 0.35;
      go('ask');
    }, INTRO_MS);
    return cancel;
  }, [go]);

  const blastOff = useCallback(() => {
    go('blast');
    warpSpeed.current = 3.6;
    setRippleAt(gameNow());
    sfx.launch();
    haptics.correct(10);
    kick(1.3);
    for (let i = 0; i < 6; i++) later(() => onBurst(w * (0.3 + Math.random() * 0.4), h * (0.25 + Math.random() * 0.35), ['#ffd77a', '#6ad7ff', '#ff6ad5'][i % 3]), 200 + i * 140);
    later(() => {
      go('summary');
      warpSpeed.current = 0.8;
      sfx.milestone(15);
      later(() => onDone({ fuelGain: base * 0.7 * firstTry.current, answers: answers.current }), SUMMARY_MS);
    }, BLAST_MS);
  }, [go, later, onBurst, onDone, base, w, h]);

  const answer = useCallback(
    (value: number) => {
      if (phase !== 'ask' || right !== null) return;
      const s = run.steps[step];
      const ok = value === s.answer;
      setTyped('');
      if (wrong.length === 0) {
        if (s.factKey) answers.current.push({ factKey: s.factKey, correct: ok });
        if (ok) firstTry.current++;
      }
      if (!ok) {
        sfx.wrong();
        haptics.thump();
        setWrong((ws) => (ws.includes(value) ? ws : [...ws, value]));
        return;
      }
      sfx.correct(step + 2, false);
      haptics.correct(step + 1);
      setRight(value);
      // the engines flare, then the jump: twice as long as the last
      later(() => {
        go('jump');
        sfx.wormhole();
        warpSpeed.current = 0.6 + step * 0.35;
      }, 300);
      later(() => {
        const landed = PADS[step + 1] + 0.5;
        const pt = onRoad(g, landed, 0, shipSize * 0.3);
        onBurst(pt.x, pt.y, '#ffd77a');
        kick(0.3 + step * 0.15);
        setRight(null);
        setWrong([]);
        warpSpeed.current = 0.35 + step * 0.15;
        if (step + 1 >= ROAD_JUMPS) {
          setStep(ROAD_JUMPS);
          go('charge');
          sfx.monsterRise();
          later(blastOff, CHARGE_MS);
        } else {
          setStep(step + 1);
          go('ask');
        }
      }, 300 + jumpMs(step));
    },
    [phase, right, run.steps, step, wrong.length, later, go, g, shipSize, onBurst, blastOff],
  );

  // dev mode: Shift+G answers the current jump
  useEffect(() => {
    const solve = () => run.steps[step] && answer(run.steps[step].answer);
    window.addEventListener(DEV_SOLVE_EVENT, solve);
    return () => window.removeEventListener(DEV_SOLVE_EVENT, solve);
  }, [answer, run.steps, step]);

  // keyboards: type the number and press Enter
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (phase !== 'ask') return;
      if (/^[0-9]$/.test(e.key)) setTyped((v) => (v.length >= 3 ? v : v + e.key));
      else if (e.key === 'Backspace') setTyped((v) => v.slice(0, -1));
      else if (e.key === 'Enter' && typed) answer(Number(typed));
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [phase, typed, answer]);

  // ---- render ----
  const now = gameNow();
  const { p, angle } = pose(now);
  const tp = (now - phaseStart.current) / 1000;
  const blasting = phase === 'blast';
  const stretch = blasting ? 1 + Math.min(3, tp * 2.4) : phase === 'charge' ? 1 + tp * 0.15 : 1;
  const v = run.values[Math.min(step, ROAD_JUMPS)];
  const cur = run.steps[step];
  const chain = run.values.join(' → ');

  return (
    <div className={`road is-${phase}`}>
      <canvas ref={warpRef} className="battle-warp" />
      <SpaceRipple source={warpRef} startedAt={rippleAt} origin={{ x: w / 2, y: h / 2 }} speed={Math.hypot(w, h) / 1.3} />
      <canvas ref={roadRef} className="road-canvas" />

      {/* the blast's light trail: a column of light from the middle up to just under the ship */}
      {blasting && (
        <div
          className="road-trail"
          style={{
            left: p.x,
            top: p.y + shipSize * 0.3,
            width: shipSize * 0.7,
            height: Math.max(0, h / 2 - p.y),
            opacity: Math.max(0, 1 - tp / (BLAST_MS / 1000)),
          }}
        />
      )}
      {/* the motion-blur trail: fading copies of the ship behind it as it blasts off */}
      {blasting &&
        Array.from({ length: 6 }, (_, i) => (
          <div
            key={i}
            className="road-ship road-ghost"
            style={{ left: p.x, top: p.y + (i + 1) * (10 + tp * 90), rotate: `${angle}deg`, scale: `${stretch} 1`, opacity: 0.45 * (1 - i / 6), filter: `blur(${2 + i * 1.5}px)` }}
          >
            <GliderShip size={shipSize} />
          </div>
        ))}
      {phase !== 'summary' && (
        <div className={`road-ship ${phase === 'charge' ? 'is-charging' : ''}`} style={{ left: p.x, top: p.y, rotate: `${angle}deg`, scale: `${stretch} 1` }}>
          <GliderShip size={shipSize} avatar={avatar} />
        </div>
      )}
      {(phase === 'ask' || phase === 'jump' || phase === 'charge') && (
        <div key={v} className="road-energy" style={{ left: p.x, top: p.y - shipSize * 0.95 }} dir="ltr">
          ⚡{v}
        </div>
      )}
      {blasting && tp < 0.45 && <div className="blast-flash" style={{ opacity: 1 - tp / 0.45 }} />}

      <div className="battle-header">
        <span className="battle-title">🛣️ {t.roadTitle}</span>
        <span className="battle-cannons-text">{t.roadJumps(Math.min(ROAD_JUMPS, step + 1), ROAD_JUMPS)}</span>
      </div>

      {phase === 'intro' && (
        <div className="round-card">
          <GradientText className="round-card-title" colors={['#ff6ad5', '#ffd77a', '#7ee08f', '#6ad7ff', '#b18cff', '#ff6ad5']} animationSpeed={3}>
            🛣️ {t.roadTitle}
          </GradientText>
          <div className="round-card-text">{adding ? t.roadIntroAdd : t.roadIntro}</div>
        </div>
      )}

      {phase === 'ask' && cur && (
        <div className="road-panel">
          <div className="sd-question" dir="ltr">
            {adding ? `${v} + ${v}` : `${v} × 2`} = <span className="sd-question-blank">{typed || '?'}</span>
          </div>
          <div className={`sd-hint ${wrong.length ? 'is-on' : ''}`} dir="auto">
            {wrong.length ? (adding ? t.roadHintAdd(v) : t.roadHint(v)) : ' '}
          </div>
          <div className="road-choices" dir="ltr">
            {cur.choices.map((c) => (
              <button
                key={c}
                type="button"
                className={`sd-choice ${wrong.includes(c) ? 'is-wrong' : ''} ${right === c ? 'is-right' : ''}`}
                disabled={wrong.includes(c) || right !== null}
                onClick={() => answer(c)}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      )}

      {phase === 'summary' && (
        <div className="round-card">
          <GradientText className="round-card-title" colors={['#7ee08f', '#6ad7ff', '#ffd77a', '#ff6ad5', '#7ee08f']} animationSpeed={2}>
            {t.roadWin}
          </GradientText>
          <div className="road-chain" dir="ltr">
            {chain}
          </div>
          <div className="round-card-text">{adding ? t.roadDoubledAdd : t.roadDoubled}</div>
        </div>
      )}
    </div>
  );
}
