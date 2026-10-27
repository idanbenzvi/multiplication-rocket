import type { Progress } from '../../../game/types';
import { pickFact } from '../../../game/questions';
import { randomizeOrder } from '../../../game/facts';
import { missionOfKey, type Mission, type PilotMission } from '../../../game/mission';
import { GATE_HALF } from './field';

// The Canyon Run's maths: every so often a bridge of light spans the canyon,
// a stretch of the number line on it, wall to wall (a tick for every number,
// every fifth one named), and a fact on the windscreen. The ship flies
// through the bridge where it is across the canyon: that's its answer. Right
// on it is a bullseye; a number or two off is close; further, a miss, and
// how far off is shown, the distance along the line being the difference.

export const GATE_COUNT = 8;
/** where the first gate is along the run, and how far apart they are */
export const FIRST_GATE = 470;
export const GATE_GAP = 560;
/** after the last, how far on the ship climbs out of the canyon */
export const RUN_TAIL = 330;
/** how many numbers a ruler spans (one more number than this, from lo to hi) */
export const SPAN = 20;
/** the ruler's half-length across the canyon */
export const RULER = 32;
/** how far apart its numbers are */
export const LANE = (RULER * 2) / SPAN;
/** within this many of the answer is close */
export const CLOSE = 2;

export type Verdict = 'bullseye' | 'close' | 'miss';

export interface Gate {
  /** where along the run */
  d: number;
  /** where its answer is tracked */
  factKey: string;
  op: Mission;
  /** the fact as it's shown */
  x: number;
  y: number;
  answer: number;
  /** the ruler's first number (its last is lo + SPAN) */
  lo: number;
}

export interface GateResult {
  gate: number;
  /** the number flown through */
  value: number;
  answer: number;
  verdict: Verdict;
}

export function gateDistances(count = GATE_COUNT): number[] {
  return Array.from({ length: count }, (_, i) => FIRST_GATE + i * GATE_GAP);
}

export function runLength(count = GATE_COUNT): number {
  return FIRST_GATE + (count - 1) * GATE_GAP + RUN_TAIL;
}

/** the ruler's first number for an answer: the answer anywhere but its last three either end (and never below 0) */
export function windowFor(answer: number, rand: () => number = Math.random): number {
  const into = 3 + Math.floor(rand() * (SPAN - 5));
  return Math.max(0, answer - into);
}

/** where across the canyon a number is on a gate's ruler */
export function uOf(gate: Pick<Gate, 'lo'>, n: number): number {
  return -RULER + (n - gate.lo) * LANE;
}

/** the number on a gate's ruler nearest a place across the canyon (one off the ends counts as the end) */
export function valueAt(gate: Pick<Gate, 'lo'>, u: number): number {
  const k = Math.round((u + RULER) / LANE);
  return gate.lo + Math.max(0, Math.min(SPAN, k));
}

export function judge(value: number, answer: number): Verdict {
  const off = Math.abs(value - answer);
  return off === 0 ? 'bullseye' : off <= CLOSE ? 'close' : 'miss';
}

/**
 * A run's gates: facts the pilot finds hard (the usual weighting), no answer
 * twice, no × 1 (where the ruler would be all the help), each fact shown
 * either way round, and its answer somewhere along its ruler.
 */
export function buildGates(progress: Progress, mission: PilotMission, rand: () => number = Math.random, count = GATE_COUNT): Gate[] {
  const used = new Set<number>();
  let last: string | undefined;
  return gateDistances(count).map((d) => {
    let fact = pickFact(mission, progress, last, rand);
    for (let tries = 0; tries < 40 && (used.has(fact.answer) || (missionOfKey(fact.key) === 'mul' && Math.min(fact.a, fact.b) < 2)); tries++) {
      fact = pickFact(mission, progress, last, rand);
    }
    used.add(fact.answer);
    last = fact.key;
    const { x, y } = randomizeOrder(fact);
    return { d, factKey: fact.key, op: missionOfKey(fact.key), x, y, answer: fact.answer, lo: windowFor(fact.answer, rand) };
  });
}

/** room either end of a ruler, to the canyon's walls at a gate */
export const RULER_ROOM = GATE_HALF - RULER;
