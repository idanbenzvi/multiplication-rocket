import { Canyon, HOVER, smooth } from './field';
import { judge, LANE, RULER, uOf, valueAt, type Gate, type GateResult } from './gates';

// A Canyon Run's flight, step by step (the scene draws it, canyon/World.tsx;
// nothing here draws). The ship dives into the canyon from high above, then
// flies along it by itself, round its bends, banking into them; the pilot
// steers it across. A tap (a key, or a side of the screen) moves where it's
// going one number along the next gate's ruler, and taps add up (a key's
// bounce, or two keys at once, counting once); holding glides it, and let go
// it settles on the number it's coming to; a finger dragged across, or the
// mouse's reticle, puts it anywhere across, and resting there it settles on
// the nearest number. However it's told, it slides there smoothly: as fast
// as is near enough to stop in time, never faster than its fastest, and
// never pushed across harder than its thrusters can.
// The walls push it back, scraping, and a spire knocks it aside, slower;
// nothing ends the run. Through a gate, the number it's at is its answer: a
// bullseye boosts it, and bullseyes in a row fly faster and faster. Its
// pace follows how the pilot's doing: each bullseye a little faster, each
// miss slower (a close one, a touch slower), so a pilot finding it hard has
// longer to read the next gate, and one flying it well is pushed (useCanyon
// keeps the pace for their next run). After the last gate it climbs out of
// the canyon, into the sky.
//
// Its way in, a film's establishing shot: high over the canyon it glides,
// looking a little down along it, for a moment after the white has cleared,
// then swoops down into it, gaining speed, and levels out over its floor.
// Its height follows a smootherstep, so it starts down, steepens and pulls
// out with no jolt; its nose points only some of the way it's falling (it
// keeps looking on ahead) and comes up, as a plane's flares, while it's
// still settling.

/** the dive in from high above the canyon (the glide over it first), and the climb out (s) */
export const DESCENT_S = 4.2;
export const OVER_S = 1.4;
export const START_HEIGHT = 125;
/** diving: the speed it gains at its steepest (units/s), how much of the way it's falling its nose points, and how far down it looks gliding over the canyon (radians) */
const DIVE_PUSH = 30;
const DIVE_LOOK = 0.55;
const OVER_LOOK = -0.1;
export const CLIMB_S = 2.6;
/** how fast it flies (units/s), at a pace of 1 */
const BASE = 60;
const CALM_BASE = 50;
/** the pace (a share of BASE): a new pilot's, the slowest and the fastest, and how a gate moves it */
export const PACE_START = 0.85;
export const PACE_MIN = 0.65;
export const PACE_MAX = 1.25;
const PACE_STEP: Record<GateResult['verdict'], number> = { bullseye: 0.05, close: -0.04, miss: -0.09 };
/** across: the fastest it slides (units/s), the hardest it's pushed (units/s²), how keenly it closes on where it's going, and how quickly it takes up a new speed */
const SLIDE_MAX = 36;
const SLIDE_PUSH = 150;
const SLIDE_GAIN = 5.5;
const SLIDE_LAG = 14;
/** across, gliding with a direction held: at first, and held a while */
const GLIDE = 24;
const GLIDE_HELD = 32;
/** held this long, a press glides instead of stepping one number */
const GLIDES_AFTER = 0.26;
/** a way's presses closer together than this are one (a key's bounce, or ← and A at once) */
export const DEBOUNCE_S = 0.035;
/** the mouse or a finger still this long, it settles on the nearest number */
const POINTER_REST = 0.2;
/** how strongly a place pointed at is drawn to the nearest number while it moves (0 not at all, 1 snapped) */
const DETENT = 0.6;
/** knocked off a spire, how long the pointer waits to steer again (s) */
const KNOCKED_S = 0.6;
/** how near the walls it can come (its wings), and the spires */
const WING = 3.6;
const CLEAR = 2.8;

