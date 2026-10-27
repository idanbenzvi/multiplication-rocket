import { Canyon, HOVER, smooth } from './field';
import { judge, LANE, uOf, valueAt, type Gate, type GateResult } from './gates';

// A Canyon Run's flight, step by step (the scene draws it, canyon/World.tsx;
// nothing here draws). The ship dives into the canyon from high above, then
// flies along it by itself, round its bends, banking into them; the pilot
// steers it across. A tap (a key, or a side of the screen) moves it one
// number along the next gate's ruler; holding glides it, and let go it
// settles on the nearest number; a finger dragged across slides it there,
// and the mouse aims it at a number across the screen.
// The walls push it back, scraping, and a spire knocks it aside, slower;
// nothing ends the run. Through a gate, the number it's at is its answer: a
// bullseye boosts it, and bullseyes in a row fly faster and faster. Its
// pace follows how the pilot's doing: each bullseye a little faster, each
// miss slower (a close one, a touch slower), so a pilot finding it hard has
// longer to read the next gate, and one flying it well is pushed (useCanyon
// keeps the pace for their next run). After the last gate it climbs out of
// the canyon, into the sky.

/** the dive in from high above the canyon, and the climb out (s) */
export const DESCENT_S = 2.8;
export const START_HEIGHT = 125;
export const CLIMB_S = 2.6;
/** how fast it flies (units/s), at a pace of 1 */
const BASE = 60;
const CALM_BASE = 50;
/** the pace (a share of BASE): a new pilot's, the slowest and the fastest, and how a gate moves it */
export const PACE_START = 0.85;
export const PACE_MIN = 0.65;
export const PACE_MAX = 1.25;
const PACE_STEP: Record<GateResult['verdict'], number> = { bullseye: 0.05, close: -0.04, miss: -0.09 };
/** across, gliding with a direction held */
const GLIDE = 26;
/** held this long, a press glides instead of stepping one number */
const GLIDES_AFTER = 0.22;
/** how near the walls it can come (its wings), and the spires */
const WING = 3.6;
const CLEAR = 2.8;

export interface Steer {
  /** a direction held (a key, or a side of the screen pressed): -1 left, 1 right */
  hold: -1 | 0 | 1;
  /** how long it's been held (s) */
  held: number;
  /** a finger dragging: where across it's put the ship, or null */
  drag: number | null;
  /** where it's settling: a number's place on the next ruler, or null */
  target: number | null;
}

export type RunPhase = 'descent' | 'fly' | 'climb' | 'done';

export interface Ship {
  d: number;
  u: number;
  /** across, units/s */
  vu: number;
  /** its height, and how fast that's changing */
  y: number;
  vy: number;
  /** its own speed, and a boost's on top of it, dying away */
  speed: number;
  boost: number;
  /** which way it points (radians: right of straight along the world's -z), its nose's pitch, and how far it's banked (right wing down) */
  heading: number;
  pitch: number;
  bank: number;
  /** how near a wall (0 … 1), and a scrape's jolt, dying away */
  near: number;
  scrape: number;
}

export type RunEvent =
  | { type: 'gate'; result: GateResult; u: number }
  | { type: 'scrape'; side: -1 | 1; strength: number }
  | { type: 'spire'; side: -1 | 1 }
  | { type: 'lane'; value: number }
  | { type: 'climb' }
  | { type: 'done' };

export class Run {
  readonly canyon: Canyon;
  readonly gates: Gate[];
  readonly calm: boolean;
  phase: RunPhase = 'descent';
  /** since the run began, and since its phase did (s) */
  time = 0;
  phaseTime = 0;
  ship: Ship;
  steer: Steer = { hold: 0, held: 0, drag: null, target: null };
  /** the next gate's index (gates.length once they're all flown) */
  next = 0;
  results: GateResult[] = [];
  combo = 0;
  bestCombo = 0;
  /** how fast it flies, a share of BASE: eased down by misses, up by bullseyes */
  pace: number;
  private bumpCool = 0;
  private lastValue = Number.NaN;
  private lastVu = 0;
  private lastY: number;

  constructor(canyon: Canyon, gates: Gate[], calm = false, pace = PACE_START) {
    this.canyon = canyon;
    this.gates = gates;
    this.calm = calm;
    this.pace = Math.max(PACE_MIN, Math.min(PACE_MAX, pace));
    const y = canyon.floor(0) + HOVER + START_HEIGHT;
    this.lastY = y;
    this.ship = { d: 0, u: 0, vu: 0, y, vy: 0, speed: this.cruise(), boost: 0, heading: 0, pitch: -0.6, bank: 0, near: 0, scrape: 0 };
  }

  /** the speed it settles to: its pace, and bullseyes in a row on top */
  private cruise(): number {
    const per = this.calm ? 2 : 4.5;
    return ((this.calm ? CALM_BASE : BASE) + Math.min(this.combo, 6) * per) * this.pace;
  }

