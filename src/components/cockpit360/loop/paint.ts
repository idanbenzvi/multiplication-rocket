import { angleAt, feltG, forcesAt, poseAt, R, RUN_UP, speedAt, type BeatId, type Frame, type V3 } from './story';
import { cutRect, type P2, type Split } from './split';
import type { ShipModel } from './wireframe';

// The loop's picture, drawn on one canvas over the whole cockpit
// (LoopShow.tsx): the cockpit's side of the cut, its speed lines rushing in
// towards the ship's nose (manga's focus lines), the tunnel vision of the g
// pressing on the pilot and the black-and-white impact frame of the
// ignition; and the blueprint's side, the ship as a wireframe flying its
// loop: the path drawn round, the ship with afterimages trailing it when it
// bursts along, its flame, its side thrusters puffing, and arrows for the
// forces on it, labelled, the one being explained big and pulsing. Its
// camera pulls back wide to fly and snaps in close when time stops, drifting
// round the frozen ship, a little tilted.

export interface Words {
  title: string;
  jp: string;
  thrust: string;
  turn: string;
  velocity: string;
  seat: string;
  inertia: string;
  centre: string;
  speed: string;
  kmh: string;
  angle: string;
  noAir: string;
  off: string;
  rtl: boolean;
}

export interface PaintState {
  w: number;
  h: number;
  split: Split;
  /** the blueprint's edge, back from the cut (px): 0 there, split.reach off the screen */
  off: number;
  frame: Frame;
  /** where the ship's nose is on the screen, for the focus lines */
  nose: P2;
  /** the slash across the screen: how far it's drawn (0 … 1), and fading (1 … 0) */
  slash: number;
  slashFade: number;
  /** the ignition's impact frame: black and white */
  impact: boolean;
  /** the lever pulled, the engines charging (0 … 1) */
  charge: number;
  calm: boolean;
  avatar: string;
  words: Words;
  /** ms, for the flicker and the pulses */
  now: number;
}

const CYAN = '#5cf2ff';
const COLORS = { thrust: '#ff8a1e', turn: '#ff4fd8', velocity: '#7dffb0', seat: '#ffd36b', inertia: '#ffffff' };
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => mul(a, 1 / (Math.hypot(...a) || 1));
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** a small seeded random (the same lines while time's frozen, new ones every frame while it isn't) */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- the blueprint's camera ----

interface Cam {
  eye: V3;
  right: V3;
  up: V3;
  fwd: V3;
  /** px per unit at a unit's distance */
  f: number;
  cx: number;
  cy: number;
  /** its tilt (radians, a Dutch angle) */
  roll: number;
}

/** a camera `dist` from `target`, round it by `az` and up by `el` */
function camera(target: V3, az: number, el: number, dist: number, fovY: number, box: Split['box'], roll: number): Cam {
  const eye = add(target, mul([Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)], dist));
  const fwd = norm(sub(target, eye));
  const right = norm(cross(fwd, [0, 1, 0]));
  const up = cross(right, fwd);
  return { eye, right, up, fwd, f: box.h / 2 / Math.tan(fovY / 2), cx: box.cx, cy: box.cy, roll };
}

/** where a point lands on the screen, and how far away it is (null behind the camera) */
function project(c: Cam, p: V3): [number, number, number] | null {
  const d = sub(p, c.eye);
  const z = dot(d, c.fwd);
  if (z < 0.2) return null;
  let x = (dot(d, c.right) / z) * c.f;
  let y = (-dot(d, c.up) / z) * c.f;
  if (c.roll) {
    const cs = Math.cos(c.roll);
    const sn = Math.sin(c.roll);
    [x, y] = [x * cs - y * sn, x * sn + y * cs];
  }
  return [c.cx + x, c.cy + y, z];
}

/** a critically damped spring, stepped exactly */
function spring(x: number, v: number, goal: number, omega: number, dt: number): [number, number] {
  const d = x - goal;
  const e = Math.exp(-omega * dt);
  return [goal + (d + (v + omega * d) * dt) * e, (v - omega * (v + omega * d) * dt) * e];
}

export class LoopPainter {
  private shot = { tx: -2, ty: R, tz: 0, az: -0.5, el: 0.2, dist: 22, roll: 0 };
  private vel = { tx: 0, ty: 0, tz: 0, az: 0, el: 0, dist: 0, roll: 0 };
  private history: Array<{ at: number; s: number }> = [];
  private bg: HTMLCanvasElement | null = null;
  private bgKey = '';
  private settled = false;
  /** where the ship was drawn last (for an effect to land on it) */
  shipAt: P2 = [0, 0];

  private model: ShipModel;

  constructor(model: ShipModel) {
    this.model = model;
  }

