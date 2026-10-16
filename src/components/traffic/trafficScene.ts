import type { TrafficDir } from '../../game/bonusRounds';
import type { Porthole } from '../scene/spriteTexture';
import { glow, HULLS, IONS, PILOT_CANOPY, PILOT_ENGINES, rearShipSvg, rgba, SHIP_KINDS, sprite, trafficSprite } from './trafficArt';

// Space Traffic's world, seen from just behind the pilot's ship: lanes of
// slower ships stretch ahead to a vanishing point, laid out on a grid, so the
// ship can swerve left, right, up or down into the next lane. Beacons mark
// the lanes' edges (the pilot's own lane in gold) and rush past to show the
// speed. Distances are in lanes (a lane is 1 wide); z is how far ahead of the
// pilot's ship.
//
// It runs every frame on a 2D canvas, outside React: the round
// (SpaceTraffic.tsx) says what happens (a slow ship pulls into the lane, the
// pilot swerves round it or brakes, and races off at the end) and this
// animates it.

/** the camera trails the pilot's ship by this much */
const BACK = 4.2;
/** a slow ship in the pilot's lane waits this far ahead */
export const HOLD = 2.4;
/** the camera rides this far above the pilot's lane, to see over the ship to the one waiting ahead */
const CAM_UP = 1.9;
/** traffic shows up this far ahead */
const FAR = 46;
/** nothing nearer the camera than this is drawn */
const NEAR = 0.45;
/** the pilot's ship, in lanes */
const PILOT_W = 0.75;
/** lanes per second: cruising, swerving past a ship, braking, and racing off at the end */
const CRUISE = 9;
const BOOST = 24;
const BRAKING = 4;
const FINALE = 70;
const BEACON_GAP = 3.2;
const AMBIENT = 11;
/** the lanes next to the pilot's stay clear this far ahead, so a swerve never meets anyone */
const KEEP_CLEAR = 16;

/** how long things take, in seconds */
const INTRO_FLY_S = 1.4;
const APPROACH_S = 2.3;
export const DODGE_S = 0.75;
export const BRAKE_S = 1.2;

const DIR_STEP: Record<TrafficDir, { x: number; y: number }> = {
  up: { x: 0, y: 1 },
  down: { x: 0, y: -1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const easeOut = (t: number) => 1 - (1 - t) ** 3;
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));

export interface Lens {
  w: number;
  h: number;
  /** a lane's width in pixels where the pilot's ship is */
  lanePx: number;
  /** focal length, in pixels */
  f: number;
  /** the vanishing point */
  cx: number;
  horizon: number;
  /** how far above the pilot's lane the camera rides, in lanes */
  camUp: number;
}

/** the camera for this screen */
export function lensFor(w: number, h: number): Lens {
  // the pilot's ship sits above the D-pad on a phone, in the lower middle on a wide screen, and the
  // vanishing point a quarter of the way down; the lanes are as wide as fits the camera's height between
  const horizon = h * 0.25;
  const room = h * (h > w ? 0.52 : 0.6) - horizon;
  const lanePx = Math.max(72, Math.min(210, w * 0.34, room / CAM_UP));
  return { w, h, lanePx, f: lanePx * BACK, cx: w / 2, horizon, camUp: room / lanePx };
}

type Role = 'ambient' | 'blocker' | 'passing';

interface Ship {
  kind: number;
  /** how wide it is, in lanes */
  size: number;
  hull: string;
  ion: string;
  /** where it is (between two lanes while it changes lanes) */
  x: number;
  y: number;
  /** the lane it's in, or moving to */
  lx: number;
  ly: number;
  z: number;
  /** its own speed as a share of the pilot's cruising speed: everyone is slower */
  pace: number;
  number: number;
  role: Role;
  seed: number;
}

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
  color: string;
  size: number;
}

interface Pt {
  x: number;
  y: number;
  /** pixels per lane at this depth */
  s: number;
}

const pick = <T,>(items: readonly T[]) => items[Math.floor(Math.random() * items.length)];

export interface SceneOptions {
  now: number;
  /** the rocket's color this level */
  accent: string;
  /** the pilot's animal, in the canopy */
  avatar?: string;
  /** numbers the passing traffic may carry (never the ones the round asks about) */
  numbers: number[];
  /** reduced motion: the ship banks instead of rolling right round, and nothing shakes */
  calm: boolean;
}

