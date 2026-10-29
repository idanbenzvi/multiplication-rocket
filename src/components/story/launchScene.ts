import { glow, pilotCanopy, pilotEngines, rearShipSvg, rgba, sprite } from '../traffic/trafficArt';
import { HYPER_TINTS, hyperStreak } from '../arrival/dropOut';
import type { Point } from '../arrival/eclipse';
import type { PadShipSpec } from '../bay/useBay';
import { bringing, drawNightSide } from './earth';
import { StorySun } from './storySun';
import { TAU, clamp01, easeIn, easeInOut, easeOut, lerp } from './storyMath';
import { LAUNCH, circleThrough } from './timeline';

// The launch (StoryLaunch.tsx): a new pilot's first take-off, as a film's.
// Earth's night side fills the lower left (earth.ts), its cities' lights
// twinkling, and its edge runs from the top of the screen to the bottom, a razor line of light
// with its air glowing pink to violet beyond it, a purple haze, and a bloom
// of light on the edge where the Black Sun hangs above it (after React Bits
// Pro's Horizon Bloom, its Edge preset, on its side; ours). The pilot's own
// ship lifts off at the bottom left and turns some 40° towards the Black Sun.
// It gathers its power, its engines' glow swelling and pulsing faster, specks
// of light spiralling into them, edging towards where it's going as space
// holds its breath (the stars all but still); then a blast, and it's gone into
// the distance in a blink, as an anime's ships go to warp, leaving a trail of
// fading afterimages, the stars smeared at once into streaks, speed lines
// flickering round, Earth falling away; a glint where it went, and the screen
// washes out to white.

const STARS = 260;
/** the ship's heading, once it has turned (degrees right of straight up; on a narrow screen a little steeper, to stay on it) */
const HEADING = 41;
const HEADING_NARROW = 30;
/** the place on Earth just below the bloom, at the edge (Europe's lights, lon/lat) */
const BELOW_BLOOM: [number, number] = [14, 46];

interface Star {
  /** where it is round the vanishing point (angle) and how far out, near to the camera (z from 1 far to 0 at the camera) */
  a: number;
  d: number;
  z: number;
  size: number;
  tint: string;
  phase: number;
}

export class LaunchScene {
  private readonly calm: boolean;
  private readonly sun: StorySun;
  private readonly shipSvg: string;
  private readonly ship: PadShipSpec;
  private readonly stars: Star[];
  private t = 0;
  /** how fast the stars come at it (0 to 1, the warp) */
  private warp = 0;

  constructor(calm: boolean, ship: PadShipSpec) {
    this.calm = calm;
    this.ship = ship;
    this.sun = new StorySun(calm);
    // the Black Sun as it is now: a black hole, its whirlpool spun up, swallowing
    this.sun.t = 0;
    this.sun.awaken();
    for (let i = 0; i < 40; i++) this.sun.update(0.1);
    this.shipSvg = rearShipSvg(ship.accent, ship.admiral, ship.ship);
    sprite(this.shipSvg, 384, 384, ship.avatar ? { emoji: ship.avatar, ...pilotCanopy(ship.ship) } : undefined);
    this.stars = Array.from({ length: STARS }, () => newStar(Math.random()));
  }

  /** where the ship lifts off (the bottom left), and where it's heading off to (the vanishing point) */
  private path(w: number, h: number): { start: Point; v: Point; heading: number } {
    const narrow = h > w;
    const start = { x: w * (narrow ? 0.16 : 0.2), y: h * 0.86 };
    const heading = ((narrow ? HEADING_NARROW : HEADING) * Math.PI) / 180;
    const vy = h * (narrow ? 0.3 : 0.34);
    const reach = (start.y - vy) / Math.cos(heading);
    return { start, v: { x: Math.min(w * 0.84, start.x + Math.sin(heading) * reach), y: vy }, heading };
  }

  /** Earth: its edge from near the top left of the screen down to the bottom, its middle far off to the lower left */
  private earth(w: number, h: number) {
    const portrait = h > w;
    const top = { x: w * (portrait ? -0.05 : 0.1), y: -h * 0.04 };
    const bottom = { x: w * (portrait ? 0.92 : 0.68), y: h * 1.04 };
    return circleThrough(top, bottom, Math.max(w, h) * 1.35);
  }

