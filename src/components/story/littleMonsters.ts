import { EYE_R, GLYPHS, inMouth, type Design } from '../sun/monsterArt';
import { LITTLE_ONES } from '../sun/roster';
import { glow } from '../traffic/trafficArt';
import type { Point } from '../arrival/eclipse';
import { drawSprite, monsterGlyph } from './bloom';
import { TAU, clamp01, easeInOut, lerp } from './storyMath';

// The little monsters the Black Sun spits out as it turns, in the story's
// opening (openingScene.ts): Monster Sun's own (sun/roster.ts), made of
// characters as they are there, only smaller. Each one's spat out of the
// Sun's rim in a gush of its corrupted liquid (StorySun's spit), and its
// letters fly out of the liquid, still its violet and pink, coming together
// into the monster as they take on its colours; its eyes pop open last. Then
// it wobbles off into space, looking where it's going, growing a little as
// it comes nearer, and is gone before the camera goes over to Earth.
//
// They live in the opening's world (the Sun at 0, 0, its radius one, y
// down), and are drawn through its camera.

/** cells across a little one's grid (Monster Sun's have 29: these are seen small) */
const GRID = 17;
/** a little one's size, side to side (world units), as it's made, and how much bigger it grows on its way */
const SIZE = 1.4;
const GROW = 0.5;
/** how long its letters take to fly out of the liquid into place, the last of them setting off this long after the first (seconds) */
const FLY = 0.7;
const SPREAD = 0.55;
/** when its eyes pop open (seconds after it's spat out) */
const EYES_AT = 1.05;
/** the liquid's colours (corruption.ts's), which its letters are as they fly */
const LIQUID = ['#a64dff', '#e04dff'];
const MOUTH = '#c0163f';
/** where each comes out (radians, round the Sun: 0 right, y down) and how fast it's away (world units a second) */
const WAYS: Array<[number, number]> = [
  [-2.35, 1.5],
  [-0.55, 1.35],
  [0.4, 1.6],
  [2.15, 1.3],
  [-1.45, 1.45],
];

type Kind = 'body' | 'ray' | 'mouth';

interface Letter {
  /** its place on the monster's grid (-1 to 1 each way) */
  x: number;
  y: number;
  kind: Kind;
  color: string;
  ch: string;
  /** when its character changes next (seconds of the time that always runs) */
  flip: number;
  /** where in the liquid it starts from (world units), and how long after the monster's spat out it sets off */
  sx: number;
  sy: number;
  delay: number;
}

interface Little {
  design: Design;
  glyphs: string[];
  letters: Letter[];
  eyes: Array<[number, number]>;
  eyeR: number;
  /** the way it's going out (radians), and how fast it's going by the end */
  way: number;
  speed: number;
  /** when it was spat out (the time that always runs), and since then (s) */
  born: number;
  age: number;
  /** where it is (world units) */
  x: number;
  y: number;
  phase: number;
}

const pick = (set: string[]) => set[Math.floor(Math.random() * set.length)];
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const easeOut = (p: number) => 1 - (1 - p) ** 3;

/** its letters, on the coarser grid: as Monster Sun's buildMonster lays them out, but each starting in the liquid round where it's spat out */
function lettersOf(design: Design, way: number): Letter[] {
  const glyphs = design.glyphs ?? GLYPHS;
  const eyeR = design.eyeR ?? EYE_R;
  const h = (GRID - 1) / 2;
  const out: Letter[] = [];
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      const x = (c - h) / h;
      const y = (r - h) / h;
      if (design.eyes.some(([ex, ey]) => Math.hypot(x - ex, y - ey) < eyeR)) continue;
      let kind: Kind;
      if (design.body(x, y)) kind = inMouth(design.mouth, x, y) ? 'mouth' : 'body';
      else if (design.limbs?.(x, y)) kind = 'ray';
      else continue;
      const [hx, hy, hr] = design.heart ?? [0, 0, 0.22];
      const pal = design.palette;
      const color = kind === 'mouth' ? MOUTH : kind === 'ray' ? pal.ray : Math.hypot(x - hx, y - hy) < hr ? pal.core : pal.mid;
      // (from the liquid just inside the rim, round the spot it's spat from)
      const a = way + rand(-0.55, 0.55);
      const d = rand(0.72, 1.05);
      out.push({ x, y, kind, color, ch: pick(glyphs), flip: 0, sx: Math.cos(a) * d, sy: Math.sin(a) * d, delay: rand(0, SPREAD) * (0.4 + 0.6 * Math.hypot(x, y)) });
    }
  }
  return out;
}

export class LittleMonsters {
  private readonly calm: boolean;
  private readonly ones: Little[] = [];
  private spawned = 0;

  constructor(calm: boolean) {
    this.calm = calm;
  }

  /** how many there'll be */
  static readonly count = Math.min(WAYS.length, LITTLE_ONES.length);

  /** the next one, spat out now (`time`: the time that always runs); which way it's going, for the Sun to spit it that way */
  spawn(time: number): number {
    const i = this.spawned++;
    const design = LITTLE_ONES[i % LITTLE_ONES.length];
    const [way, speed] = WAYS[i % WAYS.length];
    const start = this.calm ? 2.7 : 1 + SIZE * 0.45;
    this.ones.push({
      design,
      glyphs: design.glyphs ?? GLYPHS,
      letters: lettersOf(design, way),
      eyes: design.eyes,
      eyeR: design.eyeR ?? EYE_R,
      way,
      speed,
      born: time,
      age: 0,
      x: Math.cos(way) * start,
      y: Math.sin(way) * start,
      phase: i * 1.7,
    });
    return way;
  }

