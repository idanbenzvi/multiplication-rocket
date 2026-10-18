import { glow, rgba } from '../traffic/trafficArt';

// Monster Sun's arrival (after React Bits Pro's Eclipse): out of the warp, a
// sun hangs in total eclipse, a dark disc in a corona of streamers that
// slowly turn and shift from gold to pink. As the pilot's ship flies in, the
// corona brightens, prominences arc off its rim, a diamond ring flashes on its
// edge, and two angry eyes open in the dark: it's the monster sun, and they
// follow the ship. It stays behind the lobby, glowing, flaring now and then
// and blinking. With reduced motion it's there from the start and holds still.

const TAU = Math.PI * 2;
const STREAMERS = 72;
/** the diamond ring flashes on the rim here (radians, clockwise from the right) and then */
const DIAMOND_AT = -0.75;
const DIAMOND_S = [1.1, 1.75];
/** the eyes open */
const EYES_S = 1.45;

const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const easeOut = (t: number) => 1 - (1 - t) ** 3;

type RGB = [number, number, number];
const hex = (h: string): RGB => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const mix = (a: RGB, b: RGB, m: number): RGB => [a[0] + (b[0] - a[0]) * m, a[1] + (b[1] - a[1]) * m, a[2] + (b[2] - a[2]) * m];
const css = (c: RGB, a: number) => `rgba(${c[0] | 0}, ${c[1] | 0}, ${c[2] | 0}, ${a})`;
/** the corona's colors (near the rim, further out, furthest), drifting from one palette to the other */
const GOLD: RGB[] = [hex('#fff4d6'), hex('#ffb04a'), hex('#ff5c8a')];
const PINK: RGB[] = [hex('#ffe9f2'), hex('#ff7a59'), hex('#b45cff')];

interface Flare {
  a: number;
  born: number;
  life: number;
  /** how high it arcs, and how wide its feet are apart, in sun radii and radians */
  height: number;
  spread: number;
}

export interface Point {
  x: number;
  y: number;
}

export class EclipseScene {
  private readonly calm: boolean;
  private flares: Flare[] = [];
  private nextFlare = 2.6;
  private readonly streamers = Array.from({ length: STREAMERS }, () => ({ phase: Math.random() * TAU, rate: 0.5 + Math.random() * 0.9, reach: 0.6 + Math.random() * 0.5 }));

  constructor(calm: boolean) {
    this.calm = calm;
    // the corona erupts as the ship comes in
    if (!calm) {
      this.flares.push({ a: -2.3, born: 0.65, life: 1.6, height: 0.55, spread: 0.2 });
      this.flares.push({ a: 0.5, born: 0.95, life: 1.5, height: 0.45, spread: 0.16 });
      this.flares.push({ a: 2.5, born: 1.2, life: 1.7, height: 0.6, spread: 0.22 });
    }
  }

  /** where the sun hangs, and its radius */
  sun(w: number, h: number): Point & { r: number } {
    const wide = w > h;
    return { x: w / 2, y: h * (wide ? 0.36 : 0.28), r: Math.min(w, h) * (wide ? 0.2 : 0.24) };
  }

  /** where the ship flies to: just below the sun, against its glow */
  shipTarget(w: number, h: number): Point {
    const s = this.sun(w, h);
    return { x: s.x - s.r * 0.18, y: s.y + s.r * 1.3 };
  }