  /** the Black Sun, over Earth's edge, beyond where the ship's heading */
  private sunSpot(w: number, h: number): Point & { r: number } {
    const r = Math.min(w, h) * 0.075;
    const { v } = this.path(w, h);
    if (h > w) return { x: w * 0.68, y: h * 0.15, r };
    return { x: Math.min(w - r * 2.2, v.x + r * 2.6), y: v.y - r * 1.2, r };
  }

  private vanish(w: number, h: number): Point {
    return this.path(w, h).v;
  }

  update(dt: number) {
    this.t += dt;
    this.sun.update(dt);
    const t = this.t;
    // (in a blink, at the blast)
    this.warp = this.calm ? 0 : easeOut(clamp01((t - LAUNCH.blast) / 0.15));
    // the stars come at it, all but still as it gathers its power, and rushing past once it's away; past the camera, they start again far off
    const speed = (0.04 - 0.035 * this.charged(t)) * (1 - this.warp) + this.warp * 2.6;
    for (const s of this.stars) {
      s.z -= dt * speed;
      if (s.z <= 0.02) Object.assign(s, newStar(1));
    }
  }

  /** how far it's gathered its power (0 to 1) */
  private charged(t: number): number {
    return clamp01((t - LAUNCH.charge[0]) / (LAUNCH.charge[1] - LAUNCH.charge[0]));
  }

  /** the ship at `t`: where it is, how wide (px), its heading (degrees), how hard it burns and how charged it is */
  private shipPose(w: number, h: number, t = this.t): { x: number; y: number; w: number; rot: number; burn: number; charge: number; alpha: number } {
    const u = Math.min(w, h);
    const { start, v, heading } = this.path(w, h);
    const size = Math.min(u * 0.3, 220);
    const lift = easeOut(clamp01((t - LAUNCH.ignite) / 2.2));
    const turn = easeInOut(clamp01((t - LAUNCH.turn[0]) / (LAUNCH.turn[1] - LAUNCH.turn[0])));
    // up off the bottom, curving over on to its heading
    const rise = { x: start.x + u * 0.16 * Math.sin(heading) * turn, y: start.y - u * 0.16 * lift };
    // gathering its power, it edges a little towards where it's going; then the blast, and it's gone into the distance in a blink
    const c = this.charged(t);
    const b = clamp01((t - LAUNCH.blast) / (this.calm ? 1.4 : 0.3));
    const depth = this.calm ? b * 6 : 0.14 * easeInOut(c) + 90 * b ** 2.4;
    const near = 1 / (1 + depth);
    const shake = this.calm ? 0 : Math.max(0, 1 - Math.abs(t - LAUNCH.ignite - 0.4) / 0.9) * u * 0.006 + (b > 0 ? 0 : c * c * u * 0.004);
    return {
      x: lerp(v.x, rise.x, near) + Math.sin(t * 70) * shake,
      y: lerp(v.y, rise.y, near) + Math.cos(t * 53) * shake,
      w: size * near,
      rot: ((Math.atan2(v.x - rise.x, rise.y - v.y) * 180) / Math.PI) * turn,
      burn: clamp01((t - LAUNCH.ignite) / 0.4) * (0.5 + 0.5 * b),
      charge: this.calm || b >= 1 ? 0 : c,
      alpha: this.calm ? 1 - clamp01((b - 0.6) / 0.4) : 1,
    };
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const t = this.t;
    const u = Math.min(w, h);
    const e = this.earth(w, h);
    const v = this.vanish(w, h);
    const s = this.sunSpot(w, h);

    ctx.fillStyle = '#04020c';
    ctx.fillRect(0, 0, w, h);
    // the deep violet of space round the Black Sun
    const sky = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, Math.max(w, h) * 0.9);
    sky.addColorStop(0, '#2a0f4a');
    sky.addColorStop(0.4, '#140829');
    sky.addColorStop(1, '#04020c');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    this.drawStars(ctx, w, h, v);

    // the tunnel glowing round where it's heading, as the warp builds
    if (this.warp > 0.01) {
      const r = Math.max(w, h) * (0.3 + 0.5 * this.warp);
      const g = ctx.createRadialGradient(v.x, v.y, 0, v.x, v.y, r);
      g.addColorStop(0, rgba('#e6d9ff', 0.55 * this.warp));
      g.addColorStop(0.15, rgba('#9a6bff', 0.32 * this.warp));
      g.addColorStop(0.5, rgba('#5a1d9a', 0.14 * this.warp));
      g.addColorStop(1, rgba('#5a1d9a', 0));
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }

    // the Black Sun, swallowing, its eyes on the ship
    this.sun.at = s;
    const pose = this.shipPose(w, h);
    this.sun.draw(ctx, w, h, undefined, { x: pose.x, y: pose.y });

    this.drawEarth(ctx, w, h, e, s);
    this.drawAfterimages(ctx, w, h);
    this.drawShip(ctx, pose, u);
    this.drawBlast(ctx, w, h);
    this.drawSpeedLines(ctx, w, h, v);
    this.drawGlint(ctx, pose, u);

    // washing out to white
    const white = clamp01((t - LAUNCH.white[0]) / (LAUNCH.white[1] - LAUNCH.white[0]));
    // (and in from black at the start)
    const black = 1 - clamp01(t / 0.5);
    if (black > 0) {
      ctx.fillStyle = `rgba(0, 0, 0, ${black})`;
      ctx.fillRect(0, 0, w, h);
    }
    if (white > 0) {
      ctx.fillStyle = `rgba(255, 252, 246, ${easeInOut(white)})`;
      ctx.fillRect(0, 0, w, h);
    }
  }

  /** its WebGL given back */
  dispose() {
    this.sun.dispose();
  }

  get done(): boolean {
    return this.t >= LAUNCH.end;
  }

  /** the stars: points far off; with the warp, streaks rushing out of the vanishing point, blooming as they come */
  private drawStars(ctx: CanvasRenderingContext2D, w: number, h: number, v: Point) {
    const reach = Math.hypot(Math.max(v.x, w - v.x), Math.max(v.y, h - v.y));
    const warp = this.warp;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const s of this.stars) {
      // seen from the camera: further out the nearer it is
      const r = (s.d * reach * 0.18) / s.z;
      if (r > reach * 1.2) continue;
      const x = v.x + Math.cos(s.a) * r;
      const y = v.y + Math.sin(s.a) * r;
      const near = clamp01(1 - s.z);
      const bright = clamp01(0.25 + near * 0.9) * (this.calm ? 0.8 : 0.7 + 0.3 * Math.sin(this.t * 3 + s.phase));
      if (warp > 0.02) {
        // a streak back along its way: the faster, the longer
        const r0 = (s.d * reach * 0.18) / Math.min(1, s.z + 0.04 + warp * 0.9);
        const x0 = v.x + Math.cos(s.a) * r0;
        const y0 = v.y + Math.sin(s.a) * r0;
        const width = Math.max(1, s.size * (0.8 + near * 2.4) * (1 + warp));
        hyperStreak(ctx, x0, y0, x, y, width, s.tint, Math.min(1, bright * (0.5 + warp)));
        // blooming as it nears
        if (near > 0.5) {
          const b = width * (3 + warp * 5) * near;
          ctx.globalAlpha = Math.min(1, warp * near);
          ctx.drawImage(glow(s.tint), x - b / 2, y - b / 2, b, b);
          ctx.globalAlpha = 1;
        }
      } else {
        const size = s.size * (0.6 + near * 1.4);
        ctx.fillStyle = `rgba(255, 255, 255, ${bright})`;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  /** Earth's night side and its edge of light, from the top of the screen to the bottom */
  private drawEarth(ctx: CanvasRenderingContext2D, w: number, h: number, e: { x: number; y: number; r: number }, sun: Point & { r: number }) {
    const t = this.t;
    const u = Math.min(w, h);
    // as the warp takes it, Earth falls away behind
    const away = this.calm ? 0 : easeIn(clamp01((t - LAUNCH.blast) / 0.8));
    const r = e.r * (1 - 0.08 * away);
    const cx = e.x - u * 0.3 * away;
    const cy = e.y + u * 0.3 * away;
    // where its edge faces the Black Sun: the bloom's there
    const toSun = Math.atan2(sun.y - cy, sun.x - cx);
    const bx = cx + Math.cos(toSun) * r;
    const by = cy + Math.sin(toSun) * r;

    ctx.save();
    // the purple haze beyond the edge, wide and soft
    ctx.globalCompositeOperation = 'lighter';
    const haze = ctx.createRadialGradient(cx, cy, r * 0.98, cx, cy, r + u * 0.42);
    haze.addColorStop(0, rgba('#c04dff', 0.42));
    haze.addColorStop(0.08, rgba('#8a3dff', 0.26));
    haze.addColorStop(0.35, rgba('#4a1d9a', 0.1));
    haze.addColorStop(1, rgba('#4a1d9a', 0));
    ctx.fillStyle = haze;
    ctx.fillRect(0, 0, w, h);
    // the aura where the Black Sun hangs over it: a bloom of light on the edge
    const pulse = 1 + 0.06 * Math.sin(t * 1.7);
    const aura = u * 0.75 * pulse;
    const ag = ctx.createRadialGradient(bx, by, 0, bx, by, aura);
    ag.addColorStop(0, rgba('#ffe6f4', 0.75));
    ag.addColorStop(0.08, rgba('#ff7ad9', 0.5));
    ag.addColorStop(0.3, rgba('#a04dff', 0.2));
    ag.addColorStop(1, rgba('#5a1d9a', 0));
    ctx.fillStyle = ag;
    ctx.fillRect(bx - aura, by - aura, aura * 2, aura * 2);
    ctx.restore();

    // the night side: its seas, its lands and its cities, Europe's just below the bloom
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    const body = ctx.createRadialGradient(bx, by, 0, bx, by, r * 0.9);
    body.addColorStop(0, '#2a1a5c');
    body.addColorStop(0.12, '#121a48');
    body.addColorStop(0.5, '#0a1032');
    body.addColorStop(1, '#060a24');
    ctx.fillStyle = body;
    ctx.fill();
    ctx.clip();
    const lands = bringing(BELOW_BLOOM[0], BELOW_BLOOM[1], [Math.cos(toSun) * 0.9, -Math.sin(toSun) * 0.9, 0.44]);
    drawNightSide(ctx, { x: cx, y: cy }, r, { lands, time: t, calm: this.calm, lamp: u * 0.015, w, h });
    // the air, lit, just inside the edge
    ctx.globalCompositeOperation = 'lighter';
    const inner = ctx.createRadialGradient(cx, cy, r * 0.94, cx, cy, r);
    inner.addColorStop(0, rgba('#ff6ad5', 0));
    inner.addColorStop(0.8, rgba('#b45cff', 0.18));
    inner.addColorStop(1, rgba('#ff9de2', 0.45));
    ctx.fillStyle = inner;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    // the edge: its air glowing pink to violet, and a razor line of light along it, brightest where the bloom is
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const band = u * 0.035;
    const air = ctx.createRadialGradient(cx, cy, r, cx, cy, r + band);
    air.addColorStop(0, rgba('#ffd6f0', 0.85));
    air.addColorStop(0.2, rgba('#ff6ad5', 0.5));
    air.addColorStop(0.55, rgba('#9a4dff', 0.22));
    air.addColorStop(1, rgba('#9a4dff', 0));
    ctx.fillStyle = air;
    ctx.beginPath();
    ctx.arc(cx, cy, r + band, 0, TAU);
    ctx.arc(cx, cy, r, 0, TAU, true);
    ctx.fill();
    for (const [width, color, a] of [
      [u * 0.012, '#ff8ae0', 0.35],
      [Math.max(1.5, u * 0.0035), '#ffffff', 0.95],
    ] as Array<[number, string, number]>) {
      // brightest round the bloom, fading off along the edge either way
      const lg = ctx.createConicGradient ? ctx.createConicGradient(toSun - Math.PI, cx, cy) : null;
      if (lg) {
        lg.addColorStop(0, rgba(color, a * 0.25));
        lg.addColorStop(0.32, rgba(color, a * 0.4));
        lg.addColorStop(0.5, rgba(color, a));
        lg.addColorStop(0.68, rgba(color, a * 0.4));
        lg.addColorStop(1, rgba(color, a * 0.25));
        ctx.strokeStyle = lg;
      } else {
        ctx.strokeStyle = rgba(color, a * 0.7);
      }
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, TAU);
      ctx.stroke();
    }
    // a lens streak along the edge through the bloom
    const sl = u * 0.9;
    ctx.translate(bx, by);
    ctx.rotate(toSun + Math.PI / 2);
    const sg = ctx.createLinearGradient(-sl / 2, 0, sl / 2, 0);
    sg.addColorStop(0, rgba('#ff6ad5', 0));
    sg.addColorStop(0.5, rgba('#fff4fb', 0.8));
    sg.addColorStop(1, rgba('#ff6ad5', 0));
    ctx.fillStyle = sg;
    ctx.fillRect(-sl / 2, -1.5, sl, 3);
    const flare = u * 0.16 * pulse;
    ctx.drawImage(glow('#ffd6f0'), -flare / 2, -flare / 2, flare, flare);
    ctx.restore();
  }

  /** the pilot's ship from behind, its flames growing as it goes */
  private drawShip(ctx: CanvasRenderingContext2D, p: ReturnType<LaunchScene['shipPose']>, u: number) {
    if (p.alpha <= 0.01 || p.w < 0.5) return;
    const img = sprite(this.shipSvg, 384, 384, this.ship.avatar ? { emoji: this.ship.avatar, ...pilotCanopy(this.ship.ship) } : undefined);
    ctx.save();
    ctx.globalAlpha = p.alpha;
    ctx.translate(p.x, p.y);
    ctx.rotate((p.rot * Math.PI) / 180);
    // the flash and the ring as it lights up
    const ki = (this.t - LAUNCH.ignite) / 0.9;
    if (ki > 0 && ki < 1 && !this.calm) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 1 - ki;
      const r = p.w * (0.6 + ki * 1.8);
      ctx.strokeStyle = rgba('#9fe6ff', 0.8);
      ctx.lineWidth = Math.max(1.5, p.w * 0.03);
      ctx.beginPath();
      ctx.ellipse(0, p.w * 0.45, r, r * 0.35, 0, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
    ctx.globalCompositeOperation = 'lighter';
    const flick = 1 + Math.sin(this.t * 43) * 0.08 + Math.sin(this.t * 27) * 0.05;
    // gathering its power: its engines' glow swelling, pulsing faster and faster, and specks of light spiralling into them
    const c = p.charge;
    const swell = 1 + c * (1.3 + 0.25 * Math.sin(this.t * (8 + 34 * c)));
    const engines = pilotEngines(this.ship.ship);
    if (c > 0) {
      const mx = (engines.reduce((a, e) => a + e.x, 0) / engines.length - 0.5) * p.w;
      const my = (engines.reduce((a, e) => a + e.y, 0) / engines.length - 0.5) * p.w;
      const charge = p.w * (0.9 + 0.9 * c);
      ctx.globalAlpha = p.alpha * Math.min(1, c * 1.5) * 0.8;
      ctx.drawImage(glow('#9fe6ff'), mx - charge / 2, my - charge / 2, charge, charge);
      for (let i = 0; i < 28; i++) {
        const k = (this.t * (0.9 + 0.8 * c) + i / 28) % 1;
        const a = i * 2.39996 + k * 2.6;
        const r = p.w * 1.5 * (1 - k) ** 1.5;
        const size = p.w * (0.05 + 0.07 * k);
        ctx.globalAlpha = p.alpha * c * Math.sin(Math.PI * k);
        ctx.drawImage(glow(i % 3 ? '#9fe6ff' : '#e6d9ff'), mx + Math.cos(a) * r - size / 2, my + Math.sin(a) * r * 0.8 - size / 2, size, size);
      }
      ctx.globalAlpha = p.alpha;
    }
    for (const e of engines) {
      const ex = (e.x - 0.5) * p.w;
      const ey = (e.y - 0.5) * p.w;
      const fw = e.r * p.w * 3.4 * flick * swell;
      const fh = fw * (1.4 + p.burn * 4.6) * flick;
      ctx.drawImage(glow('#6ad7ff'), ex - fw / 2, ey - fw * 0.3, fw, fh);
      ctx.drawImage(glow('#b18cff'), ex - fw * 0.35, ey + fh * 0.2, fw * 0.7, fh * 0.9);
      const core = e.r * p.w * 2.6 * swell;
      ctx.drawImage(glow('#ffffff'), ex - core / 2, ey - core / 2, core, core);
    }
    ctx.globalCompositeOperation = 'source-over';
    // (tiny now: a point of light is all that's left of it)
    if (img && p.w > u * 0.012) ctx.drawImage(img, -p.w / 2, -p.w / 2, p.w, p.w);
    ctx.restore();
  }

  /** the blast: a flash off its engines as it goes, and the screen flaring white for a moment */
  private drawBlast(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const k = (this.t - LAUNCH.blast) / 0.45;
    if (k <= 0 || k >= 1 || this.calm) return;
    const at = this.shipPose(w, h, LAUNCH.blast);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 1 - k;
    const size = at.w * (2 + 6 * easeOut(k));
    ctx.drawImage(glow('#e6f6ff'), at.x - size / 2, at.y - size / 2, size, size);
    ctx.drawImage(glow('#9fe6ff'), at.x - size, at.y - size, size * 2, size * 2);
    ctx.restore();
    // (an impact frame: a flash of white over everything)
    if (k < 0.25) {
      ctx.fillStyle = `rgba(240, 248, 255, ${0.55 * (1 - k / 0.25)})`;
      ctx.fillRect(0, 0, w, h);
    }
  }

  /** where it went in the blast: its image left behind, again and again, smaller and smaller, each fading */
  private drawAfterimages(ctx: CanvasRenderingContext2D, w: number, h: number) {
    if (this.calm || this.t < LAUNCH.blast) return;
    const img = sprite(this.shipSvg, 384, 384, this.ship.avatar ? { emoji: this.ship.avatar, ...pilotCanopy(this.ship.ship) } : undefined);
    if (!img) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 8; i++) {
      const at = LAUNCH.blast + i * 0.032;
      const age = (this.t - at) / 0.7;
      if (age < 0 || age >= 1) continue;
      const p = this.shipPose(w, h, at);
      if (p.w < 2) continue;
      ctx.globalAlpha = 0.5 * (1 - age) * (1 - i / 9);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rot * Math.PI) / 180);
      ctx.drawImage(img, -p.w / 2, -p.w / 2, p.w, p.w);
      ctx.restore();
    }
    ctx.restore();
  }

  /** as it goes to warp: manga's speed lines, flickering round where it went */
  private drawSpeedLines(ctx: CanvasRenderingContext2D, w: number, h: number, v: Point) {
    const k = this.t - LAUNCH.blast;
    if (k <= 0 || this.calm) return;
    const strength = Math.min(1, k / 0.08) * (0.55 + 0.45 * Math.exp(-k * 3));
    const reach = Math.hypot(Math.max(v.x, w - v.x), Math.max(v.y, h - v.y));
    // (drawn afresh a few times a second, as a hand-drawn frame is)
    let seed = Math.floor(this.t * 24) * 7919;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    ctx.save();
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 64; i++) {
      const a = rnd() * TAU;
      const r0 = reach * (0.22 + rnd() * 0.4);
      const half = (0.002 + rnd() * 0.006) * (1 + strength);
      ctx.globalAlpha = strength * (0.25 + rnd() * 0.5);
      ctx.beginPath();
      ctx.moveTo(v.x + Math.cos(a) * r0, v.y + Math.sin(a) * r0);
      ctx.lineTo(v.x + Math.cos(a - half) * reach * 1.3, v.y + Math.sin(a - half) * reach * 1.3);
      ctx.lineTo(v.x + Math.cos(a + half) * reach * 1.3, v.y + Math.sin(a + half) * reach * 1.3);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  /** as it's gone: a glint, a star of light where it went */
  private drawGlint(ctx: CanvasRenderingContext2D, p: ReturnType<LaunchScene['shipPose']>, u: number) {
    const k = (this.t - LAUNCH.glint) / 0.7;
    if (k <= 0 || k >= 1 || this.calm) return;
    const f = Math.sin(Math.PI * k);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.translate(p.x, p.y);
    const size = u * 0.35 * f;
    ctx.drawImage(glow('#e6f6ff'), -size / 2, -size / 2, size, size);
    for (let i = 0; i < 4; i++) {
      ctx.rotate(i ? Math.PI / 4 : 0);
      const L = u * (i % 2 ? 0.18 : 0.34) * f;
      const g = ctx.createLinearGradient(0, 0, L, 0);
      g.addColorStop(0, `rgba(255, 255, 255, ${0.95 * f})`);
      g.addColorStop(1, 'rgba(200, 180, 255, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-L, 0);
      ctx.lineTo(0, -u * 0.004);
      ctx.lineTo(L, 0);
      ctx.lineTo(0, u * 0.004);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
}

function newStar(z: number): Star {
  return { a: Math.random() * TAU, d: 0.05 + Math.random() ** 0.7, z: z * (0.3 + Math.random() * 0.7), size: 0.6 + Math.random() * 1.3, tint: HYPER_TINTS[Math.floor(Math.random() * HYPER_TINTS.length)], phase: Math.random() * TAU };
}
