import { describe, expect, it } from 'vitest';
import { stuckAfterMs, thinkSteps, type ThinkStep } from './thinkThrough';
import type { FactStat } from './types';

const mastered: FactStat = { attempts: 5, correct: 5, wrong: 0, dueScore: 0.2, last: '11111', box: 2, since: Number.MAX_SAFE_INTEGER - 1 };
const ids = (steps: ThinkStep[]) => steps.map((s) => s.id);
/** every number a step shows, its math and its picture's */
const shown = (steps: ThinkStep[]) =>
  steps.flatMap((s) => [
    ...('math' in s ? (s.math.match(/\d+/g) ?? []).map(Number) : []),
    ...('visual' in s && s.visual?.kind === 'hops' ? s.visual.values.filter((v): v is number => v !== null) : []),
  ]);

describe("the ship's computer, thinking a multiplication through", () => {
  it('shows what it means, counts in jumps, gives the shortcut and turns it around', () => {
    const steps = thinkSteps(3, 7, 'mul', {});
    expect(ids(steps)).toEqual(['meaningMul', 'skip', 'trick', 'swap']);
    expect(steps[0]).toMatchObject({ visual: { kind: 'groups', rows: 3, cols: 7 } });
  });

  it('counts by the bigger number, the fewer jumps, and leaves the last one to the child', () => {
    const skip = thinkSteps(3, 7, 'mul', {}).find((s) => s.id === 'skip');
    expect(skip).toMatchObject({ by: 7, jumps: 3, visual: { kind: 'hops', values: [7, 14, null] } });
  });

  it('builds on a fact the pilot has mastered, one group smaller', () => {
    const known = thinkSteps(6, 8, 'mul', { '6x7': mastered }).find((s) => s.id === 'known');
    expect(known).toMatchObject({ p: 6, q: 7, known: 42, add: 6, math: '6 × 7 = 42  →  42 + 6  →  ?' });
    // none when nothing nearby is known yet
    expect(ids(thinkSteps(6, 8, 'mul', {}))).not.toContain('known');
  });

  it('never gives the answer away', () => {
    for (let x = 2; x <= 10; x++) {
      for (let y = 2; y <= 10; y++) {
        const all: Record<string, FactStat> = {};
        for (let a = 1; a <= 10; a++) for (let b = a; b <= 10; b++) all[`${a}x${b}`] = mastered;
        expect(shown(thinkSteps(x, y, 'mul', all))).not.toContain(x * y);
      }
    }
  });

  it('has no jumps to count for ×1, nor anything to turn round for a square', () => {
    expect(ids(thinkSteps(1, 6, 'mul', {}))).toEqual(['meaningMul', 'trick', 'swap']);
    expect(ids(thinkSteps(4, 4, 'mul', {}))).toEqual(['meaningMul', 'skip', 'trick']);
  });
});

describe("the ship's computer, offering help", () => {
  it('waits a while past the pilot\'s own pace (7 s at least), and less for a fact they keep missing', () => {
    expect(stuckAfterMs(5000, false)).toBe(7500);
    expect(stuckAfterMs(2500, false)).toBe(7000);
    expect(stuckAfterMs(10000, false)).toBe(15000);
    expect(stuckAfterMs(10000, true)).toBe(3500);
  });
});

describe("the ship's computer, thinking a sum through", () => {
  it('puts small sums together as dots, and counts on from the bigger number', () => {
    const steps = thinkSteps(3, 8, 'add', {});
    expect(ids(steps)).toEqual(['meaningAdd', 'countOn', 'trick', 'swapAdd']);
    expect(steps[1]).toMatchObject({ big: 8, small: 3, visual: { values: [8, 9, 10, null] } });
  });

  it('shows two-digit sums as tens and ones', () => {
    expect(thinkSteps(37, 45, 'add', {})[0]).toMatchObject({ id: 'meaningTens', visual: { kind: 'tens', a: 37, b: 45 } });
    expect(ids(thinkSteps(37, 45, 'add', {}))).toEqual(['meaningTens', 'trick', 'swapAdd']);
  });

  it('never gives the answer away', () => {
    for (const [x, y] of [[3, 8], [8, 3], [7, 7], [9, 6], [34, 5], [37, 45], [1, 9]]) {
      expect(shown(thinkSteps(x, y, 'add', {}))).not.toContain(x + y);
    }
  });
});
