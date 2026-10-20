import { describe, expect, it } from 'vitest';
import { nextDueScore, recordAttempt } from './facts';

describe('recordAttempt', () => {
  it('starts a new fact from a fresh stat', () => {
    const m = recordAttempt({}, '3x4', true, 100);
    expect(m['3x4']).toEqual({ attempts: 1, correct: 1, wrong: 0, dueScore: nextDueScore(1, true), last: '1', box: 1, since: 100 });
  });

  it('adds to an existing stat without mutating the input', () => {
    const before = { '3x4': { attempts: 2, correct: 1, wrong: 1, dueScore: 4, last: '10', box: 0 } };
    const after = recordAttempt(before, '3x4', false, 100);
    expect(after['3x4']).toEqual({ attempts: 3, correct: 1, wrong: 2, dueScore: nextDueScore(4, false), last: '100', box: 0 });
    expect(before['3x4'].attempts).toBe(2);
  });
});