export class TrafficScene {
  private ships: Ship[] = [];
  private particles: Particle[] = [];
  /** the pilot's lane, and the one it was in before swerving */
  private lane = { x: 0, y: 0 };
  private from = { x: 0, y: 0 };
  /** where the pilot's ship is right now, and how far it's rolled (radians, clockwise on screen) */
  private pos = { x: 0, y: 0 };
  private roll = 0;
  private z = 0;
  private cam = { x: 0, y: 0 };
  private travel = 0;
  private readonly startedAt: number;
  private dodgeAt = -Infinity;
  private rollSign = 1;
  /** when the ship in the lane starts to drop back past the swerving pilot */
  private passAt = Infinity;
  private boostUntil = -Infinity;
  private brakeAt = -Infinity;
  private brakeDir = { x: 0, y: 0 };
  private finaleAt = Infinity;
  private blocker: Ship | null = null;
  private blockerAt = 0;
  private blockerFrom = 0;
  private nextSpawn = 0;
  private readonly pilotSvg: string;
  private readonly canopy?: Porthole;
  private readonly numbers: number[];
  private readonly calm: boolean;
  speed = CRUISE;
  /** the pilot's ship on screen, as of the last frame drawn (spark bursts go off there) */
  shipScreen = { x: 0, y: 0 };

  constructor({ now, accent, avatar, numbers, calm }: SceneOptions) {
    this.startedAt = now;
    this.pilotSvg = rearShipSvg(accent);
    this.canopy = avatar ? { emoji: avatar, ...PILOT_CANOPY } : undefined;
    this.numbers = numbers.length ? numbers : [0];
    this.calm = calm;
    // the road is already busy when the round opens
    for (let i = 0; i < AMBIENT; i++) this.spawnAmbient(6 + Math.random() * (FAR - 6));
  }

  /** a slow ship pulls into the pilot's lane, far ahead, with its number on its back */
  spawnBlocker(number: number, now: number) {
    const z = FAR * 0.72;
    const kind = Math.floor(Math.random() * SHIP_KINDS.length);
    const ship: Ship = {
      kind,
      // a size bigger than the rest: a lumbering freighter
      size: Math.min(SHIP_KINDS[kind].width * 1.15, 1.05),
      hull: pick(HULLS),
      ion: pick(IONS),
      x: this.lane.x,
      y: this.lane.y,
      lx: this.lane.x,
      ly: this.lane.y,
      z,
      pace: 0.5,
      number,
      role: 'blocker',
      seed: Math.random() * 100,
    };
    this.ships.push(ship);
    this.blocker = ship;
    this.blockerAt = now;
    this.blockerFrom = z;
    this.passAt = Infinity;
  }

  /** the right drill: swerve into the next lane that way, rolling right round, and race past */
  dodge(dir: TrafficDir, now: number) {
    const step = DIR_STEP[dir];
    this.from = { ...this.lane };
    this.lane = { x: this.lane.x + step.x, y: this.lane.y + step.y };
    this.dodgeAt = now;
    // a barrel roll into the turn (left rolls left); up and down roll either way
    this.rollSign = step.x !== 0 ? step.x : Math.random() < 0.5 ? -1 : 1;
    // the slow ship drops back once the pilot is half way out of its lane
    this.passAt = now + DODGE_S * 0.5;
  }

  /** a wrong drill: the ship starts that way, its shields flare, and it brakes behind the slow ship */
  brake(dir: TrafficDir, now: number) {
    this.brakeAt = now;
    this.brakeDir = DIR_STEP[dir];
  }

  /** all the way through: the pilot races off towards the vanishing point */
  finale(now: number) {
    this.finaleAt = now;
  }

  // ---------- every frame ----------

  update(dt: number, now: number) {
    const passing = this.ships.some((s) => s.role === 'passing' && s.z > -1);
    // racing off at the end, then back to cruising behind the summary
    const racing = now >= this.finaleAt && now < this.finaleAt + 2.2;
    const target = racing ? FINALE : now < this.boostUntil || passing ? BOOST : now - this.brakeAt < 0.7 ? BRAKING : CRUISE;
    this.speed += (target - this.speed) * (1 - Math.exp(-(target > this.speed ? 3 : 4) * dt));
    this.travel += this.speed * dt;

    this.movePilot(now, dt);
    this.moveTraffic(now, dt);
    this.moveParticles(now, dt);
  }

