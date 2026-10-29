import { stamp } from '../boss/blackSunScene';
import { glow, HULLS, IONS, rgba, SHIP_KINDS, trafficSprite } from '../traffic/trafficArt';
import type { Point } from '../arrival/eclipse';
import { bloomNumber } from './bloom';
import { drawGlobe, turned, unit } from './earth';
import { LittleMonsters } from './littleMonsters';
import { StorySun } from './storySun';
import { turning } from './sunOrb';
import { TAU, clamp01, easeInOut, lerp, seeded } from './storyMath';
import { BEATS, OPENING, beatAt } from './timeline';

// The story's opening (StoryOpening.tsx), one continuous shot on one canvas,
// in the style of the arrivals': everything in space runs on numbers, the Sun
// shining, ships gliding about with numbers puffing from their engines, and
// numbers twinkling all round like stars, each with a little bloom. Then the Sun turns bad (StorySun)
// and becomes the Black Sun, the numbers are pulled in from everywhere and
// swallowed, the ships' engines sputter and go out and they drift to a stop,
// and the stars stop twinkling. The camera goes over to Earth (earth.ts), its
// lights flickering, where Orbie lights up (the overlay draws Orbie where `orbie`
// says), and pushes in on it.
//
// It's drawn in the world's units (the Sun's radius is one), through a
// camera that moves from shot to shot. `draw` takes the story's time (which
// waits at a beat's end while its line is read) and the time that always
// runs on (for what twinkles, spins and glides).

/** where Earth is, and Orbie beside it (world units: the Sun is at 0, 0, its radius 1) */
const EARTH = { x: -5.4, y: 3.7, r: 1.3 };
const ORBIE = { x: -3.6, y: 3.05, r: 0.42 };

/** the camera: where it looks and how near (a world unit is `z` of the screen's shorter side), from each moment */
const SHOTS: Array<{ t: number; x: number; y: number; z: number }> = [
  { t: 0, x: -0.9, y: 0.5, z: 0.1 },
  { t: 8, x: -0.6, y: 0.4, z: 0.11 },
  // in on the Sun as it turns
  { t: 10, x: 0, y: 0.15, z: 0.2 },
  { t: 16.6, x: 0, y: 0.15, z: 0.215 },
  // back out, to see the numbers pulled in from everywhere
  { t: 19, x: -0.7, y: 0.5, z: 0.085 },
  { t: 26.5, x: -0.9, y: 0.6, z: 0.09 },
  // over to Earth
  { t: 29.8, x: -4.55, y: 3.3, z: 0.17 },
  { t: 37, x: -4.75, y: 3.4, z: 0.185 },
  // and in on it
  { t: 41.5, x: -5.4, y: 3.7, z: 0.52 },
];
/** how far out from its middle Earth's haze reaches (its radii); its picture's made this often (a second), and no bigger than this (device px) */
const EARTH_REACH = 1.3;
const EARTH_REFRESH = 20;
const EARTH_PIC_MAX = 1400;
/** with reduced motion, each beat's shot, held (the camera cuts between them) */
const CALM_SHOTS = [0, 2, 4, 6, 7];

/** the numbers in the sky: what they say */
const NUMBERS = ['7', '12', '24', '9', '36', '5', '81', '3', '42', '18', '6', '56', '4', '27', '8', '64', '2', '30', '49', '15', '72', '1', '35', '20', '63', '16', '45', '10', '54', '28', '40', '21', '32', '48'];
const NUMBER_COLORS = ['#fdf3e7', '#ffb37a', '#c9a4de', '#7fe0ff', '#ffd77a', '#ff9de2'];
const STARS = 240;

interface SkyNumber {
  text: string;
  color: string;
  x: number;
  y: number;
  size: number;
  phase: number;
  /** when it's pulled in (story seconds), and whether it has been */
  pullAt: number;
  gone: boolean;
}

interface Ship {
  kind: number;
  hull: string;
  ion: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** width, in world units */
  size: number;
  rot: number;
  spin: number;
  /** when its engines start to sputter (story seconds) */
  sputterAt: number;
  /** its engines' power now, 0 to 1 */
  power: number;
  puffs: Array<{ x: number; y: number; vx: number; vy: number; born: number; text: string }>;
  nextPuff: number;
}

