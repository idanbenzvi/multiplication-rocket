import type { Fact, Progress } from './types';
import { buildFactPool, pickNextFact, randomizeOrder } from './facts';
import { getLevelConfig } from './levels';
import { distractors } from './distractors';

// Bonus rounds take the place of every CHALLENGE_EVERY-th question (see
// wormhole.ts) and rotate, so a session sees all of them.
export type BonusKind = 'wormhole' | 'meteor' | 'constellation' | 'battle' | 'stranded';
export const BONUS_ROTATION: BonusKind[] = ['wormhole', 'meteor', 'constellation', 'battle', 'stranded'];

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
