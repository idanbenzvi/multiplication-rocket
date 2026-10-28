// The afterburner's loop (the cockpit's easter egg, LoopShow.tsx), as a
// story told in beats, the way an anime tells a big move: the lever pulled
// and the engines charging, the screen slashed in two, the blueprint sliding
// in beside the cockpit, the ignition, and then the loop itself in bursts of
// speed, each stopping dead (time frozen, the camera drifting round the
// ship) while one of the forces on it is explained: the thrust that speeds it
// up, the turning force that bends its path round, the seat pushing the pilot
// towards the middle (3 G), and inertia, what it would do without the turning
// force. Then a last burst out of the loop, a ta-daa, and the blueprint slides
// away.
//
// Where the ship is goes by one number along its path, s: from -1 to 0 the
// straight run-up (the engine lit, speeding up), from 0 to 1 the loop
// (s · 360°), and on past 1 straight out of it. The numbers are a real loop's:
// a 765 m circle at 150 m/s (540 km/h) is a turning force of 3 g, and the
// run-up is 2 g of thrust from 40 m/s. In deep space there's no air (so no
// drag or lift, and no banking on it) and next to no gravity: the side
// thrusters do all the turning.

export type BeatId = 'thrust' | 'turn' | 'g' | 'inertia' | 'done';
export type SegKind = 'charge' | 'slash' | 'split' | 'ignite' | 'move' | 'hold' | 'close';

export interface Seg {
  kind: SegKind;
  ms: number;
  /** where the ship is along its path at the segment's start and end */
  s0: number;
  s1: number;
  /** a hold's force being explained */
  beat?: BeatId;
  /** a move's speed: bursting out of a hold and braking into the next ('out'), or speeding up and braking ('inout') */
  ease?: 'out' | 'inout' | 'linear';
}

/** g (m/s²) */
export const G0 = 9.81;
/** the loop's radius (m) and speed round it (m/s) */
export const RADIUS_M = 765;
export const SPEED = 150;
/** the run-up: from this speed (m/s), the engine pushing at this many g */
export const SPEED_START = 40;
export const BOOST_G = 2;
/** coming out of it, the engine lit again */
export const EXIT_G = 1.5;

/** the turning force a loop needs, in g: speed² ÷ radius */
export function turnG(speed = SPEED, radius = RADIUS_M): number {
  return (speed * speed) / radius / G0;
}

/** the blueprint's loop radius (its units; the ship's about 2 long) and its run-up's length */
export const R = 4;
export const RUN_UP = 6;

/** the loop's angle at s (radians): none on the run-up, a full turn once out */
export function angleAt(s: number): number {
  return Math.max(0, Math.min(1, s)) * Math.PI * 2;
}

export type V3 = [number, number, number];

/** the ship at s: where (the loop stands on the x axis, its middle at (0, R)), its nose and its top (the canopy) */
export function poseAt(s: number): { pos: V3; forward: V3; up: V3 } {
  if (s <= 0) return { pos: [s * RUN_UP, 0, 0], forward: [1, 0, 0], up: [0, 1, 0] };
  if (s >= 1) return { pos: [(s - 1) * RUN_UP, 0, 0], forward: [1, 0, 0], up: [0, 1, 0] };
  const a = angleAt(s);
  // (the top always towards the middle: an inside loop)
  return { pos: [R * Math.sin(a), R - R * Math.cos(a), 0], forward: [Math.cos(a), Math.sin(a), 0], up: [-Math.sin(a), Math.cos(a), 0] };
}

/** the ship's speed at s (m/s): speeding up along the run-up (v² growing with the distance, as a steady push does), steady round the loop, faster again out of it */
export function speedAt(s: number): number {
  if (s <= -1) return SPEED_START;
  if (s < 0) return Math.sqrt(SPEED_START ** 2 + (SPEED ** 2 - SPEED_START ** 2) * (s + 1));
  if (s <= 1) return SPEED;
  return Math.sqrt(SPEED ** 2 + 2 * EXIT_G * G0 * (s - 1) * 400);
}

/** how hard the engine's pushing (0 … 1), and the side thrusters (0 … 1), at s */
export function forcesAt(s: number): { thrust: number; turn: number } {
  const edge = (x: number) => Math.max(0, Math.min(1, x / 0.025));
  if (s < 0) return { thrust: s > -1 ? 1 : 0, turn: 0 };
  if (s <= 1) return { thrust: 0, turn: Math.min(edge(s), edge(1 - s)) };
  return { thrust: EXIT_G / BOOST_G, turn: 0 };
}

/** what the pilot feels (in g): pushed back into the seat on the run-up, down into it round the loop */
export function feltG(s: number): number {
  const { thrust, turn } = forcesAt(s);
  return s < 0 ? thrust * BOOST_G : s <= 1 ? turn * turnG() : EXIT_G;
}

