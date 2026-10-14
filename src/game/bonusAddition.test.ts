import { describe, expect, it } from 'vitest';
import type { Progress } from './types';
import {
  buildRoad,
  ROAD_JUMPS,
  buildAdditionStardust,
  buildBattle,
  buildStardust,
  buildStranded,
  buildSumTargets,
  CONSTELLATION_TARGETS,
  MAX_CANNONS,
  MIN_CANNONS,
  STRANDED_SHIPS,
  starChartFor,
} from './bonusRounds';
import { additionTrackKey } from './addition';
import { buildSkyAddRounds, expectedAnswer, groupColumns, initialSkyState, skyReducer } from './splitSky';

const progress = (stage: number): Progress => ({
  version: 1,
  level: 3,
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

describe('addition Fleet Battle: the missing part', () => {
  it('has the cannons collected plus one per ship make the enemies', () => {
    for (const stage of [1, 2, 3]) {
      repeat(200, () => {
        const b = buildBattle(progress(stage), 'add');
        expect(b.mission).toBe('add');
        expect(b.cannons).toBeGreaterThanOrEqual(MIN_CANNONS);
        expect(b.cannons).toBeLessThanOrEqual(MAX_CANNONS);
        expect(b.ships).toBeGreaterThanOrEqual(1);
        expect(b.ships).toBeLessThanOrEqual(12);
        expect(b.enemies).toBe(b.cannons + b.ships);
        expect(b.enemies).toBeLessThanOrEqual(stage === 1 ? 10 : 20);
      });
    }
    expect(buildBattle(progress(1)).enemies % 1).toBe(0); // multiplication still builds
  });
});

describe('addition Stranded Fleet', () => {
  it('hides one number added to five different others, within the stage', () => {
    for (const stage of [1, 2, 3]) {
      repeat(200, () => {
        const r = buildStranded(progress(stage), 'add');
        expect(r.mission).toBe('add');
        expect(r.others).toHaveLength(STRANDED_SHIPS);
        expect(new Set(r.others).size).toBe(STRANDED_SHIPS);
        expect(r.hidden).toBeGreaterThan(0);
        expect(r.others.every((m) => m > 0 && r.hidden + m <= MAX_SUM[stage])).toBe(true);
      });
    }
  });
});

describe('addition Stardust Run', () => {
  it('jumps the same amount every time, within the stage', () => {
    for (const stage of [1, 2, 3]) {
      repeat(200, () => {
        const run = buildAdditionStardust(stage);
        expect(run.mission).toBe('add');
        expect(run.steps.length).toBeGreaterThanOrEqual(2);
        expect(run.values).toHaveLength(run.steps.length + 1);
        run.values.slice(1).forEach((v, k) => expect(v - run.values[k]).toBe(run.jump));
        expect(run.values[run.values.length - 1]).toBeLessThanOrEqual(MAX_SUM[stage]);
        if (stage === 3) expect(run.values[0]).toBeGreaterThanOrEqual(11);
        run.steps.forEach((s, k) => {
          expect(s.answer).toBe(run.values[k + 1]);
          expect(s.factKey).toBe(additionTrackKey(run.values[k], run.jump));
          expect(s.choices).toHaveLength(4);
          expect(new Set(s.choices).size).toBe(4);
          expect(s.choices).toContain(s.answer);
          expect(s.choices.every((c) => c > 0)).toBe(true);
        });
      });
    }
  });

  it('still walks a times table on the multiplication mission', () => {
    const run = buildStardust(progress(1));
    expect(run.mission).toBe('mul');
    run.values.forEach((v, k) => expect(v).toBe(run.jump * (run.startM + k)));
  });
});

describe('addition Constellation', () => {
  it('counts on from the first number, on a chart that fits the sums', () => {
    for (const stage of [1, 2, 3]) {
      repeat(50, () => {
        const targets = buildSumTargets(progress(stage));
        expect(targets).toHaveLength(CONSTELLATION_TARGETS);
        expect(new Set(targets.map((x) => `${x.a}+${x.b}`)).size).toBe(targets.length);
        expect(targets.every((x) => x.a >= 1 && x.b >= 1 && x.a + x.b <= MAX_SUM[stage])).toBe(true);
      });
    }
    expect(starChartFor(10)).toBe('frame');
    expect(starChartFor(11)).toBe('frames');
    expect(starChartFor(20)).toBe('frames');
    expect(starChartFor(21)).toBe('hundred');
  });
});

describe('addition Split Sky', () => {
  it('splits a sum into two groups, and the referee adds them', () => {
    for (const stage of [1, 2, 3]) {
      const rounds = buildSkyAddRounds({}, stage);
      expect(rounds.length).toBeGreaterThan(0);
      for (const r of rounds) {
        expect(r).toMatchObject({ rows: 1, mission: 'add' });
        expect(r.cols.left).toBeGreaterThanOrEqual(2);
        expect(r.cols.right).toBeGreaterThanOrEqual(2);
        expect(r.cols.left + r.cols.right).toBeLessThanOrEqual(MAX_SUM[stage]);
        expect(groupColumns(r)).toBe(Math.max(r.cols.left, r.cols.right) <= 10 ? 5 : 10);
      }
    }
    const round = { rows: 1, cols: { left: 8, right: 5 }, mission: 'add' as const };
    expect(expectedAnswer(round, 'left', 'count')).toBe(8);
    expect(expectedAnswer(round, 'right', 'join')).toBe(13);
    let s = initialSkyState();
    s = skyReducer(s, { type: 'player', side: 'left', player: { name: 'A', avatar: '🐶' } });
    s = skyReducer(s, { type: 'player', side: 'right', player: { name: 'B', avatar: '🐱' } });
    s = skyReducer(s, { type: 'start', rounds: [round] });
    s = skyReducer(s, { type: 'answer', side: 'left', stage: 'count', value: 8 });
    s = skyReducer(s, { type: 'answer', side: 'right', stage: 'count', value: 5 });
    expect(s.phase).toBe('join');
    s = skyReducer(s, { type: 'answer', side: 'left', stage: 'join', value: 13 });
    s = skyReducer(s, { type: 'answer', side: 'right', stage: 'join', value: 13 });
    expect(s).toMatchObject({ phase: 'lit', lit: 1, perfect: 1 });
  });
});

describe('Acceleration Road: doubling', () => {
  it('doubles four times, and only tracks facts the main drill asks too', () => {
    for (const [mission, stage, level] of [['mul', 1, 1], ['mul', 1, 6], ['add', 1, 1], ['add', 2, 3], ['add', 3, 3]] as const) {
      repeat(100, () => {
        const run = buildRoad({ ...progress(stage), level }, mission);
        expect(run.mission).toBe(mission);
        expect(run.values).toHaveLength(ROAD_JUMPS + 1);
        run.values.slice(1).forEach((v, k) => expect(v).toBe(run.values[k] * 2));
        if (mission === 'add' && stage < 3) expect(run.values[0]).toBe(1);
        run.steps.forEach((s, k) => {
          expect(s.answer).toBe(run.values[k + 1]);
          expect(s.choices).toHaveLength(4);
          expect(new Set(s.choices).size).toBe(4);
          expect(s.choices).toContain(s.answer);
          expect(s.choices.every((c) => c > 0)).toBe(true);
          const v = run.values[k];
          if (mission === 'mul') expect(s.factKey).toBe(v <= 10 ? `${Math.min(v, 2)}x${Math.max(v, 2)}` : null);
          else if (stage < 3) expect(s.factKey).toBe(`${v}+${v}`);
          else expect(s.factKey).toBe(additionTrackKey(v, v));
        });
      });
    }
  });
});