export class OpeningScene {
  readonly sun: StorySun;
  private readonly calm: boolean;
  /** the little monsters it spits out as it turns */
  private readonly monsters: LittleMonsters;
  private readonly numbers: SkyNumber[];
  private readonly ships: Ship[];
  private readonly stars: Array<{ x: number; y: number; size: number; phase: number; rate: number; depth: number }>;
  /** what has happened (each once) */
  private done = new Set<string>();
  private shake = 0;
  /** Earth's picture, while it's not too big: when it was made, for how big an Earth (px), how big it is (px) */
  private earthPic: { canvas: HTMLCanvasElement | null; at: number; r: number; px: number } = { canvas: null, at: -Infinity, r: 0, px: 0 };
  /** the camera as of the last frame, and the screen */
  private cam = { x: 0, y: 0, z: 1 };
  private w = 0;
  private h = 0;
  /** someone listening: the Sun turns, becomes the Black Sun, a number is pulled in, an engine sputters out */
  onEvent?: (what: 'flicker' | 'turn' | 'awaken' | 'spawn' | 'pull' | 'sputter' | 'orbie') => void;

  constructor(calm: boolean) {
    this.calm = calm;
    this.sun = new StorySun(calm);
    this.monsters = new LittleMonsters(calm);
    // (the sky is laid out the same for everyone)
    const rnd = seeded(20261027);
    // the numbers all round, none on the Sun, more near it; pulled in nearest first
    this.numbers = NUMBERS.map((text, i) => {
      const a = rnd() * TAU;
      const d = 2.1 + rnd() ** 0.8 * 5.6;
      const x = Math.cos(a) * d * 1.25 - 0.6;
      const y = Math.sin(a) * d * 0.8 + 0.4;
      const k = clamp01((d - 2.1) / 5.6);
      return {
        text,
        color: NUMBER_COLORS[i % NUMBER_COLORS.length],
        x,
        y,
        size: 0.32 + rnd() * 0.18,
        phase: rnd() * TAU,
        pullAt: lerp(OPENING.pull[0], OPENING.pull[1], clamp01(k * 0.75 + rnd() * 0.25)),
        gone: false,
      };
    });
    // (never across the Sun: they stop well clear of it)
    const lanes: Array<[number, number, number, number, number]> = [
      // x, y, vx, vy, size
      [-7.2, -3.0, 0.24, 0.03, 0.62],
      [-5.6, 3.4, 0.22, -0.04, 0.78],
      [5.2, 3.0, -0.18, 0.02, 0.7],
      [-3.2, -5.4, 0.1, 0.12, 0.5],
      [5.0, -3.6, -0.16, 0.03, 0.56],
      [-7.6, 0.9, 0.2, -0.01, 0.66],
    ];
    // (with reduced motion they hold still, partway along their lanes)
    const along = calm ? 20 : 0;
    this.ships = lanes.map(([x, y, vx, vy, size], i) => ({
      kind: i % SHIP_KINDS.length,
      hull: HULLS[(i * 3) % HULLS.length],
      ion: IONS[i % IONS.length],
      x: x + vx * along,
      y: y + vy * along,
      vx,
      vy,
      size,
      rot: 0,
      spin: (i % 2 ? 1 : -1) * (4 + i),
      sputterAt: lerp(OPENING.sputter[0], OPENING.sputter[1] - 1.5, i / (lanes.length - 1)),
      power: 1,
      puffs: [],
      nextPuff: rnd() * 0.6,
    }));
    this.stars = Array.from({ length: STARS }, () => ({ x: rnd(), y: rnd(), size: 0.5 + rnd() * 1.5, phase: rnd() * TAU, rate: 0.8 + rnd() * 2.2, depth: 0.15 + rnd() * 0.5 }));
  }