  /** step the camera and remember the ship's path (dt in s) */
  step(st: PaintState, dt: number) {
    const f = st.frame;
    const pose = poseAt(f.s);
    const close = f.kind === 'hold';
    const aspect = st.split.box.w / st.split.box.h;
    const goal = close
      ? {
          tx: pose.pos[0] + pose.up[0] * 0.25,
          ty: pose.pos[1] + pose.up[1] * 0.25,
          tz: 0,
          // (round the frozen ship, a little more the longer it's held)
          az: -0.55 + f.u * 0.75,
          el: 0.3,
          dist: Math.max(7, 5.6 / Math.min(1, aspect)),
          roll: f.beat === 'g' ? -0.1 : 0.08,
        }
      : {
          tx: -2.4 + 2.6 * smooth(-0.7, 0.15, f.s),
          ty: R * 0.92,
          tz: 0,
          az: -0.42 + 0.22 * clamp(f.s, -1, 1.2),
          el: 0.18,
          dist: Math.max(21, 16.5 / aspect),
          roll: 0,
        };
    const omega = st.calm ? 6 : 10;
    if (!this.settled) {
      Object.assign(this.shot, goal);
      this.settled = true;
    }
    for (const k of Object.keys(goal) as Array<keyof typeof goal>) {
      [this.shot[k], this.vel[k]] = spring(this.shot[k], this.vel[k], goal[k], k === 'roll' ? omega * 0.6 : omega, dt);
    }
    this.history.push({ at: st.now, s: f.s });
    while (this.history.length && st.now - this.history[0].at > 260) this.history.shift();
  }

  private cam(st: PaintState): Cam {
    const s = this.shot;
    return camera([s.tx, s.ty, s.tz], s.az, s.el, s.dist, 36 * (Math.PI / 180), st.split.box, st.calm ? 0 : s.roll);
  }

