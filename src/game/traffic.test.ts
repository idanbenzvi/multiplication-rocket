import { describe, expect, it } from 'vitest';
import type { Progress } from './types';
import { buildTraffic, TRAFFIC_DIRS, TRAFFIC_PASSES, trafficDecoys, trafficDirs } from './bonusRounds';
import { additionTrackKey, isAddKind } from './addition';
import { pairKey } from './mission';

const progress = (level: number, stage?: number): Progress => ({
  version: 1,
  level,
  fuel: 0,
  currentStreak: 0,
  bestStreak: 0,
  totalCorrectAnswers: 0,
  launchesCompleted: 0,
  mastery: {},
  stage,
});
const MAX_SUM: Record<number, number> = { 1: 10, 2: 20, 3: 100 };
const repeat = (n: number, fn: () => void) => Array.from({ length: n }).forEach(fn);

describe('Space Traffic: the ways round', () => {
  it('uses all four directions in a run, never the same twice in a row', () => {
    repeat(300, () => {
      const dirs = trafficDirs();
      expect(dirs).toHaveLength(TRAFFIC_PASSES);
      expect(new Set(dirs).size).toBe(TRAFFIC_DIRS.length);
      dirs.slice(1).forEach((d, i) => expect(d).not.toBe(dirs[i]));
    });
  });
});

describe('Space Traffic: decoy drills', () => {
  it('always finds three near misses, none of them making the number (every fact in the table)', () => {
    for (let x = 2; x <= 10; x++) {
      for (let y = 2; y <= 10; y++) {
        repeat(5, () => {
          const decoys = trafficDecoys('mul', x, y);
          const values = decoys.map(([a, b]) => a * b);
          expect(decoys).toHaveLength(3);
          expect(values).not.toContain(x * y);
          expect(new Set(values).size).toBe(3);
          decoys.flat().forEach((f) => expect(f >= 2 && f <= 10).toBe(true));
        });
      }
    }
  });

  it('works for every sum within 20, and keeps the numbers positive', () => {
    for (const stage of [1, 2]) {
      for (let x = 1; x <= 10; x++) {
        for (let y = 1; y <= 10; y++) {
          const decoys = trafficDecoys('add', x, y, stage);
          const values = decoys.map(([a, b]) => a + b);
          expect(decoys).toHaveLength(3);
          expect(values).not.toContain(x + y);
          expect(new Set(values).size).toBe(3);
          decoys.flat().forEach((n) => expect(n).toBeGreaterThanOrEqual(1));
        }
      }
    }
  });
});

describe('Space Traffic: a run', () => {
  const checkRun = (mission: 'mul' | 'add', p: Progress) => {
    const run = buildTraffic(p, mission);
    expect(run.mission).toBe(mission);
    expect(run.passes).toHaveLength(TRAFFIC_PASSES);
    expect(new Set(run.passes.map((s) => s.dir)).size).toBe(TRAFFIC_DIRS.length);
    for (const pass of run.passes) {
      const op = (a: number, b: number) => (mission === 'add' ? a + b : a * b);
      // one drill on each side; only the one on the way round makes the number
      TRAFFIC_DIRS.forEach((d) => expect(pass.drills[d].value).toBe(op(pass.drills[d].x, pass.drills[d].y)));
      const makers = TRAFFIC_DIRS.filter((d) => pass.drills[d].value === pass.number);
      expect(makers).toEqual([pass.dir]);
      expect(new Set(TRAFFIC_DIRS.map((d) => pass.drills[d].value)).size).toBe(4);
    }
    return run;
  };

  it('multiplication: tracked under the fact itself, no ×1, no number twice', () => {
    for (const level of [1, 4, 9]) {
      repeat(200, () => {
        const run = checkRun('mul', progress(level));
        expect(new Set(run.passes.map((s) => s.number)).size).toBe(TRAFFIC_PASSES);
        for (const pass of run.passes) {
          const { x, y } = pass.drills[pass.dir];
          expect(x).toBeGreaterThanOrEqual(2);
          expect(y).toBeGreaterThanOrEqual(2);
          expect(pass.factKey).toBe(pairKey('mul', x, y));
        }
      });
    }
  });

  it('addition: sums within the pilot stage, tracked like the main drill', () => {
    for (const stage of [1, 2, 3]) {
      repeat(200, () => {
        const run = checkRun('add', progress(3, stage));
        for (const pass of run.passes) {
          const { x, y } = pass.drills[pass.dir];
          expect(pass.number).toBeLessThanOrEqual(MAX_SUM[stage]);
          // within the 1-10 table the fact itself; beyond it, stage 3 tracks the kind of sum
          if (x <= 10 && y <= 10) expect(pass.factKey).toBe(additionTrackKey(x, y));
          else expect(isAddKind(pass.factKey)).toBe(true);
        }
      });
    }
  });
});
