import type { FactStat } from './types';
import { masterySummary } from './masteryStats';
import { pairKey, parsePair, type Mission } from './mission';
import { additionTrackKey, pickAdditionFact } from './addition';

// The Black Sun: the final boss, for a pilot who has mastered every fact of
// their mission (see docs/plans/2026-10-19-black-sun.md). The monster sun
// has become a black hole that swallows numbers. Answering 15 in a row cures
// it, and its life is what's left of those 15. Every 5 in a row is a
// checkpoint: before the first one a miss swallows the whole run (the sun
// gets all its life back), but after one, a miss makes it throw a fireball
// at the ship instead. Dodge it and the run carries on; get hit and the run
// falls back to the last checkpoint. A missed fact always comes back a few
// questions later, so a run can't get past one it doesn't know.

/** right answers in a row that cure it */
export const RUN_TO_WIN = 15;
/** a checkpoint every this many in a row */
export const CHECKPOINT_EVERY = 5;
/** a missed fact is asked again after this many other questions */
export const RETRY_AFTER = 2;
/** a fact isn't asked again within this many questions (unless it was missed) */
const RECENT = 8;

export interface BossQuestion {
  /** the problem itself: "7x8", "37+45" */
  key: string;
  /** what its answers are tracked under (a two-digit sum by its kind) */
  track: string;
  /** in the order shown */
  x: number;
  y: number;
  answer: number;
  /** missed earlier in this fight, and back again */
  retry: boolean;
}

export interface BossFight {
  /** right answers in a row (a dodged fireball keeps it going) */
  run: number;
  /** the last checkpoint reached: 0, 5 or 10 */
  checkpoint: number;
  /** questions answered so far */
  answered: number;
  misses: number;
  /** fireballs thrown, dodged, and taken */
  fireballs: number;
  dodged: number;
  burned: number;
  bestRun: number;
  /** missed problems, asked again once `answered` reaches `due` */
  retries: Array<{ key: string; due: number }>;
  /** the problems asked lately, newest last */
  recent: string[];
  /** a fireball is on its way: the run waits on the dodge */
  fireball: boolean;
}

/**
 * What an answer did: hit the sun, reached a checkpoint, cured it (won), or
 * missed, which before the first checkpoint lets the sun swallow the run,
 * and after it makes the sun throw a fireball.
 */
export type BossOutcome = 'hit' | 'checkpoint' | 'won' | 'swallowed' | 'fireball';

export function newFight(): BossFight {
  return { run: 0, checkpoint: 0, answered: 0, misses: 0, fireballs: 0, dodged: 0, burned: 0, bestRun: 0, retries: [], recent: [], fireball: false };
}

/** the Black Sun's life: the right answers in a row still to go */
export function bossLife(fight: BossFight): number {
  return RUN_TO_WIN - fight.run;
}

/** `gained`: life the sun got back */
export function answerBoss(fight: BossFight, q: BossQuestion, correct: boolean): { fight: BossFight; outcome: BossOutcome; gained: number } {
  const answered = fight.answered + 1;
  const recent = [...fight.recent, q.key].slice(-RECENT);
  // a retry that's answered goes; a missed problem (again) comes back later
  const retries = fight.retries.filter((r) => r.key !== q.key);
  if (correct) {
    const run = fight.run + 1;
    const next = { ...fight, answered, recent, retries, run, bestRun: Math.max(fight.bestRun, run) };
    if (run >= RUN_TO_WIN) return { fight: next, outcome: 'won', gained: 0 };
    if (run % CHECKPOINT_EVERY === 0) return { fight: { ...next, checkpoint: run }, outcome: 'checkpoint', gained: 0 };
    return { fight: next, outcome: 'hit', gained: 0 };
  }
  const missed = { ...fight, answered, recent, retries: [...retries, { key: q.key, due: answered + RETRY_AFTER }], misses: fight.misses + 1 };
  if (fight.checkpoint > 0) return { fight: { ...missed, fireball: true, fireballs: fight.fireballs + 1 }, outcome: 'fireball', gained: 0 };
  return { fight: { ...missed, run: 0 }, outcome: 'swallowed', gained: fight.run };
}

