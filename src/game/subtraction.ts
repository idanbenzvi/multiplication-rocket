import type { Fact, FactStat, Progress } from './types';
import { isMastered, pickNextFact } from './facts';
import { pairKey } from './mission';
import { clampStage, READY_AT, REVIEW_SHARE } from './addition';

// The subtraction mission climbs three stages, as addition does, moving up on
// mastery (checked at each launch, see useGameStore): differences within 10
// (9 − 4), back across ten from the teens (13 − 5, every answer 1-10), then
// within 100. Stages 1-2 are a fixed table: every fact is the other side of
// a sum in the addition table, (b + d) − b with b and d from 1 to 10, so the
// two stages together are a 10 × 10 grid, b by d (MasteryHeatmap). Stage 3
// tracks *kinds* of problem instead, with or without borrowing, and makes up
// a fresh problem of the kind picked. A difference is never below 1, and its
// key always has the bigger number first ("13-5"). The stage reached is
// Progress.subStage, apart from addition's (a +− pilot climbs both).

export const SUB_STAGES = 3;
/** the biggest number taken from in each stage (1-based: STAGE_MAX_FROM[stage - 1]) */
export const STAGE_MAX_FROM = [10, 20, 99] as const;

/** stage 3's kinds, easiest first: ":b" means borrowing (52 − 7, 52 − 27) */
export type SubKind = 'tens-tens' | '2d-1d' | '2d-2d' | '2d-1d:b' | '2d-2d:b';
export const SUB_KINDS: SubKind[] = ['tens-tens', '2d-1d', '2d-2d', '2d-1d:b', '2d-2d:b'];

export function isSubKind(key: string): key is SubKind {
  return (SUB_KINDS as string[]).includes(key);
}

/** a subtraction pilot's stage */
export function subStageOf(progress: Pick<Progress, 'subStage'>): 1 | 2 | 3 {
  return clampStage(progress.subStage);
}

const tableFact = (a: number, b: number): Fact => ({ a, b, key: pairKey('sub', a, b), answer: a - b });

/** whether a difference is in the table: both what's taken and what's left from 1 to 10 */
export function inSubTable(a: number, b: number): boolean {
  return b >= 1 && b <= 10 && a - b >= 1 && a - b <= 10;
}

/** stage 1: the 45 differences within 10; stage 2: the 55 from 11 to 20 back (what's taken and what's left, 1-10) */
export function subtractionTable(stage: 1 | 2): Fact[] {
  const facts: Fact[] = [];
  for (let b = 1; b <= 10; b++) {
    for (let d = 1; d <= 10; d++) {
      if (stage === 1 ? b + d <= 10 : b + d > 10) facts.push(tableFact(b + d, b));
    }
  }
  return facts;
}

/** which kind of two-digit difference a problem beyond the table is (a the bigger) */
export function subKindOf(a: number, b: number): SubKind {
  if (b < 10) return a % 10 < b ? '2d-1d:b' : '2d-1d';
  if (a % 10 === 0 && b % 10 === 0) return 'tens-tens';
  return a % 10 < b % 10 ? '2d-2d:b' : '2d-2d';
}

/** where a difference's answers are tracked: the fact itself within the table, its kind beyond it */
export function subtractionTrackKey(a: number, b: number): string {
  const [hi, lo] = a >= b ? [a, b] : [b, a];
  return inSubTable(hi, lo) ? pairKey('sub', hi, lo) : subKindOf(hi, lo);
}

/** a fresh problem of a kind, the bigger number first; never one in the table, never below 1 */
export function makeSubProblem(kind: SubKind, rand: () => number = Math.random): [number, number] {
  const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
  switch (kind) {
    case 'tens-tens': {
      // 70 − 30 (from 30 up: 20 − 10 is in the table)
      const t1 = int(3, 9);
      return [t1 * 10, int(1, t1 - 1) * 10];
    }
    case '2d-1d': {
      // 58 − 3: the ones are enough, nothing to borrow
      const ones = int(1, 9);
      return [int(2, 9) * 10 + ones, int(1, ones)];
    }
    case '2d-1d:b': {
      // 52 − 7 = 45: not enough ones, so a ten is broken into ones
      const ones = int(0, 8);
      return [int(2, 9) * 10 + ones, int(ones + 1, 9)];
    }
    case '2d-2d': {
      // 58 − 23: tens from tens, ones from ones
      const ta = int(2, 9);
      const oa = int(1, 9);
      return [ta * 10 + oa, int(1, ta - 1) * 10 + int(0, oa)];
    }
    case '2d-2d:b': {
      // 52 − 27 = 25: the ones borrow a ten
      const ta = int(2, 9);
      const oa = int(0, 8);
      return [ta * 10 + oa, int(1, ta - 1) * 10 + int(oa + 1, 9)];
    }
  }
}

const KIND_POOL: Fact[] = SUB_KINDS.map((key) => ({ a: 0, b: 0, key, answer: 0 }));

/**
 * The next subtraction question for a pilot at this stage, weighted by their
 * mastery (missed facts and kinds come back more). One in five reviews the
 * earlier stages, so nothing learned is forgotten.
 */
export function pickSubtractionFact(stage: number, mastery: Record<string, FactStat>, avoidKey?: string, rand: () => number = Math.random): Fact {
  const s = clampStage(stage);
  const review = s > 1 && rand() < REVIEW_SHARE;
  if (review) {
    const earlier = s === 2 ? subtractionTable(1) : [...subtractionTable(1), ...subtractionTable(2)];
    return pickNextFact(earlier, mastery, avoidKey);
  }
  if (s !== 3) return pickNextFact(subtractionTable(s), mastery, avoidKey);
  const kind = pickNextFact(KIND_POOL, mastery, avoidKey).key as SubKind;
  const [a, b] = makeSubProblem(kind, rand);
  return { a, b, key: kind, answer: a - b };
}

/** the stage's facts (or, for stage 3, kinds) mastered, 0-1 */
export function subStageMastery(stage: number, mastery: Record<string, FactStat>): number {
  const s = clampStage(stage);
  const keys = s === 3 ? SUB_KINDS : subtractionTable(s).map((f) => f.key);
  return keys.filter((k) => isMastered(mastery[k])).length / keys.length;
}

/** enough of this stage is mastered for the next one to open */
export function subStageReady(stage: number, mastery: Record<string, FactStat>): boolean {
  return clampStage(stage) < SUB_STAGES && subStageMastery(stage, mastery) >= READY_AT;
}

/** the stage a pilot's differences start at in a mission they switch to: as far on as the facts they already know open */
export function subStageFor(stage: number | undefined, mastery: Record<string, FactStat>): 1 | 2 | 3 {
  let s = clampStage(stage);
  while (subStageReady(s, mastery)) s = clampStage(s + 1);
  return s;
}