export interface Steer {
  /** a direction held (a key, or a side of the screen pressed): -1 left, 1 right */
  hold: -1 | 0 | 1;
  /** how long it's been held (s) */
  held: number;
  /** the mouse or a finger: the place across it points at (u), or null */
  pointer: number | null;
  /** a finger's still on the glass (it settles on a number when it's lifted, or rests) */
  dragging: boolean;
  /** where it's going: a number's place on the ruler (or, a pointer moving, any place across), or null */
  target: number | null;
  /** when each way was last pressed, left and right (the press's own clock, s), and the pointer last moved (the run's time, s) */
  pressedAt: [number, number];
  pointedAt: number;
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
  | { type: 'dive' }
  | { type: 'level' }
  | { type: 'climb' }
  | { type: 'done' };

/** 0 at 0, 1 at 1, with no speed nor push at either end (Perlin's smootherstep) */
export const smoother = (x: number) => x * x * x * (x * (6 * x - 15) + 10);

/** how far through its swoop the dive is, `t` seconds in: 0 gliding over the canyon, 1 down */
export const swoopAt = (t: number) => Math.min(1, Math.max(0, (t - OVER_S) / (DESCENT_S - OVER_S)));

export class Run {
  readonly canyon: Canyon;
  readonly gates: Gate[];
  readonly calm: boolean;
  phase: RunPhase = 'descent';
  /** since the run began, and since its phase did (s) */
  time = 0;
  phaseTime = 0;
  ship: Ship;
  steer: Steer = { hold: 0, held: 0, pointer: null, dragging: false, target: null, pressedAt: [-Infinity, -Infinity], pointedAt: 0 };
  /** the next gate's index (gates.length once they're all flown) */
  next = 0;
  results: GateResult[] = [];
  combo = 0;
  bestCombo = 0;
  /** how fast it flies, a share of BASE: eased down by misses, up by bullseyes */
  pace: number;
  private bumpCool = 0;
  private knockedAt = -1;
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
    this.ship = { d: 0, u: 0, vu: 0, y, vy: 0, speed: this.cruise(), boost: 0, heading: 0, pitch: OVER_LOOK, bank: 0, near: 0, scrape: 0 };
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

  /** a place across drawn towards the nearest number on the ruler, smoothly (a pointer moving) */
  private detent(u: number): number {
    const k = (u + RULER) / LANE;
    const n = Math.round(k);
    const x = k - n;
    return -RULER + (n + x - (DETENT * Math.sin(2 * Math.PI * x)) / (2 * Math.PI)) * LANE;
  }

  /** a direction pressed (`at`: when, s, by the event's own clock; else the run's): where it's going one number further that way (presses add up); held, it glides */
  press(dir: -1 | 1, at = this.time) {
    const s = this.steer;
    const way = dir < 0 ? 0 : 1;
    // (a bounce, or the other key for the same way: one press)
    if (Math.abs(at - s.pressedAt[way]) < DEBOUNCE_S) return;
    s.pressedAt[way] = at;
    s.hold = dir;
    s.held = 0;
    s.pointer = null;
    s.dragging = false;
    const from = this.settle(s.target ?? this.ship.u);
    s.target = this.settle(from + dir * LANE);
  }

  release(dir?: -1 | 1) {
    const s = this.steer;
    if (dir !== undefined && s.hold !== dir) return;
    // (after a glide, it settles on the number it's coming to, never back behind it)
    if (s.held >= GLIDES_AFTER) {
      const stop = this.ship.u + this.ship.vu / SLIDE_GAIN;
      let to = this.settle(stop);
      if ((to - this.ship.u) * s.hold < 0) to = this.settle(to + s.hold * LANE);
      s.target = to;
    }
    s.hold = 0;
    s.held = 0;
  }

  /** a finger dragged across: the ship towards there (u) */
  dragTo(u: number) {
    this.point(u);
    this.steer.dragging = true;
  }

  endDrag() {
    const s = this.steer;
    if (!s.dragging) return;
    s.dragging = false;
    if (s.pointer !== null) s.target = this.settle(s.pointer);
    s.pointer = null;
  }

  /** the mouse: the ship towards the place under its reticle (u), settling on the nearest number once it rests */
  aimAt(u: number) {
    this.point(u);
  }

  private point(u: number) {
    const s = this.steer;
    s.hold = 0;
    s.held = 0;
    s.pointer = Math.max(-RULER, Math.min(RULER, u));
    s.pointedAt = this.time;
    if (this.time - this.knockedAt >= KNOCKED_S) s.target = this.detent(s.pointer);
  }

  /** the number it's going for on the ruler ahead (where it's going, else where it is) */
  aimed(): number | null {
    const g = this.ruler();
    if (!g) return null;
    const s = this.steer;
    return valueAt(g, s.target ?? this.ship.u);
  }