  /** the ruler steering settles on: the next gate's (the last one's, after it) */
  ruler(): Gate | null {
    return this.gates[Math.min(this.next, this.gates.length - 1)] ?? null;
  }

  /** the next gate, if any */
  ahead(): Gate | null {
    return this.gates[this.next] ?? null;
  }

  /** how fast it's going, all told (units/s) */
  forward(): number {
    return this.ship.speed + this.ship.boost;
  }

  /** how far the ship can go across here, either way */
  private limit(d: number): number {
    return this.canyon.half(d) - WING;
  }

  /** the nearest number's place on the ruler to u, within the walls here */
  private settle(u: number): number {
    const g = this.ruler();
    const lim = this.limit(this.ship.d);
    if (!g) return Math.max(-lim, Math.min(lim, u));
    let target = uOf(g, valueAt(g, u));
    // (a place past the wall here: the nearest one inside it)
    while (Math.abs(target) > lim && Math.abs(target) > LANE) target -= Math.sign(target) * LANE;
    return target;
  }

  // ---- the controls ----

  /** a direction pressed: one number along, at once; held, it glides */
  press(dir: -1 | 1) {
    const s = this.steer;
    s.hold = dir;
    s.held = 0;
    s.drag = null;
    const g = this.ruler();
    const from = s.target ?? this.ship.u;
    s.target = g ? this.settle(uOf(g, valueAt(g, from) + dir)) : this.settle(from + dir * LANE);
  }

  release(dir?: -1 | 1) {
    const s = this.steer;
    if (dir !== undefined && s.hold !== dir) return;
    // (after a glide, it settles on the number it's coming to)
    if (s.held >= GLIDES_AFTER) s.target = this.settle(this.ship.u + this.ship.vu * 0.12);
    s.hold = 0;
    s.held = 0;
  }

  /** a finger dragged across: the ship there (u) */
  dragTo(u: number) {
    const lim = this.limit(this.ship.d);
    this.steer.hold = 0;
    this.steer.drag = Math.max(-lim, Math.min(lim, u));
  }

  endDrag() {
    const s = this.steer;
    if (s.drag === null) return;
    s.target = this.settle(s.drag);
    s.drag = null;
  }

  /** the mouse: aim at the number nearest u, and settle there */
  aimAt(u: number) {
    const s = this.steer;
    s.hold = 0;
    s.held = 0;
    s.drag = null;
    s.target = this.settle(u);
  }

  /** the number it's going for on the ruler ahead: where it's settling (or being dragged), else where it is */
  aimed(): number | null {
    const g = this.ruler();
    if (!g) return null;
    const s = this.steer;
    return valueAt(g, s.drag ?? s.target ?? this.ship.u);
  }

  // ---- each frame ----

