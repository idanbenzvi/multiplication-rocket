import { BEAM_TOP_FRACTION } from '../scene/plume';
import { glow, pilotCanopy, pilotEngines, rearShipSvg, rgba, sprite } from '../traffic/trafficArt';
import { TrafficPlume } from '../traffic/trafficPlume';
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
// Its engines burn with the main game's own plume (scene/plume.ts, through
// traffic/trafficPlume.ts), and it blasts off as the rocket does there
// (scene/EngineGlow.tsx, its numbers here in 2D): it gathers its power, the
// plume swelling and heating from ion blue to hot pink, the glow at its
// nozzles and the aura round its hull pulsing faster and faster, sparks
// curling in to them, as it edges towards where it's going and space holds
// its breath (the stars all but still); then it jumps to warp as a
// starship does: it stretches out towards where it's going, its bow leaping
// into the distance and its stern snapping after it, the stars smeared at once
// into streaks across the screen along its heading, speed lines flickering
// alongside, Earth falling away; where it's gone, the warp flash, a burst of
// blue-white light with a long flare across it; and the screen washes out to
// white.

const STARS = 420;
/** how far a star drifts back past the ship a second (of the screen's diagonal), at its nearest: as it lifts off, and in the warp */
const DRIFT = 0.03;
const WARP_SPEED = 4.5;
/** how long a star's streak is at its nearest in the warp (of the diagonal) */
const STREAK = 0.6;
/** the game's blast-off (EngineGlow.tsx): its glow's colours as it builds, cool to hot, an admiral's gold; its sparks, and its shockwave's time (s) */
const COOL = '#6ad7ff';
const HOT = '#ff6ad5';
const GOLD_COOL = '#ffd77a';
const GOLD_HOT = '#ffb84d';
const SPARKS = 44;
/** the jump (s after the blast): how long its bow takes to reach the distance, and its stern, setting off after it */
const BOW_S = 0.14;
const STERN: [number, number] = [0.1, 0.3];
/** how many copies of it make up the stretch */
const STRETCH = 28;
/** how long the warp flash lasts (s) */
const FLASH_S = 0.9;
/** the game's rocket, a world unit across in its scene, is this much of the ship's width here */
const UNIT = 0.42;
/** the ship's heading, once it has turned (degrees right of straight up; on a narrow screen a little steeper, to stay on it) */
const HEADING = 41;
const HEADING_NARROW = 30;
/** the place on Earth just below the bloom, at the edge (Europe's lights, lon/lat) */
const BELOW_BLOOM: [number, number] = [14, 46];