  /** how many numbers it has still to go, and which way (taps added up): the number it's going for less the one it's at */
  pending(): number {
    const g = this.ruler();
    const s = this.steer;
    if (!g || s.target === null) return 0;
    return valueAt(g, s.target) - valueAt(g, this.ship.u);
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
    const lim = this.limit(d);
    if (s.hold !== 0) s.held += dt;
    if (s.hold !== 0 && s.held >= GLIDES_AFTER) {
      // (gliding: where it's going runs on ahead of it, faster the longer it's held, into a wall if that's where it's held)
      const glide = GLIDE + (GLIDE_HELD - GLIDE) * smooth(GLIDES_AFTER, 1.4, s.held);
      s.target = Math.max(-lim - 1, Math.min(lim + 1, ship.u + (s.hold * glide) / SLIDE_GAIN));
      this.slide(s.target, dt);
    } else {
      // (a pointer at rest: onto the nearest number)
      if (s.pointer !== null && this.time - s.pointedAt >= POINTER_REST && this.time - this.knockedAt >= KNOCKED_S) s.target = this.settle(s.pointer);
      s.target ??= this.settle(ship.u);
      // (short of a wall, if where it's going is past it here: it'll get there where the canyon widens)
      this.slide(Math.max(-lim + 0.4, Math.min(lim - 0.4, s.target)), dt);
    }
    // the walls
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
      this.knockedAt = this.time;
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
      // (where it's going is kept: every ruler's numbers are at the same places across)
      events.push({ type: 'gate', result, u: ship.u });
    }

    // ---- up and down ----
    const ground = c.floor(d) + HOVER;
    if (this.phase === 'descent') {
      const x = swoopAt(this.phaseTime);
      ship.y = ground + START_HEIGHT * (1 - smoother(x));
      // (gaining speed as it swoops, most at its steepest)
      ship.boost = Math.max(ship.boost, (this.calm ? DIVE_PUSH * 0.4 : DIVE_PUSH) * Math.sin(Math.PI * x));
      if (x > 0 && this.phaseTime - dt <= OVER_S) events.push({ type: 'dive' });
      if (this.phaseTime >= DESCENT_S) {
        this.enter('fly');
        events.push({ type: 'level' });
      }
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
    let pitch = Math.atan2(ship.vy, fwd);
    // (diving, the nose some of the way it's falling, coming up as it nears the floor; and gliding over the canyon, a little down along it)
    if (this.phase === 'descent') {
      const flare = 1 - smooth(0.45, 0.9, swoopAt(this.phaseTime));
      pitch = OVER_LOOK * (1 - smoother(Math.min(1, this.phaseTime / DESCENT_S))) + pitch * (this.calm ? 0.35 : DIVE_LOOK) * flare;
    }
    ship.pitch += (pitch - ship.pitch) * (1 - Math.exp(-dt * 7));
    // banked into a bend, and into its own slides across (the way it's going, and a little the way it's pushed)
    const swerve = (ship.vu - this.lastVu) / dt;
    this.lastVu = ship.vu;
    const lateral = c.curve(d) * fwd * fwd + swerve * 0.25 + ship.vu * 0.9;
    const bank = Math.max(-0.5, Math.min(0.5, lateral * 0.012)) * (this.calm ? 0.3 : 1);
    ship.bank += (bank - ship.bank) * (1 - Math.exp(-dt * 5));
    return events;
  }

  /** across towards goal: at the speed that closes on it (keen, but no faster than it can stop in time, nor than SLIDE_MAX), taken up smoothly and never pushed harder than SLIDE_PUSH */
  private slide(goal: number, dt: number) {
    const ship = this.ship;
    const e = goal - ship.u;
    const far = Math.abs(e);
    const want = Math.sign(e) * Math.min(SLIDE_MAX, SLIDE_GAIN * far, Math.sqrt(2 * SLIDE_PUSH * 0.7 * far));
    const most = SLIDE_PUSH * dt;
    ship.vu += Math.max(-most, Math.min(most, (want - ship.vu) * (1 - Math.exp(-dt * SLIDE_LAG))));
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

  /** about where the ship will be (along, and its height) `t` seconds into the dive in: for the world to set things along its way */
  descentAt(t: number): { d: number; y: number } {
    const x = swoopAt(t);
    const push = this.calm ? DIVE_PUSH * 0.4 : DIVE_PUSH;
    // (its own speed, and the push swooping: ∫ sin πx over the swoop)
    const d = this.cruise() * t + push * ((DESCENT_S - OVER_S) / Math.PI) * (1 - Math.cos(Math.PI * x));
    return { d, y: this.canyon.floor(d) + HOVER + START_HEIGHT * (1 - smoother(x)) };
  }

  /** the ship's place in the world */
  position(): [number, number, number] {
    return this.canyon.toWorld(this.ship.d, this.ship.u, this.ship.y);
  }
}
