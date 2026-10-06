import type { Fact } from './types';
import { getLevelConfig } from './levels';

// The Asteroid Belt run: on levels whose destination is the Asteroid Belt, a
// full tank doesn't launch straight away — the ship enters the belt and must
// blast its way out. Each row of asteroids carries candidate answers; the
// drill sits in the prism at the ship's nose, and the player steers to the
// lane with the right answer and fires.

export const LANES = 4;
const ASTEROID_BELT_INDEX = 2; // position in the destination list (levels.ts)

export function isBeltLevel(level: number): boolean {
  return getLevelConfig(level).destinationIndex === ASTEROID_BELT_INDEX;
}

/** rows to clear to break out — a little longer each time the belt comes around */
export function clearsNeeded(level: number): number {
  return Math.min(10, 6 + (getLevelConfig(level).destinationSector - 1) * 2);
}

// Pacing: how long a row takes to reach the ship. Generous at first (a child
// has to work out the answer *and* steer), quicker with each consecutive
// clear, and eased back off after a mistake.
const BASE_MS = 9000;
const FASTEST_MS = 6000;
const PER_CLEAR_MS = 500;
const AFTER_MISS_MS = 2000;

export function rowDuration(consecutiveClears: number, missedThisRow: boolean): number {
  const d = Math.max(FASTEST_MS, BASE_MS - consecutiveClears * PER_CLEAR_MS);
  return missedThisRow ? d + AFTER_MISS_MS : d;
}

export interface Row {
  id: number;
  x: number;
  y: number;
  factKey: string;
  values: number[]; // one per lane
  correctLane: number;
}

function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Wrong answers a child would plausibly give: a neighboring fact (one factor
// off by one — the classic slip), and failing that, nearby numbers.
export function distractors(x: number, y: number, count: number): number[] {
  const answer = x * y;
  const near = new Set<number>();
  for (const [a, b] of [
    [x + 1, y],
    [x - 1, y],
    [x, y + 1],
    [x, y - 1],
    [x + 1, y - 1],
    [x - 1, y + 1],
  ]) {
    const v = a * b;
    if (a >= 1 && b >= 1 && v !== answer && v > 0) near.add(v);
  }
  const picks = shuffle([...near]).slice(0, count);
  for (let d = 1; picks.length < count; d++) {
    for (const v of [answer + d, answer - d]) {
      if (picks.length < count && v > 0 && v !== answer && !picks.includes(v)) picks.push(v);
    }
  }
  return picks;
}

export function buildRow(id: number, fact: Fact): Row {
  const [x, y] = Math.random() < 0.5 ? [fact.a, fact.b] : [fact.b, fact.a];
  const values = shuffle([fact.product, ...distractors(x, y, LANES - 1)]);
  return { id, x, y, factKey: fact.key, values, correctLane: values.indexOf(fact.product) };
}
