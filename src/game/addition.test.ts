import { describe, expect, it } from 'vitest';
import type { FactStat } from './types';
import {
  ADD_KINDS,
  additionTable,
  additionTrackKey,
  kindOf,
  makeProblem,
  pickAdditionFact,
  stageMastery,
  stageReady,
} from './addition';
import { answerOfKey, missionOfKey, pairKey, parsePair } from './mission';
import { formatFactKey } from './facts';
import { additionDistractors, distractors } from './distractors';
import { additionStrategy } from './strategy';
import { buildAdditionChallenge, buildChallenge } from './wormhole';
import { buildDocking, checkDock, navigatorAddMax, navigatorAddPool, navigatorChoices, sumPairs } from './crew';
import { masterySummary } from './masteryStats';
import { canHelpWith, factAnswer, initialSunState, sunReducer, type SunAction, type SunState } from './sun';
import { STRINGS } from '../i18n/strings';

const mastered: FactStat = { attempts: 5, correct: 5, wrong: 0, dueScore: 0.2 };
const masterAll = (keys: string[]) => Object.fromEntries(keys.map((k) => [k, mastered]));
const sumOf = (p: [number, number]) => p[0] + p[1];

describe('mission keys', () => {
  it('tells the missions apart by their keys', () => {
    expect(missionOfKey('3x4')).toBe('mul');
    expect(missionOfKey('3+4')).toBe('add');
    expect(missionOfKey('2d+1d:c')).toBe('add');
    expect(pairKey('add', 7, 3)).toBe('3+7');
    expect(pairKey('mul', 7, 3)).toBe('3x7');
  });

  it('parses concrete problems, not kinds', () => {
    expect(parsePair('37+45')).toEqual({ mission: 'add', a: 37, b: 45 });
    expect(parsePair('7x8')).toEqual({ mission: 'mul', a: 7, b: 8 });
    expect(parsePair('2d+2d:c')).toBeNull();
    expect(answerOfKey('37+45')).toBe(82);
    expect(answerOfKey('7x8')).toBe(56);
    expect(formatFactKey('3+4')).toBe('3 + 4');
    expect(formatFactKey('3x4')).toBe('3 × 4');
  });
});

describe('addition stages', () => {
  it('stage 1 is the 25 sums within 10, stage 2 the 30 from 11 to 20', () => {
    const one = additionTable(1);
    const two = additionTable(2);
    expect(one).toHaveLength(25);
    expect(two).toHaveLength(30);
    expect(one.every((f) => f.a <= f.b && f.answer === f.a + f.b && f.answer <= 10 && f.key === `${f.a}+${f.b}`)).toBe(true);
    expect(two.every((f) => f.b <= 10 && f.answer > 10 && f.answer <= 20)).toBe(true);
  });

  it('sorts two-digit sums into kinds', () => {
    expect(kindOf(40, 30)).toBe('tens+tens');
    expect(kindOf(34, 5)).toBe('2d+1d');
    expect(kindOf(5, 12)).toBe('2d+1d');
    expect(kindOf(37, 5)).toBe('2d+1d:c');
    expect(kindOf(5, 37)).toBe('2d+1d:c');
    expect(kindOf(34, 25)).toBe('2d+2d');
    expect(kindOf(10, 34)).toBe('2d+2d');
    expect(kindOf(37, 45)).toBe('2d+2d:c');
    expect(additionTrackKey(8, 5)).toBe('5+8');
    expect(additionTrackKey(10, 10)).toBe('10+10');
    expect(additionTrackKey(37, 45)).toBe('2d+2d:c');
  });

  it('makes problems of the kind asked for, within 100 and never in the table', () => {
    for (const kind of ADD_KINDS) {
      for (let i = 0; i < 400; i++) {
        const [a, b] = makeProblem(kind);
        expect(a).toBeGreaterThan(0);
        expect(a + b).toBeLessThanOrEqual(100);
        expect(kindOf(a, b)).toBe(kind);
        expect(additionTrackKey(a, b)).toBe(kind);
      }
    }
  });

  it('picks from the stage, with one in five reviewing earlier stages', () => {
    const one = new Set(additionTable(1).map((f) => f.key));
    const two = new Set(additionTable(2).map((f) => f.key));
    for (let i = 0; i < 100; i++) expect(one.has(pickAdditionFact(1, {}).key)).toBe(true);
    // rand() < 0.2 reviews, otherwise the stage itself
    expect(one.has(pickAdditionFact(2, {}, undefined, () => 0.1).key)).toBe(true);
    expect(two.has(pickAdditionFact(2, {}, undefined, () => 0.5).key)).toBe(true);
    const review = pickAdditionFact(3, {}, undefined, () => 0.1);
    expect(one.has(review.key) || two.has(review.key)).toBe(true);
    for (let i = 0; i < 100; i++) {
      const f = pickAdditionFact(3, {}, undefined, () => 0.5 + Math.random() * 0.49);
      expect(ADD_KINDS).toContain(f.key);
      expect(f.answer).toBe(f.a + f.b);
      expect(kindOf(f.a, f.b)).toBe(f.key);
    }
  });

  it('opens the next stage once 80% of this one is mastered', () => {
    const one = additionTable(1).map((f) => f.key);
    expect(stageReady(1, {})).toBe(false);
    expect(stageReady(1, masterAll(one.slice(0, 19)))).toBe(false);
    expect(stageReady(1, masterAll(one.slice(0, 20)))).toBe(true);
    expect(stageMastery(3, masterAll(ADD_KINDS))).toBe(1);
    expect(stageReady(3, masterAll(ADD_KINDS))).toBe(false); // the last stage
  });

  it('counts the addition map: the table and the kinds', () => {
    expect(masterySummary({}, 'add')).toEqual({ mastered: 0, practice: 0, untried: 60 });
    expect(masterySummary(masterAll(['3+4', '2d+1d']), 'add').mastered).toBe(2);
    expect(masterySummary(masterAll(['3+4']), 'mul').mastered).toBe(0);
  });
});

