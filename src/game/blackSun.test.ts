import { describe, expect, it } from 'vitest';
import {
  answerBoss,
  bossLife,
  bossProgress,
  bossReady,
  CHECKPOINT_EVERY,
  dodgeFireball,
  fireballFlightMs,
  newFight,
  nextBossQuestion,
  RETRY_AFTER,
  RUN_TO_WIN,
  type BossFight,
  type BossQuestion,
} from './blackSun';
import type { FactStat } from './types';
import { isAddKind } from './addition';
import { ADMIRAL_BADGE, ADMIRAL_RANK, RANK_THRESHOLDS, rankOf } from './achievements';

const q = (key: string, retry = false): BossQuestion => {
  const [a, b] = key.split(/[x+]/).map(Number);
  return { key, track: key, x: a, y: b, answer: key.includes('+') ? a + b : a * b, retry };
};

/** `n` right answers in a row, each to a different fact */
function rights(fight: BossFight, n: number): BossFight {
  for (let i = 0; i < n; i++) fight = answerBoss(fight, q(`${2 + (i % 8)}x${2 + Math.floor(i / 8)}`), true).fight;
  return fight;
}

const all = (stat: FactStat) => {
  const m: Record<string, FactStat> = {};
  for (let a = 1; a <= 10; a++) for (let b = a; b <= 10; b++) m[`${a}x${b}`] = stat;
  return m;
};
const good: FactStat = { attempts: 5, correct: 5, wrong: 0, dueScore: 0.3 };
const shaky: FactStat = { attempts: 5, correct: 3, wrong: 2, dueScore: 4 };

// a fixed sequence instead of Math.random
function seq(...values: number[]) {
  let i = 0;
  return () => values[i++ % values.length];
}

describe('the Black Sun: the run', () => {
  it('is cured by 15 right in a row, with checkpoints at 5 and 10', () => {
    let fight = newFight();
    const outcomes: string[] = [];
    for (let i = 0; i < RUN_TO_WIN; i++) {
      const r = answerBoss(fight, q(`3x${i}`), true);
      fight = r.fight;
      outcomes.push(r.outcome);
    }
    expect(outcomes.filter((o) => o === 'checkpoint')).toHaveLength(2);
    expect(outcomes[CHECKPOINT_EVERY - 1]).toBe('checkpoint');
    expect(outcomes[2 * CHECKPOINT_EVERY - 1]).toBe('checkpoint');
    expect(outcomes[RUN_TO_WIN - 1]).toBe('won');
    expect(bossLife(fight)).toBe(0);
    expect(fight.bestRun).toBe(RUN_TO_WIN);
  });

  it('loses each right answer off its life', () => {
    expect(bossLife(newFight())).toBe(RUN_TO_WIN);
    expect(bossLife(rights(newFight(), 4))).toBe(RUN_TO_WIN - 4);
  });

  it('swallows the whole run on a miss before the first checkpoint, and gets that life back', () => {
    const before = rights(newFight(), 4);
    const { fight, outcome, gained } = answerBoss(before, q('7x8'), false);
    expect(outcome).toBe('swallowed');
    expect(gained).toBe(4);
    expect(fight.run).toBe(0);
    expect(fight.fireball).toBe(false);
    expect(bossLife(fight)).toBe(RUN_TO_WIN);
  });

  it('throws a fireball at a miss after a checkpoint, and the run waits on the dodge', () => {
    const before = rights(newFight(), 7);
    const { fight, outcome, gained } = answerBoss(before, q('7x8'), false);
    expect(outcome).toBe('fireball');
    expect(gained).toBe(0);
    expect(fight.run).toBe(7);
    expect(fight.fireball).toBe(true);
    expect(fight.fireballs).toBe(1);
  });

  it('keeps the run when the fireball is dodged', () => {
    const thrown = answerBoss(rights(newFight(), 7), q('7x8'), false).fight;
    const { fight, gained } = dodgeFireball(thrown, true);
    expect(fight.run).toBe(7);
    expect(gained).toBe(0);
    expect(fight.dodged).toBe(1);
    expect(fight.fireball).toBe(false);
    // and the next right answer carries on from there
    expect(answerBoss(fight, q('3x4'), true).fight.run).toBe(8);
  });

  it('falls back to the last checkpoint when the fireball hits', () => {
    const thrown = answerBoss(rights(newFight(), 13), q('7x8'), false).fight;
    const { fight, gained } = dodgeFireball(thrown, false);
    expect(fight.run).toBe(10);
    expect(gained).toBe(3);
    expect(fight.burned).toBe(1);
    expect(fight.checkpoint).toBe(10);
  });

  it('does nothing when no fireball is on its way', () => {
    const fight = rights(newFight(), 6);
    expect(dodgeFireball(fight, false)).toEqual({ fight, gained: 0 });
  });

  it('throws faster fireballs as the fight goes on, but never too fast to dodge', () => {
    expect(fireballFlightMs(2)).toBeLessThan(fireballFlightMs(1));
    expect(fireballFlightMs(30)).toBeGreaterThanOrEqual(950);
  });
});