  /** `t` seconds since it opened; `look` is where the eyes look (the ship) */
  draw(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, look: Point | null) {
    const s = this.sun(w, h);
    const R = s.r;
    // the corona brightens as it opens, flares up as the ship comes in, and breathes
    const intro = this.calm ? 1 : easeOut(clamp01((t - 0.2) / 1.2));
    const b = intro * (0.8 + 0.06 * Math.sin(t * 0.9)) + (this.calm ? 0 : 0.45 * Math.exp(-(((t - 1.15) / 0.25) ** 2)));
    const m = 0.5 + 0.5 * Math.sin(t * 0.35);
    const [c0, c1, c2] = GOLD.map((g, i) => mix(g, PINK[i], m));
    const spin = this.calm ? 0 : t * 0.04;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // the outer glow
    const og = ctx.createRadialGradient(s.x, s.y, R * 0.95, s.x, s.y, R * 3.3);
    og.addColorStop(0, css(c1, 0.75 * b));
    og.addColorStop(0.12, css(c1, 0.4 * b));
    og.addColorStop(0.35, css(c2, 0.16 * b));
    og.addColorStop(1, css(c2, 0));
    ctx.fillStyle = og;
    ctx.fillRect(s.x - R * 3.3, s.y - R * 3.3, R * 6.6, R * 6.6);
    // the streamers, each swelling and shrinking at its own pace
    const half = (TAU / STREAMERS) * 0.9;
    this.streamers.forEach((st, i) => {
      const a = (i / STREAMERS) * TAU + spin;
      const pulse = this.calm ? 0.5 : 0.5 + 0.5 * Math.sin(t * st.rate + st.phase);
      const len = R * st.reach * (0.25 + 0.75 * pulse) * (0.75 + 0.25 * Math.sin(a * 3 + t * 0.3)) * (0.6 + 0.4 * intro);
      const tipX = s.x + Math.cos(a) * (R + len);
      const tipY = s.y + Math.sin(a) * (R + len);
      const g = ctx.createLinearGradient(s.x + Math.cos(a) * R, s.y + Math.sin(a) * R, tipX, tipY);
      g.addColorStop(0, css(c0, 0.5 * b));
      g.addColorStop(0.35, css(c1, 0.28 * b));
      g.addColorStop(1, css(c2, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(s.x + Math.cos(a - half) * R * 0.98, s.y + Math.sin(a - half) * R * 0.98);
      ctx.lineTo(tipX, tipY);
      ctx.lineTo(s.x + Math.cos(a + half) * R * 0.98, s.y + Math.sin(a + half) * R * 0.98);
      ctx.closePath();
      ctx.fill();
    });
    // the bright inner ring hugging the rim
    const ring = ctx.createRadialGradient(s.x, s.y, R * 0.97, s.x, s.y, R * 1.22);
    ring.addColorStop(0, css(c0, 0.95 * b));
    ring.addColorStop(0.25, css(c1, 0.5 * b));
    ring.addColorStop(1, css(c1, 0));
    ctx.fillStyle = ring;
    ctx.beginPath();
    ctx.arc(s.x, s.y, R * 1.22, 0, TAU);
    ctx.fill();
    this.drawFlares(ctx, s, R, t, c0, c1);
    ctx.restore();

    this.drawDisc(ctx, s, R, t, b);
    this.drawEyes(ctx, s, R, t, look);
    if (!this.calm) this.drawDiamond(ctx, w, s, R, t);
  }

  /** prominences: loops of fire arcing off the rim, growing and fading; one every few seconds once it's open */
  private drawFlares(ctx: CanvasRenderingContext2D, s: Point, R: number, t: number, c0: RGB, c1: RGB) {
    if (!this.calm && t > this.nextFlare) {
      this.flares.push({ a: Math.random() * TAU, born: t, life: 1.6 + Math.random() * 0.8, height: 0.3 + Math.random() * 0.35, spread: 0.12 + Math.random() * 0.12 });
      this.nextFlare = t + 2.8 + Math.random() * 3;
    }
    this.flares = this.flares.filter((f) => t < f.born + f.life);
    ctx.lineCap = 'round';
    for (const f of this.flares) {
      const k = (t - f.born) / f.life;
      if (k < 0) continue;
      const alpha = k < 0.2 ? k / 0.2 : 1 - (k - 0.2) / 0.8;
      const rise = R * f.height * easeOut(Math.min(1, k * 1.6));
      const twist = f.spread * 0.35 * Math.sin(k * Math.PI);
      const foot = (da: number) => ({ x: s.x + Math.cos(f.a + da) * R * 0.99, y: s.y + Math.sin(f.a + da) * R * 0.99 });
      const p0 = foot(-f.spread);
      const p1 = foot(f.spread);
      const cx = s.x + Math.cos(f.a + twist) * (R + rise * 2);
      const cy = s.y + Math.sin(f.a + twist) * (R + rise * 2);
      for (const [width, a, c] of [
        [0.07, 0.22, c1],
        [0.035, 0.55, c1],
        [0.014, 0.9, c0],
      ] as Array<[number, number, RGB]>) {
        ctx.strokeStyle = css(c, a * alpha);
        ctx.lineWidth = Math.max(1, R * width);
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.quadraticCurveTo(cx, cy, p1.x, p1.y);
        ctx.stroke();
      }
    }
  }

  /** the dark disc, its outline wobbling, lit along one edge */
  private drawDisc(ctx: CanvasRenderingContext2D, s: Point, R: number, t: number, b: number) {
    const wob = this.calm ? 0 : 1;
    ctx.save();
    ctx.beginPath();
    for (let i = 0; i <= 64; i++) {
      const a = (i / 64) * TAU;
      const r = R * (1 + wob * (0.012 * Math.sin(a * 3 + t * 1.1) + 0.008 * Math.sin(a * 5 - t * 1.4)));
      const x = s.x + Math.cos(a) * r;
      const y = s.y + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    const g = ctx.createRadialGradient(s.x - R * 0.25, s.y - R * 0.3, 0, s.x, s.y, R);
    g.addColorStop(0, '#1d1030');
    g.addColorStop(1, '#06030c');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = `rgba(255, 226, 190, ${0.35 * b})`;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  /** two angry glowing eyes open in the dark, look at the ship, and blink now and then */
  private drawEyes(ctx: CanvasRenderingContext2D, s: Point, R: number, t: number, look: Point | null) {
    const open = this.calm ? 1 : easeOut(clamp01((t - EYES_S) / 0.2));
    if (open <= 0) return;
    // a blink every few seconds
    const cycle = (t - EYES_S) % 3.9;
    const lid = open * (this.calm || t < EYES_S + 1 || cycle > 0.14 ? 1 : Math.abs(cycle / 0.07 - 1));
    if (lid <= 0.02) return;
    const dir = look ? { x: look.x - s.x, y: look.y - s.y } : { x: 0, y: 1 };
    const len = Math.hypot(dir.x, dir.y) || 1;
    const gaze = { x: (dir.x / len) * R * 0.05, y: (dir.y / len) * R * 0.05 };
    for (const side of [-1, 1]) {
      const ex = s.x + side * R * 0.34;
      const ey = s.y - R * 0.04;
      const rx = R * 0.17;
      const ry = R * 0.1 * lid;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.6 * open;
      const halo = R * 0.75;
      ctx.drawImage(glow('#ff3b5c'), ex - halo / 2, ey - halo / 2, halo, halo);
      ctx.restore();
      ctx.save();
      ctx.translate(ex, ey);
      // slanted down towards the middle: grumpy
      ctx.rotate(-side * 0.32);
      ctx.beginPath();
      ctx.ellipse(0, 0, rx, ry, 0, 0, TAU);
      ctx.clip();
      const g = ctx.createRadialGradient(gaze.x, gaze.y, 0, 0, 0, rx);
      g.addColorStop(0, '#fff3d6');
      g.addColorStop(0.35, '#ffb04a');
      g.addColorStop(1, '#ff3b5c');
      ctx.fillStyle = g;
      ctx.fillRect(-rx, -ry, rx * 2, ry * 2);
      // the pupil, on the ship
      ctx.beginPath();
      ctx.ellipse(gaze.x * 1.6, gaze.y * 1.6, rx * 0.32, ry * 0.75, 0, 0, TAU);
      ctx.fillStyle = '#2b0b14';
      ctx.fill();
      // a heavy lid across the top
      ctx.fillStyle = '#0d0618';
      ctx.fillRect(-rx, -ry, rx * 2, ry * 0.55);
      ctx.restore();
    }
  }

  /** the diamond ring: a blinding point on the rim with a star of spikes and a lens streak, as the eclipse peaks */
  private drawDiamond(ctx: CanvasRenderingContext2D, w: number, s: Point, R: number, t: number) {
    const k = (t - DIAMOND_S[0]) / (DIAMOND_S[1] - DIAMOND_S[0]);
    if (k <= 0 || k >= 1) return;
    const f = Math.sin(Math.PI * k) ** 0.7;
    const x = s.x + Math.cos(DIAMOND_AT) * R;
    const y = s.y + Math.sin(DIAMOND_AT) * R;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const size = R * 1.7 * f;
    ctx.drawImage(glow('#fff1c9'), x - size / 2, y - size / 2, size, size);
    ctx.drawImage(glow('#ffffff'), x - size / 4, y - size / 4, size / 2, size / 2);
    ctx.translate(x, y);
    for (let i = 0; i < 4; i++) {
      ctx.rotate(Math.PI / 2);
      const L = R * (i % 2 ? 0.9 : 1.5) * f;
      const g = ctx.createLinearGradient(0, 0, L, 0);
      g.addColorStop(0, `rgba(255, 255, 255, ${0.9 * f})`);
      g.addColorStop(1, 'rgba(255, 240, 210, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, -R * 0.025);
      ctx.lineTo(L, 0);
      ctx.lineTo(0, R * 0.025);
      ctx.closePath();
      ctx.fill();
    }
    // (four quarter turns: back to level)
    const sw = w * 0.7 * f;
    const lg = ctx.createLinearGradient(-sw / 2, 0, sw / 2, 0);
    lg.addColorStop(0, rgba('#ffb04a', 0));
    lg.addColorStop(0.5, rgba('#fff4d6', 0.7 * f));
    lg.addColorStop(1, rgba('#ffb04a', 0));
    ctx.fillStyle = lg;
    ctx.fillRect(-sw / 2, -1.5, sw, 3);
    ctx.restore();
  }
}