describe('addition choices', () => {
  const pairs: Array<[number, number]> = [
    ...additionTable(1).map((f): [number, number] => [f.a, f.b]),
    ...additionTable(2).map((f): [number, number] => [f.a, f.b]),
    ...ADD_KINDS.flatMap((k) => Array.from({ length: 30 }, () => makeProblem(k))),
  ];

  it('gives distinct, positive near misses, never the answer', () => {
    for (const [a, b] of pairs) {
      for (const count of [3, 4]) {
        const d = additionDistractors(a, b, count);
        expect(d).toHaveLength(count);
        expect(new Set(d).size).toBe(count);
        expect(d.every((v) => v > 0 && v !== a + b)).toBe(true);
      }
    }
    expect(distractors(3, 4, 3, 'add').every((v) => v !== 7)).toBe(true);
  });

  it('includes the forgot-to-carry slip, and puts the answer anywhere among the choices', () => {
    const seen = new Set<number>();
    const ranks = new Set<number>();
    for (let i = 0; i < 300; i++) {
      const d = additionDistractors(37, 45, 3);
      d.forEach((v) => seen.add(v));
      ranks.add(d.filter((v) => v < 82).length);
    }
    expect(seen.has(72)).toBe(true);
    expect(ranks.size).toBe(4);
  });
});

describe('addition hints', () => {
  for (const lang of ['en', 'he'] as const) {
    it(`stop one step short of the answer (${lang})`, () => {
      const t = STRINGS[lang];
      const all: Array<[number, number]> = [
        ...additionTable(1).flatMap((f): Array<[number, number]> => [[f.a, f.b], [f.b, f.a]]),
        ...additionTable(2).flatMap((f): Array<[number, number]> => [[f.a, f.b], [f.b, f.a]]),
        ...ADD_KINDS.flatMap((k) => Array.from({ length: 60 }, () => makeProblem(k))),
      ];
      for (const [x, y] of all) {
        const s = additionStrategy(x, y, t);
        expect(s.text || s.math).toBeTruthy();
        const numbers = `${s.text ?? ''} ${s.math ?? ''}`.match(/\d+/g)?.map(Number) ?? [];
        expect(numbers).not.toContain(x + y);
        if (s.math) expect(s.math.endsWith('?')).toBe(true);
      }
    });
  }

  it('makes ten for the sums that cross it', () => {
    expect(additionStrategy(8, 5, STRINGS.en).math).toBe('8 + 5  →  8 + 2 + 3  →  10 + 3  →  ?');
    expect(additionStrategy(37, 45, STRINGS.en).math).toBe('37 + 45  →  30 + 40 + 7 + 5  →  70 + 12  →  ?');
  });
});

