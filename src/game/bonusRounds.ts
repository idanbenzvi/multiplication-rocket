import type { Fact, Progress } from './types';
import { buildFactPool, pickNextFact, randomizeOrder } from './facts';
import { getLevelConfig } from './levels';
import { distractors } from './distractors';
import type { Mission } from './mission';
import { pickFact } from './questions';
import { additionTable, additionTrackKey, clampStage } from './addition';
import { pairKey } from './mission';

// Bonus rounds take the place of every CHALLENGE_EVERY-th question (see
// wormhole.ts) and rotate, so a session sees all of them. Every round has an
// addition version too: see each one below.
export type BonusKind = 'wormhole' | 'meteor' | 'constellation' | 'battle' | 'stranded' | 'stardust' | 'road';
export const BONUS_ROTATION: BonusKind[] = ['wormhole', 'meteor', 'constellation', 'battle', 'stranded', 'stardust', 'road'];

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
export function buildMeteorDrills(progress: Progress, mission: Mission = 'mul'): MeteorDrill[] {
  const drills: MeteorDrill[] = [];
  let last: string | undefined;
  for (let i = 0; i < METEOR_DRILLS; i++) {
    const fact = pickFact(mission, progress, last);
    last = fact.key;
    const { x, y } = randomizeOrder(fact);
    drills.push({
      factKey: fact.key,
      x,
      y,
      answer: fact.answer,
      values: shuffle([fact.answer, ...distractors(x, y, METEORS_PER_DRILL - 1, mission)]),
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
    if (used.has(fact.answer)) continue;
    used.add(fact.answer);
    targets.push({ target: fact.answer, hint: { rows: fact.a, cols: fact.b } });
  }
  return targets;
}

// ---------- Build-a-Constellation, addition: count on along a star chart ----------

export interface SumTarget {
  factKey: string;
  /** stars already lit (gold) */
  a: number;
  /** stars to count on from there */
  b: number;
}

/** the star chart: a ten-frame within 10, two side by side within 20, a hundred chart beyond */
export type StarChart = 'frame' | 'frames' | 'hundred';

export function starChartFor(maxSum: number): StarChart {
  return maxSum <= 10 ? 'frame' : maxSum <= 20 ? 'frames' : 'hundred';
}

// The usual weighting picks the sums; each is drawn as its first number
// already lit, and the child counts on to where the sum lands.
export function buildSumTargets(progress: Progress): SumTarget[] {
  const targets: SumTarget[] = [];
  const used = new Set<string>();
  let last: string | undefined;
  for (let tries = 0; targets.length < CONSTELLATION_TARGETS && tries < 60; tries++) {
    const fact = pickFact('add', progress, last);
    last = fact.key;
    const { x, y } = randomizeOrder(fact);
    if (used.has(`${x}+${y}`)) continue;
    used.add(`${x}+${y}`);
    targets.push({ factKey: fact.key, a: x, b: y });
  }
  return targets;
}

// ---------- Fleet Battle ----------

export const MIN_CANNONS = 2;
export const MAX_CANNONS = 7;
export const MAX_BATTLE_TRIES = 3;

export interface Battle {
  mission: Mission;
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
//
// Addition: the cannons collected (2-7) are what we have, and each ship
// brings one more: the child works out the missing part, cannons + ships =
// enemies (within 10 on the first stage, within 20 after that).
export function buildBattle(progress: Progress, mission: Mission = 'mul'): Battle {
  if (mission === 'add') {
    const fits = (n: number) => n >= MIN_CANNONS && n <= MAX_CANNONS;
    const table = additionTable(clampStage(progress.stage) === 1 ? 1 : 2).filter((f) => fits(f.a) || fits(f.b));
    const fact = pickNextFact(table, progress.mastery);
    const cannonsIsA = fits(fact.a) && fits(fact.b) ? Math.random() < 0.5 : fits(fact.a);
    const cannons = cannonsIsA ? fact.a : fact.b;
    const ships = cannonsIsA ? fact.b : fact.a;
    return { mission, factKey: fact.key, cannons, ships, enemies: cannons + ships };
  }
  const facts = pool(progress).filter(
    (f) => (f.a >= MIN_CANNONS && f.a <= MAX_CANNONS && f.b >= 2) || (f.b >= MIN_CANNONS && f.b <= MAX_CANNONS && f.a >= 2),
  );
  const fact = pickNextFact(facts, progress.mastery);
  const aFits = fact.a >= MIN_CANNONS && fact.a <= MAX_CANNONS;
  const bFits = fact.b >= MIN_CANNONS && fact.b <= MAX_CANNONS;
  const cannonsIsA = aFits && bFits ? Math.random() < 0.5 : aFits;
  const cannons = cannonsIsA ? fact.a : fact.b;
  const ships = cannonsIsA ? fact.b : fact.a;
  return { mission, factKey: fact.key, cannons, ships, enemies: cannons * ships };
}

// ---------- Stranded Fleet ----------

export const STRANDED_SHIPS = 5;
export const MAX_STRANDED_GUESSES = 3;

export interface Stranded {
  mission: Mission;
  /** the fact the hidden number was picked through (for mastery) */
  factKey: string;
  /** the number every drill shares: [ ] × m = hidden × m, or [ ] + m = hidden + m */
  hidden: number;
  /** the other number on each ship, in the order the ships arrive */
  others: number[];
}

// The hidden number comes from a fact the child finds hard (the usual
// weighting), and that fact's other factor is always one of the drills.
// Addition works the same way: [ ] + 4 = 11, [ ] + 9 = 16, …, with every sum
// within the pilot's stage (10, 20, or 100).
export function buildStranded(progress: Progress, mission: Mission = 'mul'): Stranded {
  if (mission === 'add') return buildAdditionStranded(progress);
  const facts = pool(progress).filter((f) => f.a >= 2);
  const fact = pickNextFact(facts, progress.mastery);
  const [hidden, partner] = Math.random() < 0.5 ? [fact.a, fact.b] : [fact.b, fact.a];
  const others = shuffle([2, 3, 4, 5, 6, 7, 8, 9, 10].filter((m) => m !== partner)).slice(0, STRANDED_SHIPS - 1);
  return { mission, factKey: fact.key, hidden, others: shuffle([partner, ...others]) };
}

function buildAdditionStranded(progress: Progress): Stranded {
  const stage = clampStage(progress.stage);
  const maxSum = stage === 1 ? 10 : stage === 2 ? 20 : 100;
  // numbers that can go with the hidden one: up to 10 within the table, two-digit ones beyond
  const partnersFor = (hidden: number) => {
    const top = Math.min(stage === 3 ? 60 : 10, maxSum - hidden);
    return Array.from({ length: Math.max(0, top - 1) }, (_, i) => i + 2);
  };
  // a fact whose one number leaves room for four other ships
  for (let tries = 0; tries < 30; tries++) {
    const fact = pickFact('add', progress);
    const options = ([[fact.a, fact.b], [fact.b, fact.a]] as const).filter(([hidden]) => partnersFor(hidden).length >= STRANDED_SHIPS);
    if (options.length === 0) continue;
    const [hidden, partner] = options[Math.floor(Math.random() * options.length)];
    const others = shuffle(partnersFor(hidden).filter((m) => m !== partner)).slice(0, STRANDED_SHIPS - 1);
    return { mission: 'add', factKey: fact.key, hidden, others: shuffle([partner, ...others]) };
  }
  // nothing fitted (rare): a sum within 10 always does
  const hidden = 2 + Math.floor(Math.random() * 3);
  const others = shuffle(partnersFor(hidden)).slice(0, STRANDED_SHIPS);
  return { mission: 'add', factKey: `${Math.min(hidden, others[0])}+${Math.max(hidden, others[0])}`, hidden, others };
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
  /** multiplication: this stop's multiplier, the question is jump × m */
  m: number;
  answer: number;
  /** four choices, smallest at the top */
  choices: number[];
}

export interface StardustRun {
  mission: Mission;
  /** every jump's size: the times table being walked (2-9), or the number added each time */
  jump: number;
  /** multiplication: the stop the ship starts on (already lit) is jump × startM */
  startM: number;
  /** every stop's number, the starting one first: step k goes from values[k] to values[k + 1] */
  values: number[];
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
  return choicesAround(answer, [table * (m + 1), answer + 1, answer - 1, answer + 2, answer - 2, prev + m, answer + 10, answer - 10, prev + 1]);
}

function choicesAround(answer: number, slips: number[]): number[] {
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
export function buildStardust(progress: Progress, mission: Mission = 'mul'): StardustRun {
  if (mission === 'add') return buildAdditionStardust(clampStage(progress.stage));
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
  const values = Array.from({ length: jumps + 1 }, (_, k) => table * (startM + k));
  return { mission: 'mul', jump: table, startM, values, steps };
}

// Addition: jumps of the same size along the stream. Within 10, hops of 2
// or 3; within 20, hops of 3-6 that cross the ten; beyond, hops of 10 or
// 20, or of 9 and 11 (a ten, then one back or one more).
const ADD_JUMPS: Record<1 | 2 | 3, number[]> = { 1: [2, 3], 2: [3, 4, 5, 6], 3: [10, 10, 20, 9, 11] };
const ADD_MAX: Record<1 | 2 | 3, number> = { 1: 10, 2: 20, 3: 100 };

export function buildAdditionStardust(stage: number): StardustRun {
  const s = clampStage(stage);
  const jump = ADD_JUMPS[s][Math.floor(Math.random() * ADD_JUMPS[s].length)];
  // as many jumps (3-4) as fit, starting low enough for all of them
  const jumps = Math.max(2, Math.min(STARDUST_MAX_JUMPS, STARDUST_MIN_JUMPS + Math.floor(Math.random() * 2), Math.floor((ADD_MAX[s] - 1) / jump)));
  const lo = s === 3 ? 11 : 1;
  const hi = Math.max(lo, ADD_MAX[s] - jump * jumps);
  const start = lo + Math.floor(Math.random() * (hi - lo + 1));
  const values = Array.from({ length: jumps + 1 }, (_, k) => start + jump * k);
  const steps: StardustStep[] = values.slice(1).map((answer, k) => {
    const prev = values[k];
    // a ten slipped is a likely mistake only with two-digit numbers
    const tens = s === 3 ? [answer - 10, answer + 10] : [];
    const slips = [answer + jump, answer + 1, answer - 1, answer + 2, answer - 2, prev + 1, ...tens];
    return { factKey: additionTrackKey(prev, jump), m: 0, answer, choices: choicesAround(answer, slips) };
  });
  return { mission: 'add', jump, startM: 0, values, steps };
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

// ---------- Acceleration Road ----------

export const ROAD_JUMPS = 4;

export interface RoadStep {
  /** where the answer is tracked; null beyond the practised facts (16 × 2 isn't in the table) */
  factKey: string | null;
  answer: number;
  /** four choices, smallest first */
  choices: number[];
}

export interface RoadRun {
  mission: Mission;
  /** the number before each jump, then the last one: 2, 4, 8, 16, 32 (each answer doubles it) */
  values: number[];
  steps: RoadStep[];
}

// Doubling: four questions, each the last answer times 2 (or, on the
// addition mission, the last answer plus itself: a double). The road shows
// it too, since every jump is twice as long as the one before. Starts small
// for beginners: 1, 2, 4, 8 (to 16); later 2 or 4 (to 32 or 64).
export function buildRoad(progress: Progress, mission: Mission = 'mul'): RoadRun {
  const stage = clampStage(progress.stage);
  // addition below stage 3 doubles within 20: 1, 2, 4, 8, 16
  const start =
    mission === 'add'
      ? stage === 3
        ? (Math.random() < 0.5 ? 2 : 4)
        : 1
      : progress.level >= 4
        ? (Math.random() < 0.5 ? 2 : 4)
        : Math.random() < 0.5
          ? 1
          : 2;
  const values = Array.from({ length: ROAD_JUMPS + 1 }, (_, k) => start * 2 ** k);
  const steps = values.slice(0, -1).map((v): RoadStep => {
    const answer = v * 2;
    // only facts the main drill asks as well (a miss must be able to come back)
    const factKey = mission === 'add' ? (v <= 10 || stage === 3 ? additionTrackKey(v, v) : null) : v <= 10 ? pairKey('mul', v, 2) : null;
    // the slips: adding 2 (or 1) instead of doubling, tripling, a count off, a ten off
    const slips = [v + 2, v + 1, v * 3, answer + 1, answer - 1, answer + 2, answer - 2, ...(answer >= 20 ? [answer + 10, answer - 10] : [])];
    return { factKey, answer, choices: choicesAround(answer, slips) };
  });
  return { mission, values, steps };
}
