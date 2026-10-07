import type { Fact, Progress } from './types';
import { buildFactPool, pickNextFact, randomizeOrder } from './facts';
import { getLevelConfig } from './levels';
import { distractors } from './distractors';

// Bonus rounds take the place of every CHALLENGE_EVERY-th question (see
// wormhole.ts) and rotate, so a session sees all of them.
export type BonusKind = 'wormhole' | 'meteor' | 'constellation' | 'battle' | 'stranded' | 'stardust';
export const BONUS_ROTATION: BonusKind[] = ['wormhole', 'meteor', 'constellation', 'battle', 'stranded', 'stardust'];

// ---------- Meteor Shower ----------

export const METEOR_DRILLS = 5;
export const METEORS_PER_DRILL = 5;

export interface MeteorDrill {
  factKey: string;
  x: number;
  y: number;
  answer: number;
  /** numbers on the falling meteors, one of them the answer */
  values: number[];
}

function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pool(progress: Progress) {
  const cfg = getLevelConfig(progress.level);
  return buildFactPool(cfg.factorRange[0], cfg.factorRange[1]);
}

/** Drills picked with the usual "facts you struggle with come back more" weighting. */
export function buildMeteorDrills(progress: Progress): MeteorDrill[] {
  const facts = pool(progress);
  const drills: MeteorDrill[] = [];
  let last: string | undefined;
  for (let i = 0; i < METEOR_DRILLS; i++) {
    const fact = pickNextFact(facts, progress.mastery, last);
    last = fact.key;
    const { x, y } = randomizeOrder(fact);
    drills.push({
      factKey: fact.key,
      x,
      y,
      answer: fact.product,
      values: shuffle([fact.product, ...distractors(x, y, METEORS_PER_DRILL - 1)]),
    });
  }
  return drills;
}

// ---------- Build-a-Constellation ----------

export const CONSTELLATION_TARGETS = 3;
/** the star grid: rows × columns (columns is the long side) */
export const GRID_ROWS = 6;
export const GRID_COLS = 10;

export interface ConstellationTarget {
  target: number;
  /** one rectangle that works, for the hint after repeated misses */
  hint: { rows: number; cols: number };
}

// A fact fits if it can be drawn as a rectangle of at least 2×2 inside the
// grid (1-wide "rectangles" are just lines, which misses the point).
function fits(f: Fact): boolean {
  return f.a >= 2 && f.a <= GRID_ROWS && f.b <= GRID_COLS;
}

export function buildConstellationTargets(progress: Progress): ConstellationTarget[] {
  const facts = pool(progress).filter(fits);
  const targets: ConstellationTarget[] = [];
  const used = new Set<number>();
  let last: string | undefined;
  for (let tries = 0; targets.length < CONSTELLATION_TARGETS && tries < 60; tries++) {
    const fact = pickNextFact(facts, progress.mastery, last);
    last = fact.key;
    if (used.has(fact.product)) continue;
    used.add(fact.product);
    targets.push({ target: fact.product, hint: { rows: fact.a, cols: fact.b } });
  }
  return targets;
}

// ---------- Fleet Battle ----------

export const MIN_CANNONS = 2;
export const MAX_CANNONS = 7;
export const MAX_BATTLE_TRIES = 3;

export interface Battle {
  factKey: string;
  /** cannons each ship carries (the ones the player collects) */
  cannons: number;
  /** the answer: how many ships are needed */
  ships: number;
  enemies: number;
}

// One factor becomes the cannons per ship (2-7, few enough to fly around and
// collect), the other the number of ships the child has to work out:
// cannons × ships = enemies.
export function buildBattle(progress: Progress): Battle {
  const facts = pool(progress).filter(
    (f) => (f.a >= MIN_CANNONS && f.a <= MAX_CANNONS && f.b >= 2) || (f.b >= MIN_CANNONS && f.b <= MAX_CANNONS && f.a >= 2),
  );
  const fact = pickNextFact(facts, progress.mastery);
  const aFits = fact.a >= MIN_CANNONS && fact.a <= MAX_CANNONS;
  const bFits = fact.b >= MIN_CANNONS && fact.b <= MAX_CANNONS;
  const cannonsIsA = aFits && bFits ? Math.random() < 0.5 : aFits;
  const cannons = cannonsIsA ? fact.a : fact.b;
  const ships = cannonsIsA ? fact.b : fact.a;
  return { factKey: fact.key, cannons, ships, enemies: cannons * ships };
}

// ---------- Stranded Fleet ----------

export const STRANDED_SHIPS = 5;
export const MAX_STRANDED_GUESSES = 3;

export interface Stranded {
  /** the fact the hidden number was picked through (for mastery) */
  factKey: string;
  /** the number every drill shares: [ ] × m = hidden × m */
  hidden: number;
  /** the other factor on each ship, in the order the ships arrive */
  multipliers: number[];
}

