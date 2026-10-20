import { describe, expect, it } from 'vitest';
import { dayNumber, factStatus, fadeDays, isDue, pickWeight, REVIEW_DAYS, review, TOP_BOX, upgradeMastery, DUE_WEIGHT, FADING_WEIGHT } from './memory';
import { pickNextFact, recordAttempt } from './facts';
import { masterySummary } from './masteryStats';
import { computeDashboard } from '../stats/metrics';
import type { FactStat } from './types';

/** a fact's stat after these answers ('1' right, '0' wrong), each on its day */
function answer(script: Array<[day: number, right: string]>, stat?: FactStat): FactStat {
  let m: Record<string, FactStat> = stat ? { k: stat } : {};
  for (const [day, answers] of script) for (const c of answers) m = recordAttempt(m, 'k', c === '1', day);
  return m.k;
}

const D = 20_000; // a day number to start from

describe('mastering a fact', () => {
  it('takes 4 of its last 5 answers right (and the latest one)', () => {
    expect(factStatus(answer([[D, '1']]), D)).toBe('mastered');
    expect(factStatus(answer([[D, '10']]), D)).toBe('practice');
    expect(factStatus(answer([[D, '0111']]), D)).toBe('practice'); // 3 of 4
    expect(factStatus(answer([[D, '01111']]), D)).toBe('mastered'); // 4 of 5
  });

  it('goes by the latest answers, not all of them: a fact once struggled with is green as soon as it is known', () => {
    const s = answer([[D, '000000011111']]);
    expect(s.correct / s.attempts).toBeLessThan(0.5);
    expect(factStatus(s, D)).toBe('mastered');
  });

  it('turns back to practice after two misses in its last five', () => {
    expect(factStatus(answer([[D, '1111100']]), D)).toBe('practice');
  });
});

describe('spaced checks', () => {
  it('moves up a box when remembered once its wait is over: 1 day, 3, a week, 2 weeks, a month…', () => {
    let s = answer([[D, '1']]);
    let day = D;
    for (let box = 1; box < TOP_BOX; box++) {
      expect(s.box).toBe(box);
      day += REVIEW_DAYS[box];
      s = answer([[day, '1']], s);
    }
    expect(s.box).toBe(TOP_BOX);
    expect(REVIEW_DAYS.slice(1)).toEqual([1, 3, 7, 14, 30, 60, 120]);
  });

  it('counts nothing practised before its wait is over (the same day, again and again)', () => {
    const s = answer([[D, '1111111111'], [D + 1, '1'], [D + 2, '11111']]);
    expect(s.box).toBe(2);
    expect(s.since).toBe(D + 1);
  });

  it('starts the checks over after a miss: from tomorrow after a slip, from scratch after more', () => {
    const settled = answer([[D, '1'], [D + 1, '1'], [D + 4, '1'], [D + 11, '1']]);
    expect(settled.box).toBe(4);
    const slip = answer([[D + 12, '0']], settled);
    expect(slip.box).toBe(1);
    expect(factStatus(slip, D + 12)).toBe('mastered'); // still 4 of 5
    expect(isDue(slip, D + 13)).toBe(true);
    expect(answer([[D + 12, '00']], settled).box).toBe(0);
  });

  it('fades when left twice its wait, and at least a week past it', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(fadeDays)).toEqual([8, 10, 14, 28, 60, 120, 240]);
    const s = answer([[D, '1']]);
    expect(factStatus(s, D + 7)).toBe('mastered');
    expect(factStatus(s, D + 8)).toBe('fading');
  });

  it('is mastered again, a box up, once a fading fact is remembered', () => {
    const s = answer([[D, '1'], [D + 30, '1']]);
    expect(s.box).toBe(2);
    expect(factStatus(s, D + 30)).toBe('mastered');
  });

  it('counts calendar days, so tomorrow starts at midnight', () => {
    const evening = new Date(2026, 9, 20, 23, 30).getTime();
    const morning = new Date(2026, 9, 21, 7, 0).getTime();
    expect(dayNumber(morning) - dayNumber(evening)).toBe(1);
  });
});

