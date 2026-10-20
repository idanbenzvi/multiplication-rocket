import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { gameNow, gameTimeout, usePause } from '../../game/gameClock';
import { roundOp, useGameStore } from '../../game/useGameStore';
import { getLevelConfig } from '../../game/levels';
import { buildRoad, ROAD_JUMPS } from '../../game/bonusRounds';
import { kick } from '../../game/flight';
import { sfx } from '../../audio/sfx';
import { haptics } from '../../audio/haptics';
import { useT } from '../../i18n/useLang';
import { useProfiles, useShip } from '../../profiles/useProfiles';
import { useWarpCanvas } from '../useWarpCanvas';
import { SpaceRipple } from '../SpaceRipple';
import GradientText from '../reactbits/GradientText';
import { RearShip } from '../spaceArt';
import { DEV_SOLVE_EVENT } from '../../dev/devMode';
import { calmMotion } from '../arrival/dropOut';
import { viewport } from '../viewport';
import './road.css';

interface Props {
  onDone: (result: { fuelGain: number; answers: Array<{ factKey: string; correct: boolean }> }) => void;
  onBurst: (x: number, y: number, color: string) => void;
}

// Acceleration Road, seen from just behind the ship: a glowing rainbow road
// of floating slabs stretches ahead to the horizon, with holes in it. Every
// right answer doubles the number (2, 4, 8, 16, 32) and the ship's energy,
// and the ship jumps the next hole: every hole is twice as long as the one
// before (1, 2, 4, 8 slabs), and every jump twice as far, in about the same
// time, so the ship really accelerates. ×2 you can see. After the fourth it
// flies on to the middle of the screen, the view tilts up, and it blasts off
// skyward with a light trail and a space-time ripple.
//
// The road builds itself as the round opens (after React Bits Pro's
// Perspective Grid): a neon grid sweeps out to the horizon, the slabs rise
// up out of it into place, nearest first, and the ship falls out of the sky
// and bounces down on its pad. The grid stays on faintly under the road.
type Phase = 'intro' | 'ask' | 'jump' | 'charge' | 'blast' | 'summary';

const INTRO_MS = 2600;
/** the grid sweeps out to the horizon in this long; the slabs rise from then, a little later the further off */
const GRID_MS = 650;
const SLABS_FROM_MS = 180;
const SLAB_GAP_MS = 20;
const SLAB_DROP_MS = 420;
/** how far below the slabs rise from, and how high the ship drops from (world units) */
const SLAB_DEPTH = 2.2;
const SHIP_HEIGHT = 4;
/** the ship falls, and lands on its pad */
const SHIP_DROP_MS = 600;
const LAND_MS = 1350;
const CHARGE_MS = 1100;
const BLAST_MS = 2200;
const SUMMARY_MS = 4600;
/** the first jump is this many slabs; each one after it doubles */
const JUMP_UNIT = 2;
const START_TILE = 3;
/** where the ship stands before each jump, and where the last one lands */
const PADS = Array.from({ length: ROAD_JUMPS + 1 }, (_, k) => START_TILE + JUMP_UNIT * (2 ** k - 1));
const END_TILE = PADS[ROAD_JUMPS];
/** the road goes on to the horizon */
const ROAD_LEN = END_TILE + 70;
/** half the road's width, and the slabs' thickness (world units: a slab is 1 long) */
const HALF = 1.3;
const THICK = 0.35;
/** how far the camera trails the ship, and how far ahead it draws */
const BACK = 3;
const FAR = 60;