// The hidden number comes from a fact the child finds hard (the usual
// weighting), and that fact's other factor is always one of the drills.
export function buildStranded(progress: Progress): Stranded {
  const facts = pool(progress).filter((f) => f.a >= 2);
  const fact = pickNextFact(facts, progress.mastery);
  const [hidden, partner] = Math.random() < 0.5 ? [fact.a, fact.b] : [fact.b, fact.a];
  const others = shuffle([2, 3, 4, 5, 6, 7, 8, 9, 10].filter((m) => m !== partner)).slice(0, STRANDED_SHIPS - 1);
  return { factKey: fact.key, hidden, multipliers: shuffle([partner, ...others]) };
}

/** fuel bonus by how many ships were showing when guessed right: 1 → 3×, 5 → 1× */
export function strandedMultiplier(shipsShown: number): number {
  return 1 + (STRANDED_SHIPS - Math.max(1, Math.min(STRANDED_SHIPS, shipsShown))) * 0.5;
}

// ---------- Stardust Run ----------

export const STARDUST_MIN_JUMPS = 3;
export const STARDUST_MAX_JUMPS = 4;

export interface StardustStep {
  factKey: string;
  /** this stop's multiplier: the question is table × m */
  m: number;
  answer: number;
  /** four choices, smallest at the top */
  choices: number[];
}

export interface StardustRun {
  /** the times table being walked, 2-9 */
  table: number;
  /** the stop the ship starts on (already lit): table × startM */
  startM: number;
  steps: StardustStep[];
}

function factKeyOf(a: number, b: number): string {
  return a <= b ? `${a}x${b}` : `${b}x${a}`;
}

// The wrong choices are the slips a child skip-counting actually makes:
// jumping one stop too far, landing one or two off, adding the multiplier
// instead of the table, or slipping a ten. Choices are listed smallest
// first, so the answer's slot is picked at random (and the slips chosen to
// fit around it); otherwise "too far" slips would always put it near the top.
function stardustChoices(table: number, m: number): number[] {
  const answer = table * m;
  const prev = table * (m - 1);
  const slips = [table * (m + 1), answer + 1, answer - 1, answer + 2, answer - 2, prev + m, answer + 10, answer - 10, prev + 1];
  const unique = [...new Set(slips)].filter((v) => v > 0 && v !== answer);
  const below = shuffle(unique.filter((v) => v < answer));
  const above = shuffle(unique.filter((v) => v > answer));
  const slot = Math.min(below.length, Math.floor(Math.random() * 4));
  const picked = [...below.slice(0, slot), ...above.slice(0, 3 - slot)];
  // not enough slips on one side (tiny answers): pad with nearby numbers
  for (let d = 3; picked.length < 3; d++) {
    for (const v of [answer + d, answer - d]) if (v > 0 && picked.length < 3 && !picked.includes(v)) picked.push(v);
  }
  return [answer, ...picked].sort((a, b) => a - b);
}

// The table comes from a fact the child finds hard (the usual weighting), and
// the run of 3-4 jumps passes through that fact.
export function buildStardust(progress: Progress): StardustRun {
  const facts = pool(progress).filter((f) => (f.a >= 2 && f.a <= 9) || (f.b >= 2 && f.b <= 9));
  const fact = pickNextFact(facts, progress.mastery);
  const aOk = fact.a >= 2 && fact.a <= 9;
  const bOk = fact.b >= 2 && fact.b <= 9;
  const tableIsA = aOk && bOk ? Math.random() < 0.5 : aOk;
  const table = tableIsA ? fact.a : fact.b;
  const partner = tableIsA ? fact.b : fact.a;
  const jumps = STARDUST_MIN_JUMPS + Math.floor(Math.random() * (STARDUST_MAX_JUMPS - STARDUST_MIN_JUMPS + 1));
  // stops run startM+1 … startM+jumps, all within 2-10, including the partner when it can
  const lo = Math.max(1, partner - jumps);
  const hi = Math.min(10 - jumps, partner - 1);
  const startM = hi >= lo ? lo + Math.floor(Math.random() * (hi - lo + 1)) : 1 + Math.floor(Math.random() * (10 - jumps));
  const steps: StardustStep[] = [];
  for (let k = 1; k <= jumps; k++) {
    const m = startM + k;
    steps.push({ factKey: factKeyOf(table, m), m, answer: table * m, choices: stardustChoices(table, m) });
  }
  return { table, startM, steps };
}

/** a pattern worth remembering for each table (shown at the end of the run) */
export type TablePattern = 'evenEnds' | 'digits369' | 'ends50' | 'tenMinus' | 'digitSum9';
export function tablePattern(table: number): TablePattern {
  if (table === 5) return 'ends50';
  if (table === 9) return 'digitSum9';
  if (table === 3) return 'digits369';
  if (table === 7) return 'tenMinus';
  return 'evenEnds';
}