/** the loop's beats, in order: where each stops (s), and the force it explains */
export const BEATS: Array<{ id: BeatId; at: number }> = [
  { id: 'thrust', at: -0.5 },
  { id: 'turn', at: 70 / 360 },
  { id: 'g', at: 0.5 },
  { id: 'inertia', at: 280 / 360 },
  { id: 'done', at: 1.12 },
];

/** how far a frozen moment still drifts on (s), in slow motion */
const DRIFT = 0.012;
/** a frozen moment's time: the flight outside nearly stopped */
export const FROZEN = 0.04;

/** the story, its holds `holds` ms long (the words in each want time to read) */
export function buildStory(holds: Record<BeatId, number>): Seg[] {
  const segs: Seg[] = [
    { kind: 'charge', ms: 480, s0: -1, s1: -1 },
    { kind: 'slash', ms: 140, s0: -1, s1: -1 },
    { kind: 'split', ms: 520, s0: -1, s1: -1 },
    { kind: 'ignite', ms: 180, s0: -1, s1: -0.98 },
  ];
  let s = -0.98;
  const moveMs = [520, 640, 540, 500, 640];
  BEATS.forEach((b, i) => {
    segs.push({ kind: 'move', ms: moveMs[i], s0: s, s1: b.at, ease: i === 0 ? 'inout' : 'out' });
    segs.push({ kind: 'hold', ms: holds[b.id], s0: b.at, s1: b.at + DRIFT, beat: b.id });
    s = b.at + DRIFT;
  });
  segs.push({ kind: 'close', ms: 560, s0: s, s1: s + 0.12, ease: 'linear' });
  return segs;
}

export interface Frame {
  kind: SegKind;
  /** the segment's index, and how far through it (0 … 1) */
  index: number;
  u: number;
  beat?: BeatId;
  s: number;
  /** the flight outside's time (1 flying, nearly 0 frozen) */
  time: number;
  /** how fast the ship's going along its path right now, a share of a burst's (for the speed lines) */
  rush: number;
  done: boolean;
}

const easeOf = (kind: Seg['ease'], u: number) =>
  kind === 'out' ? 1 - (1 - u) ** 3 : kind === 'inout' ? (u < 0.5 ? 4 * u ** 3 : 1 - (-2 * u + 2) ** 3 / 2) : u;
/** how fast each easing is going at u (its slope, 1 = the average) */
const slopeOf = (kind: Seg['ease'], u: number) =>
  kind === 'out' ? 3 * (1 - u) ** 2 : kind === 'inout' ? (u < 0.5 ? 12 * u ** 2 : 3 * (-2 * u + 2) ** 2 / 2) : 1;

/** the story playing: stepped by the frame, a hold cut short by a tap, or skipped to its end */
export class Story {
  index = 0;
  at = 0;
  readonly segs: Seg[];

  constructor(segs: Seg[]) {
    this.segs = segs;
  }

  step(ms: number) {
    this.at += ms;
    while (this.index < this.segs.length && this.at >= this.segs[this.index].ms) {
      this.at -= this.segs[this.index].ms;
      this.index++;
    }
  }

  /** a tap: a frozen moment goes on at once */
  next() {
    const seg = this.segs[this.index];
    if (seg?.kind === 'hold') this.at = Math.max(this.at, seg.ms - 1);
  }

  /** straight to the end: the blueprint slides away */
  end() {
    const close = this.segs.findIndex((g) => g.kind === 'close');
    if (this.index < close) {
      this.index = close;
      this.at = 0;
    }
  }

  get done(): boolean {
    return this.index >= this.segs.length;
  }

  frame(): Frame {
    if (this.done) {
      const last = this.segs[this.segs.length - 1];
      return { kind: 'close', index: this.segs.length, u: 1, s: last.s1, time: 1, rush: 0, done: true };
    }
    const seg = this.segs[this.index];
    const u = Math.min(1, this.at / seg.ms);
    const s = seg.s0 + (seg.s1 - seg.s0) * easeOf(seg.ease ?? 'linear', u);
    // frozen in a hold (slowing into it over its first 150 ms), flying otherwise
    const time = seg.kind === 'hold' ? FROZEN + (1 - FROZEN) * Math.max(0, 1 - this.at / 150) ** 2 : 1;
    const rush = seg.kind === 'move' || seg.kind === 'ignite' ? Math.min(1, slopeOf(seg.ease ?? 'linear', u) * 0.7) : seg.kind === 'close' ? 0.5 : 0;
    return { kind: seg.kind, index: this.index, u, beat: seg.beat, s, time, rush, done: false };
  }
}

/** how long to hold a beat whose words are `text`: time to read them (a child's pace), within reason */
export function holdFor(text: string): number {
  return Math.round(Math.min(7500, Math.max(3400, 1600 + text.length * 48)));
}