describe('asking', () => {
  it('brings a due check up, and a fading fact more', () => {
    const settled: FactStat = { ...answer([[D, '1111']]) }; // dueScore down near its floor
    expect(pickWeight(settled, D)).toBeLessThan(0.5);
    expect(pickWeight(settled, D + 1)).toBe(DUE_WEIGHT);
    expect(pickWeight(settled, D + 8)).toBe(FADING_WEIGHT);
    // a fact that's being missed keeps its own (higher) weight
    expect(pickWeight({ ...settled, dueScore: 6 }, D + 8)).toBe(6);
  });

  it('asks the due facts within a session', () => {
    const pool = Array.from({ length: 30 }, (_, i) => ({ a: 1, b: i, key: `f${i}`, answer: i }));
    const mastery: Record<string, FactStat> = {};
    // 25 facts checked yesterday (not due), 5 mastered a while ago and due now
    for (let i = 0; i < 30; i++) mastery[`f${i}`] = answer(i < 5 ? [[dayNumber() - 2, '1111']] : [[dayNumber() - 1, '1111'], [dayNumber(), '1']]);
    let due = 0;
    for (let i = 0; i < 1000; i++) if (Number(pickNextFact(pool, mastery).key.slice(1)) < 5) due++;
    expect(due / 1000).toBeGreaterThan(0.45);
  });
});

describe('counting', () => {
  it('counts fading facts apart from mastered ones', () => {
    const mastery = { '3x4': answer([[D, '1']]), '5x6': answer([[D + 6, '1']]), '7x8': answer([[D, '0']]) };
    expect(masterySummary(mastery, 'mul', D + 9)).toEqual({ mastered: 1, fading: 1, practice: 1, untried: 52 });
  });

  it('lists the fading facts for the parent dashboard, longest unchecked first', () => {
    const now = new Date(2026, 9, 20, 12).getTime();
    const day = dayNumber(now);
    const mastery = { '3x4': answer([[day - 9, '1']]), '6x7': answer([[day - 20, '1']]), '2x2': answer([[day, '1']]) };
    const dash = computeDashboard([], mastery, 7, now);
    expect(dash.fading).toBe(2);
    expect(dash.fadingFacts).toEqual([{ fact: '6x7', days: 20 }, { fact: '3x4', days: 9 }]);
  });
});

describe('upgrading progress saved before spaced review', () => {
  const at = (day: number) => (day * 86_400_000) + new Date(day * 86_400_000).getTimezoneOffset() * 60_000 + 12 * 3_600_000;

  it("replays each fact's answers from the answer log", () => {
    const old: Record<string, FactStat> = { '6x7': { attempts: 4, correct: 4, wrong: 0, dueScore: 0.2 } };
    const log = [D, D + 1, D + 4, D + 11].map((day) => ({ fact: '6x7', correct: true, at: at(day) }));
    const up = upgradeMastery(old, log, D + 12)['6x7'];
    expect(up).toMatchObject({ attempts: 4, correct: 4, box: 4, since: D + 11, last: '1111' });
  });

  it('finds a fact practised once, two weeks ago, fading', () => {
    const old: Record<string, FactStat> = { '3x8': { attempts: 3, correct: 3, wrong: 0, dueScore: 0.2 } };
    const log = [1, 2, 3].map((i) => ({ fact: '3x8', correct: true, at: at(D) + i }));
    expect(factStatus(upgradeMastery(old, log, D + 14)['3x8'], D + 14)).toBe('fading');
  });

  it('keeps the old verdict for a fact the log has nothing on, checked from today', () => {
    const old: Record<string, FactStat> = {
      '2x3': { attempts: 10, correct: 9, wrong: 1, dueScore: 0.2 },
      '7x9': { attempts: 10, correct: 5, wrong: 5, dueScore: 3 },
    };
    const up = upgradeMastery(old, [], D);
    expect(up['2x3']).toMatchObject({ box: 1, since: D });
    expect(factStatus(up['2x3'], D)).toBe('mastered');
    expect(up['7x9'].box).toBe(0);
    expect(factStatus(up['7x9'], D)).toBe('practice');
  });

  it('judges a fact the old way until it is upgraded', () => {
    expect(factStatus({ attempts: 5, correct: 4, wrong: 1, dueScore: 1 }, D)).toBe('mastered');
    expect(factStatus({ attempts: 5, correct: 3, wrong: 2, dueScore: 1 }, D)).toBe('practice');
    // and an answer to it carries on from that verdict
    expect(answer([[D, '1']], { attempts: 5, correct: 4, wrong: 1, dueScore: 1 }).box).toBe(1);
  });

  it('leaves facts already upgraded alone', () => {
    const fresh = answer([[D, '1']]);
    expect(upgradeMastery({ k: fresh }, [{ fact: 'k', correct: false, at: at(D) }], D).k).toBe(fresh);
  });
});

describe('review', () => {
  it('keeps just the last five answers', () => {
    let r = {};
    for (const c of '1101011') r = review(r, c === '1', D);
    expect(r).toMatchObject({ last: '01011' });
  });
});