  private movePilot(now: number, dt: number) {
    // flying in from just in front of the camera as the round opens
    const intro = clamp01((now - this.startedAt) / INTRO_FLY_S);
    this.z = -2.6 * (1 - easeOut(intro));
    // swerving into the next lane, rolling right round on the way
    const k = clamp01((now - this.dodgeAt) / DODGE_S);
    const e = easeInOut(k);
    const baseX = this.from.x + (this.lane.x - this.from.x) * e;
    const baseY = this.from.y + (this.lane.y - this.from.y) * e;
    let roll = k < 1 ? this.rollSign * (this.calm ? Math.sin(Math.PI * k) * 0.35 : e * Math.PI * 2) : 0;
    // a wrong drill: a lurch that way, and back
    const b = (now - this.brakeAt) / 0.55;
    let nx = 0;
    let ny = 0;
    if (b >= 0 && b < 1) {
      const lurch = Math.sin(Math.PI * b) * 0.22;
      nx = this.brakeDir.x * lurch;
      ny = this.brakeDir.y * lurch;
      roll += this.brakeDir.x * Math.sin(Math.PI * b) * 0.3;
    }
    // floating at cruise, and a lean as it flies in
    this.pos.x = baseX + nx + Math.sin(now * 1.3) * 0.03;
    this.pos.y = baseY + ny + Math.sin(now * 1.7 + 1) * 0.025;
    this.roll = roll + Math.sin(now * 0.9) * 0.04 + (1 - intro) * 0.5;
    // the finale: off to the vanishing point, faster and faster
    if (now >= this.finaleAt) {
      const tf = now - this.finaleAt;
      this.z = tf * tf * 16;
      this.roll += this.calm ? 0 : Math.min(1, tf * 1.2) * Math.PI * 2;
    }
    // the camera follows the swerve a moment behind, so the move shows on screen (not the bobbing)
    const follow = 1 - Math.exp(-3.2 * dt);
    this.cam.x += (baseX - this.cam.x) * follow;
    this.cam.y += (baseY - this.cam.y) * follow;
  }

  private moveTraffic(now: number, dt: number) {
    const blk = this.blocker;
    if (blk) {
      if (now >= this.passAt) {
        // the pilot is swerving out of its way: it drops back past them
        blk.role = 'passing';
        this.blocker = null;
        this.boostUntil = now + 1;
      } else {
        // closing in, slowing to wait just ahead, and pulling away a little after a wrong drill
        const a = clamp01((now - this.blockerAt) / APPROACH_S);
        const kb = (now - this.brakeAt) / BRAKE_S;
        const gap = kb >= 0 && kb < 1 ? 1.6 * (kb < 0.3 ? easeOut(kb / 0.3) : 1 - easeInOut((kb - 0.3) / 0.7)) : 0;
        blk.z = HOLD + (this.blockerFrom - HOLD) * (1 - easeOut(a)) + gap + Math.sin(now * 2.1) * 0.05;
      }
    }
    for (const s of this.ships) {
      if (s.role === 'blocker') continue;
      // catching up with a slower ship in the same lane: fall in behind it
      for (const o of this.ships) {
        if (o !== s && o.lx === s.lx && o.ly === s.ly && o.z > s.z && o.z - s.z < 3 && o.pace < s.pace) s.pace = o.pace;
      }
      s.z -= (this.speed - s.pace * CRUISE) * dt;
      if (s.role !== 'ambient') continue;
      // keep out of the pilot's lane, and out of the lanes next to it near the pilot
      const d = Math.abs(s.lx - this.lane.x) + Math.abs(s.ly - this.lane.y);
      if ((d === 0 || (d === 1 && s.z < KEEP_CLEAR)) && s.z > -0.5) this.moveAway(s);
      // (a swerve can bring a ship from a diagonal lane right next to the pilot: that one clears out quickly)
      const glide = 1 - Math.exp(-(s.z < 8 ? 7 : 2.4) * dt);
      s.x += (s.lx - s.x) * glide;
      s.y += (s.ly - s.y) * glide;
    }
    this.ships = this.ships.filter((s) => s.z > NEAR * 0.6 - BACK);
    if (this.blocker && !this.ships.includes(this.blocker)) this.blocker = null;
    const ambient = this.ships.filter((s) => s.role === 'ambient').length;
    if (ambient < AMBIENT && now >= this.nextSpawn) {
      this.spawnAmbient();
      this.nextSpawn = now + 0.35 + Math.random() * 0.5;
    }
  }

