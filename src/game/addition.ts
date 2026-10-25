import type { Fact, FactStat } from './types';
import { isMastered, pickNextFact } from './facts';
import { pairKey } from './mission';

// The addition mission climbs three stages, moving up on mastery (checked
// at each launch, see useGameStore): sums within 10, sums within 20 (the
// "crossing ten" facts, 8 + 5), then two-digit sums within 100. Stages 1-2
// are a fixed table, like the times table, so every fact is tracked. Stage
// 3 has thousands of pairs, so it tracks *kinds* of problem instead (with
// or without carrying) and makes up a fresh problem of the kind picked.

export const ADD_STAGES = 3;
/** the biggest sum in each stage (1-based: STAGE_MAX_SUM[stage - 1]) */
export const STAGE_MAX_SUM = [10, 20, 100] as const;
/** share of a stage's questions that review the earlier stages */
export const REVIEW_SHARE = 0.2;
/** share of a stage that has to be mastered before the next one opens */
const READY_AT = 0.8;

/** stage 3's kinds, easiest first: ":c" means carrying (37 + 5, 37 + 45) */
export type AddKind = 'tens+tens' | '2d+1d' | '2d+2d' | '2d+1d:c' | '2d+2d:c';
export const ADD_KINDS: AddKind[] = ['tens+tens', '2d+1d', '2d+2d', '2d+1d:c', '2d+2d:c'];

export function isAddKind(key: string): key is AddKind {
  return (ADD_KINDS as string[]).includes(key);
}

export function clampStage(stage: number | undefined): 1 | 2 | 3 {
  return stage === 2 ? 2 : stage !== undefined && stage >= 3 ? 3 : 1;
}

const tableFact = (a: number, b: number): Fact => ({ a, b, key: pairKey('add', a, b), answer: a + b });

/** stage 1: the 25 sums within 10; stage 2: the 30 sums from 11 to 20 (both numbers 1-10) */
export function additionTable(stage: 1 | 2): Fact[] {
  const facts: Fact[] = [];
  for (let a = 1; a <= 10; a++) {
    for (let b = a; b <= 10; b++) {
      if (stage === 1 ? a + b <= 10 : a + b > 10) facts.push(tableFact(a, b));
    }
  }
  return facts;
}

/** which kind of two-digit sum a pair beyond the 1-10 table is */
export function kindOf(a: number, b: number): AddKind {
  const [lo, hi] = a <= b ? [a, b] : [b, a];
  if (lo < 10) return (hi % 10) + lo >= 10 ? '2d+1d:c' : '2d+1d';
  if (lo % 10 === 0 && hi % 10 === 0) return 'tens+tens';
  return (lo % 10) + (hi % 10) >= 10 ? '2d+2d:c' : '2d+2d';
}

/** where a pair's answers are tracked: the fact itself within the 1-10 table, its kind beyond it */
export function additionTrackKey(a: number, b: number): string {
  return a <= 10 && b <= 10 ? pairKey('add', a, b) : kindOf(a, b);
}

/** a fresh problem of a kind, smaller number first; every sum is within 100 */
export function makeProblem(kind: AddKind, rand: () => number = Math.random): [number, number] {
  const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
  switch (kind) {
    case 'tens+tens': {
      // 20 + 30 … 40 + 60 (never 10 + 10, which is in the table)
      const t1 = int(1, 8);
      const t2 = int(t1 === 1 ? 2 : 1, 10 - t1);
      return order(t1 * 10, t2 * 10);
    }
    case '2d+1d': {
      // 34 + 5: the ones still fit in one digit (from 11 + n, since 10 + n is in the table)
      const tens = int(1, 9);
      const ones = int(tens === 1 ? 1 : 0, 8);
      return order(tens * 10 + ones, int(1, 9 - ones));
    }
    case '2d+1d:c': {
      // 37 + 5 = 42: the ones carry into the tens (up to 95 + 5)
      const ones = int(1, 9);
      const tens = int(1, 9);
      const one = tens === 9 ? 10 - ones : int(10 - ones, 9);
      return order(tens * 10 + ones, one);
    }
    case '2d+2d': {
      // 34 + 25: tens with tens, ones with ones, nothing carries
      const ta = int(1, 8);
      const tb = int(1, 9 - ta);
      const oa = int(0, 9);
      const ob = int(oa === 0 ? 1 : 0, 9 - oa);
      return order(ta * 10 + oa, tb * 10 + ob);
    }
    case '2d+2d:c': {
      // 37 + 45 = 82: the ones carry (up to 100)
      const ta = int(1, 8);
      const tb = int(1, 9 - ta);
      const oa = int(1, 9);
      const ob = ta + tb === 9 ? 10 - oa : int(10 - oa, 9);
      return order(ta * 10 + oa, tb * 10 + ob);
    }
  }
}

function order(a: number, b: number): [number, number] {
  return a <= b ? [a, b] : [b, a];
}

const KIND_POOL: Fact[] = ADD_KINDS.map((key) => ({ a: 0, b: 0, key, answer: 0 }));

/**
 * The next addition question for a pilot at this stage, weighted by their
 * mastery (missed facts and kinds come back more). One in five reviews the
 * earlier stages, so nothing learned is forgotten.
 */
export function pickAdditionFact(stage: number, mastery: Record<string, FactStat>, avoidKey?: string, rand: () => number = Math.random): Fact {
  const s = clampStage(stage);
  const review = s > 1 && rand() < REVIEW_SHARE;
  if (review) {
    const earlier = s === 2 ? additionTable(1) : [...additionTable(1), ...additionTable(2)];
    return pickNextFact(earlier, mastery, avoidKey);
  }
  if (s !== 3) return pickNextFact(additionTable(s), mastery, avoidKey);
  const kind = pickNextFact(KIND_POOL, mastery, avoidKey).key as AddKind;
  const [a, b] = makeProblem(kind, rand);
  return { a, b, key: kind, answer: a + b };
}

/** the stage's facts (or, for stage 3, kinds) mastered, 0-1 */
export function stageMastery(stage: number, mastery: Record<string, FactStat>): number {
  const s = clampStage(stage);
  const keys = s === 3 ? ADD_KINDS : additionTable(s).map((f) => f.key);
  return keys.filter((k) => isMastered(mastery[k])).length / keys.length;
}

/** enough of this stage is mastered for the next one to open */
export function stageReady(stage: number, mastery: Record<string, FactStat>): boolean {
  return clampStage(stage) < ADD_STAGES && stageMastery(stage, mastery) >= READY_AT;
}

/** the stage a pilot's sums start at in a mission they switch to: as far on as the facts they already know (sharedFacts.ts) open */
export function stageFor(stage: number | undefined, mastery: Record<string, FactStat>): 1 | 2 | 3 {
  let s = clampStage(stage);
  while (stageReady(s, mastery)) s = clampStage(s + 1);
  return s;
}
