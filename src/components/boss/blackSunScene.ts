import { EclipseScene, GOLD, hex, mix, PINK, type Point, type RGB } from '../arrival/eclipse';
import { glow, pilotCanopy, pilotEngines, rearShipSvg, rgba, sprite } from '../traffic/trafficArt';
import type { ShipId } from '../scene/ships';
import { pickOp, type PilotMission } from '../../game/mission';

// The Black Sun's sky, on one canvas (after Monster Sun's arrival,
// arrival/eclipse.ts, which it extends: the same eclipse, the same ship
// flying in). Once the fight starts the monster sun turns into a black hole:
// an accretion disk spins up round it, seen nearly edge-on, its far side
// bent over the top by the hole's pull, and numbers drift in from all round,
// spiralling in faster and faster, stretched thin as they near it, until
// they touch the dark and are swallowed with a little star blast.
//
// The pilot's ship hangs below it. A right answer flies up to the ship,
// which fires it at the sun as a bolt of light: the dark shell cracks, and
// the cracks spread with every hit. Every 5 in a row a layer of the shell
// shatters off. A wrong answer is pulled off its button into the hole; and
// once there's a checkpoint the sun winds up and spits a fireball at the
// ship instead, which can be dodged. The 15th bolt shatters the shell for
// good: everything it swallowed bursts back out, the ship does a roll and a
// loop and flies in close as the camera follows, and the sun lights up gold
// and smiles; rays grow, a rainbow arcs, hearts float up and the dead little
// worlds round it bloom blue and green, one by one.
//
// The overlay (BlackSun.tsx) steps it (update), draws it, tells it what's
// happening (fire, swallowFrom, heal, checkpoint, chargeFireball, dodge,
// cure), and times its own moves by the scene's clock (after), which stops
// while the player is away.

const TAU = Math.PI * 2;
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const easeOut = (t: number) => 1 - (1 - t) ** 3;
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const rand = (a: number, b: number) => a + Math.random() * (b - a);

/** the corona once it's a black hole (near the rim, further out, furthest), and once it's cured */
const DARK: RGB[] = [hex('#ffd2c4'), hex('#ff4f6d'), hex('#7b2cff')];
const HAPPY: RGB[] = [hex('#fffbe6'), hex('#ffd36b'), hex('#ff9f4a')];
/** the whirlpool round the hole, inner edge to outer */
const DISK_COLORS = ['#fff3d6', '#ffc46a', '#ff7a59', '#ff4f8a', '#b45cff'];
/** its plane: tilted a touch, seen from a little above (squashed to this); its inner and outer edge, in sun radii */
const TILT = -0.12;
const DISK_FLAT = 0.42;
const DISK_IN = 1.06;
const DISK_OUT = 2.7;
const PARTICLES = 150;
/** its spiral arms, and how tightly they wind in */
const ARMS = 3;
const ARM_WIND = 2.6;
/** the numbers fall in on the same plane */
const FALL_FLAT = DISK_FLAT;
/** a number is swallowed when it touches the dark (in sun radii, on screen) */
const SWALLOW_AT = 1.03;
const NUMBER_COLORS = ['#fdf3e7', '#ffb37a', '#c9a4de', '#7fe0ff', '#ffd77a', '#ff9de2'];
const FONT = "'Fredoka', 'Trebuchet MS', sans-serif";

/** the ship flies in as Monster Sun's does (ModeArrival), and stays: seconds from the mode opening */
const FLIGHT_S = [0.48, 1.75];
/** how far below the sun's middle the ship hangs, in sun radii, and how wide it is */
const SHIP_BELOW = 2.05;
const SHIP_W = 0.95;
/** it's never bigger than this, in px (on a big screen) */
const SHIP_MAX_PX = 124;
/** its size flying in from just behind the camera, in px */
const SHIP_NEAR_PX = 182;

/** the cure, in seconds from the 15th bolt landing */
const CURE = {
  // the shell shatters (till then it shakes, its cracks blazing)
  shatter: 0.45,
  roll: [0.9, 1.4],
  loop: [1.4, 2.6],
  approach: [2.6, 3.8],
  zoom: [1.2, 3.6],
  face: 1.5,
  rays: [1.7, 2.8],
  rainbow: [2.7, 4],
  blooms: [2.4, 2.95, 3.5],
  admiral: 4.7,
};

export interface ShipPose {
  x: number;
  y: number;
  /** width in px */
  w: number;
  /** degrees */
  rot: number;
  alpha: number;
  /** engine burn, 0 to 1 */
  burn: number;
}

interface Spiral {
  text: string;
  color: string;
  /** where it is in its slanted plane round the sun: distance in sun radii, and angle */
  rho: number;
  theta: number;
  /** font size, in sun radii */
  size: number;
  born: number;
  /** an answer pulled off its button: a timed fall from where it was, round and in */
  fall?: { at: number; dur: number; rho0: number; theta0: number; turn: number };
  /** an answer (its swallow is heard; a wrong one goes red as it falls) */
  loud: boolean;
  red: boolean;
}

/** a star blast where something was swallowed, or a hit's flash: on the sun, in sun radii from its middle */
interface Blast {
  x: number;
  y: number;
  born: number;
  life: number;
  size: number;
  color: string;
  sparks: Array<{ a: number; v: number }>;
}

interface Bolt {
  text: string;
  /** where the answer leaves its button, on screen */
  from: Point;
  at: number;
  /** when it reaches the ship and fires, and where on the sun it lands (sun radii) */
  fireAt: number;
  hitAt: number;
  to: Point;
}

interface Shard {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  spin: number;
  size: number;
  born: number;
  life: number;
  /** its edge glows this colour */
  edge: string;
}

interface Ring {
  born: number;
  life: number;
  /** from and to, in sun radii */
  r0: number;
  r1: number;
  color: string;
  width: number;
}

interface Ember {
  x: number;
  y: number;
  vx: number;
  vy: number;
  born: number;
  life: number;
  color: string;
  size: number;
}

interface Fireball {
  /** charging in the mouth from, launched at, lands at (scene seconds) */
  chargeAt: number;
  launchAt: number;
  landAt: number;
  /** where it's thrown, on screen (the ship's place as it charged) */
  target: Point;
  /** dodged: which way the ship went */
  dodged: -1 | 0 | 1;
  done: boolean;
  onDone: (dodged: boolean) => void;
}

interface Planet {
  orbit: number;
  angle: number;
  speed: number;
  size: number;
  ocean: string;
  land: string;
  /** continents: centre, size and slant, in planet radii */
  blobs: Array<{ x: number; y: number; rx: number; ry: number; a: number }>;
  ring: boolean;
  moon: boolean;
  bloomAt: number;
}

interface Floater {
  x: number;
  y: number;
  vy: number;
  sway: number;
  born: number;
  life: number;
  size: number;
  color: string;
  heart: boolean;
}

interface Firework {
  x: number;
  y: number;
  born: number;
  color: string;
  sparks: Array<{ a: number; v: number }>;
}

type Mood = 'angry' | 'wince' | 'gloat' | 'rage' | 'stunned';

/** what's going on, for the sun's face and the sky */
type Stage = 'arrive' | 'fight' | 'cured';