  paint(ctx: CanvasRenderingContext2D, st: PaintState) {
    const { w, h, split, off } = st;
    ctx.clearRect(0, 0, w, h);
    const shown = off < split.reach - 1;
    // ---- the cockpit's side ----
    ctx.save();
    if (shown) clipTo(ctx, cutRect(w, h, split.a, split.n, off, false));
    this.cockpitSide(ctx, st);
    ctx.restore();
    if (!shown) {
      this.slashLine(ctx, st);
      return;
    }
    // ---- the blueprint's ----
    const panel = cutRect(w, h, split.a, split.n, off, true);
    ctx.save();
    clipTo(ctx, panel);
    ctx.translate(split.n[0] * off, split.n[1] * off);
    this.blueprint(ctx, st);
    ctx.restore();
    if (st.impact) {
      // (the impact frame: the blueprint's colours turned inside out)
      ctx.save();
      clipTo(ctx, panel);
      ctx.globalCompositeOperation = 'difference';
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
    this.gutter(ctx, st);
    this.slashLine(ctx, st);
  }

  // ---- the cockpit's side: focus lines, the g's tunnel vision, the impact frame ----

  private cockpitSide(ctx: CanvasRenderingContext2D, st: PaintState) {
    const { w, h, frame: f, nose, calm } = st;
    const min = Math.min(w, h);
    if (st.impact) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);
      focusLines(ctx, nose, w, h, min * 0.22, 140, '#fff', 1, rng(Math.floor(st.now / 33)));
      return;
    }
    // the lever pulled: an alarm's red at the edges, pulsing
    if (st.charge > 0) {
      const k = st.charge * (0.55 + 0.45 * Math.sin(st.now / 70));
      const g = ctx.createRadialGradient(w / 2, h / 2, min * 0.35, w / 2, h / 2, Math.hypot(w, h) / 2);
      g.addColorStop(0, 'rgba(255,40,40,0)');
      g.addColorStop(1, `rgba(255,40,40,${(0.35 * k).toFixed(3)})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
    // the speed: lines rushing in from the edges towards the nose (frozen in place while time is)
    const frozen = f.kind === 'hold';
    const k = calm ? 0 : frozen ? 0.6 : Math.max(st.charge * 0.5, f.rush, f.kind === 'close' ? 0.3 : 0);
    if (k > 0.02) {
      const seed = frozen ? 7 + f.index : Math.floor(st.now / 33);
      focusLines(ctx, nose, w, h, min * (0.5 - 0.18 * k), Math.round(50 + 70 * k), frozen ? 'rgba(220,240,255,0.55)' : '#fff', frozen ? 0.5 : 0.35 + 0.45 * k, rng(seed));
    }
    // the g pressing on the pilot: the edges of the view darkening
    const g = feltG(f.s);
    if (g > 1.05) {
      const dark = Math.min(0.75, (g - 1) * 0.28);
      const grad = ctx.createRadialGradient(nose[0], nose[1], min * 0.3, nose[0], nose[1], Math.hypot(w, h) * 0.6);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, `rgba(0,0,0,${dark.toFixed(3)})`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    }
  }

  // ---- the cut between them: a manga panel's gutter, and the slash that made it ----

  private gutter(ctx: CanvasRenderingContext2D, st: PaintState) {
    const { split, off } = st;
    const [nx, ny] = split.n;
    const ext = Math.hypot(st.w, st.h);
    const dx = split.b[0] - split.a[0];
    const dy = split.b[1] - split.a[1];
    const len = Math.hypot(dx, dy);
    const ux = (dx / len) * ext;
    const uy = (dy / len) * ext;
    const ax = split.a[0] + nx * off;
    const ay = split.a[1] + ny * off;
    const line = (width: number, color: string, shift = 0) => {
      ctx.beginPath();
      ctx.moveTo(ax - ux + nx * shift, ay - uy + ny * shift);
      ctx.lineTo(ax + ux + nx * shift, ay + uy + ny * shift);
      ctx.lineWidth = width;
      ctx.strokeStyle = color;
      ctx.stroke();
    };
    line(14, '#fff', 0);
    line(8, '#05060c', 0);
    line(2, 'rgba(92,242,255,0.9)', 6);
  }

  private slashLine(ctx: CanvasRenderingContext2D, st: PaintState) {
    if (st.slash <= 0 || st.slashFade <= 0) return;
    const { split } = st;
    const ext = 0.2;
    const a: P2 = [split.a[0] - (split.b[0] - split.a[0]) * ext, split.a[1] - (split.b[1] - split.a[1]) * ext];
    const b: P2 = [split.b[0] + (split.b[0] - split.a[0]) * ext, split.b[1] + (split.b[1] - split.a[1]) * ext];
    const k = st.slash;
    const end: P2 = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
    ctx.save();
    ctx.globalAlpha = st.slashFade;
    ctx.lineCap = 'round';
    for (const [width, color] of [
      [26, 'rgba(92,242,255,0.25)'],
      [10, 'rgba(255,255,255,0.7)'],
      [3, '#fff'],
    ] as const) {
      ctx.beginPath();
      ctx.moveTo(...a);
      ctx.lineTo(...end);
      ctx.lineWidth = width;
      ctx.strokeStyle = color;
      ctx.stroke();
    }
    // the blade's glint at its tip
    const g = ctx.createRadialGradient(end[0], end[1], 0, end[0], end[1], 60);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(end[0] - 60, end[1] - 60, 120, 120);
    ctx.restore();
  }

  // ---- the blueprint ----

  private background(st: PaintState): HTMLCanvasElement {
    const key = `${st.w}x${st.h}`;
    if (this.bg && this.bgKey === key) return this.bg;
    const c = document.createElement('canvas');
    const scale = Math.min(window.devicePixelRatio || 1, 1.5);
    c.width = Math.round(st.w * scale);
    c.height = Math.round(st.h * scale);
    const g = c.getContext('2d')!;
    g.scale(scale, scale);
    const { box } = st.split;
    const grad = g.createRadialGradient(box.cx, box.cy, 0, box.cx, box.cy, Math.hypot(box.w, box.h) * 0.75);
    grad.addColorStop(0, '#0b2a5c');
    grad.addColorStop(0.6, '#061a3d');
    grad.addColorStop(1, '#020a1c');
    g.fillStyle = grad;
    g.fillRect(0, 0, st.w, st.h);
    // the grid, every 32 px, heavier every 160
    for (let x = 0; x <= st.w; x += 32) {
      g.fillStyle = x % 160 === 0 ? 'rgba(92,242,255,0.16)' : 'rgba(92,242,255,0.06)';
      g.fillRect(x, 0, 1, st.h);
    }
    for (let y = 0; y <= st.h; y += 32) {
      g.fillStyle = y % 160 === 0 ? 'rgba(92,242,255,0.16)' : 'rgba(92,242,255,0.06)';
      g.fillRect(0, y, st.w, 1);
    }
    // a manga's screentone in the far corner: dots, growing towards it
    const far: P2 = st.split.portrait ? [st.w, st.h] : [st.w, st.h];
    for (let y = 6; y < st.h; y += 9) {
      for (let x = 6 + ((y / 9) % 2) * 4.5; x < st.w; x += 9) {
        const d = Math.hypot(x - far[0], y - far[1]) / (Math.min(st.w, st.h) * 0.6);
        if (d > 1) continue;
        g.beginPath();
        g.arc(x, y, (1 - d) * 2.2, 0, Math.PI * 2);
        g.fillStyle = 'rgba(92,242,255,0.12)';
        g.fill();
      }
    }
    this.bg = c;
    this.bgKey = key;
    return c;
  }

  private blueprint(ctx: CanvasRenderingContext2D, st: PaintState) {
    const { frame: f, calm, words } = st;
    ctx.drawImage(this.background(st), 0, 0, st.w, st.h);
    const cam = this.cam(st);
    const pose = poseAt(f.s);
    const { thrust, turn } = forcesAt(f.s);
    const frozen = f.kind === 'hold';
    const pulse = 1 + (calm ? 0 : 0.1 * Math.sin(st.now / 110));
    const ship = project(cam, pose.pos);
    if (ship) this.shipAt = [ship[0] + st.split.n[0] * st.off, ship[1] + st.split.n[1] * st.off];

    // a frozen moment: lines bursting out from behind the ship, turning slowly
    if (frozen && ship) {
      ctx.save();
      const r = Math.hypot(st.split.box.w, st.split.box.h);
      const rot = st.now / 4000;
      ctx.globalAlpha = 0.16 * Math.min(1, f.u * 6);
      ctx.fillStyle = CYAN;
      for (let i = 0; i < 36; i++) {
        const a = rot + (i / 36) * Math.PI * 2;
        const wedge = 0.012 + (i % 3) * 0.006;
        ctx.beginPath();
        ctx.moveTo(ship[0], ship[1]);
        ctx.lineTo(ship[0] + Math.cos(a - wedge) * r, ship[1] + Math.sin(a - wedge) * r);
        ctx.lineTo(ship[0] + Math.cos(a + wedge) * r, ship[1] + Math.sin(a + wedge) * r);
        ctx.fill();
      }
      ctx.restore();
    }

    this.path(ctx, cam, f.s, words);

    // the speed: lines streaking past the ship, back along its way
    if (f.rush > 0.05 && ship && !calm) {
      const ahead = project(cam, add(pose.pos, pose.forward));
      if (ahead) {
        const dx = ahead[0] - ship[0];
        const dy = ahead[1] - ship[1];
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len;
        const uy = dy / len;
        const r = rng(Math.floor(st.now / 33));
        const { box } = st.split;
        ctx.save();
        ctx.lineCap = 'round';
        // (four kinds, thin and thick, white and cyan, each one path: a stroke apiece costs)
        const kinds: Array<[number, string]> = [
          [1.2, `rgba(255,255,255,${0.55 * f.rush})`],
          [3, `rgba(255,255,255,${0.35 * f.rush})`],
          [1.2, `rgba(92,242,255,${0.6 * f.rush})`],
          [2.6, `rgba(92,242,255,${0.4 * f.rush})`],
        ];
        kinds.forEach(([width, color], kind) => {
          ctx.beginPath();
          for (let i = 0; i < 12; i++) {
            // (mostly near the ship's line, some anywhere)
            const along = (r() - 0.5) * box.w * 1.2;
            const across = (r() - 0.5) * (r() < 0.6 ? 160 : box.h);
            const x = ship[0] + ux * along - uy * across;
            const y = ship[1] + uy * along + ux * across;
            const l = (60 + r() * 220) * f.rush * (kind % 2 ? 0.7 : 1);
            ctx.moveTo(x, y);
            ctx.lineTo(x - ux * l, y - uy * l);
          }
          ctx.lineWidth = width;
          ctx.strokeStyle = color;
          ctx.stroke();
        });
        ctx.restore();
      }
    }

    // afterimages: where the ship just was, fading, in two colours
    if (f.rush > 0.15 && !calm) {
      [90, 190].forEach((back, i) => {
        const past = this.history.find((p) => p.at >= st.now - back);
        if (!past || Math.abs(past.s - f.s) < 0.004) return;
        drawShip(ctx, cam, this.model, poseAt(past.s), 0.32 - i * 0.12, i % 2 ? '#ff4fd8' : CYAN, true);
      });
    }

    // inertia: the line it'd fly on without the turning force, and a ghost of it flying along it
    if (f.beat === 'inertia') {
      const from = project(cam, pose.pos);
      const to = project(cam, add(pose.pos, mul(pose.forward, 12)));
      if (from && to) {
        ctx.save();
        ctx.setLineDash([10, 9]);
        ctx.lineDashOffset = -st.now / 30;
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.beginPath();
        ctx.moveTo(from[0], from[1]);
        ctx.lineTo(to[0], to[1]);
        ctx.stroke();
        ctx.restore();
      }
      const ghost = { ...pose, pos: add(pose.pos, mul(pose.forward, 0.8 + smooth(0, 0.8, f.u) * 4.5)) };
      drawShip(ctx, cam, this.model, ghost, 0.45, '#ffffff', true);
      const g = project(cam, add(ghost.pos, mul(pose.up, -0.9)));
      if (g) tag(ctx, g[0], g[1], words.inertia, COLORS.inertia, 1, words.rtl);
    }

    // the flame
    if (thrust > 0) this.flame(ctx, cam, pose, thrust, st);
    // the side thrusters, puffing out from the belly (pushing the ship the other way: towards the middle)
    if (turn > 0.05 && f.beat !== 'inertia') {
      for (const local of this.model.belly) {
        const at = toWorld(pose, local);
        for (let i = 0; i < 3; i++) {
          const ph = ((st.now / (frozen ? 2400 : 260) + i / 3) % 1) * (calm ? 0.5 : 1);
          const p = project(cam, add(at, mul(pose.up, -(0.12 + ph * 0.7))));
          if (!p) continue;
          const r = (3 + ph * 14) * (cam.f / p[2]) * 0.012 + 2;
          ctx.beginPath();
          ctx.arc(p[0], p[1], r, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(220,250,255,${(0.75 * (1 - ph) * turn).toFixed(3)})`;
          ctx.fill();
        }
      }
    }

    drawShip(ctx, cam, this.model, pose, 1, CYAN, false);

    // the pilot in their window, squashed by the g
    const seat = project(cam, toWorld(pose, this.model.window));
    if (seat && st.avatar) {
      const size = clamp((cam.f / seat[2]) * 0.34, 12, 38);
      const squash = 1 / Math.max(1, 1 + (feltG(f.s) - 1) * 0.08);
      ctx.save();
      ctx.translate(seat[0], seat[1]);
      ctx.scale(1 / Math.sqrt(squash), squash);
      // (in their bubble of glass, so they show against the lines behind)
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.66, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(2,10,28,0.88)';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#d8fdff';
      ctx.stroke();
      ctx.font = `${size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(st.avatar, 0, 0);
      ctx.restore();
    }

    // the forces, as arrows from the ship's middle (shorter close up, so they stay in the picture)
    const lit = (b: BeatId) => (frozen ? (f.beat === b ? 1.25 * pulse : 0.45) : 1);
    const v = speedAt(f.s) / 150;
    const k = clamp(this.shot.dist / 16, 0.5, 1.15);
    arrow3(ctx, cam, add(pose.pos, mul(pose.up, 0.85)), pose.forward, (1.0 + 0.9 * v) * k, COLORS.velocity, words.velocity, frozen ? 0.6 : 0.9, words.rtl, true);
    if (thrust > 0) arrow3(ctx, cam, pose.pos, pose.forward, 2.2 * k * thrust * (f.beat === 'thrust' ? pulse : 1), COLORS.thrust, words.thrust, lit('thrust'), words.rtl);
    if (turn > 0.05) {
      const off = f.beat === 'inertia';
      const a = arrow3(ctx, cam, pose.pos, pose.up, 2.0 * k * turn * (f.beat === 'turn' ? pulse : 1), COLORS.turn, off ? `${words.turn} · ${words.off}` : words.turn, off ? 0.4 : lit('turn'), words.rtl);
      if (off && a) cross2(ctx, a[0], a[1]);
    }
    if (f.beat === 'g' && seat) {
      // the seat, under the pilot (away from the middle), pushing them towards it
      const w0 = toWorld(pose, this.model.window);
      arrow3(ctx, cam, add(w0, mul(pose.up, -1.05)), pose.up, 0.85 * pulse, COLORS.seat, `${words.seat} · ${feltG(f.s).toFixed(1)} G`, 1.2, words.rtl, false, true);
    }

    this.readouts(ctx, st);
  }

  /** the path: the run-up, the loop and the way out, dotted, a bright line where the ship's been; the loop's angles round it */
  private path(ctx: CanvasRenderingContext2D, cam: Cam, s: number, words: Words) {
    const pts: Array<{ s: number; p: [number, number, number] | null }> = [];
    for (let i = 0; i <= 160; i++) {
      const t = -1 + (i / 160) * 2.4;
      pts.push({ s: t, p: project(cam, poseAt(t).pos) });
    }
    ctx.save();
    ctx.lineJoin = 'round';
    const stroke = (pick: (t: number) => boolean, width: number, color: string) => {
      ctx.beginPath();
      let on = false;
      for (const { s: t, p } of pts) {
        if (!p || !pick(t)) {
          on = false;
          continue;
        }
        if (on) ctx.lineTo(p[0], p[1]);
        else ctx.moveTo(p[0], p[1]);
        on = true;
      }
      ctx.lineWidth = width;
      ctx.strokeStyle = color;
      ctx.stroke();
    };
    // (dots, not a dashed line: a dash costs far more to draw)
    ctx.beginPath();
    for (const { s: t, p } of pts) if (p && t > s) ctx.rect(p[0] - 1, p[1] - 1, 2, 2);
    ctx.fillStyle = 'rgba(92,242,255,0.5)';
    ctx.fill();
    stroke((t) => t <= s, 6, 'rgba(92,242,255,0.18)');
    stroke((t) => t <= s, 2, 'rgba(180,250,255,0.95)');
    // the angles round the loop, every 30°, named every 90°
    ctx.font = '700 11px Orbitron, "Secular One", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let d = 0; d < 360; d += 30) {
      const a = (d * Math.PI) / 180;
      const on: V3 = [R * Math.sin(a), R - R * Math.cos(a), 0];
      const out = norm(sub(on, [0, R, 0]));
      const p0 = project(cam, on);
      const p1 = project(cam, add(on, mul(out, d % 90 ? 0.25 : 0.4)));
      if (!p0 || !p1) continue;
      ctx.beginPath();
      ctx.moveTo(p0[0], p0[1]);
      ctx.lineTo(p1[0], p1[1]);
      ctx.lineWidth = d % 90 ? 1 : 2;
      ctx.strokeStyle = angleAt(s) * (180 / Math.PI) >= d && s > 0 ? 'rgba(180,250,255,0.9)' : 'rgba(92,242,255,0.4)';
      ctx.stroke();
      if (d % 90 === 0) {
        const p2 = project(cam, add(on, mul(out, 0.85)));
        if (p2) {
          ctx.fillStyle = 'rgba(180,250,255,0.75)';
          ctx.fillText(`${d}°`, p2[0], p2[1]);
        }
      }
    }
    // its middle, where the turning force points
    const c = project(cam, [0, R, 0]);
    if (c && s > 0 && s < 1.05) {
      ctx.strokeStyle = 'rgba(255,79,216,0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(c[0] - 7, c[1]);
      ctx.lineTo(c[0] + 7, c[1]);
      ctx.moveTo(c[0], c[1] - 7);
      ctx.lineTo(c[0], c[1] + 7);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,160,235,0.85)';
      ctx.font = '600 11px Orbitron, "Secular One", sans-serif';
      ctx.fillText(words.centre, c[0], c[1] + 16);
    }
    // the run-up's start
    const start = project(cam, [-RUN_UP, 0, 0]);
    if (start) {
      ctx.fillStyle = 'rgba(92,242,255,0.6)';
      ctx.fillRect(start[0] - 3, start[1] - 3, 6, 6);
    }
    ctx.restore();
  }

  /** the engine's flame, flickering out of the nozzle: a jagged tongue, inked round, white at its heart */
  private flame(ctx: CanvasRenderingContext2D, cam: Cam, pose: ReturnType<typeof poseAt>, thrust: number, st: PaintState) {
    const frozen = st.frame.kind === 'hold';
    const r = rng(frozen ? 3 + st.frame.index : Math.floor(st.now / 40));
    const back = mul(pose.forward, -1);
    const side = norm(cross(pose.forward, [0, 0, 1]));
    const base = toWorld(pose, this.model.nozzle);
    const len = (1.1 + (st.calm ? 0.2 : r() * 0.8)) * thrust * (1 + st.frame.rush * 0.6);
    const outline: Array<[number, number]> = [];
    const N = 7;
    for (const sign of [1, -1]) {
      for (let i = 0; i <= N; i++) {
        const t = sign > 0 ? i / N : 1 - i / N;
        const width = 0.22 * (1 - t) ** 0.8 * (i % 2 ? 1.25 : 0.8);
        const p = project(cam, add(add(base, mul(back, t * len)), mul(side, sign * width)));
        if (p) outline.push([p[0], p[1]]);
      }
    }
    if (outline.length < 4) return;
    const tip = project(cam, add(base, mul(back, len)));
    const b0 = project(cam, base);
    if (!tip || !b0) return;
    ctx.save();
    const g = ctx.createLinearGradient(b0[0], b0[1], tip[0], tip[1]);
    g.addColorStop(0, '#fff8dc');
    g.addColorStop(0.3, '#ffb347');
    g.addColorStop(0.75, '#ff4f1e');
    g.addColorStop(1, 'rgba(255,40,80,0)');
    ctx.beginPath();
    outline.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(10,6,20,0.85)';
    ctx.stroke();
    ctx.restore();
  }

  /** the numbers: the title, the speed, the g, the angle, and what space hasn't got */
  private readouts(ctx: CanvasRenderingContext2D, st: PaintState) {
    const { split, words, frame: f } = st;
    const right = st.w - (split.portrait ? 14 : 20);
    // (at the blueprint's top right; upright, where the cut would clip them, along its foot)
    const top = split.portrait ? st.h - 76 : 30;
    ctx.save();
    ctx.direction = words.rtl ? 'rtl' : 'ltr';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#ffd36b';
    ctx.font = '800 15px Orbitron, "Secular One", sans-serif';
    ctx.fillText(words.title, right, top);
    ctx.fillStyle = 'rgba(92,242,255,0.7)';
    ctx.font = '400 12px "Dela Gothic One", "Noto Sans JP", sans-serif';
    ctx.fillText(words.jp, right, top + 17);
    const g = feltG(f.s);
    const rows: Array<[string, string, string]> = [
      [words.speed, `${Math.round(speedAt(f.s) * 3.6)} ${words.kmh}`, '#bff9ff'],
      ['G', `${g.toFixed(1)}`, g > 2.5 ? '#ff6ad5' : g > 1.5 ? '#ffd36b' : '#bff9ff'],
      [words.angle, `${Math.round((angleAt(f.s) * 180) / Math.PI)}°`, '#bff9ff'],
    ];
    ctx.font = '700 13px Orbitron, "Secular One", sans-serif';
    let y = top + 42;
    if (split.portrait) {
      // (upright, on one line: the speed, the g, the angle)
      ctx.fillStyle = '#bff9ff';
      ctx.fillText(rows.map(([label, value]) => (label === 'G' ? `${value} G` : value)).join(' · '), right, top + 36);
      y = top + 54;
    } else {
      // (the name first, as each language reads)
      rows.forEach(([label, value, color]) => {
        ctx.fillStyle = color;
        ctx.fillText(value, words.rtl ? right - 64 : right, y);
        ctx.fillStyle = 'rgba(92,242,255,0.6)';
        ctx.fillText(label, words.rtl ? right : right - 92, y);
        y += 19;
      });
      y += 4;
    }
    ctx.font = '600 11px Quicksand, "Secular One", sans-serif';
    ctx.fillStyle = 'rgba(191,249,255,0.65)';
    ctx.fillText(words.noAir, right, y);
    ctx.restore();
  }
}

// ---- helpers ----

function clipTo(ctx: CanvasRenderingContext2D, poly: P2[]) {
  ctx.beginPath();
  poly.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.clip();
}

/** manga's focus lines: thin wedges from beyond the screen's edge in towards `at`, stopping short of it */
function focusLines(ctx: CanvasRenderingContext2D, at: P2, w: number, h: number, inner: number, count: number, color: string, alpha: number, r: () => number) {
  const far = Math.hypot(w, h);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < count; i++) {
    const a = r() * Math.PI * 2;
    const start = inner * (0.8 + r() * 0.9);
    const half = (0.002 + r() * 0.009) * (1 + start / far);
    ctx.moveTo(at[0] + Math.cos(a) * start, at[1] + Math.sin(a) * start);
    ctx.lineTo(at[0] + Math.cos(a - half) * far, at[1] + Math.sin(a - half) * far);
    ctx.lineTo(at[0] + Math.cos(a + half) * far, at[1] + Math.sin(a + half) * far);
    ctx.closePath();
  }
  ctx.fill();
  ctx.restore();
}

/** a point of the ship's own frame, where it is now */
function toWorld(pose: ReturnType<typeof poseAt>, [x, y, z]: V3): V3 {
  const right = cross(pose.forward, pose.up);
  return add(pose.pos, add(add(mul(right, x), mul(pose.up, y)), mul(pose.forward, z)));
}

/** a reused buffer, so a frame allocates nothing */
const scratch: Float32Array[] = [];
function buffer(slot: number, n: number): Float32Array {
  if (!scratch[slot] || scratch[slot].length < n) scratch[slot] = new Float32Array(n);
  return scratch[slot];
}

/**
 * Every point of a part of the ship on the screen, once a frame (x, y and
 * how far away; NaN behind the camera): the camera's axes are turned into the
 * ship's own frame first, so each point is three dot products and a divide.
 */
function projectPart(cam: Cam, pose: ReturnType<typeof poseAt>, arr: Float32Array, out: Float32Array) {
  const right = cross(pose.forward, pose.up);
  const o = sub(pose.pos, cam.eye);
  const axis = (c: V3): [number, number, number, number] => [dot(right, c), dot(pose.up, c), dot(pose.forward, c), dot(o, c)];
  const [xr, xu, xf, x0] = axis(cam.right);
  const [yr, yu, yf, y0] = axis(cam.up);
  const [zr, zu, zf, z0] = axis(cam.fwd);
  const cs = Math.cos(cam.roll);
  const sn = Math.sin(cam.roll);
  for (let i = 0; i < arr.length; i += 3) {
    const a = arr[i];
    const b = arr[i + 1];
    const c = arr[i + 2];
    const z = z0 + a * zr + b * zu + c * zf;
    if (z < 0.2) {
      out[i] = NaN;
      continue;
    }
    const x = ((x0 + a * xr + b * xu + c * xf) / z) * cam.f;
    const y = (-(y0 + a * yr + b * yu + c * yf) / z) * cam.f;
    out[i] = cam.cx + x * cs - y * sn;
    out[i + 1] = cam.cy + x * sn + y * cs;
    out[i + 2] = z;
  }
}

/** the ship's wireframe: the far side faint, the near side bright with a glow (or, a ghost, all one faint colour) */
function drawShip(ctx: CanvasRenderingContext2D, cam: Cam, model: ShipModel, pose: ReturnType<typeof poseAt>, alpha: number, color: string, ghost: boolean) {
  const centre = project(cam, pose.pos);
  if (!centre) return;
  const parts = { hull: model.hull, trim: model.trim, hot: model.hot };
  const seen = {} as Record<keyof typeof parts, Float32Array>;
  (Object.keys(parts) as Array<keyof typeof parts>).forEach((k, slot) => {
    if (ghost && k === 'trim') return;
    seen[k] = buffer(slot, parts[k].length);
    projectPart(cam, pose, parts[k], seen[k]);
  });
  const pass = (k: keyof typeof parts, stroke: string, near: boolean | null, width: number, a: number) => {
    const p = seen[k];
    const n = parts[k].length;
    ctx.beginPath();
    for (let i = 0; i < n; i += 6) {
      if (Number.isNaN(p[i]) || Number.isNaN(p[i + 3])) continue;
      if (near !== null && (p[i + 2] + p[i + 5]) / 2 < centre[2] !== near) continue;
      ctx.moveTo(p[i], p[i + 1]);
      ctx.lineTo(p[i + 3], p[i + 4]);
    }
    ctx.globalAlpha = a;
    ctx.lineWidth = width;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  };
  ctx.save();
  ctx.lineCap = 'round';
  if (ghost) {
    pass('hull', color, null, 1.2, alpha);
    pass('hot', color, null, 1.2, alpha);
  } else {
    pass('hull', color, false, 1, 0.28 * alpha);
    pass('hot', '#ff8a1e', false, 1, 0.3 * alpha);
    pass('hull', color, true, 5, 0.16 * alpha);
    pass('hull', '#d8fdff', true, 1.4, alpha);
    pass('trim', '#ffffff', true, 1.8, alpha);
    pass('trim', '#ffffff', false, 1, 0.3 * alpha);
    pass('hot', '#ffb35c', true, 1.8, alpha);
  }
  ctx.restore();
}

/** an arrow in 3D from `from` along `dir`, `len` long, inked and labelled at its tip (or its tail); its middle on the screen */
function arrow3(
  ctx: CanvasRenderingContext2D,
  cam: Cam,
  from: V3,
  dir: V3,
  len: number,
  color: string,
  label: string,
  emphasis: number,
  rtl: boolean,
  hollow = false,
  tail = false,
): [number, number] | null {
  if (len < 0.05) return null;
  const a = project(cam, from);
  const b = project(cam, add(from, mul(dir, len)));
  if (!a || !b) return null;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l = Math.hypot(dx, dy);
  if (l < 4) return null;
  const ux = dx / l;
  const uy = dy / l;
  const k = Math.max(0.6, Math.min(1.4, emphasis));
  const shaft = (hollow ? 3 : 6) * k;
  const head = Math.min(l * 0.45, 18 * k);
  const hw = 11 * k;
  const bx = b[0] - ux * head;
  const by = b[1] - uy * head;
  const outline = (): void => {
    ctx.beginPath();
    ctx.moveTo(a[0] - uy * shaft * 0.5, a[1] + ux * shaft * 0.5);
    ctx.lineTo(bx - uy * shaft * 0.5, by + ux * shaft * 0.5);
    ctx.lineTo(bx - uy * hw, by + ux * hw);
    ctx.lineTo(b[0], b[1]);
    ctx.lineTo(bx + uy * hw, by - ux * hw);
    ctx.lineTo(bx + uy * shaft * 0.5, by - ux * shaft * 0.5);
    ctx.lineTo(a[0] + uy * shaft * 0.5, a[1] - ux * shaft * 0.5);
    ctx.closePath();
  };
  ctx.save();
  ctx.lineJoin = 'round';
  outline();
  if (emphasis > 1.05) {
    // (the one being explained glows)
    ctx.globalAlpha = 0.3;
    ctx.lineWidth = 14;
    ctx.strokeStyle = color;
    ctx.stroke();
  }
  ctx.globalAlpha = Math.min(1, emphasis);
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(5,6,12,0.9)';
  ctx.stroke();
  if (hollow) {
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = color;
    ctx.stroke();
  } else {
    ctx.fillStyle = color;
    ctx.fill();
  }
  ctx.restore();
  if (tail) tag(ctx, a[0] - ux * 16, a[1] - uy * 16, label, color, emphasis, rtl);
  else tag(ctx, b[0] + ux * 14, b[1] + uy * 14, label, color, emphasis, rtl);
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

/** a label in a tag, its colour's, dark letters */
function tag(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, color: string, emphasis: number, rtl: boolean) {
  const size = emphasis > 1.05 ? 14 : 11;
  ctx.save();
  ctx.globalAlpha = Math.min(1, Math.max(0.35, emphasis));
  ctx.font = `800 ${size}px Orbitron, "Secular One", sans-serif`;
  ctx.direction = rtl ? 'rtl' : 'ltr';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const w = ctx.measureText(text).width + 12;
  const h = size + 9;
  ctx.fillStyle = 'rgba(5,6,12,0.9)';
  ctx.fillRect(x - w / 2 - 2, y - h / 2 - 2, w + 4, h + 4);
  ctx.fillStyle = color;
  ctx.fillRect(x - w / 2, y - h / 2, w, h);
  ctx.fillStyle = '#05060c';
  ctx.fillText(text, x, y + 1);
  ctx.restore();
}

/** an X over something switched off */
function cross2(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.save();
  ctx.lineCap = 'round';
  for (const [width, color] of [
    [9, '#05060c'],
    [5, '#ff3d3d'],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(x - 12, y - 12);
    ctx.lineTo(x + 12, y + 12);
    ctx.moveTo(x + 12, y - 12);
    ctx.lineTo(x - 12, y + 12);
    ctx.lineWidth = width;
    ctx.strokeStyle = color;
    ctx.stroke();
  }
  ctx.restore();
}
