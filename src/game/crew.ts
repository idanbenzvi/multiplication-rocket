import type { Fact, FactStat } from './types';
import { buildFactPool, pickNextFact } from './facts';
import { MAX_SPEED_FACTOR, MIN_SPEED_FACTOR, speedFactor } from './scoring';

// Crew Flight: two pilots fly one rocket on one device, taking turns. Each
// sits in a seat: the Pilot gets the usual timed drills, the Navigator (a
// younger child) picture questions about equal groups from a small pool.
// Both pour fuel into one shared tank, and every DOCK_EVERY-th turn is a
// Docking round they play together: each secretly picks one factor, and the
// two have to multiply to the station's number. See docs/plans/2026-10-08-crew-flight.md.

export type Seat = 'pilot' | 'navigator';

export const DOCK_EVERY = 4;
export const MAX_DOCK_TRIES = 3;

// ---------- question pools ----------

const NAVIGATOR_START_MAX = 5;
const NAVIGATOR_CAP_MAX = 7;
/** share of the navigator's pool that has to be mastered before it widens */
const WIDEN_AT = 0.8;

function isMastered(stat: FactStat | undefined): boolean {
  return !!stat && stat.attempts > 0 && stat.correct / stat.attempts >= 0.8;
}

/** the navigator's biggest factor: 5, widening a step at a time (to 7) as they master it */
export function navigatorMax(mastery: Record<string, FactStat>): number {
  let max = NAVIGATOR_START_MAX;
  while (max < NAVIGATOR_CAP_MAX) {
    const pool = buildFactPool(1, max);
    const done = pool.filter((f) => isMastered(mastery[f.key])).length;
    if (done / pool.length < WIDEN_AT) break;
    max++;
  }
  return max;
}

export function poolFor(seat: Seat, mastery: Record<string, FactStat>): Fact[] {
  return seat === 'pilot' ? buildFactPool(1, 10) : buildFactPool(1, navigatorMax(mastery));
}

/** seats for two pilots by their solo levels: the one further along flies */
export function suggestSeats(levelA: number, levelB: number): [Seat, Seat] {
  if (levelA === levelB) return ['pilot', 'pilot'];
  return levelA > levelB ? ['pilot', 'navigator'] : ['navigator', 'pilot'];
}

// ---------- the shared tank ----------

/** roughly how many average correct answers fill the tank at this crew level */
export function turnsToLaunch(crewLevel: number): number {
  return Math.min(16, 6 + (crewLevel - 1));
}

const AVERAGE_SPEED_FACTOR = (MAX_SPEED_FACTOR + MIN_SPEED_FACTOR) / 2;

// The pilot's fuel follows the usual speed curve, normalized so an
// average-speed answer is worth one share. A navigator's answer (untimed:
// counting groups takes the time it takes) is always worth exactly one share,
// so the younger child's part of the launch is as big as the older one's.
export function fuelPerAnswer(seat: Seat, crewLevel: number, elapsedMs: number): number {
  const share = 100 / turnsToLaunch(crewLevel);
  return seat === 'pilot' ? (share * speedFactor(elapsedMs)) / AVERAGE_SPEED_FACTOR : share;
}

// ---------- navigator questions ----------

/** running totals while counting the groups: 3 groups of 4 → 4, 8, 12 */
export function skipCounts(groups: number, size: number): number[] {
  return Array.from({ length: groups }, (_, i) => (i + 1) * size);
}

function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// The answer plus the slips a child counting groups makes: one group too
// many or too few, and miscounting by one or two.
export function navigatorChoices(groups: number, size: number): number[] {
  const answer = groups * size;
  const slips = shuffle([...new Set([answer + size, answer - size, answer + 1, answer - 1, answer + 2])]).filter(
    (v) => v > 0 && v !== answer,
  );
  const picked = slips.slice(0, 3);
  for (let d = 2; picked.length < 3; d++) {
    for (const v of [answer + d, answer - d]) if (v > 0 && picked.length < 3 && !picked.includes(v)) picked.push(v);
  }
  return shuffle([answer, ...picked]);
}

// ---------- docking ----------

export interface Docking {
  target: number;
  /** every way to make it within 1-10, smaller factor first */
  pairs: Array<[number, number]>;
}

export function factorPairs(n: number): Array<[number, number]> {
  const pairs: Array<[number, number]> = [];
  for (let a = 1; a <= 10; a++) {
    const b = n / a;
    if (Number.isInteger(b) && b >= a && b <= 10) pairs.push([a, b]);
  }
  return pairs;
}

// Targets above 10 (so "1 × n" never works and both children have to
// think) with at least two factor pairs (so there's something to agree on).
// With a navigator aboard, some pair has a factor of 5 or less: a part the
// younger child can find.
export function buildDocking(mastery: Record<string, FactStat>, withNavigator: boolean): Docking {
  const candidates = buildFactPool(1, 10).filter((f) => {
    if (f.product <= 10) return false;
    const pairs = factorPairs(f.product);
    return pairs.length >= 2 && (!withNavigator || pairs.some(([a]) => a <= 5));
  });
  const fact = pickNextFact(candidates, mastery);
  return { target: fact.product, pairs: factorPairs(fact.product) };
}

export type DockResult = 'dock' | 'over' | 'under';

export function checkDock(a: number, b: number, target: number): DockResult {
  const p = a * b;
  return p === target ? 'dock' : p > target ? 'over' : 'under';
}

/** fuel multiplier (in answer shares) for docking on try 1, 2 or 3 */
export function dockMultiplier(tryNumber: number): number {
  return Math.max(1, MAX_DOCK_TRIES + 1 - tryNumber);
}

// ---------- persistence ----------

/** one saved crew level per pair of pilots, whichever seat each is in */
export function crewKey(idA: string, idB: string): string {
  return [idA, idB].sort().join('+');
}