/** the hole each jump clears is half its length (1, 2, 4, 8 slabs), nudged at random; a few boost pads */
function makeRoad() {
  const holes = new Set<number>();
  PADS.slice(0, -1).forEach((pad, k) => {
    const len = JUMP_UNIT * 2 ** k;
    const shift = len >= 8 ? Math.floor(Math.random() * 3) - 1 : 0;
    const start = pad + Math.max(1, Math.floor(len / 4)) + shift;
    for (let i = 0; i < len / 2; i++) holes.add(start + i);
  });
  for (let u = END_TILE + 4; u < ROAD_LEN; u++) if (Math.random() < 0.12) holes.add(u);
  const boosts = new Set<number>();
  for (let u = 1; u < ROAD_LEN; u++) if (!holes.has(u) && !PADS.includes(u) && Math.random() < 0.18) boosts.add(u);
  return { holes, boosts };
}

/** the camera for this screen: where the horizon is, and where the road under the ship meets the screen */
function lens(w: number, h: number) {
  const narrow = w < 700;
  const horizon = h * (narrow ? 0.3 : 0.36);
  const ground = h * (narrow ? 0.64 : 0.88);
  const f = Math.min(w * 1.1, h * 1.0);
  return { cx: w / 2, horizon, ground, f, height: ((ground - horizon) * BACK) / f, shipSize: Math.min(narrow ? w * 0.28 : 130, 130) };
}
type Lens = ReturnType<typeof lens>;

interface Cam {
  z: number;
  y: number;
  /** extra pixels the horizon drops by (the view tilting up at the blast) */
  tilt: number;
}

interface Pt {
  x: number;
  y: number;
}

function project(l: Lens, cam: Cam, x: number, y: number, z: number): Pt {
  const dz = Math.max(0.05, z - cam.z);
  return { x: l.cx + (x * l.f) / dz, y: l.horizon + cam.tilt + ((cam.y - y) * l.f) / dz };
}

