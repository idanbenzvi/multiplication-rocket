import { describe, expect, it } from 'vitest';
import type { FactStat } from './types';
import { FAST_MS, SLOW_MS } from './scoring';
import {
  buildDocking,
  checkDock,
  crewKey,
  dockMultiplier,
  factorPairs,
  fuelPerAnswer,
  navigatorChoices,
  navigatorMax,
  poolFor,
  skipCounts,
  suggestSeats,
  turnsToLaunch,
} from './crew';

const solid: FactStat = { attempts: 5, correct: 5, wrong: 0, dueScore: 0.2 };

function masteredUpTo(max: number): Record<string, FactStat> {
  const m: Record<string, FactStat> = {};
  for (let a = 1; a <= max; a++) for (let b = a; b <= max; b++) m[`${a}x${b}`] = solid;
  return m;
}

describe('navigator pool', () => {
  it('starts at factors up to 5', () => {
    expect(navigatorMax({})).toBe(5);
    const pool = poolFor('navigator', {});
    expect(Math.max(...pool.map((f) => f.b))).toBe(5);
  });

  it('widens one step once the current pool is mastered, capped at 7', () => {
    expect(navigatorMax(masteredUpTo(5))).toBe(6);
    expect(navigatorMax(masteredUpTo(6))).toBe(7);
    expect(navigatorMax(masteredUpTo(10))).toBe(7);
  });

  it('gives the pilot the full 1-10 pool', () => {
    expect(poolFor('pilot', {})).toHaveLength(55);
  });
});

describe('suggestSeats', () => {
  it('puts the higher-level pilot in the pilot seat', () => {
    expect(suggestSeats(4, 1)).toEqual(['pilot', 'navigator']);
    expect(suggestSeats(1, 4)).toEqual(['navigator', 'pilot']);
  });

  it('lets two equals both fly as pilots', () => {
    expect(suggestSeats(3, 3)).toEqual(['pilot', 'pilot']);
  });
});

describe('fuel', () => {
  it('fills the tank in about turnsToLaunch average answers', () => {
    expect(turnsToLaunch(1)).toBeGreaterThanOrEqual(6);
    expect(turnsToLaunch(5)).toBeGreaterThan(turnsToLaunch(1));
  });

  it("is fair: a navigator's answer is worth a pilot's average-speed answer", () => {
    const mid = (FAST_MS + SLOW_MS) / 2;
    expect(fuelPerAnswer('navigator', 2, 99_999)).toBeCloseTo(fuelPerAnswer('pilot', 2, mid));
  });

  it('still rewards a fast pilot more than a slow one', () => {
    expect(fuelPerAnswer('pilot', 1, 1000)).toBeGreaterThan(fuelPerAnswer('pilot', 1, 20_000));
  });
});

describe('docking', () => {
  it('lists factor pairs within 1-10, smaller first', () => {
    expect(factorPairs(24)).toEqual([
      [3, 8],
      [4, 6],
    ]);
    expect(factorPairs(64)).toEqual([[8, 8]]);
  });

  it('only picks targets above 10 with at least two pairs to agree on', () => {
    for (let i = 0; i < 200; i++) {
      const d = buildDocking({}, false);
      expect(d.target).toBeGreaterThan(10);
      expect(d.pairs.length).toBeGreaterThanOrEqual(2);
      expect(d.pairs).toEqual(factorPairs(d.target));
    }
  });

  it('with a navigator aboard, some pair always has a factor of 5 or less', () => {
    for (let i = 0; i < 200; i++) {
      const d = buildDocking({}, true);
      expect(d.pairs.some(([a]) => a <= 5)).toBe(true);
    }
  });

  it('checks a pick against the target', () => {
    expect(checkDock(4, 6, 24)).toBe('dock');
    expect(checkDock(6, 4, 24)).toBe('dock');
    expect(checkDock(5, 6, 24)).toBe('over');
    expect(checkDock(3, 7, 24)).toBe('under');
  });

  it('pays more for docking on an earlier try', () => {
    expect([1, 2, 3].map(dockMultiplier)).toEqual([3, 2, 1]);
  });
});

describe('navigator questions', () => {
  it('skip-counts the groups', () => {
    expect(skipCounts(3, 4)).toEqual([4, 8, 12]);
  });

  it('offers four different positive choices including the answer', () => {
    for (const [g, s] of [
      [1, 1],
      [1, 3],
      [3, 4],
      [5, 5],
      [7, 6],
    ]) {
      const c = navigatorChoices(g, s);
      expect(c).toHaveLength(4);
      expect(new Set(c).size).toBe(4);
      expect(c).toContain(g * s);
      expect(c.every((v) => v > 0)).toBe(true);
    }
  });
});

describe('crewKey', () => {
  it('is the same whichever order the pilots are in', () => {
    expect(crewKey('b', 'a')).toBe(crewKey('a', 'b'));
  });
});