interface Star {
  /** where it is along the ship's heading and across it (0 to 1 of the room for them), and how near (0.2 far to 1) */
  a: number;
  c: number;
  near: number;
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
  /** how far into the warp (0 to 1) */
  private warp = 0;
  /** the game's plume, a frame at a time; without WebGL (or with reduced motion), glowing flames */
  private readonly plume: TrafficPlume | null;
  private readonly sparks = Array.from({ length: SPARKS }, (_, i) => ({
    angle: (i / SPARKS) * TAU + Math.random() * 0.4,
    radius: 1.1 + Math.random() * 1.5,
    rate: 0.9 + Math.random() * 0.9,
    offset: Math.random(),
    curl: (Math.random() < 0.5 ? -1 : 1) * (1.2 + Math.random()),
  }));

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
    this.plume = calm ? null : TrafficPlume.create(!!ship.admiral);
    // (drawn once now, so its shader's built before it lights)
    this.plume?.frame(0, 0, 0);
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
    // the stars drift back past it, all but still as it gathers its power, and rushing by once it's away (the nearer, the faster)
    const speed = DRIFT * (1 - 0.9 * this.charged(t)) * (1 - this.warp) + this.warp * WARP_SPEED;
    for (const s of this.stars) {
      s.a -= (dt * speed * s.near) / 2.4;
      if (s.a < 0) Object.assign(s, newStar(1 + s.a));
    }
  }

  /** the way it's going on screen: from where it lifted off to the vanishing point */
  private heading(w: number, h: number): Point {
    const { start, v } = this.path(w, h);
    const d = Math.hypot(v.x - start.x, v.y - start.y) || 1;
    return { x: (v.x - start.x) / d, y: (v.y - start.y) / d };
  }

  /** the engines' power, as the game's plume takes it (0 idle, 1 flat out, up to 1.9 in a blast-off) */
  private power(t: number, charge: number): number {
    const lift = clamp01((t - LAUNCH.ignite) / 0.6);
    const build = charge * (0.62 + 0.08 * Math.sin(t * 34));
    return Math.min(0.1 + 0.35 * lift + build + this.ignition(t) * 0.6 + (t >= LAUNCH.blast ? 0.6 : 0), 1.9);
  }

  /** how far into the distance its stern is (0 to 1) at `t`, and its bow */
  private stern(t: number): number {
    return easeIn(clamp01((t - LAUNCH.blast - STERN[0]) / (STERN[1] - STERN[0])));
  }

  private bow(t: number): number {
    return easeOut(clamp01((t - LAUNCH.blast) / BOW_S));
  }

  /** 1 at the blast, fading, as the game's ignition does (FlyingRocket) */
  private ignition(t: number): number {
    return t < LAUNCH.blast ? 0 : Math.exp(-3.2 * (t - LAUNCH.blast));
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
    const b = this.calm ? clamp01((t - LAUNCH.blast) / 1.4) : this.stern(t);
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

    this.drawStars(ctx, w, h);

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
    this.drawStretch(ctx, w, h);
    this.drawSpeedLines(ctx, w, h);
    this.drawFlash(ctx, w, h, v);

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
    this.plume?.dispose();
  }

  get done(): boolean {
    return this.t >= LAUNCH.end;
  }

  /** the stars: points far off, drifting back past it; in the warp, streaks smeared across the screen along its heading */
  private drawStars(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const d = this.heading(w, h);
    const diag = Math.hypot(w, h);
    // the room for them: the screen, turned to the heading, and room ahead for a streak's length
    const across = Math.abs(w * d.y) + Math.abs(h * d.x);
    const along = Math.abs(w * d.x) + Math.abs(h * d.y);
    const room = along + STREAK * diag;
    const warp = this.warp;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const s of this.stars) {
      const at = s.a * room - along / 2;
      const off = (s.c - 0.5) * across;
      const x = w / 2 + d.x * at - d.y * off;
      const y = h / 2 + d.y * at + d.x * off;
      const bright = clamp01(0.2 + s.near * 0.85) * (this.calm ? 0.8 : 0.7 + 0.3 * Math.sin(this.t * 3 + s.phase));
      if (warp > 0.02) {
        // a streak back along where it came from: the nearer, the longer and the wider
        const len = diag * STREAK * warp * s.near ** 1.5 + 2;
        const x0 = x + d.x * len;
        const y0 = y + d.y * len;
        if (Math.max(x, x0) < -8 || Math.min(x, x0) > w + 8 || Math.max(y, y0) < -8 || Math.min(y, y0) > h + 8) continue;
        const width = Math.max(1, s.size * (0.6 + s.near * 1.8) * (1 + 0.6 * warp));
        hyperStreak(ctx, x0, y0, x, y, width, s.tint, Math.min(1, bright * (0.5 + warp)));
      } else {
        if (x < -4 || x > w + 4 || y < -4 || y > h + 4) continue;
        const size = s.size * (0.5 + s.near * 1.1);
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

  /** the pilot's ship from behind, burning with the game's plume, gathering its power as the game's rocket does */
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
    const engines = pilotEngines(this.ship.ship);
    const c = p.charge;
    const t = this.t;
    // (a touch of it: the hull stays in sight as it stretches out)
    const ig = this.ignition(t) * 0.3;
    const gold = !!this.ship.admiral;
    // as the game's blast-off glows (EngineGlow.tsx): cool to hot as it builds, the pulse quickening
    const color = mix(gold ? GOLD_COOL : COOL, gold ? GOLD_HOT : HOT, c);
    const pulse = 0.82 + 0.18 * Math.sin(t * (7 + 26 * c));
    const unit = p.w * UNIT;
    const mx = (engines.reduce((a, e) => a + e.x, 0) / engines.length - 0.5) * p.w;
    const my = (engines.reduce((a, e) => a + e.y, 0) / engines.length - 0.5) * p.w;
    ctx.globalCompositeOperation = 'lighter';
    // the aura round its hull, behind it
    const aura = unit * ((1.5 + 1.2 * c) * pulse + 1.4 * ig) * 1.6;
    const auraA = 0.48 * c * pulse + 0.3 * ig;
    if (auraA > 0.01) {
      ctx.globalAlpha = p.alpha * Math.min(1, auraA);
      ctx.drawImage(glow(color), -aura / 2, -aura / 2, aura, aura);
    }
    ctx.globalAlpha = p.alpha;
    if (this.plume) {
      // the game's own plume out of each nozzle, swelling with the charge
      const s = this.power(t, c);
      const img = this.plume.frame(t, s, 0);
      const pw = p.w * (0.8 + 0.25 * Math.min(s, 1)) * (engines.length > 1 ? 0.8 : 1);
      const ph = p.w * (0.9 + 1.1 * s);
      for (const e of engines) ctx.drawImage(img, (e.x - 0.5) * p.w - pw / 2, (e.y - 0.5) * p.w - BEAM_TOP_FRACTION * ph, pw, ph);
    } else {
      // (without WebGL: glowing flames)
      const flick = 1 + Math.sin(t * 43) * 0.08 + Math.sin(t * 27) * 0.05;
      for (const e of engines) {
        const ex = (e.x - 0.5) * p.w;
        const ey = (e.y - 0.5) * p.w;
        const fw = e.r * p.w * 3.4 * flick * (1 + c);
        const fh = fw * (1.4 + p.burn * 4.6) * flick;
        ctx.drawImage(glow('#6ad7ff'), ex - fw / 2, ey - fw * 0.3, fw, fh);
        ctx.drawImage(glow('#b18cff'), ex - fw * 0.35, ey + fh * 0.2, fw * 0.7, fh * 0.9);
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    // (tiny now: a point of light is all that's left of it)
    if (img && p.w > u * 0.012) ctx.drawImage(img, -p.w / 2, -p.w / 2, p.w, p.w);
    ctx.globalCompositeOperation = 'lighter';
    // the glow at its nozzles, over it, white-hot at ignition
    for (const e of engines) {
      const n = unit * ((0.35 + 2.3 * c) * pulse + 2.2 * ig) * (engines.length > 1 ? 0.7 : 1) + e.r * p.w * 2.4;
      ctx.globalAlpha = p.alpha * Math.min(1, 0.55 + 0.95 * c * pulse + ig);
      ctx.drawImage(glow(ig > 0.3 ? '#ffffff' : color), (e.x - 0.5) * p.w - n / 2, (e.y - 0.5) * p.w - n / 2, n, n);
    }
    // sparks drawn in to the engines, curling as they go, brightest as they arrive
    if (c > 0) {
      const size = unit * 0.22;
      for (const sp of this.sparks) {
        const q = (t * sp.rate + sp.offset) % 1;
        const r = unit * sp.radius * (1 - q) ** 1.6;
        const a = sp.angle + sp.curl * q * 2.2;
        ctx.globalAlpha = p.alpha * Math.min(1, c * Math.sin(Math.PI * q) * 2.2);
        ctx.drawImage(glow(color), mx + Math.cos(a) * r - size / 2, my + Math.sin(a) * r * 0.75 - size / 2, size, size);
      }
    }
    ctx.restore();
  }

  /** where it is when it's `k` of the way into the distance (as its stern will be when it's got that far) */
  private poseAt(w: number, h: number, k: number) {
    return this.shipPose(w, h, LAUNCH.blast + STERN[0] + (STERN[1] - STERN[0]) * Math.sqrt(clamp01(k)));
  }

  /** the jump: it stretched out from its stern, where it is, to its bow, far off where it's going, copy after copy of it adding up to a streak of light in its colours */
  private drawStretch(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const t = this.t;
    if (this.calm || t <= LAUNCH.blast) return;
    const from = this.stern(t);
    const to = this.bow(t);
    if (to - from < 0.002) return;
    const img = sprite(this.shipSvg, 384, 384, this.ship.avatar ? { emoji: this.ship.avatar, ...pilotCanopy(this.ship.ship) } : undefined);
    if (!img) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    let last = this.poseAt(w, h, from);
    for (let i = 1; i <= STRETCH; i++) {
      const p = this.poseAt(w, h, lerp(from, to, i / STRETCH));
      // (each as bright as it's far from the last, so where they bunch up near its stern they don't blow out)
      const gap = Math.hypot(p.x - last.x, p.y - last.y);
      last = p;
      const a = (0.16 + 0.2 * (1 - i / STRETCH)) * clamp01(gap / (p.w * 0.3));
      if (p.w < 0.5 || a < 0.03) continue;
      ctx.globalAlpha = a;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rot * Math.PI) / 180);
      ctx.drawImage(img, -p.w / 2, -p.w / 2, p.w, p.w);
      ctx.restore();
    }
    // and a line of light down the middle of it, from its stern to its bow
    const a = this.poseAt(w, h, from);
    const b = this.poseAt(w, h, to);
    const g = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
    g.addColorStop(0, rgba('#9fe6ff', 0.5));
    g.addColorStop(1, 'rgba(255, 255, 255, 0.95)');
    ctx.globalAlpha = 1;
    ctx.strokeStyle = g;
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(1.5, a.w * 0.18);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.restore();
  }

  /** as it goes to warp: manga's speed lines, flickering across the screen along its heading */
  private drawSpeedLines(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const k = this.t - LAUNCH.blast;
    if (k <= 0 || this.calm) return;
    const strength = Math.min(1, k / 0.08) * (0.55 + 0.45 * Math.exp(-k * 3));
    const d = this.heading(w, h);
    const diag = Math.hypot(w, h);
    const across = Math.abs(w * d.y) + Math.abs(h * d.x);
    // (drawn afresh a few times a second, as a hand-drawn frame is)
    let seed = Math.floor(this.t * 24) * 7919 + 1;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    ctx.save();
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 48; i++) {
      const off = (rnd() - 0.5) * across;
      const mid = (rnd() - 0.5) * diag;
      const len = diag * (0.25 + rnd() * 0.6);
      const half = (0.6 + rnd() * 2.2) * (1 + strength);
      const cx = w / 2 - d.y * off + d.x * mid;
      const cy = h / 2 + d.x * off + d.y * mid;
      ctx.globalAlpha = strength * (0.2 + rnd() * 0.45);
      // a sliver, thickest in its middle, pointed at both ends
      ctx.beginPath();
      ctx.moveTo(cx - (d.x * len) / 2, cy - (d.y * len) / 2);
      ctx.lineTo(cx - d.y * half, cy + d.x * half);
      ctx.lineTo(cx + (d.x * len) / 2, cy + (d.y * len) / 2);
      ctx.lineTo(cx + d.y * half, cy - d.x * half);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  /** as its stern catches up with its bow: the warp flash, where it's gone, a burst of blue-white light, a long flare across it, rays, and a ring of light spreading */
  private drawFlash(ctx: CanvasRenderingContext2D, w: number, h: number, v: Point) {
    const k = (this.t - LAUNCH.flash) / FLASH_S;
    if (k <= 0 || k >= 1 || this.calm) return;
    const u = Math.min(w, h);
    const d = this.heading(w, h);
    // (in a blink, then dying away)
    const f = k < 0.08 ? easeOut(k / 0.08) : (1 - (k - 0.08) / 0.92) ** 2;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.translate(v.x, v.y);
    // its burst
    const core = u * (0.12 + 0.3 * f);
    ctx.globalAlpha = f;
    ctx.drawImage(glow('#9fd8ff'), -core * 1.6, -core * 1.6, core * 3.2, core * 3.2);
    ctx.drawImage(glow('#ffffff'), -core / 2, -core / 2, core, core);
    ctx.globalAlpha = 1;
    // the long flare, level across the screen, as a lens catches it
    const L = Math.max(w, h) * (0.5 + 0.7 * f);
    for (const [thick, color, a] of [
      [u * 0.018, '#6ab8ff', 0.5],
      [u * 0.005, '#ffffff', 0.95],
    ] as Array<[number, string, number]>) {
      const g = ctx.createLinearGradient(-L, 0, L, 0);
      g.addColorStop(0, rgba(color, 0));
      g.addColorStop(0.5, rgba(color, a * f));
      g.addColorStop(1, rgba(color, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(0, 0, L, thick, 0, 0, TAU);
      ctx.fill();
    }
    // rays, along its heading and across it
    ctx.rotate(Math.atan2(d.y, d.x));
    for (let i = 0; i < 4; i++) {
      const R = u * (i % 2 ? 0.12 : 0.28) * f;
      const g = ctx.createLinearGradient(0, 0, R, 0);
      g.addColorStop(0, `rgba(255, 255, 255, ${0.9 * f})`);
      g.addColorStop(1, 'rgba(160, 200, 255, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-R, 0);
      ctx.lineTo(0, -u * 0.005);
      ctx.lineTo(R, 0);
      ctx.lineTo(0, u * 0.005);
      ctx.closePath();
      ctx.fill();
      ctx.rotate(Math.PI / 4);
    }
    ctx.restore();
    // a ring of light, spreading
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = (1 - k) ** 2 * 0.7;
    ctx.strokeStyle = '#bfe4ff';
    ctx.lineWidth = Math.max(1, u * 0.006 * (1 - k));
    ctx.beginPath();
    ctx.arc(v.x, v.y, u * (0.05 + 0.45 * easeOut(k)), 0, TAU);
    ctx.stroke();
    ctx.restore();
    // (and the screen catching it, for a moment)
    if (k < 0.12) {
      ctx.fillStyle = `rgba(225, 240, 255, ${0.35 * (1 - k / 0.12)})`;
      ctx.fillRect(0, 0, w, h);
    }
  }
}

function newStar(a: number): Star {
  return { a, c: Math.random(), near: 0.2 + 0.8 * Math.random() ** 1.6, size: 0.6 + Math.random() * 1.3, tint: HYPER_TINTS[Math.floor(Math.random() * HYPER_TINTS.length)], phase: Math.random() * TAU };
}

/** a colour `k` of the way from `a` to `b` (in eighths, so the glows stay few) */
function mix(a: string, b: string, k: number): string {
  const q = Math.round(clamp01(k) * 8) / 8;
  const x = parseInt(a.slice(1), 16);
  const y = parseInt(b.slice(1), 16);
  const ch = (shift: number) => Math.round(lerp((x >> shift) & 255, (y >> shift) & 255, q));
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
}
