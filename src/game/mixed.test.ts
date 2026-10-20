import { describe, expect, it } from 'vitest';
import { covers, missionOfKey, opsOf, pickOp } from './mission';
import { pickFact } from './questions';
import { masterySummary } from './masteryStats';
import { bossProgress, newFight, nextBossQuestion } from './blackSun';
import type { Progress } from './types';

const progress = (stage = 1): Progress => ({ version: 1, level: 3, fuel: 0, currentStreak: 0, bestStreak: 0, totalCorrectAnswers: 0, launchesCompleted: 0, mastery: {}, stage });

describe('the mixed mission', () => {
  it('practises both operations, and each one-operation mission just its own', () => {
    expect(opsOf('mix')).toEqual(['mul', 'add']);
    expect(opsOf('add')).toEqual(['add']);
    expect(covers('mix', '7x8') && covers('mix', '3+4') && covers('mix', '2d+1d:c')).toBe(true);
    expect(covers('mul', '3+4')).toBe(false);
    expect(covers('add', '7x8')).toBe(false);
  });

  it('picks × or + at random for each question or round, and never for the others', () => {
    const ops = new Set(Array.from({ length: 200 }, () => pickOp('mix')));
    expect(ops).toEqual(new Set(['mul', 'add']));
    expect(pickOp('mul', () => 0.9)).toBe('mul');
    expect(pickOp('add', () => 0.1)).toBe('add');
  });

  it('asks about half of each, sums at its own addition stage', () => {
    const facts = Array.from({ length: 400 }, () => pickFact('mix', progress(1)));
    const sums = facts.filter((f) => missionOfKey(f.key) === 'add');
    expect(sums.length).toBeGreaterThan(140);
    expect(sums.length).toBeLessThan(260);
    // stage 1: sums within 10 (the odd review is none: stage 1 has nothing before it)
    for (const f of sums) expect(f.answer).toBeLessThanOrEqual(10);
    for (const f of facts.filter((f) => missionOfKey(f.key) === 'mul')) expect(f.answer).toBe(f.a * f.b);
  });

  it('keeps one map with both kinds of fact in it', () => {
    expect(masterySummary({}, 'mix')).toEqual({ mastered: 0, practice: 0, untried: 115 });
    expect(masterySummary({}, 'mul').untried).toBe(55);
    expect(masterySummary({}, 'add').untried).toBe(60);
  });

  it('faces the Black Sun once all 115 are mastered, with both kinds of question', () => {
    expect(bossProgress({}, 'mix')).toEqual({ have: 0, need: 115 });
    const ops = new Set(Array.from({ length: 100 }, () => missionOfKey(nextBossQuestion(newFight(), 'mix', {}).key)));
    expect(ops).toEqual(new Set(['mul', 'add']));
  });
});