  update(dt: number, time: number) {
    for (const m of this.ones) {
      m.age = time - m.born;
      if (this.calm) continue;
      // edging out as it's made, then away, faster and faster, curving a little
      const v = m.speed * (0.18 + 0.82 * easeInOut(clamp01((m.age - 0.9) / 1.6)));
      const way = m.way + 0.12 * Math.sin(m.age * 0.6 + m.phase);
      m.x += Math.cos(way) * v * dt;
      m.y += Math.sin(way) * v * dt;
      for (const l of m.letters) {
        if (time < l.flip) continue;
        if (l.kind !== 'mouth') l.ch = pick(m.glyphs);
        l.flip = time + rand(0.08, 0.45);
      }
    }
    // (gone, far out of sight)
    for (let i = this.ones.length - 1; i >= 0; i--) if (Math.hypot(this.ones[i].x, this.ones[i].y) > 30) this.ones.splice(i, 1);
  }

  /** through the camera: `screen` puts a world point on screen, `z` px to a world unit, on a screen `w` by `h` */
  draw(ctx: CanvasRenderingContext2D, screen: (x: number, y: number) => Point, z: number, w: number, h: number, time: number) {
    for (const m of this.ones) {
      const grown = this.calm ? 1 : 1 + GROW * clamp01((m.age - 1.2) / 6);
      // (its grid's half-width, in px; and how far it wobbles and tips)
      const half = (SIZE / 2) * grown * z;
      const bob = this.calm ? 0 : Math.sin(time * 3.1 + m.phase) * 0.08;
      const c = screen(m.x - Math.sin(m.way) * bob, m.y + Math.cos(m.way) * bob);
      const reach = half * 1.8 + (m.age < FLY + SPREAD ? 2 * z : 0);
      if (c.x + reach < 0 || c.y + reach < 0 || c.x - reach > w || c.y - reach > h) continue;
      const tip = this.calm ? 0 : Math.sin(time * 1.7 + m.phase) * 0.14;
      const cos = Math.cos(tip);
      const sin = Math.sin(tip);
      const appear = this.calm ? clamp01(m.age / 0.8) : 1;
      const pal = m.design.palette;

      // its glow
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.45 * appear * clamp01((m.age - 0.4) / 0.8);
      const g = half * 3.2;
      ctx.drawImage(glow(pal.mid), c.x - g / 2, c.y - g / 2, g, g);
      ctx.restore();

      // its letters, flying out of the liquid into place, then never sitting still
      const pitch = (2 / (GRID - 1)) * half;
      // (a character's about half its sprite's width: as wide as its cell, so they're packed as Monster Sun's are)
      const size = pitch * 2.1;
      const sway = m.design.sway;
      const chomp = Math.floor(time * 7 + m.phase) % 2 ? '▲' : '▼';
      ctx.save();
      for (const l of m.letters) {
        const p = this.calm ? 1 : clamp01((m.age - l.delay) / FLY);
        if (p <= 0) continue;
        const [mx, my] = l.kind === 'ray' && sway ? sway(l.x, l.y, time) : [0, 0];
        const gx = l.x + mx;
        const gy = l.y + my;
        let x = c.x + (gx * cos - gy * sin) * half;
        let y = c.y + (gx * sin + gy * cos) * half;
        if (p < 1) {
          const k = easeOut(p);
          const from = screen(l.sx, l.sy);
          x = lerp(from.x, x, k);
          y = lerp(from.y, y, k);
        }
        // (still the liquid's colour as it flies, its own once it's nearly there)
        const color = p < 0.75 ? LIQUID[(l.x * 7 + l.y * 5) & 1] : l.color;
        const s = p < 1 ? size * (0.8 + 0.2 * p) : size;
        ctx.globalAlpha = appear * Math.min(1, 0.4 + p);
        drawSprite(ctx, monsterGlyph(l.kind === 'mouth' ? chomp : l.ch, color), x - s / 2, y - s / 2, s);
      }
      ctx.restore();

      // its eyes popping open, looking where it's going (and blinking)
      const open = this.calm ? appear : clamp01((m.age - EYES_AT) / 0.25);
      if (open <= 0) continue;
      const blink = (time + m.phase) % 3.6 < 0.12 ? 0.15 : 1;
      const lookX = Math.cos(m.way);
      const lookY = Math.sin(m.way);
      ctx.save();
      for (const [ex, ey] of m.eyes) {
        const x = c.x + (ex * cos - ey * sin) * half;
        const y = c.y + (ex * sin + ey * cos) * half;
        const r = m.eyeR * half * 1.1 * (open < 1 ? easeOut(open) * 1.25 - 0.25 * open : 1);
        if (r < 0.5) continue;
        ctx.fillStyle = pal.eye;
        ctx.beginPath();
        ctx.ellipse(x, y, r, r * blink, 0, 0, TAU);
        ctx.fill();
        if (blink < 1) continue;
        ctx.fillStyle = '#12051a';
        ctx.beginPath();
        ctx.arc(x + lookX * r * 0.4, y + lookY * r * 0.4, r * 0.5, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }
  }
}
