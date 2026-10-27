import { glow, pilotCanopy, pilotEngines, rearShipSvg, rgba, sprite } from '../traffic/trafficArt';
import { HYPER_TINTS, hyperStreak } from '../arrival/dropOut';
import type { Point } from '../arrival/eclipse';
import type { PadShipSpec } from '../bay/useBay';
import { StorySun } from './storySun';
import { LAUNCH, circleThrough } from './timeline';

// The launch (StoryLaunch.tsx): a new pilot's first take-off, as a film's.
// Earth's night side fills the lower left, its city lights twinkling, and its
// edge runs from the top of the screen to the bottom, a razor line of light
// with its air glowing pink to violet beyond it, a purple haze, and a bloom
// of light on the edge where the Black Sun hangs above it (after React Bits
// Pro's Horizon Bloom, its Edge preset, on its side; ours). The pilot's own
// ship lifts off at the bottom left, turns some 40° towards the Black Sun and
// is away: the stars stretch out past it from where it's heading, longer and
// brighter, blooming, as it shrinks to a glint and a dot, and the screen
// washes out to white.

const TAU = Math.PI * 2;
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const easeOut = (t: number) => 1 - (1 - t) ** 3;
const easeIn = (t: number) => t * t * t;
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

const STARS = 260;
/** the ship's heading, once it has turned (degrees right of straight up; on a narrow screen a little steeper, to stay on it) */
const HEADING = 41;
const HEADING_NARROW = 30;
/** the cities on Earth's night side: so many clusters, of so many lights */
const CITIES = 46;
const CITY_LIGHTS = 7;

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
  private readonly lights: Array<{ s: number; d: number; size: number; rate: number; phase: number }> = [];
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
    // the cities, in clusters along the edge and back from it (where along the edge on screen, 0 to 1, and how far in, a share of the screen)
    for (let c = 0; c < CITIES; c++) {
      const s = Math.random();
      const d = 0.015 + Math.random() ** 1.4 * 0.75;
      for (let i = 0; i < CITY_LIGHTS; i++) {
        this.lights.push({ s: s + (Math.random() - 0.5) * 0.035, d: Math.max(0.006, d + (Math.random() - 0.5) * 0.04), size: 0.4 + Math.random(), rate: 1 + Math.random() * 4, phase: Math.random() * TAU });
      }
    }
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
    this.warp = this.calm ? 0 : easeIn(clamp01((t - LAUNCH.away[0]) / (LAUNCH.away[1] - LAUNCH.away[0] - 1)));
    // the stars come at it, faster with the warp; past the camera, they start again far off
    const speed = 0.04 + this.warp * 1.6;
    for (const s of this.stars) {
      s.z -= dt * speed;
      if (s.z <= 0.02) Object.assign(s, newStar(1));
    }
  }

  /** the ship: where it is, how wide (px), its heading (degrees) and how hard it burns */
  private shipPose(w: number, h: number): { x: number; y: number; w: number; rot: number; burn: number; alpha: number } {
    const t = this.t;
    const u = Math.min(w, h);
    const { start, v, heading } = this.path(w, h);
    const size = Math.min(u * 0.3, 220);
    const lift = easeOut(clamp01((t - LAUNCH.ignite) / 2.2));
    const turn = easeInOut(clamp01((t - LAUNCH.turn[0]) / (LAUNCH.turn[1] - LAUNCH.turn[0])));
    // up off the bottom, curving over on to its heading
    const rise = { x: start.x + u * 0.16 * Math.sin(heading) * turn, y: start.y - u * 0.16 * lift };
    // then away: into the distance, towards the vanishing point, smaller and smaller
    const k = clamp01((t - LAUNCH.away[0]) / (LAUNCH.away[1] - LAUNCH.away[0]));
    const depth = this.calm ? k * 6 : easeIn(k) * 60 + k * 4;
    const near = 1 / (1 + depth);
    const shake = this.calm ? 0 : Math.max(0, 1 - Math.abs(t - LAUNCH.ignite - 0.4) / 0.9) * u * 0.006;
    return {
      x: lerp(v.x, rise.x, near) + Math.sin(t * 70) * shake,
      y: lerp(v.y, rise.y, near) + Math.cos(t * 53) * shake,
      w: size * near,
      rot: ((Math.atan2(v.x - rise.x, rise.y - v.y) * 180) / Math.PI) * turn,
      burn: clamp01((t - LAUNCH.ignite) / 0.4) * (0.5 + 0.5 * k),
      alpha: this.calm ? 1 - clamp01((k - 0.6) / 0.4) : 1,
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
    this.drawShip(ctx, pose, u);
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
        const r0 = (s.d * reach * 0.18) / Math.min(1, s.z + 0.04 + warp * 0.5);
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
    const away = this.calm ? 0 : easeIn(clamp01((t - LAUNCH.away[0] - 1) / 4));
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

    // the night side
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    const body = ctx.createRadialGradient(bx, by, 0, bx, by, r * 0.9);
    body.addColorStop(0, '#2a1a5c');
    body.addColorStop(0.12, '#141640');
    body.addColorStop(0.5, '#090b26');
    body.addColorStop(1, '#05061a');
    ctx.fillStyle = body;
    ctx.fill();
    ctx.clip();
    // its cities, twinkling, all along the edge on screen (from where it leaves the top to the bottom) and back from it, foreshortened near it
    ctx.globalCompositeOperation = 'lighter';
    const across = (y: number) => Math.atan2(y - cy, Math.sqrt(Math.max(0, r * r - (y - cy) ** 2)));
    const a0 = across(0);
    const a1 = across(h);
    for (const l of this.lights) {
      const a = lerp(a0, a1, l.s);
      const d = r - l.d * u;
      const x = cx + Math.cos(a) * d;
      const y = cy + Math.sin(a) * d;
      if (x < -10 || y < -10 || x > w + 10 || y > h + 10) continue;
      const fore = 0.35 + 0.65 * clamp01(l.d * 6);
      const tw = this.calm ? 0.8 : 0.6 + 0.4 * Math.sin(t * l.rate + l.phase);
      const size = u * 0.009 * l.size * fore * tw;
      ctx.drawImage(glow('#ffc46a'), x - size, y - size * fore, size * 2, size * 2 * fore);
    }
    // the air, lit, just inside the edge
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
    for (const e of pilotEngines(this.ship.ship)) {
      const ex = (e.x - 0.5) * p.w;
      const ey = (e.y - 0.5) * p.w;
      const fw = e.r * p.w * 3.4 * flick;
      const fh = fw * (1.4 + p.burn * 4.6) * flick;
      ctx.drawImage(glow('#6ad7ff'), ex - fw / 2, ey - fw * 0.3, fw, fh);
      ctx.drawImage(glow('#b18cff'), ex - fw * 0.35, ey + fh * 0.2, fw * 0.7, fh * 0.9);
      const core = e.r * p.w * 2.6;
      ctx.drawImage(glow('#ffffff'), ex - core / 2, ey - core / 2, core, core);
    }
    ctx.globalCompositeOperation = 'source-over';
    // (tiny now: a point of light is all that's left of it)
    if (img && p.w > u * 0.012) ctx.drawImage(img, -p.w / 2, -p.w / 2, p.w, p.w);
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
