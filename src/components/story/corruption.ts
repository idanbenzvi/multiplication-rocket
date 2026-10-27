import type { Point } from '../arrival/eclipse';
import { css, hex, mix } from '../arrival/eclipse';
import { glyphSprite, tileSprite } from './bloom';
import { TAU, clamp01 } from './storyMath';

// What the Black Sun does to the numbers it swallows, in the story
// (StorySun): each one splashes as it goes in, a crown of glyph tiles thrown
// up off its rim that falls back in (after React Bits Pro's Glyph Stream's
// splash; ours), and it spits out what's left of them, corrupted: liquid
// made of glowing characters, heavier where it's thicker (after its Liquid
// ASCII; ours), in gushes as it swallows and in arcs leaping off it all the
// while, some falling back like a sun's prominences, some thrown away.
//
// Both work round the sun in its own units (its radius is one, from its
// middle), and draw on a grid of character cells sized to it on screen.

/** something round the sun: where, how fast, since when, for how long */
interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  born: number;
  life: number;
}

/** the sun's pull, in its radii per second², at its rim */
const PULL = 1.25;

/** the sun's pull on `m` for `dt` seconds, and on it goes */
function fall(m: Mote, dt: number, drag = 0) {
  const d2 = m.x * m.x + m.y * m.y;
  const d = Math.sqrt(d2) || 1;
  const a = PULL / d2;
  m.vx -= (m.x / d) * a * dt;
  m.vy -= (m.y / d) * a * dt;
  if (drag) {
    m.vx *= Math.exp(-dt * drag);
    m.vy *= Math.exp(-dt * drag);
  }
  m.x += m.vx * dt;
  m.y += m.vy * dt;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = (s: string) => s[Math.floor(Math.random() * s.length)];
const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

// ---------- the splash ----------

/** the stream's head, fresh, and its tail, old: violet to pink */
const HEAD = hex('#7c4dff');
const TAIL = hex('#ff8ae0');
const SHADES = 6;
const SHADE = Array.from({ length: SHADES }, (_, i) => css(mix(HEAD, TAIL, i / (SHADES - 1)), 1));

/** sprites by colour, then character (looked up every frame, so kept apart from bloom.ts's own) */
function sprites(colors: string[], make: (ch: string, color: string) => HTMLCanvasElement) {
  const byColor = colors.map(() => new Map<string, HTMLCanvasElement>());
  return (ch: string, i: number) => {
    let c = byColor[i].get(ch);
    if (!c) byColor[i].set(ch, (c = make(ch, colors[i])));
    return c;
  };
}
const tile = sprites(SHADE, tileSprite);

interface Drop extends Mote {
  ch: string;
  /** when its character changes next (they flicker fast while fresh, and settle) */
  flip: number;
  /** where it was, a moment ago and before: its tail */
  trail: Point[];
}

export class GlyphSplash {
  private drops: Drop[] = [];
  private t = 0;
  private lastTrail = 0;

  /** a number swallowed at `at` (on the rim): a crown of tiles thrown up off it, its own digits among them */
  splash(at: Point, text: string) {
    const out = Math.atan2(at.y, at.x);
    const n = 26;
    for (let i = 0; i < n; i++) {
      // a crown: up and out to either side, a few straight up
      const a = out + (i / (n - 1) - 0.5) * 2.6 + rand(-0.15, 0.15);
      const v = rand(1.3, 2.5) * (1 - 0.3 * Math.abs(i / (n - 1) - 0.5));
      this.drops.push({
        x: at.x,
        y: at.y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        born: this.t,
        life: rand(0.75, 1.3),
        ch: i < text.length ? text[i] : pick(CHARS),
        flip: this.t + 0.05,
        trail: [],
      });
    }
  }

  step(dt: number) {
    this.t += dt;
    const t = this.t;
    const trail = t - this.lastTrail > 0.035;
    if (trail) this.lastTrail = t;
    for (const d of this.drops) {
      if (trail) {
        d.trail.unshift({ x: d.x, y: d.y });
        if (d.trail.length > 3) d.trail.pop();
      }
      fall(d, dt, 0.8);
      if (t >= d.flip) {
        d.ch = pick(CHARS);
        // (fast at first, slower as it ages)
        d.flip = t + 0.06 + 0.25 * clamp01((t - d.born) / d.life);
      }
    }
    this.drops = this.drops.filter((d) => t - d.born < d.life && d.x * d.x + d.y * d.y > 0.9);
  }

  /** on the sun at `s` (its middle on screen, and its radius) */
  draw(ctx: CanvasRenderingContext2D, s: Point & { r: number }) {
    if (!this.drops.length) return;
    const cell = Math.max(8, Math.min(20, s.r * 0.12));
    // one tile to a cell: the freshest there
    const cells = new Map<number, { gx: number; gy: number; ch: string; shade: number; a: number }>();
    const put = (p: Point, d: Drop, older: number) => {
      const gx = Math.round((p.x * s.r) / cell);
      const gy = Math.round((p.y * s.r) / cell);
      const k = (this.t - d.born) / d.life;
      const shade = Math.min(SHADES - 1, Math.floor(k * (SHADES - 1)) + older);
      const a = (1 - k * k) * (1 - older * 0.28);
      const key = gx * 4096 + gy;
      const there = cells.get(key);
      if (!there || there.a < a) cells.set(key, { gx, gy, ch: d.ch, shade, a });
    };
    for (const d of this.drops) {
      put(d, d, 0);
      d.trail.forEach((p, i) => put(p, d, i + 1));
    }
    ctx.save();
    for (const c of cells.values()) {
      ctx.globalAlpha = c.a;
      ctx.drawImage(tile(c.ch, c.shade), s.x + c.gx * cell - cell / 2, s.y + c.gy * cell - cell / 2, cell, cell);
    }
    ctx.restore();
  }
}

// ---------- the liquid ----------

/** light to heavy: where the liquid's thin, and thick */
const RAMP = '.:-~=+*#%@';
/** the corrupted: what a swallowed number's digits come out as */
const GLITCH = '#%@&?!$*/\\<>';
/** its colours, from its thin edges to its thick middles */
const HUES = ['#6b3cff', '#a64dff', '#e04dff', '#ff6fd8'];
const glyph = sprites(HUES, glyphSprite);
/** how often the liquid's picture is made again (a second): a terminal's refresh, between them it's just moved and scaled with the sun */
const REFRESH = 30;
/** how far out it's seen (sun radii) */
const FAR = 4;

interface Blob extends Mote {
  /** how much of it there is (how thick it makes the liquid) */
  mass: number;
  /** a swallowed number's digits, while they're still to be seen in it */
  digits: string;
}

export class AsciiFlares {
  private blobs: Blob[] = [];
  private t = 0;
  private next = 0;
  /** how many arcs leap off it a second (0: none, as when it's the Sun still) */
  rate = 0;
  /** (the grid, kept from frame to frame) */
  private dens = new Float32Array(0);
  private owner = new Int16Array(0);
  /** its picture: when it was made, for a sun how big, and where the sun's middle is in it (px) */
  private picture: HTMLCanvasElement | null = null;
  private made = { at: -Infinity, r: 1, x: 0, y: 0, w: 0, h: 0 };

  /** a number swallowed at `at`: what's left of it gushes out of the far side, corrupted, thrown away */
  gush(at: Point, text: string) {
    const a0 = Math.atan2(at.y, at.x) + Math.PI + rand(-0.6, 0.6);
    for (let i = 0; i < 11; i++) {
      const a = a0 + rand(-0.28, 0.28);
      const v = rand(1.15, 2.1);
      this.add(Math.cos(a0) * 1.02, Math.sin(a0) * 1.02, Math.cos(a) * v, Math.sin(a) * v, rand(1.6, 2.4), rand(0.9, 1.3), text, rand(0.05, 0.3));
    }
  }

  /** an arc of it leaping off the sun at a spot, most of it falling back in */
  private leap() {
    const a0 = Math.random() * TAU;
    // (all leaning the same way round, so it arcs)
    const lean = rand(-0.55, 0.55);
    const n = 12 + Math.floor(Math.random() * 7);
    const v0 = rand(0.95, 1.3);
    for (let i = 0; i < n; i++) {
      const a = a0 + lean + rand(-0.12, 0.12);
      const v = v0 * rand(0.85, 1.12) * (Math.random() < 0.12 ? 1.45 : 1);
      this.add(Math.cos(a0) * 1.02, Math.sin(a0) * 1.02, Math.cos(a) * v, Math.sin(a) * v, rand(2.2, 3.4), rand(0.6, 1), '', (i / n) * 0.5);
    }
  }

  private add(x: number, y: number, vx: number, vy: number, life: number, mass: number, digits: string, delay: number) {
    if (this.blobs.length > 220) return;
    this.blobs.push({ x, y, vx, vy, born: this.t + delay, life, mass, digits });
  }

  step(dt: number) {
    this.t += dt;
    const t = this.t;
    if (this.rate > 0 && t >= this.next) {
      this.leap();
      this.next = t + rand(0.5, 1.5) / this.rate;
    }
    for (const b of this.blobs) if (t >= b.born) fall(b, dt);
    // gone back in, gone too far, or gone
    this.blobs = this.blobs.filter((b) => t < b.born || (t - b.born < b.life && b.x * b.x + b.y * b.y > 0.92 && b.x * b.x + b.y * b.y < FAR * FAR));
  }

  /** on the sun at `s` (its middle on screen, and its radius) */
  draw(ctx: CanvasRenderingContext2D, s: Point & { r: number }) {
    const m = ctx.getTransform();
    const scale = Math.hypot(m.a, m.b) || 1;
    if (this.t - this.made.at >= 1 / REFRESH || Math.abs(s.r / this.made.r - 1) > 0.12) this.make(s.r, scale);
    const pic = this.picture;
    if (!pic || !this.made.w) return;
    const k = s.r / this.made.r;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(pic, s.x - this.made.x * k, s.y - this.made.y * k, this.made.w * k, this.made.h * k);
    ctx.restore();
  }

  /** its picture, round a sun of radius `r` (px), at `scale` device pixels to the px */
  private make(r: number, scale: number) {
    const t = this.t;
    this.made.at = t;
    this.made.r = r;
    this.made.w = 0;
    const live = this.blobs.filter((b) => t >= b.born);
    if (!live.length) return;
    // a character's cell: as tall as it, and narrower (a terminal's)
    const ch = Math.max(8, Math.min(18, r * 0.1));
    const cw = ch * 0.6;
    // the grid round the sun, as far out as the furthest of it
    let far = 1.4;
    for (const b of live) far = Math.max(far, Math.abs(b.x) + 0.3, Math.abs(b.y) + 0.3);
    far = Math.min(far, FAR + 0.3);
    const nx = Math.ceil((far * r) / cw);
    const ny = Math.ceil((far * r) / ch);
    const cols = nx * 2 + 1;
    const rows = ny * 2 + 1;
    if (this.dens.length < cols * rows) {
      this.dens = new Float32Array(cols * rows);
      this.owner = new Int16Array(cols * rows);
    }
    const dens = this.dens;
    const owner = this.owner;
    dens.fill(0, 0, cols * rows);
    owner.fill(-1, 0, cols * rows);
    // each lump of it, spread over the cells round it (the thicker the nearer its middle)
    const reach = Math.max(1.6 * ch, 0.3 * r);
    live.forEach((b, i) => {
      const age = (t - b.born) / b.life;
      const thin = 1.4 * b.mass * (1 - age * age) * Math.min(1, (t - b.born) / 0.15);
      const gx = (b.x * r) / cw + nx;
      const gy = (b.y * r) / ch + ny;
      const px = reach * (0.8 + 0.5 * age);
      const rx = px / cw;
      const ry = px / ch;
      const x0 = Math.max(0, Math.floor(gx - rx));
      const x1 = Math.min(cols - 1, Math.ceil(gx + rx));
      const y0 = Math.max(0, Math.floor(gy - ry));
      const y1 = Math.min(rows - 1, Math.ceil(gy + ry));
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const d2 = ((x - gx) / rx) ** 2 + ((y - gy) / ry) ** 2;
          if (d2 >= 1) continue;
          const w = (1 - d2) * (1 - d2) * thin;
          const k = y * cols + x;
          if (owner[k] < 0 || w > dens[k] * 0.6) owner[k] = i;
          dens[k] += w;
        }
      }
    });
    // drawn on its own canvas (no bigger than a screen's worth)
    const size = ch * 1.4;
    const w = cols * cw + size;
    const h = rows * ch + size;
    const dpr = Math.min(scale, 2048 / Math.max(w, h));
    const pic = (this.picture ??= document.createElement('canvas'));
    const pw = Math.ceil(w * dpr);
    const ph = Math.ceil(h * dpr);
    if (pic.width !== pw || pic.height !== ph) {
      pic.width = pw;
      pic.height = ph;
    }
    const g = pic.getContext('2d');
    if (!g) return;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, pw, ph);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.globalCompositeOperation = 'lighter';
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const k = y * cols + x;
        // (its surface shimmering, sloshing)
        const d = dens[k] * (0.85 + 0.15 * Math.sin(x * 0.55 + t * 4.1) * Math.sin(y * 0.7 - t * 3.3));
        if (d < 0.18) continue;
        const level = Math.min(1, (d - 0.18) / 1.4);
        const b = live[owner[k]];
        // a number's digits still in it, fresh out, and flickering corrupt
        const fresh = b && b.digits && t - b.born < 0.7;
        const flick = (x * 13 + y * 7 + Math.floor(t * 10)) % 5;
        const c = fresh ? (flick < 2 ? b.digits[(x + y) % b.digits.length] : GLITCH[(x * 7 + y * 3 + Math.floor(t * 12)) % GLITCH.length]) : RAMP[Math.min(RAMP.length - 1, Math.floor(level * RAMP.length))];
        g.globalAlpha = Math.min(1, 0.35 + level);
        g.drawImage(glyph(c, Math.min(HUES.length - 1, Math.floor(level * HUES.length + (fresh ? 1 : 0)))), x * cw, y * ch, size, size);
      }
    }
    // (where the sun's middle is in it, and how big it is, in px)
    this.made.x = nx * cw + size / 2;
    this.made.y = ny * ch + size / 2;
    this.made.w = w;
    this.made.h = h;
  }
}