  /** the camera at story time `t` */
  private shot(t: number): { x: number; y: number; z: number } {
    if (this.calm) return SHOTS[CALM_SHOTS[beatAt(t)]];
    let i = 0;
    while (i + 1 < SHOTS.length && t >= SHOTS[i + 1].t) i++;
    const a = SHOTS[i];
    const b = SHOTS[Math.min(SHOTS.length - 1, i + 1)];
    const k = b === a ? 0 : easeInOut(clamp01((t - a.t) / (b.t - a.t)));
    return { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), z: lerp(a.z, b.z, k) };
  }

  /** a point in the world, on the screen */
  private screen(x: number, y: number): Point {
    return { x: this.w / 2 + (x - this.cam.x) * this.cam.z, y: this.h / 2 + (y - this.cam.y) * this.cam.z };
  }

  /** where Orbie is on screen, its radius, and how lit up it is (0: not there yet) */
  orbie(t: number): { x: number; y: number; r: number; on: number } {
    const p = this.screen(ORBIE.x, ORBIE.y + Math.sin(t * 1.3) * 0.05);
    return { ...p, r: ORBIE.r * this.cam.z, on: clamp01((t - OPENING.orbie) / 0.6) };
  }

  /** once, as story time passes `at` */
  private once(id: string, t: number, at: number, fn: () => void) {
    if (t < at || this.done.has(id)) return;
    this.done.add(id);
    fn();
  }

  /** step on by `dt` seconds of the time that always runs (to `time`), and to story time `t` */
  update(t: number, time: number, dt: number) {
    const sun = this.sun;
    sun.update(dt);
    this.shake *= Math.exp(-dt * 3);
    this.once('flicker', t, OPENING.flicker, () => this.onEvent?.('flicker'));
    // its light caves in: the eclipse's own clock starts
    this.once('turn', t, OPENING.turn, () => {
      sun.t = 0;
      this.onEvent?.('turn');
    });
    this.once('awaken', t, OPENING.awaken, () => {
      sun.awaken();
      this.shake = 1;
      this.onEvent?.('awaken');
    });
    this.once('orbie', t, OPENING.orbie, () => this.onEvent?.('orbie'));
    // the little monsters, spat out one after another
    for (let i = 0; i < LittleMonsters.count; i++) {
      this.once(`spawn${i}`, t, OPENING.spawn[0] + i * OPENING.spawn[1], () => {
        sun.spit(this.monsters.spawn(time));
        this.onEvent?.('spawn');
      });
    }
    this.monsters.update(dt, time);

    // the numbers, pulled in
    for (const n of this.numbers) {
      if (n.gone || t < n.pullAt || !this.w) continue;
      n.gone = true;
      const p = this.screen(n.x, n.y);
      sun.swallowFrom(n.text, p, n.color, n.size);
      this.onEvent?.('pull');
    }

    // the ships glide on, puffing numbers, till their engines sputter and go out; then they drift to a stop
    for (const s of this.ships) {
      const k = (t - s.sputterAt) / 1.6;
      const was = s.power;
      if (k < 0) s.power = 1;
      else if (k < 1) s.power = (1 - k) * (Math.sin(k * 41) > 0.1 ? 1 : 0.15);
      else s.power = 0;
      if (was > 0 && s.power === 0) this.onEvent?.('sputter');
      const drag = k < 0 ? 0 : 0.7;
      s.vx *= Math.exp(-dt * drag);
      s.vy *= Math.exp(-dt * drag);
      if (!this.calm) {
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        // stranded: turning slowly, adrift
        if (k > 1) s.rot += s.spin * dt * clamp01(k - 1);
      }
      if (s.power > 0.5 && time >= s.nextPuff && !this.calm) {
        const sp = Math.hypot(s.vx, s.vy) || 1;
        s.puffs.push({ x: s.x, y: s.y + s.size * 0.2, vx: (-s.vx / sp) * 0.25, vy: (-s.vy / sp) * 0.25 + 0.05, born: time, text: NUMBERS[Math.floor(Math.random() * 12)] });
        s.nextPuff = time + 0.7 + Math.random() * 0.5;
      }
      for (const p of s.puffs) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
      s.puffs = s.puffs.filter((p) => time - p.born < 1.6);
    }
  }

  /** `t`: story seconds; `time`: seconds that always run on */
  draw(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, time: number) {
    this.w = w;
    this.h = h;
    const u = Math.min(w, h);
    const shot = this.shot(t);
    const shake = this.calm ? 0 : this.shake;
    this.cam = { x: shot.x + Math.sin(time * 63) * shake * 0.05, y: shot.y + Math.cos(time * 49) * shake * 0.04, z: shot.z * u };

    ctx.fillStyle = '#05030f';
    ctx.fillRect(0, 0, w, h);
    const bg = ctx.createRadialGradient(w * 0.6, h * 0.35, 0, w * 0.6, h * 0.35, Math.max(w, h) * 0.9);
    bg.addColorStop(0, '#1a1036');
    bg.addColorStop(1, 'rgba(5, 3, 15, 0)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // once the numbers are gone, the stars stop twinkling and dim
    const still = clamp01((t - OPENING.pull[1]) / 2);
    this.drawStars(ctx, w, h, time, still);

    this.drawEarth(ctx, t, time);

    // the Sun: as it was, then turning, then the Black Sun
    const s = this.screen(0, 0);
    this.sun.at = { x: s.x, y: s.y, r: this.cam.z };
    const look = t > BEATS[3] ? this.screen(EARTH.x, EARTH.y) : { x: s.x, y: s.y + this.cam.z * 3 };
    const caving = clamp01((t - OPENING.turn) / 1.3);
    const f = clamp01((t - OPENING.flicker) / (OPENING.turn - OPENING.flicker));
    // (flickering, more and more, as it turns)
    const flick = f > 0 && !this.calm ? 1 - f * 0.55 * (0.5 + 0.5 * Math.sin(time * 37) * Math.sin(time * 23.7)) : 1;
    // its face turning, from the frown till well after its light's caved in: its smoke churning, its colour draining, veins creeping in, then dark (sunOrb.ts)
    const face = turning(easeInOut(clamp01((t - OPENING.frown + 0.3) / (OPENING.turn + 2.2 - OPENING.frown + 0.3))));
    if (t < OPENING.turn + 0.4) face.glow *= flick;
    this.sun.look = face;
    if (t >= OPENING.turn) this.sun.draw(ctx, w, h, undefined, look);
    if (caving < 1) {
      this.sun.drawBright(ctx, time, {
        shine: (1 - caving) * flick,
        core: 1 - caving,
        disc: t < OPENING.turn,
        smile: t < OPENING.frown ? 1 : lerp(1, -1, clamp01((t - OPENING.frown) / 0.4)),
        veins: clamp01((t - OPENING.frown) / (OPENING.turn - OPENING.frown + 0.4)),
      });
    }

    this.monsters.draw(ctx, (x, y) => this.screen(x, y), this.cam.z, w, h, time);
    this.drawNumbers(ctx, t, time);
    this.drawShips(ctx, time);
    this.drawOrbieGlow(ctx, t, time);

    // out to black at the end
    const dark = clamp01((t - OPENING.fade[0]) / (OPENING.fade[1] - OPENING.fade[0]));
    if (dark > 0) {
      ctx.fillStyle = `rgba(3, 2, 10, ${dark})`;
      ctx.fillRect(0, 0, w, h);
    }
  }

  private drawStars(ctx: CanvasRenderingContext2D, w: number, h: number, time: number, still: number) {
    const span = Math.max(w, h);
    ctx.save();
    ctx.fillStyle = '#ffffff';
    for (const s of this.stars) {
      // (far off: they move a little with the camera)
      const x = (((s.x - (this.cam.x * s.depth * 0.04)) % 1) + 1) % 1;
      const y = (((s.y - (this.cam.y * s.depth * 0.04)) % 1) + 1) % 1;
      const tw = this.calm ? 0.75 : 0.55 + 0.45 * Math.sin(time * s.rate + s.phase) * (1 - still);
      ctx.globalAlpha = tw * (1 - 0.45 * still);
      ctx.beginPath();
      ctx.arc(x * span - (span - w) / 2, y * span - (span - h) / 2, s.size, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  /** the numbers twinkling in the sky, trembling before they're pulled in */
  private drawNumbers(ctx: CanvasRenderingContext2D, t: number, time: number) {
    const z = this.cam.z;
    ctx.save();
    for (const n of this.numbers) {
      if (n.gone) continue;
      const tremble = clamp01(1 - (n.pullAt - t) / 0.8);
      const jx = this.calm ? 0 : Math.sin(time * 47 + n.phase) * tremble * 0.06;
      const bob = this.calm ? 0 : Math.sin(time * 0.7 + n.phase) * 0.08;
      const p = this.screen(n.x + jx, n.y + bob);
      const tw = this.calm ? 0.95 : 0.8 + 0.2 * Math.sin(time * 1.6 + n.phase * 2);
      const size = n.size * z * (1 + 0.06 * Math.sin(time * 1.6 + n.phase * 2));
      ctx.globalAlpha = tw;
      ctx.globalCompositeOperation = 'lighter';
      stamp(ctx, bloomNumber(n.text, n.color), p.x, p.y, size);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
  }

  /** the ships, seen from behind: their engines' glow and the numbers puffing out of them, their lights blinking */
  private drawShips(ctx: CanvasRenderingContext2D, time: number) {
    const z = this.cam.z;
    for (const s of this.ships) {
      const kind = SHIP_KINDS[s.kind];
      const img = trafficSprite(s.kind, s.hull);
      const sw = s.size * z;
      const sh = sw * kind.aspect;
      const p = this.screen(s.x, s.y);
      // the numbers it runs on, puffing out behind it
      for (const puff of s.puffs) {
        const k = (time - puff.born) / 1.6;
        const q = this.screen(puff.x, puff.y);
        ctx.save();
        ctx.globalAlpha = (1 - k) * 0.85;
        stamp(ctx, bloomNumber(puff.text, s.ion), q.x, q.y, sw * 0.2 * (1 + k * 0.6));
        ctx.restore();
      }
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((s.rot * Math.PI) / 180);
      // the engines
      if (s.power > 0.01) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = s.power;
        for (const e of kind.engines) {
          const ex = (e.x - 0.5) * sw;
          const ey = (e.y - 0.5) * sh;
          const r = e.r * sw * 5 * (1 + 0.08 * Math.sin(time * 31 + e.x * 9));
          ctx.drawImage(glow(s.ion), ex - r / 2, ey - r / 2, r, r);
        }
        ctx.restore();
      }
      if (img) ctx.drawImage(img, -sw / 2, -sh / 2, sw, sh);
      // its lights, blinking: stranded, they keep on blinking
      const blink = Math.sin(time * 4 + s.kind) > 0.6 ? 1 : 0.25;
      kind.lights.forEach((l, i) => {
        const r = sw * 0.16 * blink;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(glow(i === 0 ? '#ff4f6d' : '#7ee08f'), (l.x - 0.5) * sw - r / 2, (l.y - 0.5) * sh - r / 2, r, r);
        ctx.restore();
      });
      ctx.restore();
    }
  }

  /** Orbie's light round it (the overlay draws Orbie itself over it): a flash as it lights up, then a glow, breathing */
  private drawOrbieGlow(ctx: CanvasRenderingContext2D, t: number, time: number) {
    const k = t - OPENING.orbie;
    if (k < 0) return;
    const o = this.orbie(t);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const breathe = this.calm ? 1 : 1 + 0.12 * Math.sin(time * 2.4);
    const size = o.r * 4.2 * breathe * clamp01(k / 0.5);
    ctx.globalAlpha = 0.7;
    ctx.drawImage(glow('#b18cff'), o.x - size / 2, o.y - size / 2, size, size);
    // the flash, and a ring racing out
    const f = k / 0.9;
    if (f < 1 && !this.calm) {
      ctx.globalAlpha = 1 - f;
      const flash = o.r * (2 + 5 * f);
      ctx.drawImage(glow('#e6f6ff'), o.x - flash / 2, o.y - flash / 2, flash, flash);
      ctx.strokeStyle = rgba('#8fe6ff', 0.9);
      ctx.lineWidth = Math.max(1.5, o.r * 0.12 * (1 - f));
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.r * (1 + 3 * f), 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Earth (earth.ts), turning slowly, lit by the Sun, dimming as it turns; its cities' lights flickering, some going out, once the numbers are gone */
  private drawEarth(ctx: CanvasRenderingContext2D, t: number, time: number) {
    const c = this.screen(EARTH.x, EARTH.y);
    const r = EARTH.r * this.cam.z;
    if (c.x + r * 1.5 < 0 || c.y - r * 1.5 > this.h || c.x - r * 1.5 > this.w || c.y + r * 1.5 < 0) return;
    // the light comes from the Sun (up and to the right on screen; into view, y is up), and a little from in front
    const toSun = Math.atan2(0 - EARTH.y, 0 - EARTH.x);
    const light = unit([Math.cos(toSun), -Math.sin(toSun), 0.18]);
    const spin = -0.35 + (this.calm ? 0 : time * 0.018);
    const look = {
      lands: turned(spin, 0.32, -0.4),
      clouds: turned(spin * 1.3 + 0.5, 0.32, -0.4),
      light,
      dim: 0.55 * clamp01((t - OPENING.turn) / 3),
      time,
      outage: clamp01((t - OPENING.pull[0]) / 6),
      calm: this.calm,
    };
    // close up, it's drawn as it is
    const m = ctx.getTransform();
    const scale = Math.hypot(m.a, m.b) || 1;
    const pic = this.earthPic;
    const side = Math.ceil(r * 2 * EARTH_REACH * scale);
    if (side > EARTH_PIC_MAX) {
      pic.r = 0;
      drawGlobe(ctx, c, r, look);
      return;
    }
    // further off, its picture's made again a terminal's refresh at a time (its cities' lights are the most there is to draw), and moved with the camera
    if (time - pic.at >= 1 / EARTH_REFRESH || !pic.r || Math.abs(r / pic.r - 1) > 0.04 || !pic.canvas) {
      const canvas = (pic.canvas ??= document.createElement('canvas'));
      if (canvas.width < side || canvas.width > side * 1.5) canvas.width = canvas.height = side;
      const g = canvas.getContext('2d');
      if (!g) return;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, canvas.width, canvas.height);
      g.setTransform(scale, 0, 0, scale, 0, 0);
      drawGlobe(g, { x: r * EARTH_REACH, y: r * EARTH_REACH }, r, look);
      pic.r = r;
      pic.at = time;
      pic.px = canvas.width / scale;
    }
    if (!pic.canvas) return;
    const k = r / pic.r;
    const half = pic.r * EARTH_REACH * k;
    ctx.drawImage(pic.canvas, c.x - half, c.y - half, pic.px * k, pic.px * k);
  }
}