  /** a lane near the pilot's, but never theirs or one next to it (those stay clear for swerving) */
  private spawnAmbient(z = FAR + Math.random() * 4) {
    const options: Array<[number, number]> = [];
    for (let dx = -2; dx <= 2; dx++) {
      for (let dy = -2; dy <= 2; dy++) {
        if (Math.abs(dx) + Math.abs(dy) < 2) continue;
        const lx = this.lane.x + dx;
        const ly = this.lane.y + dy;
        if (this.ships.some((s) => s.lx === lx && s.ly === ly && Math.abs(s.z - z) < 7)) continue;
        // the diagonal lanes, right by the pilot, are the busiest
        const weight = Math.max(Math.abs(dx), Math.abs(dy)) === 1 ? 3 : 1;
        for (let k = 0; k < weight; k++) options.push([lx, ly]);
      }
    }
    if (!options.length) return;
    const [lx, ly] = pick(options);
    const kind = Math.floor(Math.random() * SHIP_KINDS.length);
    // a number nobody else on the road has right now, if there's one
    const shown = new Set(this.ships.map((s) => s.number));
    const fresh = this.numbers.filter((n) => !shown.has(n));
    this.ships.push({
      kind,
      size: SHIP_KINDS[kind].width,
      hull: pick(HULLS),
      ion: pick(IONS),
      x: lx,
      y: ly,
      lx,
      ly,
      z,
      pace: 0.42 + Math.random() * 0.36,
      number: pick(fresh.length ? fresh : this.numbers),
      role: 'ambient',
      seed: Math.random() * 100,
    });
  }

  /** change lanes, out to the one farthest from the pilot that's free */
  private moveAway(s: Ship) {
    const away = (x: number, y: number) => Math.abs(x - this.lane.x) + Math.abs(y - this.lane.y);
    const free = (x: number, y: number) => !this.ships.some((o) => o !== s && o.lx === x && o.ly === y && Math.abs(o.z - s.z) < 3);
    const options = [
      [s.lx + 1, s.ly],
      [s.lx - 1, s.ly],
      [s.lx, s.ly + 1],
      [s.lx, s.ly - 1],
    ].sort((p, q) => away(q[0], q[1]) - away(p[0], p[1]));
    const [x, y] = options.find(([x, y]) => away(x, y) >= 2 && free(x, y)) ?? options[0];
    s.lx = x;
    s.ly = y;
  }