function quad(ctx: CanvasRenderingContext2D, pts: Pt[], fill: string) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (const p of pts.slice(1)) ctx.lineTo(p.x, p.y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
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
const easeOut = (t: number) => 1 - (1 - t) ** 3;
/** eases out past the end and back */
const easeOutBack = (t: number) => 1 + 2.4 * (t - 1) ** 3 + 1.4 * (t - 1) ** 2;
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
/** a ball's fall: down, and two little bounces */
function easeOutBounce(t: number): number {
  const n = 7.5625;
  const d = 2.75;
  if (t < 1 / d) return n * t * t;
  if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
  if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
  return n * (t -= 2.625 / d) * t + 0.984375;
}

/** how long jump k takes: barely longer though twice as far, so the ship speeds up */
const jumpMs = (k: number) => 750 + 120 * k;
/** how high jump k goes (world units) */
const jumpLift = (k: number) => 0.7 + JUMP_UNIT * 2 ** k * 0.11;

export function AccelerationRoad({ onDone, onBurst }: Props) {
  const t = useT();
  const avatar = useProfiles((s) => s.profiles.find((p) => p.id === s.activeId)?.avatar);
  const shipId = useShip();
  const run = useMemo(() => buildRoad(useGameStore.getState().progress, roundOp()), []);
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
  const l = useMemo(() => lens(w, h), [w, h]);

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
  useWarpCanvas(warpRef, l.horizon / h, warpSpeed);
  const roadRef = useRef<HTMLCanvasElement>(null);
  // the road building itself as the round opens
  const openedAt = useRef(gameNow());
  const [calm] = useState(calmMotion);

  const go = useCallback((p: Phase) => {
    phaseStart.current = gameNow();
    setPhase(p);
  }, []);

  // Where the ship is in the world (z along the road, y up), and the camera
  // that trails it. The camera rises a little with a jump, so the road
  // drops away beneath; at the blast it stops and tilts up.
  const world = (now: number): { z: number; y: number; cam: Cam; energy: number } => {
    const tp = (now - phaseStart.current) / 1000;
    const camFor = (z: number, y: number, tilt = 0): Cam => ({ z: z - BACK, y: l.height + y * 0.55, tilt });
    switch (phase) {
      case 'intro': {
        // falling out of the sky onto the first pad, bouncing as it lands
        const z = PADS[0] + 0.5;
        const k = calm ? 1 : clamp01((now - openedAt.current - (LAND_MS - SHIP_DROP_MS)) / SHIP_DROP_MS);
        return { z, y: SHIP_HEIGHT * (1 - easeOutBounce(k)), cam: camFor(z, 0), energy: 0.5 };
      }
      case 'jump': {
        const k = Math.min(1, tp / (jumpMs(step) / 1000));
        const e = easeInOut(k);
        const z = PADS[step] + 0.5 + (PADS[step + 1] - PADS[step]) * e;
        const y = Math.sin(Math.PI * e) * jumpLift(step);
        return { z, y, cam: camFor(z, y), energy: step + 1.5 };
      }
      case 'charge': {
        const z = END_TILE + 0.5;
        return { z, y: 0, cam: camFor(z, 0), energy: 4 + Math.min(1, tp / (CHARGE_MS / 1000)) * 2 };
      }
      case 'blast':
      case 'summary': {
        const z = END_TILE + 0.5;
        const tb = phase === 'summary' ? 9 : tp;
        return { z, y: 0, cam: camFor(z, 0, Math.min(1, tb / 1.4) ** 2 * h * 0.45), energy: 8 };
      }
      default:
        return { z: PADS[Math.min(step, ROAD_JUMPS)] + 0.5, y: 0, cam: camFor(PADS[Math.min(step, ROAD_JUMPS)] + 0.5, 0), energy: step };
    }
  };

  // the ship on screen: its centre and scale (it flies off to the middle of the screen, then up)
  const shipOnScreen = (now: number) => {
    const { y, cam } = world(now);
    const tp = (now - phaseStart.current) / 1000;
    const bob = phase === 'ask' || phase === 'intro' ? Math.sin(now / 420) * 4 : 0;
    const shake = phase === 'charge' ? (Math.random() - 0.5) * 4 * Math.min(1, tp) : 0;
    const p = project(l, { ...cam, tilt: 0 }, 0, y + 0.45, cam.z + BACK);
    const home = { x: p.x + shake, y: p.y - l.shipSize * 0.35 + bob, scale: 1, stretch: 1 };
    if (phase !== 'blast' && phase !== 'summary') return home;
    const tb = phase === 'summary' ? 9 : tp;
    // first to the middle of the screen, shrinking into the distance
    const k = easeInOut(Math.min(1, tb / 0.7));
    const mid = { x: w / 2, y: h / 2 };
    if (tb < 0.7) return { x: home.x + (mid.x - home.x) * k, y: home.y + (mid.y - home.y) * k, scale: 1 - 0.45 * k, stretch: 1 };
    // then straight up, faster and faster, stretched by the speed
    const tu = tb - 0.7;
    return { x: mid.x, y: mid.y - tu * tu * h * 1.1, scale: 0.55, stretch: 1 + Math.min(3, tu * 3) };
  };

  const worldRef = useRef(world);
  worldRef.current = world;
  const shipRef = useRef(shipOnScreen);
  shipRef.current = shipOnScreen;
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
      const W = viewport.w;
      const H = viewport.h;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const lz = lens(W, H);
      const time = gameNow() / 1000;
      const { cam, energy } = worldRef.current(gameNow());
      const opened = calm ? Infinity : gameNow() - openedAt.current;

      // the grid under the road: sweeping out to the horizon as the round opens, then on faintly
      const sweep = easeOut(clamp01(opened / GRID_MS));
      const gridGlow = 0.2 + 0.55 * (1 - clamp01((opened - 1200) / 1400));
      const gridFar = cam.z + 0.3 + (FAR - 0.3) * sweep;
      const gy = -THICK - 0.6;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineWidth = 1;
      for (let x = -6.5; x <= 6.51; x += 0.65) {
        const p0 = project(lz, cam, x, gy, cam.z + 0.3);
        const p1 = project(lz, cam, x, gy, gridFar);
        const g = ctx.createLinearGradient(p0.x, p0.y, p1.x, p1.y);
        g.addColorStop(0, `rgba(255, 106, 213, ${0.55 * gridGlow})`);
        g.addColorStop(1, 'rgba(106, 215, 255, 0)');
        ctx.strokeStyle = g;
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.stroke();
      }
      for (let u = Math.ceil(cam.z + 0.3); u < gridFar; u++) {
        const fade = 1 - (u - cam.z) / FAR;
        ctx.strokeStyle = `rgba(177, 140, 255, ${0.5 * gridGlow * fade})`;
        const p0 = project(lz, cam, -6.5, gy, u);
        const p1 = project(lz, cam, 6.5, gy, u);
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.stroke();
      }
      ctx.restore();

      // the road, far slabs first so nearer ones paint over them
      const near = Math.max(0, Math.floor(cam.z + 0.3));
      for (let u = Math.min(ROAD_LEN - 1, Math.floor(cam.z + FAR)); u >= near; u--) {
        const z0 = Math.max(u, cam.z + 0.3);
        const z1 = u + 1;
        if (z1 <= z0) continue;
        const dist = u - cam.z;
        // rising into place as the round opens, nearest first
        const dropped = clamp01((opened - SLABS_FROM_MS - Math.max(0, dist) * SLAB_GAP_MS) / SLAB_DROP_MS);
        if (dropped <= 0) continue;
        const lift = -SLAB_DEPTH * (1 - easeOutBack(dropped));
        const P = (x: number, y: number, z: number) => project(lz, cam, x, y + lift, z);
        const fade = Math.max(0, Math.min(1, 1 - (dist - FAR * 0.45) / (FAR * 0.55))) * Math.min(1, dropped * 4);
        if (road.holes.has(u)) {
          if (holesAhead.current.includes(u)) {
            // the hole to jump next: a pulsing red outline
            const pts = [P(-HALF, 0, z0), P(HALF, 0, z0), P(HALF, 0, z1), P(-HALF, 0, z1)];
            ctx.setLineDash([6, 6]);
            ctx.strokeStyle = `rgba(255, 90, 130, ${(0.35 + 0.3 * Math.sin(time * 6)) * fade})`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
            ctx.closePath();
            ctx.stroke();
            ctx.setLineDash([]);
          }
          continue;
        }
        if (fade <= 0) continue;
        const hue = (u * 21 + time * 80) % 360;
        const a = P(-HALF, 0, z0);
        const b = P(HALF, 0, z0);
        const c = P(HALF, 0, z1);
        const d = P(-HALF, 0, z1);
        // the front wall where the road breaks off (the far side of a hole), facing the ship
        if (road.holes.has(u - 1) && u > cam.z + 0.3) {
          quad(ctx, [a, b, P(HALF, -THICK, u), P(-HALF, -THICK, u)], `hsla(${hue}, 85%, 30%, ${fade})`);
        }
        // the glowing top (the glow only on nearer slabs: it's costly), with a darker inset
        if (dist < 26) {
          ctx.shadowColor = `hsla(${hue}, 100%, 60%, ${fade})`;
          ctx.shadowBlur = 18;
        }
        quad(ctx, [a, b, c, d], `hsla(${hue}, 95%, 56%, ${0.9 * fade})`);
        ctx.shadowBlur = 0;
        const inset = (x: number, z: number) => P(x * 0.86, 0, z);
        const zm = (z0 + z1) / 2;
        const zi0 = z0 + (zm - z0) * 0.18;
        const zi1 = z1 - (z1 - zm) * 0.18;
        quad(ctx, [inset(-HALF, zi0), inset(HALF, zi0), inset(HALF, zi1), inset(-HALF, zi1)], `hsla(${hue}, 90%, 42%, ${0.5 * fade})`);
        // rails along both edges, and the lane lines
        ctx.strokeStyle = `hsla(${hue}, 100%, 88%, ${fade})`;
        ctx.lineWidth = Math.max(1, Math.min(4, (lz.f / Math.max(1, dist)) * 0.02));
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(d.x, d.y);
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(c.x, c.y);
        ctx.stroke();
        if (u % 2 === 0) {
          ctx.strokeStyle = `rgba(255, 255, 255, ${0.35 * fade})`;
          ctx.beginPath();
          for (const x of [-HALF / 3, HALF / 3]) {
            const p0 = P(x, 0, z0);
            const p1 = P(x, 0, z1);
            ctx.moveTo(p0.x, p0.y);
            ctx.lineTo(p1.x, p1.y);
          }
          ctx.stroke();
        }
        if (road.boosts.has(u)) {
          // a boost pad: a glowing chevron pointing down the road
          const tip = P(0, 0, u + 0.8);
          const lft = P(-0.45, 0, u + 0.25);
          const rgt = P(0.45, 0, u + 0.25);
          ctx.strokeStyle = `rgba(255, 255, 255, ${(0.55 + 0.45 * Math.sin(time * 8 + u)) * fade})`;
          ctx.lineWidth = Math.max(1.5, ctx.lineWidth * 1.5);
          ctx.beginPath();
          ctx.moveTo(lft.x, lft.y);
          ctx.lineTo(tip.x, tip.y);
          ctx.lineTo(rgt.x, rgt.y);
          ctx.stroke();
        }
      }

      // the engines: sparks streaming back past the camera; the stream doubles with each jump
      const ship = shipRef.current(gameNow());
      const s = lz.shipSize * ship.scale;
      const rate = Math.min(480, 26 * 2 ** energy);
      for (let n = rate * dt; n > 0; n--) {
        if (n < 1 && Math.random() > n) break;
        const side = Math.random() < 0.5 ? -1 : 1;
        sparks.current.push({
          x: ship.x + side * s * 0.11,
          y: ship.y + s * 0.3,
          vx: side * (20 + Math.random() * 70) + (Math.random() - 0.5) * 40,
          vy: 110 + Math.random() * 160 + energy * 30,
          life: 1,
          hue: (time * 120 + Math.random() * 60) % 360,
          size: 1.5 + Math.random() * 2 + energy * 0.3,
        });
      }
      ctx.globalCompositeOperation = 'lighter';
      sparks.current = sparks.current.filter((sp) => {
        sp.life -= dt * 1.6;
        if (sp.life <= 0) return false;
        sp.x += sp.vx * dt;
        sp.y += sp.vy * dt;
        // coming at the camera: they grow as they fly past
        const r = sp.size * (1 + (1 - sp.life) * 2.2);
        ctx.fillStyle = `hsla(${sp.hue}, 100%, 65%, ${sp.life})`;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, r, 0, Math.PI * 2);
        ctx.fill();
        return true;
      });
      ctx.globalCompositeOperation = 'source-over';
      setFrame((f) => (f + 1) % 1_000_000);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      // its pixels back at once (some phones only free a canvas's memory when it's collected, and blank canvases past a limit)
      canvas.width = canvas.height = 0;
    };
  }, [road, calm]);

  // the ship lands on its pad as the road builds itself
  useEffect(() => {
    if (calm) return;
    return gameTimeout(() => {
      const ship = shipRef.current(gameNow());
      onBurst(ship.x, ship.y + l.shipSize * 0.3, '#ffd77a');
      sfx.pick(1);
      haptics.tick();
    }, LAND_MS);
    // once, as it lands
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // intro: the road builds itself, then the first question
  useEffect(() => {
    const cancel = gameTimeout(() => {
      warpSpeed.current = 0.3;
      go('ask');
    }, INTRO_MS);
    return cancel;
  }, [go]);

  const blastOff = useCallback(() => {
    go('blast');
    warpSpeed.current = 3.8;
    sfx.launch();
    haptics.correct(10);
    kick(1.3);
    // the ripple leaves from the middle of the screen, as the ship gets there
    later(() => setRippleAt(gameNow()), 650);
    for (let i = 0; i < 6; i++) later(() => onBurst(w * (0.3 + Math.random() * 0.4), h * (0.25 + Math.random() * 0.35), ['#ffd77a', '#6ad7ff', '#ff6ad5'][i % 3]), 700 + i * 140);
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
      // the engines flare, then the jump: twice as far as the last, in about the same time
      later(() => {
        go('jump');
        sfx.wormhole();
        warpSpeed.current = 0.45 * 2 ** step;
      }, 300);
      later(() => {
        const ship = shipRef.current(gameNow());
        onBurst(ship.x, ship.y + l.shipSize * 0.4, '#ffd77a');
        kick(0.3 + step * 0.15);
        setRight(null);
        setWrong([]);
        warpSpeed.current = 0.3 + step * 0.2;
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
    [phase, right, run.steps, step, wrong.length, later, go, l.shipSize, onBurst, blastOff],
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
  const ship = shipOnScreen(now);
  const tp = (now - phaseStart.current) / 1000;
  const blasting = phase === 'blast';
  const climbing = blasting && tp > 0.7;
  const shipPx = l.shipSize * ship.scale;
  const v = run.values[Math.min(step, ROAD_JUMPS)];
  const cur = run.steps[step];
  const { energy } = world(now);

  return (
    <div className={`road is-${phase}`}>
      <canvas ref={warpRef} className="battle-warp" />
      <SpaceRipple source={warpRef} startedAt={rippleAt} origin={{ x: w / 2, y: h / 2 }} speed={Math.hypot(w, h) / 1.3} />
      <canvas ref={roadRef} className="road-canvas" />

      {/* the climb's light trail and motion blur: a column of light, and fading copies of the ship below it */}
      {climbing && (
        <div className="road-trail" style={{ left: ship.x, top: ship.y + shipPx * 0.3, width: shipPx * 0.55, height: Math.max(0, h / 2 - ship.y + shipPx), opacity: Math.max(0, 1 - (tp - 0.7) / 1.4) }} />
      )}
      {climbing &&
        Array.from({ length: 6 }, (_, i) => (
          <div
            key={i}
            className="road-ship road-ghost"
            style={{ left: ship.x, top: ship.y + (i + 1) * (8 + (tp - 0.7) * 120), width: shipPx, height: shipPx, scale: `1 ${ship.stretch}`, opacity: 0.45 * (1 - i / 6), filter: `blur(${2 + i * 1.5}px)` }}
          >
            <RearShip size={64} />
          </div>
        ))}
      {phase !== 'summary' && (
        <div
          className={`road-ship is-${shipId} ${phase === 'charge' ? 'is-charging' : ''}`}
          style={{ left: ship.x, top: ship.y, width: shipPx, height: shipPx, scale: `1 ${ship.stretch}`, '--flame': Math.min(2.2, 0.7 + energy * 0.22) } as React.CSSProperties}
        >
          <span className="road-flame is-left" />
          <span className="road-flame is-right" />
          <RearShip size={64} />
          {avatar && <span className="road-ship-avatar">{avatar}</span>}
        </div>
      )}
      {(phase === 'ask' || phase === 'jump' || phase === 'charge') && (
        <div key={v} className="road-energy" style={{ left: ship.x, top: ship.y - shipPx * 0.68 }} dir="ltr">
          ⚡{v}
        </div>
      )}
      {blasting && tp > 0.65 && tp < 1.1 && <div className="blast-flash" style={{ opacity: 1 - (tp - 0.65) / 0.45 }} />}

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
            {run.values.join(' → ')}
          </div>
          <div className="round-card-text">{adding ? t.roadDoubledAdd : t.roadDoubled}</div>
        </div>
      )}
    </div>
  );
}