/** the fireball has passed (`dodged`) or hit the ship, which falls back to the last checkpoint */
export function dodgeFireball(fight: BossFight, dodged: boolean): { fight: BossFight; gained: number } {
  if (!fight.fireball) return { fight, gained: 0 };
  if (dodged) return { fight: { ...fight, fireball: false, dodged: fight.dodged + 1 }, gained: 0 };
  return { fight: { ...fight, fireball: false, burned: fight.burned + 1, run: fight.checkpoint }, gained: fight.run - fight.checkpoint };
}

/** how long the `n`th fireball of a fight (1-based) takes to reach the ship: a little less each time */
export function fireballFlightMs(n: number): number {
  return Math.max(950, 1750 - (Math.max(1, n) - 1) * 160);
}

/**
 * How hard a fact is for the boss's purposes: the tough middle of the table
 * comes up most, ×2 and ×10 least.
 */
function toughness(a: number, b: number): number {
  if (a === 10 || b === 10) return 0.35;
  if (a === 2 || b === 2) return 0.55;
  return 1 + (Math.min(a, b) >= 6 ? 1.2 : 0) + (a >= 6 && b >= 6 && a !== b ? 0.4 : 0);
}

/**
 * The next question: a missed problem that's due again first; otherwise, on
 * ×, a fact from 2 to 10 (the hardest the pilot finds come up most, and in
 * the last stretch of the run only from 3 to 9), not one asked lately; on +,
 * a sum from the whole mission, up to two-digit sums.
 */
export function nextBossQuestion(fight: BossFight, mission: Mission, mastery: Record<string, FactStat>, rand: () => number = Math.random): BossQuestion {
  const flip = rand() < 0.5;
  const shown = (key: string, a: number, b: number, answer: number, track: string, retry: boolean): BossQuestion => ({
    key,
    track,
    x: flip ? b : a,
    y: flip ? a : b,
    answer,
    retry,
  });

  const due = fight.retries.find((r) => r.due <= fight.answered);
  const pair = due && parsePair(due.key);
  if (pair) {
    const add = pair.mission === 'add';
    return shown(due.key, pair.a, pair.b, add ? pair.a + pair.b : pair.a * pair.b, add ? additionTrackKey(pair.a, pair.b) : due.key, true);
  }

  if (mission === 'add') {
    // (tries a few times for one not asked lately)
    let fact = pickAdditionFact(3, mastery, fight.recent[fight.recent.length - 1], rand);
    for (let i = 0; i < 6 && fight.recent.includes(pairKey('add', fact.a, fact.b)); i++) fact = pickAdditionFact(3, mastery, undefined, rand);
    return shown(pairKey('add', fact.a, fact.b), fact.a, fact.b, fact.a + fact.b, additionTrackKey(fact.a, fact.b), false);
  }

  const [lo, hi] = fight.run >= RUN_TO_WIN - CHECKPOINT_EVERY ? [3, 9] : [2, 10];
  const pool: Array<{ a: number; b: number; key: string; weight: number }> = [];
  for (let a = lo; a <= hi; a++) {
    for (let b = a; b <= hi; b++) {
      const key = pairKey('mul', a, b);
      if (fight.recent.includes(key)) continue;
      pool.push({ a, b, key, weight: Math.max(0.3, mastery[key]?.dueScore ?? 1) * toughness(a, b) });
    }
  }
  const total = pool.reduce((sum, f) => sum + f.weight, 0);
  let roll = rand() * total;
  const pick = pool.find((f) => (roll -= f.weight) <= 0) ?? pool[pool.length - 1];
  return shown(pick.key, pick.a, pick.b, pick.a * pick.b, pick.key, false);
}

/** how close a pilot is to facing it: their mission's facts mastered (4 right out of 5), out of all of them */
export function bossProgress(mastery: Record<string, FactStat>, mission: Mission): { have: number; need: number } {
  const { mastered, practice, untried } = masterySummary(mastery, mission);
  return { have: mastered, need: mastered + practice + untried };
}

export function bossReady(mastery: Record<string, FactStat>, mission: Mission): boolean {
  const { have, need } = bossProgress(mastery, mission);
  return have >= need;
}