// a number drawn once with its glow, then just stamped every frame
const SPRITE_PX = 64;
const numberSprites = new Map<string, HTMLCanvasElement>();
if (typeof document !== 'undefined') void document.fonts?.ready.then(() => numberSprites.clear());
export function numberSprite(text: string, color: string): HTMLCanvasElement {
  const key = `${text}|${color}`;
  const cached = numberSprites.get(key);
  if (cached) return cached;
  const c = document.createElement('canvas');
  const px = SPRITE_PX;
  c.width = Math.ceil(px * 0.62 * text.length + px * 0.8);
  c.height = Math.ceil(px * 1.5);
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.font = `700 ${px}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = color;
    ctx.shadowBlur = 14;
    ctx.fillStyle = color;
    ctx.fillText(text, c.width / 2, c.height / 2);
    ctx.shadowBlur = 0;
    ctx.fillText(text, c.width / 2, c.height / 2);
  }
  numberSprites.set(key, c);
  return c;
}

export class BlackSunScene extends EclipseScene {
  /** seconds since the mode opened, frozen while the player is away: everything is timed by it */
  t = 0;
  private jobs: Array<{ at: number; fn: () => void }> = [];
  private stage: Stage = 'arrive';
  private readonly mission: PilotMission;
  private shipSvg: string;
  /** the ship the pilot flies (seen from behind) */
  private readonly shipId: ShipId;
  /** when the ship was promoted to the admiral's livery (it flashes gold) */
  private promotedAt = -Infinity;
  private readonly canopy?: { emoji: string; x: number; y: number; radius: number };

  /** the free part of the screen (not under the top bar or the question panel), set by the overlay */
  arena = { x: 0, y: 0, w: 0, h: 0 };
  /** the screen's size as of the last frame */
  private w = 0;
  private h = 0;
  /** the camera, from one framing to the next: 0 the arrival's, 1 the fight's, 2 the cure's close-up */
  private frame = { from: 0, to: 0, at: 0, dur: 1 };
  private shake = 0;

  /** how much of a black hole it is (0 to 1), and when it turned */
  private hole = 0;
  private awakeAt = Infinity;
  // hot matter streaming round and in, mostly along the arms; each one starts again at the outside once it's in
  private particles = Array.from({ length: PARTICLES }, () => newParticle(DISK_IN + Math.random() * (DISK_OUT - DISK_IN), 0));
  /** how far round the arms have turned */
  private armTurn = 0;
  private diskFlash = 0;

  private spirals: Spiral[] = [];
  private nextSpiral = 0;
  /** numbers it has swallowed this fight (they all burst back out when it's cured) */
  private eaten: string[] = [];
  private blasts: Blast[] = [];
  private bolts: Bolt[] = [];
  private shards: Shard[] = [];
  private rings: Ring[] = [];
  private embers: Ember[] = [];
  private fireball: Fireball | null = null;

  /** the cracks of light in the dark shell, one per right answer of the run (in sun radii) */
  private readonly cracks: Point[][];
  /** when each crack opened (Infinity: not yet), and when it sealed again */
  private crackAt: number[];
  private sealAt: number[];
  /** how far through the run it is, for the cracks */
  private run = 0;

  private mood: Mood = 'angry';
  private moodUntil = 0;
  /** the mouth: how open it is (0 to 1), easing to where it's wanted */
  private jaw = 0;

  /** the ship: when it fired, and when it dodged (which way), when it was hit */
  private firedAt = -Infinity;
  private dodge = { at: -Infinity, dir: 0, until: -Infinity };
  private hitAt = -Infinity;

  // ---- the cure ----
  private curedAt = Infinity;
  private planets: Planet[] = [];
  private floaters: Floater[] = [];
  private nextFloater = 0;
  private fireworks: Firework[] = [];
  private nextFirework = Infinity;
  private flash = 0;
  private burstNumbers: Array<{ text: string; color: string; a: number; v: number; spin: number; size: number }> = [];

  constructor(calm: boolean, mission: PilotMission, avatar?: string, admiral = false, ship: ShipId = 'classic') {
    super(calm);
    this.mission = mission;
    this.shipId = ship;
    this.shipSvg = rearShipSvg(undefined, admiral, ship);
    this.canopy = avatar ? { emoji: avatar, ...pilotCanopy(ship) } : undefined;
    // the ship's drawing, ready by the time it flies in
    sprite(this.shipSvg, 384, 384, this.canopy);
    this.cracks = makeCracks();
    this.crackAt = this.cracks.map(() => Infinity);
    this.sealAt = this.cracks.map(() => Infinity);
  }

  // ---------- the clock ----------

  /** step it on by `dt` seconds of play */
  update(dt: number) {
    this.t += dt;
    const due = this.jobs.filter((j) => j.at <= this.t);
    if (due.length) {
      this.jobs = this.jobs.filter((j) => j.at > this.t);
      for (const j of due) j.fn();
    }
    this.simulate(dt);
  }

  /** run `fn` this many seconds from now, on the scene's clock (it waits while the player is away) */
  after(seconds: number, fn: () => void) {
    this.jobs.push({ at: this.t + seconds, fn });
  }

  /** forget everything planned (a fresh fight) */
  clearJobs() {
    this.jobs = [];
  }

  /** a tap skipped the ship's arrival: straight to it being there */
  skipArrival() {
    if (this.t < FLIGHT_S[1]) this.t = FLIGHT_S[1];
  }

  // ---------- the camera ----------

  private moveCamera(to: number, dur: number) {
    const k = clamp01((this.t - this.frame.at) / this.frame.dur);
    // (from wherever it is now, if it's still moving)
    const from = k >= 1 ? this.frame.to : lerp(this.frame.from, this.frame.to, easeInOut(k));
    this.frame = { from, to, at: this.t, dur: this.calm ? 0.001 : dur };
  }

  /** the ship has arrived: the sun eases over to make room for the panel */
  settle() {
    if (this.frame.to < 1) this.moveCamera(1, 1.1);
  }

  private framing(n: number, w: number, h: number): Point & { r: number } {
    if (n <= 0) return super.sun(w, h);
    const a = this.arena.w > 0 ? this.arena : { x: 0, y: 0, w, h };
    // the sun, the whirlpool round it and the ship below it (its flames too), fitted into the free part of the screen
    const r = Math.max(30, Math.min(a.h / 4, a.w / 4.4, 175));
    const fight = { x: a.x + a.w / 2, y: a.y + r * 1.2 + Math.max(0, a.h - r * 4) * 0.4, r };
    if (n <= 1) return fight;
    // the cure's close-up: bigger, with room for the admiral's card (beside it on a wide screen, below it otherwise)
    const wide = w > h * 1.1 && w >= 640;
    const close = wide
      ? { x: w * 0.3, y: h * 0.5, r: Math.min(w * 0.13, h * 0.25) }
      : { x: w / 2, y: Math.max(h * 0.2, Math.min(w, h) * 0.3), r: Math.min(w * 0.2, h * 0.13) };
    const k = n - 1;
    return { x: lerp(fight.x, close.x, k), y: lerp(fight.y, close.y, k), r: lerp(fight.r, close.r, k) };
  }

  override sun(w: number, h: number): Point & { r: number } {
    const k = easeInOut(clamp01((this.t - this.frame.at) / this.frame.dur));
    const a = this.framing(this.frame.from, w, h);
    const b = this.framing(this.frame.to, w, h);
    const s = { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), r: lerp(a.r, b.r, k) };
    if (this.shake > 0.01 && !this.calm) {
      s.x += Math.sin(this.t * 71) * this.shake * s.r * 0.07;
      s.y += Math.cos(this.t * 53) * this.shake * s.r * 0.05;
    }
    return s;
  }

  /** a point in the slanted plane round the sun (distance in sun radii, angle) in sun radii from its middle, as seen */
  private static project(rho: number, theta: number, flat: number): Point {
    const x = rho * Math.cos(theta);
    const y = rho * Math.sin(theta) * flat;
    return { x: x * Math.cos(TILT) - y * Math.sin(TILT), y: x * Math.sin(TILT) + y * Math.cos(TILT) };
  }

  /** the other way: a point in sun radii from the sun's middle, in the numbers' plane */
  private static unproject(p: Point): { rho: number; theta: number } {
    const x = p.x * Math.cos(-TILT) - p.y * Math.sin(-TILT);
    const y = (p.x * Math.sin(-TILT) + p.y * Math.cos(-TILT)) / FALL_FLAT;
    return { rho: Math.hypot(x, y), theta: Math.atan2(y, x) };
  }

  // ---------- the ship ----------

  /** where the ship waits: below the sun */
  private shipSpot(w: number, h: number): Point & { w: number } {
    const s = this.sun(w, h);
    return { x: s.x, y: s.y + s.r * SHIP_BELOW, w: Math.min(s.r * SHIP_W, SHIP_MAX_PX) };
  }

  /** where a banner goes: between the sun and the ship, on screen */
  bannerY(): number {
    const s = this.sun(this.w, this.h);
    return s.y + s.r * 1.3;
  }

  /** where its nose is (the bolts leave from there), on screen */
  shipNose(): Point {
    const p = this.ship(this.w, this.h);
    return { x: p.x, y: p.y - p.w * 0.3 };
  }

  ship(w: number, h: number): ShipPose {
    const spot = this.shipSpot(w, h);
    const t = this.t;
    if (this.calm) return { x: spot.x, y: spot.y, w: spot.w, rot: 0, alpha: 1, burn: 0.3 };
    // flying in from just behind the camera (Monster Sun's arrival, but it stops in its place)
    if (t < FLIGHT_S[1]) {
      const k = (t - FLIGHT_S[0]) / (FLIGHT_S[1] - FLIGHT_S[0]);
      if (k <= 0) return { ...spot, rot: 0, alpha: 0, burn: 1 };
      const depth = Math.max(0.05, SHIP_NEAR_PX / spot.w - 1);
      const near = 1 / (1 + depth * k);
      const p = (1 - near) / (1 - 1 / (1 + depth));
      const from = { x: w * 0.6, y: h + 40 };
      const via = { x: w * 0.3, y: h * 0.72 };
      const at = (q: number) => ({
        x: (1 - q) ** 2 * from.x + 2 * (1 - q) * q * via.x + q * q * spot.x,
        y: (1 - q) ** 2 * from.y + 2 * (1 - q) * q * via.y + q * q * spot.y,
      });
      const here = at(p);
      const ahead = at(Math.min(1, p + 0.02));
      const bank = ((Math.atan2(ahead.x - here.x, here.y - ahead.y) * 180) / Math.PI) * 0.6 * (1 - easeInOut(clamp01((k - 0.7) / 0.3)));
      return { ...here, w: SHIP_NEAR_PX * near, rot: bank, alpha: Math.min(1, k / 0.06), burn: 1 - k * 0.6 };
    }
    // hovering, bobbing gently
    let x = spot.x + Math.sin(t * 0.9) * spot.w * 0.04;
    let y = spot.y + Math.sin(t * 1.7) * spot.w * 0.05;
    let rot = Math.sin(t * 0.9) * 3;
    let size = spot.w;
    let burn = 0.35;
    // kicking back as it fires
    const kf = (t - this.firedAt) / 0.35;
    if (kf >= 0 && kf < 1) {
      y += Math.sin(kf * Math.PI) * spot.w * 0.12;
      burn = 0.35 + 0.5 * (1 - kf);
    }
    // dodging: a barrel roll out of the way, and back once it's passed
    const kd = t - this.dodge.at;
    if (kd >= 0 && t < this.dodge.until + 0.45) {
      const out = kd < 0.3 ? easeOut(kd / 0.3) : t < this.dodge.until ? 1 : 1 - easeInOut((t - this.dodge.until) / 0.45);
      x += this.dodge.dir * out * spot.w * 1.9;
      rot += this.dodge.dir * 360 * easeOut(clamp01(kd / 0.45));
      burn = Math.max(burn, 0.9 * (1 - clamp01(kd / 0.8)));
    }
    // hit: knocked aside, tumbling
    const kh = t - this.hitAt;
    if (kh >= 0 && kh < 1.2) {
      const fade = 1 - easeOut(kh / 1.2);
      x += Math.sin(kh * 30) * spot.w * 0.12 * fade;
      y += spot.w * 0.35 * Math.sin(Math.min(1, kh / 0.6) * Math.PI) * fade;
      rot += 540 * easeOut(clamp01(kh / 1.1)) * (this.hitSpin || 1);
    }
    // cured: a victory roll, a loop, then in close to watch the sun light up
    const kc = t - this.curedAt;
    if (kc > CURE.roll[0]) {
      const roll = easeInOut(clamp01((kc - CURE.roll[0]) / (CURE.roll[1] - CURE.roll[0])));
      rot += 360 * roll;
      y -= Math.sin(roll * Math.PI) * spot.w * 0.25;
      const kl = clamp01((kc - CURE.loop[0]) / (CURE.loop[1] - CURE.loop[0]));
      if (kl > 0 && kl < 1) {
        const phi = easeInOut(kl) * TAU;
        const rl = spot.w * 1.25;
        x += Math.sin(phi) * rl;
        y += (Math.cos(phi) - 1) * rl;
        rot -= (phi * 180) / Math.PI;
        burn = 0.9;
      }
      const ka = easeInOut(clamp01((kc - CURE.approach[0]) / (CURE.approach[1] - CURE.approach[0])));
      if (ka > 0) {
        const s = this.sun(w, h);
        const park = { x: s.x - s.r * 1.45, y: s.y + s.r * 0.95 };
        x = lerp(x, park.x + Math.sin(t * 0.9) * s.r * 0.03, ka);
        y = lerp(y, park.y + Math.sin(t * 1.7) * s.r * 0.03, ka);
        size = lerp(spot.w, s.r * 0.45, ka);
        // banking into the turn in, then looking up at it
        rot += Math.sin(ka * Math.PI) * -18 + ka * 12;
        burn = Math.max(burn, 0.7 * Math.sin(ka * Math.PI));
      }
    }
    return { x, y, w: size, rot, alpha: 1, burn };
  }
  private hitSpin = 1;

  private drawShip(ctx: CanvasRenderingContext2D, p: ShipPose) {
    if (p.alpha <= 0.01) return;
    const img = sprite(this.shipSvg, 384, 384, this.canopy);
    ctx.save();
    ctx.globalAlpha = p.alpha;
    ctx.translate(p.x, p.y);
    ctx.rotate((p.rot * Math.PI) / 180);
    // the engines: a flame out of each nozzle, longer as it burns harder
    ctx.globalCompositeOperation = 'lighter';
    const flick = 1 + Math.sin(this.t * 43) * 0.08 + Math.sin(this.t * 27) * 0.05;
    for (const e of pilotEngines(this.shipId)) {
      const ex = (e.x - 0.5) * p.w;
      const ey = (e.y - 0.5) * p.w;
      const fw = e.r * p.w * 3.2 * flick;
      const fh = fw * (1.6 + p.burn * 3.2) * flick;
      ctx.drawImage(glow('#6ad7ff'), ex - fw / 2, ey - fw * 0.3, fw, fh);
      const core = e.r * p.w * 2.4;
      ctx.drawImage(glow('#ffffff'), ex - core / 2, ey - core / 2, core, core);
    }
    ctx.globalCompositeOperation = 'source-over';
    if (img) ctx.drawImage(img, -p.w / 2, -p.w / 2, p.w, p.w);
    ctx.restore();
    // promoted: a flash of gold and a ring of light round it
    const kp = (this.t - this.promotedAt) / 1.2;
    if (kp >= 0 && kp < 1) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 1 - kp;
      const r = p.w * (1.4 + kp * 1.6);
      ctx.drawImage(glow('#ffd77a'), p.x - r / 2, p.y - r / 2, r, r);
      ctx.strokeStyle = `rgba(255, 230, 150, ${0.9 * (1 - kp)})`;
      ctx.lineWidth = Math.max(1.5, p.w * 0.05);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.w * (0.5 + kp * 1.2), 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
    // hit: it glows red for a moment
    const kh = (this.t - this.hitAt) / 0.9;
    if (kh >= 0 && kh < 1) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = (1 - kh) * 0.8;
      const r = p.w * 2;
      ctx.drawImage(glow('#ff5a3c'), p.x - r / 2, p.y - r / 2, r, r);
      ctx.restore();
    }
  }

  // ---------- what happens ----------

  /** the fight starts: the monster sun turns into a black hole */
  awaken() {
    this.stage = 'fight';
    this.awakeAt = this.t;
    this.nextSpiral = this.t + 1.3;
    this.mood = 'rage';
    this.moodUntil = this.t + 1.4;
    this.shake = 0.6;
    this.rings.push({ born: this.t, life: 1.4, r0: 1, r1: 4.5, color: '#ff4f6d', width: 0.08 });
    this.rings.push({ born: this.t + 0.25, life: 1.4, r0: 1, r1: 3.5, color: '#b45cff', width: 0.05 });
  }

  /** a fresh fight: the cracks gone, the numbers it ate forgotten */
  restart() {
    this.run = 0;
    this.crackAt = this.cracks.map(() => Infinity);
    this.sealAt = this.cracks.map(() => Infinity);
    this.eaten = [];
    this.fireball = null;
    this.stage = 'fight';
    this.curedAt = Infinity;
    this.planets = [];
    this.floaters = [];
    this.fireworks = [];
    this.nextFirework = Infinity;
    this.burstNumbers = [];
    this.awaken();
    this.moveCamera(1, 1.4);
  }

  /**
   * A right answer: `text` flies up from its button (`from`, on screen) to the
   * ship, which fires it at the sun. `run` is the run with it. The bolt
   * lands this many seconds later (returned).
   */
  fire(text: string, from: Point, run: number, onLand: () => void): number {
    const glideS = this.calm ? 0.05 : 0.32;
    const flyS = this.calm ? 0.05 : 0.12;
    const a = Math.PI / 2 + rand(-0.45, 0.45);
    const to = { x: Math.cos(a) * 0.97, y: Math.sin(a) * 0.97 };
    this.bolts.push({ text, from, at: this.t, fireAt: this.t + glideS, hitAt: this.t + glideS + flyS, to });
    this.after(glideS, () => {
      this.firedAt = this.t;
    });
    this.after(glideS + flyS, () => {
      this.run = run;
      this.crackAt[run - 1] = this.t;
      this.sealAt[run - 1] = Infinity;
      this.blasts.push(blast(to.x, to.y, this.t, 0.75, 0.9, '#ffe6a0', 14));
      this.rings.push({ born: this.t, life: 0.7, r0: 0.2, r1: 1.6, color: '#ffd77a', width: 0.05 });
      this.diskFlash = 1;
      this.shake = Math.max(this.shake, 0.35);
      if (this.stage === 'fight') this.setMood('wince', 0.55);
      onLand();
    });
    return glideS + flyS;
  }

  /**
   * A wrong answer: `text` is pulled off its button (`from`, on screen) and
   * swallowed; the sun gloats. With `color`, it's a number of the sky's
   * (the story's), pulled in as it is, `size` sun radii tall.
   */
  swallowFrom(text: string, from: Point, color?: string, size = 0.5) {
    const s = this.sun(this.w, this.h);
    const { rho, theta } = BlackSunScene.unproject({ x: (from.x - s.x) / s.r, y: (from.y - s.y) / s.r });
    this.spirals.push({
      text,
      color: color ?? '#ffffff',
      rho,
      theta,
      size,
      born: this.t - 2,
      fall: { at: this.t, dur: this.calm ? 0.6 : 1.25, rho0: rho, theta0: theta, turn: -3.6 },
      loud: !color,
      red: !color,
    });
    this.setMood('gloat', 1.6);
  }

  /** the sun gets its strength back: the cracks past the run seal up, and it glows angry */
  heal(run: number) {
    for (let i = run; i < this.crackAt.length; i++) if (this.crackAt[i] !== Infinity && this.sealAt[i] === Infinity) this.sealAt[i] = this.t;
    this.run = run;
    this.rings.push({ born: this.t, life: 0.9, r0: 1.4, r1: 0.95, color: '#ff2d55', width: 0.12 });
    this.diskFlash = 1;
    this.setMood('gloat', 1.2);
  }

  /** a checkpoint: a layer of the dark shell shatters off */
  checkpoint() {
    this.shatterShell(22, '#ffd77a', 1.2);
    this.rings.push({ born: this.t, life: 1.2, r0: 1, r1: 4, color: '#ffd77a', width: 0.07 });
    this.shake = Math.max(this.shake, 0.8);
    this.diskFlash = 1;
  }

  private shatterShell(n: number, edge: string, speed: number) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + rand(-0.15, 0.15);
      const v = rand(0.9, 2.2) * speed;
      this.shards.push({
        x: Math.cos(a) * 0.95,
        y: Math.sin(a) * 0.95,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        rot: rand(0, TAU),
        spin: rand(-6, 6),
        size: rand(0.12, 0.28),
        born: this.t,
        life: rand(0.9, 1.5),
        edge,
      });
    }
  }

  private setMood(mood: Mood, seconds: number) {
    this.mood = mood;
    this.moodUntil = this.t + seconds;
  }

  /**
   * The sun winds up a fireball and spits it at the ship (which can dodge
   * from now on). `flightS`: how long it takes to get there. `onDone` hears
   * whether it was dodged once it has passed or hit.
   */
  chargeFireball(flightS: number, onDone: (dodged: boolean) => void) {
    const charge = this.calm ? 0.6 : 0.95;
    const spot = this.shipSpot(this.w, this.h);
    this.fireball = { chargeAt: this.t, launchAt: this.t + charge, landAt: this.t + charge + flightS, target: { x: spot.x, y: spot.y }, dodged: 0, done: false, onDone };
    this.setMood('rage', charge + 0.2);
  }

  /** the pilot dodges (left -1, right 1); true if there was something to dodge */
  dodgeFireball(dir: -1 | 1): boolean {
    const f = this.fireball;
    if (!f || f.done || f.dodged) return false;
    f.dodged = dir;
    // (out of the way till it's gone past)
    this.dodge = { at: this.t, dir, until: Math.max(this.t + 0.6, f.landAt + 0.3) };
    return true;
  }

  /** the 15th bolt has landed: the shell shatters and the sun is cured; `onAdmiral` once it's done lighting up */
  cure(onAdmiral: () => void) {
    this.stage = 'cured';
    this.curedAt = this.t;
    this.mood = 'stunned';
    this.shake = 1;
    this.moodUntil = Infinity;
    this.fireball = null;
    this.after(this.calm ? 0 : CURE.shatter, () => {
      this.shatterShell(48, '#fff1c9', 2);
      for (let i = 0; i < 3; i++) this.rings.push({ born: this.t + i * 0.18, life: 1.6, r0: 1, r1: 6 + i * 2, color: i === 1 ? '#ffd77a' : '#ffffff', width: 0.1 });
      this.flash = this.calm ? 0.4 : 1;
      this.shake = 1.4;
      // everything it swallowed bursts back out
      const back = this.eaten.length >= 18 ? this.eaten : [...this.eaten, ...Array.from({ length: 18 - this.eaten.length }, () => numberText(this.mission))];
      this.burstNumbers = back.slice(-48).map((text) => ({
        text,
        color: NUMBER_COLORS[Math.floor(Math.random() * NUMBER_COLORS.length)],
        a: rand(0, TAU),
        v: rand(1.6, 4.2),
        spin: rand(-3, 3),
        size: rand(0.28, 0.5),
      }));
      this.spirals = [];
      this.makePlanets();
      this.moveCamera(2, CURE.zoom[1] - CURE.zoom[0]);
    });
    this.after(CURE.admiral, () => {
      this.nextFirework = this.t;
      onAdmiral();
    });
  }

  private makePlanets() {
    const kinds = [
      { orbit: 1.75, size: 0.2, ocean: '#3fa7ff', land: '#5fd068', ring: false, moon: true },
      { orbit: 2.15, size: 0.27, ocean: '#36c2d9', land: '#9be15d', ring: true, moon: false },
      { orbit: 2.55, size: 0.17, ocean: '#5b8cff', land: '#ffd166', ring: false, moon: false },
    ];
    this.planets = kinds.map((k, i) => ({
      ...k,
      angle: rand(0, TAU),
      speed: 0.32 - i * 0.07,
      blobs: Array.from({ length: 4 }, () => ({ x: rand(-0.6, 0.6), y: rand(-0.6, 0.6), rx: rand(0.25, 0.5), ry: rand(0.15, 0.35), a: rand(0, Math.PI) })),
      bloomAt: this.curedAt + CURE.blooms[i],
    }));
  }

  /** the pilot is a Space Admiral now: their ship takes on the admiral's livery, in a flash of gold */
  promote() {
    this.shipSvg = rearShipSvg(undefined, true, this.shipId);
    sprite(this.shipSvg, 384, 384, this.canopy);
    this.promotedAt = this.t;
  }

  /** when each little world blooms (seconds from now), for its sound */
  bloomTimes(): number[] {
    return CURE.blooms.map((b) => Math.max(0, this.curedAt + b - this.t));
  }

  // ---------- the simulation ----------

  private simulate(dt: number) {
    const t = this.t;
    this.shake *= Math.exp(-dt * 4);
    this.diskFlash *= Math.exp(-dt * 3);
    this.flash *= Math.exp(-dt * 2.4);
    if (this.mood !== 'angry' && t > this.moodUntil) this.mood = 'angry';
    // it turns into a black hole as the fight starts, and back as it's cured
    const holeGoal = this.stage === 'fight' ? 1 : 0;
    const holeRate = this.stage === 'cured' ? 3 : 0.55;
    this.hole += Math.sign(holeGoal - this.hole) * Math.min(Math.abs(holeGoal - this.hole), dt * holeRate);

    // the disk spins, faster nearer the hole (the near side coming towards us, on the left)
    const spin = this.calm ? 0 : 1;
    const whirl = spin * (this.stage === 'cured' ? 3 : 1) * (1 + 0.5 * Math.min(1, this.run / 10));
    this.armTurn -= dt * 0.55 * whirl;
    for (const p of this.particles) {
      p.theta -= ((dt * 1.9) / p.rho ** 1.5) * whirl;
      p.rho -= dt * 0.16 * whirl * (1 + 1.2 / (p.rho * p.rho));
      if (p.rho < DISK_IN) Object.assign(p, newParticle(DISK_OUT - Math.random() * 0.2, this.armTurn));
    }

    // numbers drift in from all round, more and more as the run goes on
    if (this.stage === 'fight' && !this.calm && t >= this.nextSpiral && this.spirals.length < 14) {
      this.spirals.push({
        text: numberText(this.mission),
        color: NUMBER_COLORS[Math.floor(Math.random() * NUMBER_COLORS.length)],
        rho: rand(3.4, 4.4),
        theta: rand(0, TAU),
        size: rand(0.26, 0.36),
        born: t,
        loud: false,
        red: false,
      });
      this.nextSpiral = t + rand(0.7, 1.3) * (1 - 0.35 * Math.min(1, this.run / 10));
    }
    const kept: Spiral[] = [];
    for (const n of this.spirals) {
      if (n.fall) {
        const k = clamp01((t - n.fall.at) / n.fall.dur);
        const e = k * k * (3 - 2 * k);
        n.rho = n.fall.rho0 * Math.pow(0.95 / n.fall.rho0, e);
        n.theta = n.fall.theta0 + n.fall.turn * e;
      } else {
        // falling in, faster and faster, and round faster the nearer it gets
        n.rho -= dt * 0.2 * (1 + 2.4 / (n.rho * n.rho));
        n.theta -= (dt * 1.7) / n.rho ** 1.5;
      }
      const p = BlackSunScene.project(n.rho, n.theta, FALL_FLAT);
      if (Math.hypot(p.x, p.y) <= SWALLOW_AT || n.rho < 0.9) {
        // touched the dark: swallowed, in a little star blast on its rim
        const d = Math.hypot(p.x, p.y) || 1;
        this.blasts.push(blast((p.x / d) * 1.02, (p.y / d) * 1.02, t, n.loud ? 0.75 : 0.5, n.loud ? 0.75 : 0.5, n.red ? '#ff6b8a' : '#fff1c9', n.loud ? 12 : 7));
        this.diskFlash = Math.max(this.diskFlash, n.loud ? 0.8 : 0.35);
        this.eaten.push(n.text);
        this.onSwallow?.(n.loud);
        continue;
      }
      kept.push(n);
    }
    this.spirals = kept;

    this.blasts = this.blasts.filter((b) => t < b.born + b.life);
    this.bolts = this.bolts.filter((b) => t < b.hitAt + 0.35);
    this.rings = this.rings.filter((r) => t < r.born + r.life);
    for (const s of this.shards) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vx *= Math.exp(-dt * 0.8);
      s.vy *= Math.exp(-dt * 0.8);
      s.rot += s.spin * dt;
    }
    this.shards = this.shards.filter((s) => t < s.born + s.life);
    for (const e of this.embers) {
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      e.vx *= Math.exp(-dt * 1.5);
      e.vy *= Math.exp(-dt * 1.5);
    }
    this.embers = this.embers.filter((e) => t < e.born + e.life);

    this.stepFireball();

    // the mouth opens to gloat or to spit fire, and stays shut otherwise
    const jawGoal = this.mood === 'gloat' ? 0.65 : this.mood === 'rage' && this.fireball ? 1 : this.mood === 'stunned' ? 0.4 : 0;
    this.jaw += (jawGoal - this.jaw) * Math.min(1, dt * 10);

    if (this.stage === 'cured') this.stepCure(dt);
  }

  /** someone listening for swallows (the overlay plays their sound) */
  onSwallow?: (loud: boolean) => void;

  private stepFireball() {
    const f = this.fireball;
    if (!f) return;
    const t = this.t;
    if (t >= f.launchAt && !f.done) {
      // embers stream off it as it flies
      const pos = this.fireballPos(f);
      if (pos && !this.calm) {
        for (let i = 0; i < 3; i++) {
          this.embers.push({
            x: pos.x + rand(-1, 1) * pos.size * 0.3,
            y: pos.y + rand(-1, 1) * pos.size * 0.3,
            vx: rand(-40, 40),
            vy: rand(-90, -20),
            born: t,
            life: rand(0.3, 0.7),
            color: Math.random() < 0.5 ? '#ffb347' : '#ff5a3c',
            size: pos.size * rand(0.15, 0.35),
          });
        }
      }
    }
    if (!f.done && t >= f.landAt) {
      f.done = true;
      if (f.dodged) {
        // it roars past where the ship was, and on off the screen
        f.onDone(true);
      } else {
        this.hitAt = t;
        this.hitSpin = Math.random() < 0.5 ? -1 : 1;
        this.shake = 1.2;
        this.boom(f.target, '#ffb347', 34);
        f.onDone(false);
      }
    }
    // gone: once a dodged one is off the screen, or a hit one has burst
    if (f.done && (!f.dodged || t > f.landAt + 0.9)) this.fireball = null;
  }

  /** an explosion at a point on screen (the ship hit) */
  private boom(at: Point, color: string, n: number) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU);
      const v = rand(60, 320);
      this.embers.push({ x: at.x, y: at.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, born: this.t, life: rand(0.4, 1), color: i % 3 ? color : '#fff1c9', size: rand(6, 16) });
    }
  }

  /** where the fireball is now and how big (null while it's still in the mouth) */
  private fireballPos(f: Fireball): (Point & { size: number }) | null {
    const t = this.t;
    if (t < f.launchAt) return null;
    const s = this.sun(this.w, this.h);
    const mouth = { x: s.x, y: s.y + s.r * 0.55 };
    // it comes at you: slow at first, then rushing, growing as it nears
    const k = (t - f.launchAt) / (f.landAt - f.launchAt);
    const e = k < 1 ? k * k * (1.6 - 0.6 * k) : k;
    const shipW = s.r * SHIP_W;
    const x = lerp(mouth.x, f.target.x, e);
    const y = lerp(mouth.y, f.target.y, e);
    const size = lerp(s.r * 0.3, shipW * 0.9, Math.min(e, 1.8));
    return { x, y, size };
  }

  private stepCure(dt: number) {
    const t = this.t;
    for (const p of this.planets) p.angle -= dt * p.speed;
    // hearts and sparkles float up off it
    const kc = t - this.curedAt;
    if (kc > CURE.face && t >= this.nextFloater && this.floaters.length < 40 && !this.calm) {
      const s = this.sun(this.w, this.h);
      const a = rand(0, TAU);
      this.floaters.push({
        x: s.x + Math.cos(a) * s.r * rand(0.9, 1.6),
        y: s.y + Math.sin(a) * s.r * rand(0.6, 1.2),
        vy: rand(-55, -25),
        sway: rand(0, TAU),
        born: t,
        life: rand(2.2, 3.6),
        size: s.r * rand(0.1, 0.2),
        color: ['#ff7aa8', '#ffd36b', '#ff9de2', '#ff5c8a', '#fff1c9'][Math.floor(Math.random() * 5)],
        heart: Math.random() < 0.6,
      });
      this.nextFloater = t + rand(0.12, 0.3);
    }
    for (const f of this.floaters) f.y += f.vy * dt;
    this.floaters = this.floaters.filter((f) => t < f.born + f.life);
    // fireworks for the admiral
    if (t >= this.nextFirework && !this.calm) {
      const fx = rand(0.1, 0.9) * this.w;
      const fy = rand(0.08, 0.55) * this.h;
      this.fireworks.push({
        x: fx,
        y: fy,
        born: t,
        color: ['#ffd77a', '#6ad7ff', '#ff6ad5', '#7ee08f', '#ff9d76', '#c9a4de'][Math.floor(Math.random() * 6)],
        sparks: Array.from({ length: 36 }, (_, i) => ({ a: (i / 36) * TAU + rand(-0.05, 0.05), v: rand(0.75, 1) })),
      });
      this.nextFirework = t + (t - this.curedAt < CURE.admiral + 5 ? rand(0.35, 0.6) : rand(1.1, 2));
    }
    this.fireworks = this.fireworks.filter((f) => t < f.born + 1.6);
  }

  // ---------- drawing ----------

  /** draws everything; `look` is where the eyes look (by default, the ship) */
  override draw(ctx: CanvasRenderingContext2D, w: number, h: number, _t?: number, look?: Point | null) {
    this.w = w;
    this.h = h;
    const t = this.t;
    const s = this.sun(w, h);
    const R = s.r;
    const ship = this.ship(w, h);
    const eyesOn = look === undefined ? { x: ship.x, y: ship.y } : look;
    const kc = t - this.curedAt;
    /** how cured it is: 0 a black hole (or the eclipse), 1 a happy sun */
    const joy = this.stage === 'cured' ? easeOut(clamp01((kc - CURE.shatter) / 1.1)) : 0;

    // a warm glow floods space as it lights up
    if (joy > 0) {
      const g = ctx.createRadialGradient(s.x, s.y, R, s.x, s.y, Math.max(w, h));
      g.addColorStop(0, `rgba(255, 196, 120, ${0.35 * joy})`);
      g.addColorStop(0.4, `rgba(255, 120, 170, ${0.14 * joy})`);
      g.addColorStop(1, 'rgba(60, 20, 90, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      this.drawRainbow(ctx, s, R, kc);
    }
    this.drawPlanets(ctx, s, R, t, 'back');

    // the corona, as Monster Sun's eclipse, sucked round into a swirl once it's a black hole, and warm gold once it's cured
    const intro = this.calm ? 1 : easeOut(clamp01((t - 0.2) / 1.2));
    const flare = this.calm ? 0 : 0.45 * Math.exp(-(((t - 1.15) / 0.25) ** 2));
    let b = intro * (0.8 + 0.06 * Math.sin(t * 0.9)) + flare;
    b *= 1 - 0.3 * this.hole;
    b += 0.25 * this.diskFlash * this.hole + joy * 0.35;
    const m = 0.5 + 0.5 * Math.sin(t * 0.35);
    const pal = GOLD.map((g, i) => mix(mix(mix(g, PINK[i], m), DARK[i], this.hole * 0.75), HAPPY[i], joy));
    const spin = this.calm ? 0 : t * (0.04 + this.hole * 0.18);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    this.drawCorona(ctx, s, R, t, b, intro, pal, spin, this.calm ? 0 : this.hole * 0.9);
    this.drawFlares(ctx, s, R, t, pal[0], pal[1]);
    ctx.restore();
    if (joy > 0) this.drawRays(ctx, s, R, t, kc);

    // the black hole: the disk's far side, the numbers behind, the ring of bent light round the dark
    if (this.hole > 0.01) {
      this.drawDisk(ctx, s, R, t);
      this.drawSpirals(ctx, s, R, t, 'back');
      this.drawLensing(ctx, s, R, t);
    }

    this.drawDisc(ctx, s, R, t, b);
    this.drawCracks(ctx, s, R, t);
    if (joy > 0) this.drawGold(ctx, s, R, t, kc, joy);
    // (the dark face fades with the dark, as the gold comes through)
    ctx.save();
    ctx.globalAlpha = kc < CURE.face - 0.35 ? 1 - joy : 1;
    this.drawFace(ctx, s, R, t, eyesOn, kc);
    ctx.restore();
    if (!this.calm && this.stage === 'arrive') this.drawDiamond(ctx, w, s, R, t);

    if (this.hole > 0.01) this.drawSpirals(ctx, s, R, t, 'front');

    this.drawShards(ctx, s, R, t);
    this.drawRings(ctx, s, R, t);
    this.drawFireball(ctx, t, 'behind');
    this.drawBolts(ctx, s, R, t, ship);
    this.drawShip(ctx, ship);
    this.drawFireball(ctx, t, 'front');
    this.drawBlasts(ctx, s, R, t);
    this.drawEmbers(ctx);
    this.drawPlanets(ctx, s, R, t, 'front');
    if (this.stage === 'cured') {
      this.drawBurstNumbers(ctx, s, R, kc);
      this.drawFloaters(ctx, t);
      this.drawFireworks(ctx, t);
    }
    this.drawHeat(ctx, w, h);
    if (this.flash > 0.01) {
      ctx.fillStyle = `rgba(255, 250, 235, ${Math.min(1, this.flash)})`;
      ctx.fillRect(0, 0, w, h);
    }
  }

  // ---- the black hole ----

  private diskAlpha(t: number): number {
    const k = clamp01((t - this.awakeAt) / 1.6);
    return this.hole * (this.awakeAt === Infinity ? 1 : easeOut(k));
  }

  /** where a point of the whirlpool (distance in sun radii, angle in its plane) is on screen, from the sun's middle */
  private static flat(rho: number, theta: number, R: number): Point {
    const x = rho * Math.cos(theta) * R;
    const y = rho * Math.sin(theta) * R * DISK_FLAT;
    return { x: x * Math.cos(TILT) - y * Math.sin(TILT), y: x * Math.sin(TILT) + y * Math.cos(TILT) };
  }

  /**
   * The whirlpool of hot matter round the hole, behind it: a glowing band,
   * spiral arms winding in and turning, and streaks of matter streaming round
   * and in along them (brighter on the left, where it comes towards us).
   */
  private drawDisk(ctx: CanvasRenderingContext2D, s: Point, R: number, t: number) {
    const alpha = this.diskAlpha(t);
    if (alpha <= 0.01) return;
    const glowUp = 1 + this.diskFlash * 0.6;
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.globalCompositeOperation = 'lighter';
    // the band, in its plane (squashed into an ellipse)
    ctx.save();
    ctx.rotate(TILT);
    ctx.scale(1, DISK_FLAT);
    const g = ctx.createRadialGradient(0, 0, R * DISK_IN * 0.9, 0, 0, R * DISK_OUT);
    g.addColorStop(0, rgba(DISK_COLORS[0], 0.9 * alpha * glowUp));
    g.addColorStop(0.12, rgba(DISK_COLORS[1], 0.55 * alpha * glowUp));
    g.addColorStop(0.35, rgba(DISK_COLORS[2], 0.28 * alpha * glowUp));
    g.addColorStop(0.65, rgba(DISK_COLORS[3], 0.12 * alpha));
    g.addColorStop(1, rgba(DISK_COLORS[4], 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, R * DISK_OUT, 0, TAU);
    ctx.fill();
    // the side coming towards us burns brighter
    const side = ctx.createLinearGradient(-R * DISK_OUT, 0, R * DISK_OUT, 0);
    side.addColorStop(0, `rgba(255, 244, 220, ${0.22 * alpha})`);
    side.addColorStop(0.5, 'rgba(255, 244, 220, 0)');
    ctx.fillStyle = side;
    ctx.fill();
    ctx.restore();

    // the spiral arms: glowing ribbons winding in to the hole
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let a = 0; a < ARMS; a++) {
      const base = this.armTurn + (a / ARMS) * TAU;
      for (const [width, color, op] of [
        [0.34, DISK_COLORS[3], 0.16],
        [0.14, DISK_COLORS[1], 0.3],
        [0.045, DISK_COLORS[0], 0.55],
      ] as Array<[number, string, number]>) {
        ctx.strokeStyle = rgba(color, op * alpha * glowUp);
        ctx.lineWidth = Math.max(1, R * width);
        ctx.beginPath();
        for (let i = 0; i <= 24; i++) {
          const k = i / 24;
          const rho = DISK_OUT - k * (DISK_OUT - DISK_IN);
          const p = BlackSunScene.flat(rho, base + ARM_WIND * Math.log(DISK_OUT / rho), R);
          if (i === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
      }
    }

    // streaks of matter, each a short stretch of the way it's going (round and in)
    for (const p of this.particles) {
      const near = clamp01((p.rho - DISK_IN) / (DISK_OUT - DISK_IN));
      const color = DISK_COLORS[Math.min(DISK_COLORS.length - 1, Math.floor(near * 4.5))];
      const doppler = 1 + 0.55 * -Math.cos(p.theta);
      const fadeIn = clamp01((DISK_OUT - p.rho) / 0.35);
      const a = alpha * fadeIn * (0.3 + 0.6 * (1 - near)) * doppler * (0.75 + 0.25 * Math.sin(t * 3 + p.phase));
      ctx.strokeStyle = rgba(color, Math.min(1, a));
      ctx.lineWidth = Math.max(0.7, p.width * (R / 80) * (1 - near * 0.4));
      ctx.beginPath();
      for (let i = 0; i <= 3; i++) {
        const back = (p.span * i) / 3;
        const q = BlackSunScene.flat(p.rho * (1 + back * 0.35), p.theta + back, R);
        if (i === 0) ctx.moveTo(q.x, q.y);
        else ctx.lineTo(q.x, q.y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  /** the rim of the dark: a ring of light bent round it, and a hairline hugging it */
  private drawLensing(ctx: CanvasRenderingContext2D, s: Point, R: number, t: number) {
    const alpha = this.diskAlpha(t);
    if (alpha <= 0.01) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const pulse = 1 + this.diskFlash * 0.6;
    const ring = ctx.createRadialGradient(s.x, s.y, R, s.x, s.y, R * 1.32);
    ring.addColorStop(0, rgba(DISK_COLORS[0], 0.75 * alpha * pulse));
    ring.addColorStop(0.3, rgba(DISK_COLORS[1], 0.35 * alpha * pulse));
    ring.addColorStop(1, rgba(DISK_COLORS[2], 0));
    ctx.fillStyle = ring;
    ctx.beginPath();
    ctx.arc(s.x, s.y, R * 1.32, 0, TAU);
    ctx.arc(s.x, s.y, R * 0.99, 0, TAU, true);
    ctx.fill();
    ctx.strokeStyle = `rgba(255, 246, 225, ${0.7 * alpha})`;
    ctx.lineWidth = Math.max(1, R * 0.016);
    ctx.beginPath();
    ctx.arc(s.x, s.y, R * 1.025, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  /** the numbers falling in: those behind the hole's middle, or in front */
  private drawSpirals(ctx: CanvasRenderingContext2D, s: Point, R: number, t: number, half: 'back' | 'front') {
    for (const n of this.spirals) {
      const behind = Math.sin(n.theta) < 0;
      if ((half === 'back') !== behind) continue;
      const p = BlackSunScene.project(n.rho, n.theta, FALL_FLAT);
      const dist = Math.hypot(p.x, p.y);
      // stretched thin along its way round as it nears the dark, and fading
      const near = clamp01((1.75 - dist) / 0.72);
      const stretch = 1 + near * near * 2.4;
      const squash = 1 / Math.pow(stretch, 0.75);
      const ahead = BlackSunScene.project(n.rho * 0.995, n.theta - 0.04, FALL_FLAT);
      const dir = Math.atan2(ahead.y - p.y, ahead.x - p.x);
      const depth = 1 + 0.16 * Math.sin(n.theta);
      const fade = Math.min(1, (t - n.born) / 1.1) * (1 - near * 0.45) * (behind ? 0.8 : 1);
      if (fade <= 0.01) continue;
      const color = n.red && n.fall ? lerpColor(n.color, '#ff4f6d', clamp01((t - n.fall.at) / (n.fall.dur * 0.6))) : n.color;
      const hgt = n.size * R * depth;
      ctx.save();
      ctx.translate(s.x + p.x * R, s.y + p.y * R);
      // upright while it's far, turning along its path as it's pulled thin
      ctx.rotate(dir * near * 0.85);
      ctx.scale(stretch, squash);
      ctx.globalAlpha = fade;
      if (n.red && n.fall) {
        ctx.globalCompositeOperation = 'lighter';
        const r = hgt * 2.2;
        ctx.drawImage(glow(color), -r / 2, -r / 2, r, r);
        ctx.globalCompositeOperation = 'source-over';
      }
      stamp(ctx, numberSprite(n.text, n.red ? '#ffffff' : color), 0, 0, hgt);
      ctx.restore();
    }
  }

  /** the cracks of light across the dark shell, one more with every bolt; they seal back up when it heals */
  private drawCracks(ctx: CanvasRenderingContext2D, s: Point, R: number, t: number) {
    const any = this.crackAt.some((a) => a !== Infinity);
    if (!any) return;
    const kc = t - this.curedAt;
    // blazing as it's about to shatter, then gone with the shell
    const blaze = this.stage === 'cured' ? 1 + 2 * Math.abs(Math.sin(this.t * 25)) : 1;
    const gone = this.stage === 'cured' && kc > CURE.shatter + 0.05;
    if (gone) return;
    ctx.save();
    ctx.beginPath();
    ctx.arc(s.x, s.y, R * 0.995, 0, TAU);
    ctx.clip();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const heat = 0.85 + 0.15 * Math.sin(t * 6);
    this.cracks.forEach((pts, i) => {
      const at = this.crackAt[i];
      if (at === Infinity) return;
      const grow = easeOut(clamp01((t - at) / 0.35));
      const seal = this.sealAt[i] === Infinity ? 1 : 1 - clamp01((t - this.sealAt[i]) / 0.45);
      if (seal <= 0) return;
      const n = Math.max(2, Math.ceil(pts.length * grow));
      for (const [width, a, color] of [
        [0.07, 0.22, '#ff9d4a'],
        [0.028, 0.6, '#ffd77a'],
        [0.009, 1, '#fffbe8'],
      ] as Array<[number, number, string]>) {
        ctx.strokeStyle = rgba(color, Math.min(1, a * seal * heat * blaze));
        ctx.lineWidth = Math.max(0.8, R * width * (blaze > 1 ? 1.5 : 1));
        ctx.beginPath();
        for (let j = 0; j < n; j++) {
          const p = pts[j];
          const x = s.x + p.x * R;
          const y = s.y + p.y * R;
          if (j === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    });
    ctx.restore();
  }

  // ---- the face ----

  private drawFace(ctx: CanvasRenderingContext2D, s: Point, R: number, t: number, look: Point | null, kc: number) {
    if (this.stage === 'cured' && kc > CURE.face - 0.35) {
      this.drawHappyFace(ctx, s, R, kc);
      return;
    }
    const mood = this.stage === 'arrive' ? 'angry' : this.mood;
    if (mood === 'angry' || mood === 'rage') {
      if (mood === 'rage') {
        // seeing red: the eyes blaze
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const r = R * 1.2;
        for (const side of [-1, 1]) {
          ctx.globalAlpha = 0.55 + 0.25 * Math.sin(this.t * 30);
          ctx.drawImage(glow('#ff3b2f'), s.x + side * R * 0.34 - r / 2, s.y - R * 0.04 - r / 2, r, r);
        }
        ctx.restore();
      }
      this.drawEyes(ctx, s, R, t, look);
    } else {
      this.drawMoodEyes(ctx, s, R, mood);
    }
    if (this.stage !== 'arrive') this.drawMouth(ctx, s, R, t);
  }

  /** eyes squeezed shut (> <), narrowed in glee, or wide with shock */
  private drawMoodEyes(ctx: CanvasRenderingContext2D, s: Point, R: number, mood: Mood) {
    ctx.save();
    const alpha = ctx.globalAlpha;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const side of [-1, 1]) {
      const ex = s.x + side * R * 0.34;
      const ey = s.y - R * 0.04;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.6 * alpha;
      const halo = R * 0.7;
      ctx.drawImage(glow('#ff3b5c'), ex - halo / 2, ey - halo / 2, halo, halo);
      ctx.globalAlpha = alpha;
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = '#ffb04a';
      ctx.fillStyle = '#ffe2b0';
      ctx.lineWidth = R * 0.055;
      ctx.beginPath();
      if (mood === 'wince') {
        // > <
        ctx.moveTo(ex - side * R * 0.13, ey - R * 0.09);
        ctx.lineTo(ex + side * R * 0.05, ey);
        ctx.lineTo(ex - side * R * 0.13, ey + R * 0.09);
        ctx.stroke();
      } else if (mood === 'gloat') {
        // narrowed, curving up in nasty glee
        ctx.moveTo(ex - R * 0.15, ey + R * 0.03);
        ctx.quadraticCurveTo(ex, ey - R * 0.12, ex + R * 0.15, ey + R * 0.03);
        ctx.stroke();
      } else {
        // stunned: wide open, tiny pupils
        ctx.ellipse(ex, ey, R * 0.15, R * 0.15, 0, 0, TAU);
        ctx.fill();
        ctx.beginPath();
        ctx.fillStyle = '#2b0b14';
        ctx.arc(ex, ey, R * 0.035, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  /** a jagged grin glowing in the dark: a thin line when it's quiet, a toothy maw when it laughs, a furnace when it spits fire */
  private drawMouth(ctx: CanvasRenderingContext2D, s: Point, R: number, t: number) {
    const jaw = this.jaw;
    const cx = s.x;
    const cy = s.y + R * 0.52;
    const half = R * (0.3 + jaw * 0.06);
    const open = R * 0.22 * jaw;
    const teeth = 6;
    ctx.save();
    ctx.lineJoin = 'round';
    // the inside: a red glow (white-hot as a fireball forms)
    if (jaw > 0.05) {
      const f = this.fireball;
      const charging = f && t < f.launchAt ? clamp01((t - f.chargeAt) / (f.launchAt - f.chargeAt)) : 0;
      ctx.beginPath();
      ctx.moveTo(cx - half, cy);
      ctx.quadraticCurveTo(cx, cy - open * 0.5, cx + half, cy);
      ctx.quadraticCurveTo(cx, cy + open * 1.6, cx - half, cy);
      ctx.closePath();
      const g = ctx.createRadialGradient(cx, cy + open * 0.3, 0, cx, cy + open * 0.3, half);
      g.addColorStop(0, charging > 0 ? '#fff1c9' : '#ff5a3c');
      g.addColorStop(0.5, charging > 0 ? '#ff9d4a' : '#9b1030');
      g.addColorStop(1, '#3a0614');
      ctx.fillStyle = g;
      ctx.fill();
      // teeth, top and bottom
      ctx.fillStyle = '#ffe9d6';
      for (const top of [true, false]) {
        ctx.beginPath();
        for (let i = 0; i < teeth; i++) {
          const x0 = cx - half * 0.8 + ((half * 1.6) / teeth) * i;
          const x1 = x0 + (half * 1.6) / teeth;
          const yb = top ? cy - open * 0.18 + Math.abs((x0 + x1) / 2 - cx) * 0.12 : cy + open * 0.95 - Math.abs((x0 + x1) / 2 - cx) * 0.5;
          const tip = top ? R * 0.07 * jaw : -R * 0.06 * jaw;
          ctx.moveTo(x0, yb);
          ctx.lineTo((x0 + x1) / 2, yb + tip);
          ctx.lineTo(x1, yb);
        }
        ctx.fill();
      }
      if (charging > 0) this.drawFlameBall(ctx, cx, cy + open * 0.35, R * 0.32 * easeOut(charging), t);
    }
    // the grin's outline, glowing
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = `rgba(255, 70, 90, ${0.55 + 0.25 * jaw})`;
    ctx.lineWidth = Math.max(1, R * 0.03);
    ctx.beginPath();
    ctx.moveTo(cx - half, cy - R * 0.05);
    for (let i = 1; i <= 8; i++) {
      const x = cx - half + ((half * 2) / 8) * i;
      const y = cy + (i % 2 ? R * 0.035 : -R * 0.01) + Math.sin((i / 8) * Math.PI) * R * 0.06 - (i === 8 ? R * 0.05 : 0);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  /** the cured sun's face: happy closed eyes, rosy cheeks, a big smile drawing itself in */
  private drawHappyFace(ctx: CanvasRenderingContext2D, s: Point, R: number, kc: number) {
    const k = easeOut(clamp01((kc - (CURE.face - 0.35)) / 0.9));
    if (k <= 0) return;
    ctx.save();
    ctx.globalAlpha = k;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#6b2f0e';
    ctx.lineWidth = R * 0.07;
    // eyes: happy arcs, with a twinkle
    for (const side of [-1, 1]) {
      const ex = s.x + side * R * 0.33;
      const ey = s.y - R * 0.08;
      ctx.beginPath();
      ctx.arc(ex, ey + R * 0.06, R * 0.13, Math.PI * 1.12, Math.PI * 1.88);
      ctx.stroke();
    }
    // cheeks
    ctx.fillStyle = 'rgba(255, 120, 150, 0.5)';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(s.x + side * R * 0.55, s.y + R * 0.2, R * 0.15, R * 0.09, 0, 0, TAU);
      ctx.fill();
    }
    // the smile, opening as it draws in
    const sm = easeOut(clamp01((kc - CURE.face) / 0.8));
    if (sm > 0) {
      const half = R * 0.36;
      const top = s.y + R * 0.2;
      const depth = R * 0.42 * sm;
      const grin = () => {
        ctx.beginPath();
        ctx.moveTo(s.x - half, top);
        ctx.quadraticCurveTo(s.x, top + depth * 2, s.x + half, top);
        ctx.quadraticCurveTo(s.x, top + depth * 0.35, s.x - half, top);
        ctx.closePath();
      };
      grin();
      ctx.fillStyle = '#b4380a';
      ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.fillStyle = '#ff6f7d';
      ctx.beginPath();
      ctx.ellipse(s.x, top + depth * 1.05, half * 0.42, depth * 0.32, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
      grin();
      ctx.lineWidth = R * 0.045;
      ctx.lineJoin = 'round';
      ctx.stroke();
    }
    ctx.restore();
  }

  // ---- the cure ----

  /** the golden core showing through as the dark shell is gone: a dawn spreading out from the middle */
  private drawGold(ctx: CanvasRenderingContext2D, s: Point, R: number, t: number, kc: number, joy: number) {
    const reveal = easeOut(clamp01((kc - CURE.shatter) / 0.9));
    const r = R * reveal;
    if (r <= 1) return;
    ctx.save();
    const g = ctx.createRadialGradient(s.x - R * 0.25, s.y - R * 0.3, 0, s.x, s.y, R);
    g.addColorStop(0, '#fffdf0');
    g.addColorStop(0.45, '#ffe680');
    g.addColorStop(0.85, '#ffbe3d');
    g.addColorStop(1, '#ff9a2e');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(s.x, s.y, Math.min(r, R * 1.01), 0, TAU);
    ctx.fill();
    // ripples of warm light washing out over it
    ctx.clip();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) {
      const k = ((t * 0.5 + i / 3) % 1 + 1) % 1;
      ctx.strokeStyle = `rgba(255, 255, 230, ${0.22 * (1 - k) * joy})`;
      ctx.lineWidth = R * 0.08;
      ctx.beginPath();
      ctx.arc(s.x, s.y, R * k, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
    // the dawn's bright edge as it spreads
    if (reveal < 1) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(255, 255, 240, ${0.9 * (1 - reveal)})`;
      ctx.lineWidth = R * 0.08;
      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
  }

  /** a cartoon sun's rays, growing out round it and slowly turning */
  private drawRays(ctx: CanvasRenderingContext2D, s: Point, R: number, t: number, kc: number) {
    const k = easeOut(clamp01((kc - CURE.rays[0]) / (CURE.rays[1] - CURE.rays[0])));
    if (k <= 0) return;
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(this.calm ? 0 : t * 0.15);
    const n = 14;
    const g = ctx.createRadialGradient(0, 0, R, 0, 0, R * 1.8);
    g.addColorStop(0, '#ffe680');
    g.addColorStop(1, '#ffb347');
    ctx.fillStyle = g;
    ctx.strokeStyle = 'rgba(214, 120, 20, 0.8)';
    ctx.lineWidth = Math.max(1, R * 0.025);
    ctx.lineJoin = 'round';
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      const len = R * (1.08 + (i % 2 ? 0.32 : 0.55) * k * (1 + 0.06 * Math.sin(t * 2 + i)));
      const wa = 0.11;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a - wa) * R * 1.02, Math.sin(a - wa) * R * 1.02);
      ctx.quadraticCurveTo(Math.cos(a) * len * 1.04, Math.sin(a) * len * 1.04, Math.cos(a + wa) * R * 1.02, Math.sin(a + wa) * R * 1.02);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  /** a rainbow arcing over it */
  private drawRainbow(ctx: CanvasRenderingContext2D, s: Point, R: number, kc: number) {
    const k = easeInOut(clamp01((kc - CURE.rainbow[0]) / (CURE.rainbow[1] - CURE.rainbow[0])));
    if (k <= 0) return;
    const bands = ['#ff5c5c', '#ff9d4a', '#ffd84a', '#7ee08f', '#6ad7ff', '#7b8cff', '#c27bff'];
    ctx.save();
    ctx.lineCap = 'round';
    bands.forEach((c, i) => {
      ctx.strokeStyle = rgba(c, 0.32);
      ctx.lineWidth = R * 0.085;
      ctx.beginPath();
      ctx.arc(s.x, s.y + R * 0.35, R * (2.55 - i * 0.085), Math.PI, Math.PI + Math.PI * k);
      ctx.stroke();
    });
    ctx.restore();
  }

  /** the little dead worlds round it, blooming blue and green once it shines on them */
  private drawPlanets(ctx: CanvasRenderingContext2D, s: Point, R: number, t: number, half: 'back' | 'front') {
    for (const p of this.planets) {
      const behind = Math.sin(p.angle) < 0;
      if ((half === 'back') !== behind) continue;
      const at = BlackSunScene.project(p.orbit, p.angle, FALL_FLAT);
      const x = s.x + at.x * R;
      const y = s.y + at.y * R;
      const r = p.size * R * (1 + 0.15 * Math.sin(p.angle));
      const appear = clamp01((t - this.curedAt - CURE.shatter - 0.3) / 0.6);
      if (appear <= 0) continue;
      const bloom = easeOut(clamp01((t - p.bloomAt) / 0.8));
      ctx.save();
      ctx.globalAlpha = appear;
      // a halo of air once it's alive
      if (bloom > 0) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = appear * bloom * 0.6;
        ctx.drawImage(glow('#9fe3ff'), x - r * 1.6, y - r * 1.6, r * 3.2, r * 3.2);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = appear;
      }
      if (p.ring) this.planetRing(ctx, x, y, r, bloom, 'back');
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fillStyle = lerpColor('#4b4458', p.ocean, bloom);
      ctx.fill();
      ctx.save();
      ctx.clip();
      for (const b of p.blobs) {
        ctx.fillStyle = lerpColor('#3a3446', p.land, bloom);
        ctx.beginPath();
        ctx.ellipse(x + (b.x + Math.sin(t * 0.3) * 0.1) * r, y + b.y * r, b.rx * r, b.ry * r, b.a, 0, TAU);
        ctx.fill();
      }
      if (bloom > 0) {
        ctx.fillStyle = `rgba(255, 255, 255, ${0.65 * bloom})`;
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.ellipse(x + ((((t * 0.2 + i * 0.37) % 1) * 2.4 - 1.2) * r), y + (i - 1) * r * 0.45, r * 0.32, r * 0.08, 0, 0, TAU);
          ctx.fill();
        }
      }
      // night side, away from the sun
      const away = Math.atan2(y - s.y, x - s.x);
      const sh = ctx.createLinearGradient(x - Math.cos(away) * r, y - Math.sin(away) * r, x + Math.cos(away) * r, y + Math.sin(away) * r);
      sh.addColorStop(0, 'rgba(0, 0, 0, 0)');
      sh.addColorStop(0.55, 'rgba(8, 4, 20, 0.15)');
      sh.addColorStop(1, 'rgba(8, 4, 20, 0.65)');
      ctx.fillStyle = sh;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
      ctx.restore();
      if (p.ring) this.planetRing(ctx, x, y, r, bloom, 'front');
      if (p.moon) {
        const ma = t * 1.3;
        const mx = x + Math.cos(ma) * r * 1.8;
        const my = y + Math.sin(ma) * r * 0.6;
        ctx.fillStyle = lerpColor('#5b5468', '#f4ecff', bloom);
        ctx.beginPath();
        ctx.arc(mx, my, r * 0.28, 0, TAU);
        ctx.fill();
      }
      // the moment it blooms: a sparkle
      const kb = (t - p.bloomAt) / 0.7;
      if (kb > 0 && kb < 1) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 1 - kb;
        const g = r * (2 + kb * 3);
        ctx.drawImage(glow('#d9ffb0'), x - g / 2, y - g / 2, g, g);
        drawStar(ctx, x, y, r * (1.2 + kb * 2.4), kb * 1.2, '#ffffff', 1 - kb);
      }
      ctx.restore();
    }
  }

  private planetRing(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, bloom: number, half: 'back' | 'front') {
    ctx.save();
    ctx.beginPath();
    if (half === 'back') ctx.rect(x - r * 3, y - r * 2, r * 6, r * 2);
    else ctx.rect(x - r * 3, y, r * 6, r * 2);
    ctx.clip();
    const colors = ['#ff9de2', '#ffd36b', '#9be15d', '#6ad7ff'];
    colors.forEach((c, i) => {
      ctx.strokeStyle = rgba(lerpColor('#6d6680', c, bloom), 0.85);
      ctx.lineWidth = r * 0.12;
      ctx.beginPath();
      ctx.ellipse(x, y, r * (1.45 + i * 0.13), r * (0.38 + i * 0.035), -0.25, 0, TAU);
      ctx.stroke();
    });
    ctx.restore();
  }

  /** everything it swallowed, bursting back out of it as it's cured */
  private drawBurstNumbers(ctx: CanvasRenderingContext2D, s: Point, R: number, kc: number) {
    const k = kc - CURE.shatter;
    if (k <= 0 || k > 3) return;
    for (const n of this.burstNumbers) {
      const d = R * (0.4 + n.v * (1 - Math.exp(-k * 1.6)) * 1.4);
      const x = s.x + Math.cos(n.a) * d;
      const y = s.y + Math.sin(n.a) * d * 0.9 - k * k * R * 0.05;
      ctx.save();
      ctx.globalAlpha = clamp01(1.4 - k * 0.5);
      ctx.translate(x, y);
      ctx.rotate(n.spin * k * 0.4);
      stamp(ctx, numberSprite(n.text, n.color), 0, 0, n.size * R * (1 + k * 0.25));
      ctx.restore();
    }
  }

  private drawFloaters(ctx: CanvasRenderingContext2D, t: number) {
    for (const f of this.floaters) {
      const k = (t - f.born) / f.life;
      const x = f.x + Math.sin(t * 2 + f.sway) * f.size * 0.8;
      const a = k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85;
      if (f.heart) drawHeart(ctx, x, f.y, f.size, f.color, a);
      else drawStar(ctx, x, f.y, f.size * 1.2, t * 2 + f.sway, f.color, a);
    }
  }

  private drawFireworks(ctx: CanvasRenderingContext2D, t: number) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const reach = Math.min(this.w, this.h) * 0.16;
    for (const f of this.fireworks) {
      const k = (t - f.born) / 1.6;
      const spread = easeOut(Math.min(1, k * 1.6));
      const fall = k * k * reach * 0.5;
      const a = 1 - k;
      if (k < 0.12) {
        const g = reach * 0.8 * (1 - k / 0.12);
        ctx.globalAlpha = 1;
        ctx.drawImage(glow('#ffffff'), f.x - g / 2, f.y - g / 2, g, g);
      }
      ctx.globalAlpha = a;
      for (const sp of f.sparks) {
        const x = f.x + Math.cos(sp.a) * reach * sp.v * spread;
        const y = f.y + Math.sin(sp.a) * reach * sp.v * spread + fall;
        const size = 5 + 3 * (1 - k);
        ctx.drawImage(glow(f.color), x - size, y - size, size * 2, size * 2);
      }
    }
    ctx.restore();
  }

  // ---- fire and light ----

  private drawBolts(ctx: CanvasRenderingContext2D, s: Point, R: number, t: number, ship: ShipPose) {
    for (const b of this.bolts) {
      const nose = { x: ship.x, y: ship.y - ship.w * 0.32 };
      if (t < b.fireAt) {
        // the answer flies up from its button to the ship, shrinking into it
        const k = easeInOut(clamp01((t - b.at) / (b.fireAt - b.at)));
        const x = lerp(b.from.x, nose.x, k) + Math.sin(k * Math.PI) * R * 0.5;
        const y = lerp(b.from.y, nose.y, k);
        const hgt = R * (0.5 - 0.25 * k);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(glow('#ffd77a'), x - hgt, y - hgt, hgt * 2, hgt * 2);
        ctx.globalCompositeOperation = 'source-over';
        stamp(ctx, numberSprite(b.text, '#ffd77a'), x, y, hgt);
        ctx.restore();
        continue;
      }
      // the bolt: a beam of light from the nose to where it lands, its head racing ahead, then fading
      const to = { x: s.x + b.to.x * R, y: s.y + b.to.y * R };
      const head = clamp01((t - b.fireAt) / (b.hitAt - b.fireAt));
      const fade = t < b.hitAt ? 1 : 1 - clamp01((t - b.hitAt) / 0.35);
      const hx = lerp(nose.x, to.x, head);
      const hy = lerp(nose.y, to.y, head);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      for (const [width, color, a] of [
        [0.2, '#6ad7ff', 0.25],
        [0.09, '#ffd77a', 0.6],
        [0.035, '#ffffff', 1],
      ] as Array<[number, string, number]>) {
        ctx.strokeStyle = rgba(color, a * fade);
        ctx.lineWidth = Math.max(1.5, R * width * (0.7 + 0.3 * fade));
        ctx.beginPath();
        ctx.moveTo(nose.x, nose.y);
        ctx.lineTo(hx, hy);
        ctx.stroke();
      }
      const g = R * 0.6 * fade;
      ctx.drawImage(glow('#fff1c9'), hx - g / 2, hy - g / 2, g, g);
      ctx.drawImage(glow('#6ad7ff'), nose.x - g / 2, nose.y - g / 2, g, g);
      ctx.restore();
    }
  }

  /** the fireball: forming in the mouth (drawn with it), then flying at the ship; `behind` the ship until it's past it */
  private drawFireball(ctx: CanvasRenderingContext2D, t: number, layer: 'behind' | 'front') {
    const f = this.fireball;
    if (!f) return;
    const pos = this.fireballPos(f);
    if (!pos) return;
    // a dodged one flies on past, over the ship; one that hits has burst
    const past = t > f.landAt;
    if (past && !f.dodged) return;
    if ((layer === 'front') !== past) return;
    this.drawFlameBall(ctx, pos.x, pos.y, pos.size, t);
  }

  /** a ball of fire: a white-hot core in roiling flames */
  private drawFlameBall(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, t: number) {
    if (size <= 1) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(glow('#ff5a3c'), x - size * 1.6, y - size * 1.6, size * 3.2, size * 3.2);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU + t * (2 + (i % 3));
      const d = size * (0.35 + 0.2 * Math.sin(t * 9 + i * 1.7));
      const r = size * (0.6 + 0.2 * Math.sin(t * 7 + i));
      ctx.drawImage(glow(i % 2 ? '#ffb347' : '#ff7a2f'), x + Math.cos(a) * d - r, y + Math.sin(a) * d - r, r * 2, r * 2);
    }
    ctx.drawImage(glow('#fff1c9'), x - size * 0.7, y - size * 0.7, size * 1.4, size * 1.4);
    ctx.restore();
  }

  /** a reddening at the edges of the screen as a fireball bears down */
  private drawHeat(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const f = this.fireball;
    if (!f || this.t < f.launchAt) return;
    const k = clamp01((this.t - f.launchAt) / (f.landAt - f.launchAt));
    const a = (f.done ? 0 : 0.35) * k * k;
    if (a <= 0.01) return;
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
    g.addColorStop(0, 'rgba(255, 90, 40, 0)');
    g.addColorStop(1, `rgba(255, 90, 40, ${a})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  private drawBlasts(ctx: CanvasRenderingContext2D, s: Point, R: number, t: number) {
    if (!this.blasts.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const b of this.blasts) {
      const k = (t - b.born) / b.life;
      const x = s.x + b.x * R;
      const y = s.y + b.y * R;
      // a flash, a four-pointed star, a ring, and sparks flung out and pulled back in
      const flash = R * b.size * 0.9 * (1 - k) ** 0.6;
      ctx.globalAlpha = 1;
      ctx.drawImage(glow(b.color), x - flash / 2, y - flash / 2, flash, flash);
      drawStar(ctx, x, y, R * b.size * 0.75 * Math.sin(Math.PI * Math.min(1, k * 1.3)), k * 1.4, '#ffffff', 1 - k);
      ctx.strokeStyle = rgba(b.color, 0.8 * (1 - k));
      ctx.lineWidth = Math.max(1, R * 0.025 * (1 - k));
      ctx.beginPath();
      ctx.arc(x, y, R * b.size * (0.1 + 0.6 * easeOut(k)), 0, TAU);
      ctx.stroke();
      const out = Math.sin(Math.PI * Math.min(1, k * 1.15));
      for (const sp of b.sparks) {
        const d = R * b.size * sp.v * out;
        // pulled round towards the hole as they fall back
        const sx = x + Math.cos(sp.a) * d - b.x * R * k * k * 0.25;
        const sy = y + Math.sin(sp.a) * d - b.y * R * k * k * 0.25;
        const sz = Math.max(2, R * 0.05 * (1 - k));
        ctx.drawImage(glow(b.color), sx - sz, sy - sz, sz * 2, sz * 2);
      }
    }
    ctx.restore();
  }

  private drawRings(ctx: CanvasRenderingContext2D, s: Point, R: number, t: number) {
    if (!this.rings.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const r of this.rings) {
      const k = (t - r.born) / r.life;
      if (k < 0) continue;
      ctx.strokeStyle = rgba(r.color, 0.7 * (1 - k));
      ctx.lineWidth = Math.max(1, R * r.width * (1 - k * 0.7));
      ctx.beginPath();
      ctx.arc(s.x, s.y, R * lerp(r.r0, r.r1, easeOut(k)), 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** shards of the dark shell, flying off with glowing edges */
  private drawShards(ctx: CanvasRenderingContext2D, s: Point, R: number, t: number) {
    for (const sh of this.shards) {
      const k = (t - sh.born) / sh.life;
      const x = s.x + sh.x * R;
      const y = s.y + sh.y * R;
      const z = sh.size * R;
      ctx.save();
      ctx.globalAlpha = 1 - k;
      ctx.translate(x, y);
      ctx.rotate(sh.rot);
      ctx.beginPath();
      ctx.moveTo(-z * 0.6, -z * 0.4);
      ctx.lineTo(z * 0.7, -z * 0.2);
      ctx.lineTo(z * 0.1, z * 0.6);
      ctx.closePath();
      ctx.fillStyle = '#0d0618';
      ctx.fill();
      ctx.strokeStyle = sh.edge;
      ctx.lineWidth = Math.max(1, z * 0.08);
      ctx.stroke();
      ctx.restore();
    }
  }

  private drawEmbers(ctx: CanvasRenderingContext2D) {
    if (!this.embers.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const e of this.embers) {
      const k = (this.t - e.born) / e.life;
      ctx.globalAlpha = 1 - k;
      const z = e.size * (1 - k * 0.5);
      ctx.drawImage(glow(e.color), e.x - z, e.y - z, z * 2, z * 2);
    }
    ctx.restore();
  }
}

// ---------- helpers ----------

/** a number's sprite, its digits `size` px tall, centred on (x, y) */
export function stamp(ctx: CanvasRenderingContext2D, img: HTMLCanvasElement, x: number, y: number, size: number) {
  const k = size / SPRITE_PX;
  ctx.drawImage(img, x - (img.width * k) / 2, y - (img.height * k) / 2, img.width * k, img.height * k);
}

/** a streak of matter at `rho`, most on one of the arms (turned `turn` round), the rest anywhere */
function newParticle(rho: number, turn: number) {
  const onArm = Math.random() < 0.65;
  const theta = onArm ? turn + (Math.floor(Math.random() * ARMS) / ARMS) * TAU + ARM_WIND * Math.log(DISK_OUT / rho) + rand(-0.25, 0.25) : Math.random() * TAU;
  return { rho, theta, span: 0.1 + Math.random() * 0.25, width: 0.5 + Math.random() * 1.6, phase: Math.random() * TAU };
}

function numberText(mission: PilotMission): string {
  const r = (n: number) => Math.floor(Math.random() * n);
  if (Math.random() < 0.2) return String(r(10));
  return pickOp(mission) === 'add' ? String(2 + r(60)) : String((1 + r(10)) * (1 + r(10)));
}

function blast(x: number, y: number, born: number, life: number, size: number, color: string, sparks: number): Blast {
  return { x, y, born, life, size, color, sparks: Array.from({ length: sparks }, () => ({ a: rand(0, TAU), v: rand(0.5, 1.1) })) };
}

/** a four-pointed sparkle */
function drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, len: number, turn: number, color: string, alpha: number) {
  if (len <= 0.5 || alpha <= 0.01) return;
  ctx.save();
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.translate(x, y);
  ctx.rotate(turn);
  ctx.fillStyle = color;
  const w = len * 0.12;
  for (let i = 0; i < 2; i++) {
    ctx.rotate(Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(-len, 0);
    ctx.lineTo(0, -w);
    ctx.lineTo(len, 0);
    ctx.lineTo(0, w);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawHeart(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string, alpha: number) {
  if (alpha <= 0.01) return;
  ctx.save();
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.translate(x, y);
  ctx.scale(size / 20, size / 20);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, 7);
  ctx.bezierCurveTo(-14, -2, -9, -14, 0, -6);
  ctx.bezierCurveTo(9, -14, 14, -2, 0, 7);
  ctx.fill();
  ctx.restore();
}

function lerpColor(a: string, b: string, k: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (sh: number) => Math.round(lerp((pa >> sh) & 255, (pb >> sh) & 255, clamp01(k)));
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
}

/**
 * The cracks the bolts open in the dark shell: 15 jagged lines of light,
 * each one branching off the ones before, spreading up from the bottom where
 * the bolts land until they cover it (in sun radii from its middle).
 */
function makeCracks(): Point[][] {
  const cracks: Point[][] = [];
  for (let i = 0; i < 15; i++) {
    let start: Point;
    let dir: number;
    if (i === 0 || Math.random() < 0.25) {
      // from the rim, low down
      const a = Math.PI / 2 + rand(-0.9, 0.9);
      start = { x: Math.cos(a) * 0.98, y: Math.sin(a) * 0.98 };
      dir = a + Math.PI + rand(-0.5, 0.5);
    } else {
      // off a point on an earlier crack
      const from = cracks[Math.floor(Math.random() * cracks.length)];
      start = from[1 + Math.floor(Math.random() * (from.length - 1))];
      dir = Math.atan2(-start.y, -start.x) + rand(-1.3, 1.3);
    }
    const pts = [start];
    let p = start;
    const steps = 4 + Math.floor(Math.random() * 3);
    for (let j = 0; j < steps; j++) {
      dir += rand(-0.6, 0.6);
      const len = rand(0.1, 0.2);
      let next = { x: p.x + Math.cos(dir) * len, y: p.y + Math.sin(dir) * len };
      const d = Math.hypot(next.x, next.y);
      if (d > 0.96) {
        next = { x: (next.x / d) * 0.96, y: (next.y / d) * 0.96 };
        dir += Math.PI * 0.6;
      }
      pts.push(next);
      p = next;
    }
    cracks.push(pts);
  }
  return cracks;
}