  step(rawDt: number): RunEvent[] {
    const events: RunEvent[] = [];
    if (this.phase === 'done') return events;
    const dt = Math.min(rawDt, 0.05);
    const c = this.canyon;
    const ship = this.ship;
    const s = this.steer;
    this.time += dt;
    this.phaseTime += dt;
    this.bumpCool -= dt;

    // ---- along ----
    ship.speed += (this.cruise() - ship.speed) * (1 - Math.exp(-dt * 0.8));
    ship.boost *= Math.exp(-dt / 1.3);
    const fwd = this.forward();
    ship.d += fwd * dt;
    const d = ship.d;

    // ---- across ----
    if (s.hold !== 0) s.held += dt;
    if (s.drag !== null) {
      this.spring(s.drag, 14, dt);
    } else if (s.hold !== 0 && s.held >= GLIDES_AFTER) {
      ship.vu += (s.hold * GLIDE - ship.vu) * (1 - Math.exp(-dt * 10));
      ship.u += ship.vu * dt;
      s.target = null;
    } else {
      s.target ??= this.settle(ship.u);
      this.spring(s.target, 11, dt);
    }
    // the walls
    const lim = this.limit(d);
    if (Math.abs(ship.u) > lim) {
      const side = Math.sign(ship.u) as -1 | 1;
      const into = Math.max(0, ship.vu * side);
      ship.u = side * lim;
      if (into > 0) ship.vu = -ship.vu * 0.35;
      if (s.target !== null && Math.abs(s.target) > lim) s.target = this.settle(ship.u - side * LANE * 0.6);
      const strength = Math.min(1, 0.25 + into / 26);
      ship.scrape = Math.max(ship.scrape, strength);
      ship.speed *= 1 - 0.12 * strength * dt * 10;
      if (this.bumpCool <= 0) {
        this.bumpCool = 0.3;
        events.push({ type: 'scrape', side, strength });
      }
    }
    ship.near = smooth(lim - 7, lim, Math.abs(ship.u));
    // the spires
    for (const sp of c.spiresNear(d)) {
      const dd = d - sp.d;
      const reach = sp.r * 1.05 + CLEAR;
      if (Math.abs(dd) > reach) continue;
      const w = Math.sqrt(reach * reach - dd * dd);
      const du = ship.u - sp.u;
      if (Math.abs(du) >= w) continue;
      const side = (du !== 0 ? Math.sign(du) : ship.vu >= 0 ? 1 : -1) as -1 | 1;
      ship.u = sp.u + side * w;
      ship.vu = side * Math.max(Math.abs(ship.vu) * 0.4, 9);
      s.target = this.settle(ship.u + side * LANE * 0.5);
      ship.speed *= 0.82;
      ship.boost = 0;
      ship.scrape = 1;
      if (this.bumpCool <= 0) {
        this.bumpCool = 0.4;
        events.push({ type: 'spire', side });
      }
    }
    ship.scrape *= Math.exp(-dt * 4);

    // the number it's at, on the ruler ahead (a tick as it passes each)
    const ruler = this.ruler();
    if (ruler && this.phase === 'fly') {
      const value = valueAt(ruler, ship.u);
      if (value !== this.lastValue) {
        if (!Number.isNaN(this.lastValue)) events.push({ type: 'lane', value });
        this.lastValue = value;
      }
    }

    // ---- through a gate ----
    const gate = this.ahead();
    if (gate && d >= gate.d) {
      const value = valueAt(gate, ship.u);
      const verdict = judge(value, gate.answer);
      const result: GateResult = { gate: this.next, value, answer: gate.answer, verdict };
      this.results.push(result);
      this.next++;
      this.pace = Math.max(PACE_MIN, Math.min(PACE_MAX, this.pace + PACE_STEP[verdict]));
      this.lastValue = Number.NaN;
      if (verdict === 'bullseye') {
        this.combo++;
        this.bestCombo = Math.max(this.bestCombo, this.combo);
        ship.boost += this.calm ? 10 : 28;
      } else {
        this.combo = 0;
        if (verdict === 'close') ship.boost += this.calm ? 5 : 12;
      }
      // (steering settles on the next ruler from here)
      s.target = s.drag === null && s.hold === 0 ? null : s.target;
      events.push({ type: 'gate', result, u: ship.u });
    }

    // ---- up and down ----
    const ground = c.floor(d) + HOVER;
    if (this.phase === 'descent') {
      const k = Math.min(1, this.phaseTime / DESCENT_S);
      // (falling away, then levelling out over the floor)
      const fall = 1 - k * k * (3 - 2 * k);
      ship.y = ground + START_HEIGHT * fall * fall;
      if (k >= 1) this.enter('fly');
    } else if (this.phase === 'fly') {
      const bob = this.calm ? 0 : 0.35 * Math.sin(this.time * 1.7);
      ship.y += (ground + bob - ship.y) * (1 - Math.exp(-dt * 6));
      if (d >= c.end - 210) {
        this.enter('climb');
        events.push({ type: 'climb' });
      }
    } else if (this.phase === 'climb') {
      ship.vy = Math.min(ship.vy + 75 * dt, 85);
      ship.y += ship.vy * dt;
      if (this.phaseTime >= CLIMB_S) {
        this.enter('done');
        events.push({ type: 'done' });
      }
    }
    if (this.phase !== 'climb') ship.vy = (ship.y - this.lastY) / dt;
    this.lastY = ship.y;

    // ---- which way it points ----
    ship.heading = Math.atan2(c.slope(d) * fwd + ship.vu, fwd);
    const pitch = Math.atan2(ship.vy, fwd);
    ship.pitch += (pitch - ship.pitch) * (1 - Math.exp(-dt * 7));
    // banked into a bend, and into its own swerves
    const swerve = (ship.vu - this.lastVu) / dt;
    this.lastVu = ship.vu;
    const lateral = c.curve(d) * fwd * fwd + swerve;
    const bank = Math.max(-0.5, Math.min(0.5, lateral * 0.012)) * (this.calm ? 0.3 : 1);
    ship.bank += (bank - ship.bank) * (1 - Math.exp(-dt * 5));
    return events;
  }

  private spring(goal: number, omega: number, dt: number) {
    const ship = this.ship;
    const a = omega * omega * (goal - ship.u) - 2 * omega * ship.vu;
    ship.vu += a * dt;
    ship.u += ship.vu * dt;
  }

  private enter(phase: RunPhase) {
    this.phase = phase;
    this.phaseTime = 0;
  }

  /** how far to the next gate (Infinity after the last) */
  toGate(): number {
    const g = this.ahead();
    return g ? g.d - this.ship.d : Infinity;
  }

  /** the ship's place in the world */
  position(): [number, number, number] {
    return this.canyon.toWorld(this.ship.d, this.ship.u, this.ship.y);
  }
}