describe('addition wormhole', () => {
  it('has three different pairs that make the target and two that miss', () => {
    for (const stage of [1, 2, 3]) {
      for (let i = 0; i < 200; i++) {
        const c = buildAdditionChallenge(stage);
        expect(c.mission).toBe('add');
        expect(c.drills).toHaveLength(5);
        const right = c.drills.filter((d) => d.correct);
        expect(right).toHaveLength(3);
        expect(right.every((d) => d.x + d.y === c.target)).toBe(true);
        expect(new Set(right.map((d) => pairKey('add', d.x, d.y))).size).toBe(3);
        const decoys = c.drills.filter((d) => !d.correct);
        expect(decoys.every((d) => d.x + d.y !== c.target && d.x > 0 && d.y > 0)).toBe(true);
      }
    }
  });

  it('keeps multiplication challenges as they were', () => {
    const c = buildChallenge(3);
    expect(c.mission).toBe('mul');
    expect(c.drills.filter((d) => d.correct).every((d) => d.x * d.y === c.target)).toBe(true);
  });
});

describe('addition crew flight', () => {
  it('docks on a sum, with targets from the stage', () => {
    for (let i = 0; i < 100; i++) {
      const one = buildDocking({}, false, 'add', 1);
      expect(one.mission).toBe('add');
      expect(one.target).toBeGreaterThanOrEqual(6);
      expect(one.target).toBeLessThanOrEqual(10);
      const two = buildDocking({}, true, 'add', 2);
      expect(two.target).toBeGreaterThan(10);
      expect(two.pairs.length).toBeGreaterThanOrEqual(2);
      expect(two.pairs.every((p) => sumOf(p) === two.target)).toBe(true);
      expect(two.pairs.some(([a]) => a <= 5)).toBe(true);
    }
    expect(checkDock(6, 7, 13, 'add')).toBe('dock');
    expect(checkDock(6, 8, 13, 'add')).toBe('over');
    expect(checkDock(6, 4, 13, 'add')).toBe('under');
    expect(sumPairs(12)).toEqual([[2, 10], [3, 9], [4, 8], [5, 7], [6, 6]]);
  });

  it("widens the navigator's sums as they master them", () => {
    expect(navigatorAddMax({})).toBe(6);
    expect(navigatorAddPool({}).every((f) => f.answer <= 6)).toBe(true);
    const six = navigatorAddPool({}, 6).map((f) => f.key);
    expect(navigatorAddMax(masterAll(six))).toBe(7);
    const choices = navigatorChoices(3, 4, 'add');
    expect(choices).toHaveLength(4);
    expect(choices).toContain(7);
    expect(new Set(choices).size).toBe(4);
  });
});

describe('addition in Monster Sun', () => {
  const noa = { id: 'n', name: 'Noa', avatar: '🐶', mission: 'mul' as const };
  const ari = { id: 'a', name: 'Ari', avatar: '🐱', mission: 'add' as const };
  const run = (s: SunState, ...actions: SunAction[]) => actions.reduce((x, a) => sunReducer(x, a, () => 0), s);
  const fight = (players: Array<typeof noa | typeof ari>) =>
    run(initialSunState(), ...players.map((player) => ({ type: 'join' as const, player })), { type: 'start' });

  it('answers both kinds of problem', () => {
    expect(factAnswer('37+45')).toBe(82);
    expect(factAnswer('7x8')).toBe(56);
    expect(factAnswer('2d+1d')).toBeNull();
    const s = run(fight([noa, ari]), { type: 'answer', id: 'a', fact: '8+5', value: 13 });
    expect(s.hp).toBe(s.maxHp - 1);
  });

  it('sends a + miss to anyone, a × miss only to a × pilot', () => {
    expect(canHelpWith(noa, '8+5')).toBe(true);
    expect(canHelpWith(ari, '7x8')).toBe(false);
    expect(canHelpWith({ id: 'o', name: 'Old', avatar: '🙂' }, '7x8')).toBe(true);
    let s = run(fight([noa, ari]), { type: 'answer', id: 'a', fact: '8+5', value: 12 });
    expect(s.players.find((p) => p.id === 'n')!.inbox).toHaveLength(1);
    s = run(fight([noa, ari]), { type: 'answer', id: 'n', fact: '7x8', value: 54 });
    expect(s.players.find((p) => p.id === 'a')!.inbox).toHaveLength(0);
  });
});