  private moveParticles(now: number, dt: number) {
    // the pilot's engines stream ion sparks back past the camera: more of them, and hotter, when it's going fast
    const boost = this.boost();
    if (now < this.finaleAt + 1.2) {
      for (const e of PILOT_ENGINES) {
        const w = this.pilotEngine(e);
        this.emit(w.x, w.y, this.z - 0.05, (30 + boost * 60) * dt, () => -(1.4 + Math.random() * 1.6), this.pilotIon(), 0.035 + boost * 0.03, 0.45 + Math.random() * 0.35);
      }
    }
    // nearby traffic leaves a few of its own
    for (const s of this.ships) {
      if (s.z > 24 || s.z < -1) continue;
      const k = SHIP_KINDS[s.kind];
      const closing = this.speed - s.pace * CRUISE;
      for (const e of k.engines) {
        const x = s.x + (e.x - 0.5) * s.size;
        const y = s.y - (e.y - 0.5) * s.size * k.aspect;
        this.emit(x, y, s.z - 0.05, 5 * dt, () => -(closing + 1.2 + Math.random()), s.ion, 0.03, 0.5);
      }
    }
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0 && p.z + BACK > NEAR);
  }

  private emit(x: number, y: number, z: number, rate: number, vz: () => number, color: string, size: number, life: number) {
    for (let n = rate; n > 0; n--) {
      if (n < 1 && Math.random() > n) break;
      if (this.particles.length > 420) return;
      this.particles.push({ x, y, z, vx: (Math.random() - 0.5) * 0.5, vy: (Math.random() - 0.5) * 0.5, vz: vz(), life, max: life, color, size });
    }
  }

  /** 0 at cruise, 1 at full boost */
  private boost(): number {
    return clamp01((this.speed - CRUISE) / (BOOST - CRUISE));
  }

  /** the engines' color: cool ion blue at cruise, violet, then hot pink at full speed (like the rocket's plume) */
  private pilotIon(): string {
    const b = this.boost();
    return b > 0.6 ? '#ff6ad5' : b > 0.2 ? '#b18cff' : '#6ad7ff';
  }

  /** where one of the pilot's engines is (lanes), turned with the roll; r is its radius */
  private pilotEngine(e: { x: number; y: number; r: number }) {
    const ox = (e.x - 0.5) * PILOT_W;
    const oy = (e.y - 0.5) * PILOT_W; // downwards, as on screen
    const c = Math.cos(this.roll);
    const sn = Math.sin(this.roll);
    return { x: this.pos.x + ox * c - oy * sn, y: this.pos.y - (ox * sn + oy * c), r: e.r * PILOT_W };
  }

  private project(l: Lens, x: number, y: number, z: number): Pt | null {
    const d = z + BACK;
    if (d < NEAR) return null;
    const s = l.f / d;
    return { x: l.cx + (x - this.cam.x) * s, y: l.horizon + (this.cam.y + l.camUp - y) * s, s };
  }

  // ---------- drawing ----------

  draw(ctx: CanvasRenderingContext2D, l: Lens, now: number) {
    ctx.clearRect(0, 0, l.w, l.h);
    ctx.save();
    // a wrong drill jolts the view
    const kb = now - this.brakeAt;
    if (!this.calm && kb >= 0 && kb < 0.4) {
      const shake = (1 - kb / 0.4) * 7;
      ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    }
    this.drawLanes(ctx, l);
    this.drawParticles(ctx, l);
    // the farthest first, so nearer ships cover them (the pilot's ship among them)
    const order: Array<Ship | null> = [...this.ships, null];
    order.sort((a, b) => (b ? b.z : this.z) - (a ? a.z : this.z));
    for (const s of order) {
      if (s) this.drawShip(ctx, l, s, now);
      else this.drawPilot(ctx, l, now);
    }
    ctx.restore();
  }

  /** the lanes' edges: beacons rushing past (streaked at speed), the pilot's lane outlined in gold */
  private drawLanes(ctx: CanvasRenderingContext2D, l: Lens) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    const zNear = NEAR - BACK + 0.15;
    const streak = Math.min(2.2, 0.12 + this.speed * 0.03);
    const offset = this.travel % BEACON_GAP;
    const gx = Math.round(this.cam.x);
    const gy = Math.round(this.cam.y);
    for (let i = gx - 2; i <= gx + 1; i++) {
      for (let j = gy - 2; j <= gy + 1; j++) {
        const bx = i + 0.5;
        const by = j + 0.5;
        const ours = Math.abs(bx - this.lane.x) === 0.5 && Math.abs(by - this.lane.y) === 0.5;
        const color = ours ? '#ffd77a' : '#6ad7ff';
        if (ours) {
          // a faint rail of light along the pilot's lane, to the vanishing point
          const a = this.project(l, bx, by, zNear);
          const b = this.project(l, bx, by, FAR);
          if (a && b) {
            const g = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
            g.addColorStop(0, rgba(color, 0.32));
            g.addColorStop(1, rgba(color, 0));
            ctx.strokeStyle = g;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
        ctx.strokeStyle = color;
        const first = Math.ceil((zNear + offset) / BEACON_GAP);
        for (let k = first; ; k++) {
          const z = k * BEACON_GAP - offset;
          if (z > FAR) break;
          const p = this.project(l, bx, by, z);
          if (!p || p.x < -40 || p.x > l.w + 40 || p.y < -40 || p.y > l.h + 40) continue;
          const q = this.project(l, bx, by, Math.max(zNear, z - streak)) ?? p;
          const fade = clamp01(1 - (z - FAR * 0.35) / (FAR * 0.65));
          ctx.globalAlpha = fade * (ours ? 0.95 : 0.6);
          ctx.lineWidth = Math.max(1, p.s * (ours ? 0.045 : 0.032));
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(q.x, q.y);
          ctx.stroke();
        }
      }
    }
    ctx.restore();
  }

  private drawParticles(ctx: CanvasRenderingContext2D, l: Lens) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.particles) {
      const q = this.project(l, p.x, p.y, p.z);
      if (!q) continue;
      const left = p.life / p.max;
      const size = p.size * q.s * (2.2 + 1.8 * left);
      if (size < 0.5) continue;
      ctx.globalAlpha = Math.min(1, left * 1.3);
      ctx.drawImage(glow(p.color), q.x - size / 2, q.y - size / 2, size, size);
    }
    ctx.restore();
  }

  /** a cone of ion light from a nozzle back towards the camera, fading as it goes */
  private trail(ctx: CanvasRenderingContext2D, l: Lens, x: number, y: number, z: number, len: number, r: number, color: string, alpha: number) {
    const a = this.project(l, x, y, z);
    const zEnd = Math.max(z - len, NEAR - BACK + 0.05);
    if (!a || zEnd >= z) return;
    const b = this.project(l, x, y, zEnd);
    if (!b) return;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    if (length < 0.5) return;
    const nx = -dy / length;
    const ny = dx / length;
    const w0 = r * 1.1 * a.s;
    const w1 = r * 0.45 * b.s;
    const g = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
    g.addColorStop(0, rgba(color, alpha));
    g.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(a.x + nx * w0, a.y + ny * w0);
    ctx.lineTo(b.x + nx * w1, b.y + ny * w1);
    ctx.lineTo(b.x - nx * w1, b.y - ny * w1);
    ctx.lineTo(a.x - nx * w0, a.y - ny * w0);
    ctx.closePath();
    ctx.fill();
  }

  private drawShip(ctx: CanvasRenderingContext2D, l: Lens, s: Ship, now: number) {
    const k = SHIP_KINDS[s.kind];
    const bob = Math.sin(now * 1.6 + s.seed) * 0.03;
    const p = this.project(l, s.x, s.y + bob, s.z);
    if (!p) return;
    const W = s.size * p.s;
    const H = W * k.aspect;
    if (p.x + W < 0 || p.x - W > l.w || p.y + H < 0 || p.y - H * 2 > l.h) return;
    const blocker = s.role === 'blocker';
    // far ships fade in out of the distance (a ship pulling into the lane, where it is), and
    // out again as they sweep past the camera, so they never blot out the pilot's ship
    const fade = Math.min(
      clamp01((FAR + 4 - s.z) / 10),
      blocker ? clamp01((now - this.blockerAt) / 0.4) : 1,
      clamp01((s.z + BACK - NEAR) / (BACK - NEAR - 1)),
    );
    if (fade <= 0) return;
    const left = p.x - W / 2;
    const top = p.y - H / 2;
    ctx.save();
    if (blocker) {
      // a red warning glow behind the ship in the pilot's way
      const r = W * 2.2;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = fade * (0.35 + 0.2 * Math.sin(now * 7));
      ctx.drawImage(glow('#ff5a6e'), p.x - r / 2, p.y - r / 2, r, r);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = fade;
    const img = trafficSprite(s.kind, s.hull);
    if (img) ctx.drawImage(img, left, top, W, H);
    this.plate(ctx, l, left + k.plate.x * W, top + k.plate.y * H, k.plate.h * H, s, fade);
    // the engines: ion trails back towards the camera, and white-hot nozzles in a flickering halo
    ctx.globalCompositeOperation = 'lighter';
    for (const e of k.engines) {
      const ex = s.x + (e.x - 0.5) * s.size;
      const ey = s.y + bob - (e.y - 0.5) * s.size * k.aspect;
      this.trail(ctx, l, ex, ey, s.z, 1.6, e.r * s.size, s.ion, 0.5 * fade);
    }
    for (const e of k.engines) {
      const flicker = 1 + Math.sin(now * 37 + s.seed + e.x * 9) * 0.07 + Math.sin(now * 23 + s.seed) * 0.05;
      const r = e.r * W * 5.5 * flicker;
      ctx.globalAlpha = fade;
      ctx.drawImage(glow(s.ion), left + e.x * W - r / 2, top + e.y * H - r / 2, r, r);
    }
    // navigation lights, blinking: red to port, green to starboard
    if (Math.sin(now * 3.4 + s.seed) > 0.25) {
      const r = Math.max(5, W * 0.16);
      k.lights.forEach((spot, i) => ctx.drawImage(glow(i === 0 ? '#ff5a6e' : '#7ee08f'), left + spot.x * W - r / 2, top + spot.y * H - r / 2, r, r));
    }
    ctx.restore();
    if (blocker) this.brackets(ctx, p.x, p.y, W, H, s.z, now);
  }

  /** the number painted on a ship's back, like a racing number; the one in the pilot's way is never too small to read */
  private plate(ctx: CanvasRenderingContext2D, l: Lens, cx: number, cy: number, h: number, s: Ship, fade: number) {
    const blocker = s.role === 'blocker';
    const font = Math.max(h * 0.85, blocker ? Math.max(17, Math.min(26, l.lanePx * 0.16)) : 0);
    if (font < 6) return;
    const text = String(s.number);
    ctx.font = `700 ${font}px Fredoka, 'Trebuchet MS', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = fade;
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(2, font * 0.22);
    ctx.strokeStyle = '#2b2033';
    if (blocker) {
      ctx.shadowColor = '#ffd77a';
      ctx.shadowBlur = font * 0.6;
    }
    ctx.strokeText(text, cx, cy + font * 0.05);
    ctx.shadowBlur = 0;
    ctx.fillStyle = blocker ? '#ffd77a' : '#fdf3e7';
    ctx.fillText(text, cx, cy + font * 0.05);
  }

  /** target brackets lock on to the ship in the pilot's way, pulsing faster as it closes in */
  private brackets(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, z: number, now: number) {
    const lock = easeOut(clamp01((now - this.blockerAt) / 0.6));
    const pad = Math.max(w, h) * (0.14 + (1 - lock) * 0.9);
    const x0 = x - w / 2 - pad;
    const x1 = x + w / 2 + pad;
    const y0 = y - h / 2 - pad;
    const y1 = y + h / 2 + pad;
    const arm = Math.min(x1 - x0, y1 - y0) * 0.24;
    const close = clamp01(1 - (z - HOLD) / (FAR * 0.72 - HOLD));
    const pulse = 0.5 + 0.5 * Math.sin(now * (5 + close * 7));
    ctx.save();
    ctx.globalAlpha = lock * (0.55 + 0.45 * pulse);
    ctx.strokeStyle = close > 0.85 ? '#ff6b6b' : '#ffd77a';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x0, y0 + arm);
    ctx.lineTo(x0, y0);
    ctx.lineTo(x0 + arm, y0);
    ctx.moveTo(x1 - arm, y0);
    ctx.lineTo(x1, y0);
    ctx.lineTo(x1, y0 + arm);
    ctx.moveTo(x1, y1 - arm);
    ctx.lineTo(x1, y1);
    ctx.lineTo(x1 - arm, y1);
    ctx.moveTo(x0 + arm, y1);
    ctx.lineTo(x0, y1);
    ctx.lineTo(x0, y1 - arm);
    ctx.stroke();
    ctx.restore();
  }

  private drawPilot(ctx: CanvasRenderingContext2D, l: Lens, now: number) {
    if (this.z > FAR) return;
    const p = this.project(l, this.pos.x, this.pos.y, this.z);
    if (!p) return;
    const W = PILOT_W * p.s;
    this.shipScreen = { x: p.x, y: p.y };
    const boost = this.boost();
    const ion = this.pilotIon();
    const racing = now >= this.finaleAt;
    ctx.save();
    // the engines' ion trails, long when racing
    ctx.globalCompositeOperation = 'lighter';
    const engines = PILOT_ENGINES.map((e) => this.pilotEngine(e));
    const len = racing ? 3 + (now - this.finaleAt) * 14 : 1.3 + boost * 1.8;
    for (const e of engines) this.trail(ctx, l, e.x, e.y, this.z, len, e.r, ion, 0.6);
    // the ship, rolled
    ctx.globalCompositeOperation = 'source-over';
    const img = sprite(this.pilotSvg, 384, 384, this.canopy);
    if (img) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(this.roll);
      ctx.drawImage(img, -W / 2, -W / 2, W, W);
      ctx.restore();
    }
    // white-hot nozzles
    ctx.globalCompositeOperation = 'lighter';
    for (const e of engines) {
      const q = this.project(l, e.x, e.y, this.z);
      if (!q) continue;
      const r = e.r * q.s * (6 + boost * 5) * (1 + Math.sin(now * 41 + e.x * 7) * 0.06);
      ctx.drawImage(glow(ion), q.x - r / 2, q.y - r / 2, r, r);
    }
    // the shields flare after a wrong drill
    const kb = (now - this.brakeAt) / 0.7;
    if (kb >= 0 && kb < 1) {
      ctx.globalAlpha = (1 - kb) * 0.85;
      const r = W * 1.7;
      ctx.drawImage(glow('#ff5a6e'), p.x - r / 2, p.y - r / 2, r, r);
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = '#ff8a9a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, W * 0.62, W * 0.56, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
}