describe('the Black Sun: questions', () => {
  it('asks a missed fact again a couple of questions later, and drops it once it is right', () => {
    let fight = answerBoss(newFight(), q('7x8'), false).fight;
    for (let i = 0; i < RETRY_AFTER; i++) {
      const next = nextBossQuestion(fight, 'mul', all(good), Math.random);
      expect(next.retry).toBe(false);
      fight = answerBoss(fight, next, true).fight;
    }
    const again = nextBossQuestion(fight, 'mul', all(good), Math.random);
    expect(again.retry).toBe(true);
    expect(again.key).toBe('7x8');
    expect(again.x * again.y).toBe(56);
    fight = answerBoss(fight, again, true).fight;
    expect(fight.retries).toHaveLength(0);
  });

  it('keeps a missed retry coming back', () => {
    let fight = answerBoss(newFight(), q('7x8'), false).fight;
    fight = { ...fight, answered: fight.answered + RETRY_AFTER };
    const again = nextBossQuestion(fight, 'mul', all(good), Math.random);
    fight = answerBoss(fight, again, false).fight;
    expect(fight.retries).toEqual([{ key: '7x8', due: fight.answered + RETRY_AFTER }]);
  });

  it('never asks ×1, and nothing asked lately', () => {
    let fight = newFight();
    for (let i = 0; i < 200; i++) {
      const next = nextBossQuestion(fight, 'mul', all(good));
      expect(Math.min(next.x, next.y)).toBeGreaterThanOrEqual(2);
      expect(fight.recent).not.toContain(next.key);
      fight = answerBoss(fight, next, true).fight;
      if (fight.run >= RUN_TO_WIN) fight = { ...fight, run: 0 };
    }
  });

  it('asks only from 3 to 9 in the last stretch', () => {
    const fight = rights(newFight(), RUN_TO_WIN - CHECKPOINT_EVERY);
    for (let i = 0; i < 100; i++) {
      const next = nextBossQuestion({ ...fight, recent: [] }, 'mul', all(good));
      expect(Math.min(next.x, next.y)).toBeGreaterThanOrEqual(3);
      expect(Math.max(next.x, next.y)).toBeLessThanOrEqual(9);
    }
  });

  it("brings up the pilot's weakest facts the most", () => {
    const mastery = { ...all(good), '6x7': { ...shaky, dueScore: 12 } };
    let hits = 0;
    for (let i = 0; i < 400; i++) if (nextBossQuestion(newFight(), 'mul', mastery).key === '6x7') hits++;
    // far more than its share of 45 facts
    expect(hits).toBeGreaterThan(400 / 45 * 3);
  });

  it('shows either order of the same fact', () => {
    const a = nextBossQuestion(newFight(), 'mul', all(good), seq(0.1, 0.5));
    const b = nextBossQuestion(newFight(), 'mul', all(good), seq(0.9, 0.5));
    expect(a.key).toBe(b.key);
    expect([a.x, a.y]).toEqual([b.y, b.x]);
  });

  it('asks sums on the addition mission, tracked like the rest of the mission', () => {
    for (let i = 0; i < 50; i++) {
      const next = nextBossQuestion(newFight(), 'add', {});
      expect(next.key).toContain('+');
      expect(next.answer).toBe(next.x + next.y);
      expect(next.answer).toBeLessThanOrEqual(100);
      // a two-digit sum by its kind, one within the table by itself
      expect(next.x > 10 || next.y > 10 ? isAddKind(next.track) : next.track === next.key).toBe(true);
    }
  });
});

describe('the Black Sun: who may face it', () => {
  it('waits until every fact is mastered', () => {
    expect(bossReady(all(good), 'mul')).toBe(true);
    expect(bossProgress(all(good), 'mul')).toEqual({ have: 55, need: 55 });
    const one = { ...all(good), '7x8': shaky };
    expect(bossReady(one, 'mul')).toBe(false);
    expect(bossProgress(one, 'mul')).toEqual({ have: 54, need: 55 });
    const untried = all(good);
    delete untried['1x1'];
    expect(bossReady(untried, 'mul')).toBe(false);
  });

  it('counts the addition mission by its own facts', () => {
    expect(bossProgress({}, 'add')).toEqual({ have: 0, need: 60 });
    expect(bossReady(all(good), 'add')).toBe(false);
  });
});

describe('the Black Sun: Space Admiral', () => {
  const earned = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`badge${i}`, 1]));

  it('is the rank above Honored Captain, which no number of badges reaches', () => {
    expect(rankOf(earned(100))).toBe(RANK_THRESHOLDS.length - 1);
    expect(ADMIRAL_RANK).toBe(RANK_THRESHOLDS.length);
  });

  it('comes with curing it, from any rank', () => {
    expect(rankOf({ [ADMIRAL_BADGE]: 1 })).toBe(ADMIRAL_RANK);
    expect(rankOf({ ...earned(12), [ADMIRAL_BADGE]: 1 })).toBe(ADMIRAL_RANK);
  });
});
