import { describe, expect, it } from 'vitest';
import type { FactStat, Progress } from './types';
import {
  inSubTable,
  makeSubProblem,
  pickSubtractionFact,
  SUB_KINDS,
  subKindOf,
  subStageFor,
  subStageMastery,
  subStageReady,
  subtractionTable,
  subtractionTrackKey,
} from './subtraction';
import { additionTable } from './addition';
import { answerOfKey, commutes, covers, MISSION_MENU, missionOfKey, opsOf, pairKey, parsePair, pickOp, PILOT_MISSIONS } from './mission';
import { formatFactKey, randomizeOrder } from './facts';
import { distractors } from './distractors';
import { strategyFor } from './strategy';
import { thinkSteps } from './thinkThrough';
import { buildChallenge, buildSubtractionChallenge } from './wormhole';
import { masterySummary } from './masteryStats';
import { climbStages, opStage, stageOpened, stagesOf } from './stages';
import { trackKeyOf } from './tracking';
import { pickFact } from './questions';
import { buildMeteorDrills, buildTraffic, nextBonusRound, rotationFor, roundOpFor, SUB_ROUNDS, trafficDecoys } from './bonusRounds';
import { navigatorChoices, navigatorSubPool } from './crew';
import { canHelpWith } from './sun';
import { nextBossQuestion, newFight } from './blackSun';
import { factLabel, STRINGS } from '../i18n/strings';

const mastered: FactStat = { attempts: 5, correct: 5, wrong: 0, dueScore: 0.2 };
const masterAll = (keys: string[]) => Object.fromEntries(keys.map((k) => [k, mastered]));
const progress = (over: Partial<Progress> = {}): Progress => ({
  version: 1,
  level: 1,
  fuel: 0,
  currentStreak: 0,
  bestStreak: 0,
  totalCorrectAnswers: 0,
  launchesCompleted: 0,
  mastery: {},
  ...over,
});
/** a fixed sequence of "random" numbers, repeating */
const seq = (...xs: number[]) => {
  let i = 0;
  return () => xs[i++ % xs.length];
};

describe('subtraction keys', () => {
  it('writes a difference bigger number first, and tells it from the others', () => {
    expect(pairKey('sub', 4, 9)).toBe('9-4');
    expect(pairKey('sub', 9, 4)).toBe('9-4');
    expect(missionOfKey('9-4')).toBe('sub');
    expect(missionOfKey('2d-1d:b')).toBe('sub');
    expect(missionOfKey('tens-tens')).toBe('sub');
    expect(missionOfKey('3+4')).toBe('add');
    expect(missionOfKey('tens+tens')).toBe('add');
    expect(missionOfKey('3x4')).toBe('mul');
  });

  it('parses a concrete difference, not a kind', () => {
    expect(parsePair('52-27')).toEqual({ mission: 'sub', a: 52, b: 27 });
    expect(answerOfKey('52-27')).toBe(25);
    expect(parsePair('2d-2d:b')).toBeNull();
    expect(formatFactKey('13-5')).toBe('13 − 5');
  });

  it('never shows a difference the other way round', () => {
    expect(commutes('sub')).toBe(false);
    for (let i = 0; i < 20; i++) expect(randomizeOrder({ a: 13, b: 5, key: '13-5', answer: 8 })).toEqual({ x: 13, y: 5 });
  });

  it('labels kinds by name', () => {
    const t = STRINGS.en;
    expect(factLabel(t, '2d-2d:b')).toBe(t.subKinds['2d-2d:b']);
    expect(factLabel(t, '9-4')).toBe('9 − 4');
  });
});

describe('the missions', () => {
  it('adds − and +−, append only (the answer log stores the index)', () => {
    expect(PILOT_MISSIONS.slice(0, 3)).toEqual(['mul', 'add', 'mix']);
    expect(PILOT_MISSIONS).toEqual(expect.arrayContaining(['sub', 'addsub']));
    expect([...MISSION_MENU].sort()).toEqual([...PILOT_MISSIONS].sort());
    expect(opsOf('sub')).toEqual(['sub']);
    expect(opsOf('addsub')).toEqual(['add', 'sub']);
  });

  it('covers its own facts only', () => {
    expect(covers('sub', '9-4')).toBe(true);
    expect(covers('sub', '3+4')).toBe(false);
    expect(covers('addsub', '3+4')).toBe(true);
    expect(covers('addsub', '2d-1d:b')).toBe(true);
    expect(covers('addsub', '3x4')).toBe(false);
    expect(covers('mix', '9-4')).toBe(false);
  });

  it('picks + or − half and half on +−', () => {
    let subs = 0;
    for (let i = 0; i < 2000; i++) if (pickOp('addsub') === 'sub') subs++;
    expect(subs).toBeGreaterThan(850);
    expect(subs).toBeLessThan(1150);
    expect(pickOp('sub')).toBe('sub');
  });
});

describe('the subtraction table', () => {
  it('has the 45 differences within 10 and the 55 back from the teens, each the other side of a sum', () => {
    const one = subtractionTable(1);
    const two = subtractionTable(2);
    expect(one).toHaveLength(45);
    expect(two).toHaveLength(55);
    for (const f of [...one, ...two]) {
      expect(f.answer).toBe(f.a - f.b);
      expect(f.answer).toBeGreaterThanOrEqual(1);
      expect(f.answer).toBeLessThanOrEqual(10);
      expect(f.b).toBeLessThanOrEqual(10);
      expect(inSubTable(f.a, f.b)).toBe(true);
      expect(missionOfKey(f.key)).toBe('sub');
    }
    for (const f of one) expect(f.a).toBeLessThanOrEqual(10);
    for (const f of two) expect(f.a).toBeGreaterThan(10);
    // every sum in the addition table gives its differences
    const keys = new Set([...one, ...two].map((f) => f.key));
    for (const f of [...additionTable(1), ...additionTable(2)]) {
      expect(keys.has(pairKey('sub', f.answer, f.a))).toBe(true);
      expect(keys.has(pairKey('sub', f.answer, f.b))).toBe(true);
    }
  });

  it('makes problems of each kind, never in the table, never below 1, within 99', () => {
    for (const kind of SUB_KINDS) {
      for (let i = 0; i < 300; i++) {
        const [a, b] = makeSubProblem(kind);
        expect(a).toBeGreaterThan(b);
        expect(a).toBeLessThanOrEqual(99);
        expect(b).toBeGreaterThanOrEqual(1);
        expect(inSubTable(a, b)).toBe(false);
        expect(subKindOf(a, b)).toBe(kind);
        expect(subtractionTrackKey(a, b)).toBe(kind);
      }
    }
  });

  it('tracks a table difference as itself, beyond it by kind', () => {
    expect(subtractionTrackKey(13, 5)).toBe('13-5');
    expect(subtractionTrackKey(5, 13)).toBe('13-5');
    expect(subtractionTrackKey(52, 27)).toBe('2d-2d:b');
    expect(subtractionTrackKey(58, 3)).toBe('2d-1d');
    expect(trackKeyOf('sub', 70, 30)).toBe('tens-tens');
    expect(trackKeyOf('add', 37, 45)).toBe('2d+2d:c');
  });

  it('picks at the pilot’s stage, with some review of the earlier ones', () => {
    for (let i = 0; i < 100; i++) expect(pickSubtractionFact(1, {}).a).toBeLessThanOrEqual(10);
    let reviews = 0;
    for (let i = 0; i < 400; i++) {
      const f = pickSubtractionFact(3, {});
      expect(f.answer).toBe(f.a - f.b);
      if (inSubTable(f.a, f.b)) reviews++;
      else expect(SUB_KINDS).toContain(f.key);
    }
    expect(reviews).toBeGreaterThan(30);
    expect(reviews).toBeLessThan(140);
  });

  it('opens the next stage at 80% mastered', () => {
    const keys = subtractionTable(1).map((f) => f.key);
    expect(subStageReady(1, masterAll(keys.slice(0, 35)))).toBe(false);
    expect(subStageReady(1, masterAll(keys.slice(0, 36)))).toBe(true);
    expect(subStageMastery(1, masterAll(keys))).toBe(1);
    expect(subStageReady(3, masterAll(SUB_KINDS))).toBe(false);
    const both = masterAll([...keys, ...subtractionTable(2).map((f) => f.key)]);
    expect(subStageFor(undefined, both)).toBe(3);
  });
});

describe('climbing two stages', () => {
  const addKeys = additionTable(1).map((f) => f.key);
  const subKeys = subtractionTable(1).map((f) => f.key);

  it('moves each operation of the mission up on its own', () => {
    expect(climbStages('sub', {}, masterAll(subKeys))).toEqual({ stage: undefined, subStage: 2 });
    expect(climbStages('add', {}, masterAll(subKeys))).toEqual({ stage: undefined, subStage: undefined });
    expect(climbStages('addsub', { stage: 1, subStage: 1 }, masterAll([...addKeys, ...subKeys]))).toEqual({ stage: 2, subStage: 2 });
    expect(climbStages('mul', {}, masterAll([...addKeys, ...subKeys]))).toEqual({ stage: undefined, subStage: undefined });
  });

  it('says which stage opened, and shows each on the banner', () => {
    expect(stageOpened({}, { subStage: 2 })).toEqual({ op: 'sub', stage: 2 });
    expect(stageOpened({ stage: 1 }, { stage: 2 })).toEqual({ op: 'add', stage: 2 });
    expect(stageOpened({ stage: 2 }, { stage: 2 })).toBeNull();
    expect(stagesOf('addsub', { stage: 2 })).toEqual([
      { op: 'add', stage: 2 },
      { op: 'sub', stage: 1 },
    ]);
    expect(stagesOf('mul', { stage: 2 })).toEqual([]);
    expect(opStage('sub', { stage: 3, subStage: 2 })).toBe(2);
  });

  it('asks a − pilot differences at their own stage', () => {
    for (let i = 0; i < 50; i++) {
      const f = pickFact('sub', progress({ subStage: 2, stage: 1 }));
      expect(missionOfKey(f.key)).toBe('sub');
    }
  });
});

describe('wrong answers, hints and the computer', () => {
  it('offers close slips, never the answer, never below 1', () => {
    for (const [x, y] of [
      [9, 4],
      [13, 5],
      [10, 9],
      [52, 27],
      [58, 3],
      [70, 30],
      [2, 1],
    ]) {
      for (let i = 0; i < 50; i++) {
        const picks = distractors(x, y, 3, 'sub');
        expect(picks).toHaveLength(3);
        expect(new Set(picks).size).toBe(3);
        expect(picks).not.toContain(x - y);
        for (const v of picks) expect(v).toBeGreaterThan(0);
      }
    }
  });

  it('a forgotten borrow (10 over) is among the choices with two-digit numbers', () => {
    let seen = 0;
    for (let i = 0; i < 100; i++) if (distractors(52, 27, 3, 'sub').includes(35)) seen++;
    expect(seen).toBeGreaterThan(50);
  });

  it('hints leave the answer to work out', () => {
    const t = STRINGS.en;
    for (const f of [...subtractionTable(1), ...subtractionTable(2)]) {
      const s = strategyFor(f.a, f.b, t, 'sub');
      expect(s.text ?? s.math).toBeTruthy();
      // (the unknown is the "?": at the end, or the missing part of a sum)
      if (s.math) expect(s.math).toContain('?');
    }
    for (const kind of SUB_KINDS) {
      for (let i = 0; i < 30; i++) {
        const [a, b] = makeSubProblem(kind);
        const s = strategyFor(a, b, t, 'sub');
        if (s.math) {
          expect(s.math.trim().endsWith('?')).toBe(true);
          expect(s.math).not.toMatch(new RegExp(`= ${a - b}$`));
        }
      }
    }
    expect(strategyFor(13, 5, t, 'sub').math).toBe('13 − 5  →  13 − 3 − 2  →  10 − 2  →  ?');
    expect(strategyFor(52, 7, t, 'sub').math).toBe('52 − 7  →  52 − 2 − 5  →  50 − 5  →  ?');
  });

  it('the ship’s computer takes away, counts back and thinks of the sum', () => {
    const ids = thinkSteps(9, 4, 'sub', {}).map((s) => s.id);
    expect(ids).toEqual(['meaningSub', 'countBack', 'trick', 'thinkAdd']);
    expect(thinkSteps(52, 27, 'sub', {}).map((s) => s.id)).toEqual(['meaningTensSub', 'trick']);
  });
});

describe('subtraction in the game', () => {
  it('builds a wormhole of three differences that leave the target', () => {
    for (const stage of [1, 2, 3]) {
      for (let i = 0; i < 40; i++) {
        const c = buildSubtractionChallenge(stage);
        expect(c.mission).toBe('sub');
        expect(c.drills).toHaveLength(5);
        const right = c.drills.filter((d) => d.correct);
        expect(right).toHaveLength(3);
        for (const d of c.drills) {
          expect(d.x).toBeGreaterThan(d.y);
          expect(d.y).toBeGreaterThanOrEqual(1);
          expect(d.x - d.y === c.target).toBe(d.correct);
        }
        expect(new Set(c.drills.map((d) => `${d.x}-${d.y}`)).size).toBe(5);
      }
    }
    expect(buildChallenge(1, 'sub', 2).mission).toBe('sub');
  });

  it('plays only the rounds with a − version on −, and the rest with sums on +−', () => {
    expect(rotationFor('sub')).toEqual(SUB_ROUNDS);
    expect(rotationFor('addsub')).toHaveLength(8);
    let queue = ['battle', 'meteor'] as Parameters<typeof nextBonusRound>[0];
    const seen = new Set<string>();
    for (let i = 0; i < 30; i++) {
      const next = nextBonusRound(queue, rotationFor('sub'));
      seen.add(next.kind);
      queue = next.queue;
    }
    expect([...seen].sort()).toEqual([...SUB_ROUNDS].sort());
    expect(roundOpFor('battle', 'sub')).toBe('add');
    expect(roundOpFor('meteor', 'sub')).toBe('sub');
    expect(roundOpFor('battle', 'mul')).toBe('mul');
  });

  it('builds meteor drills and space traffic of differences', () => {
    const p = progress({ subStage: 2 });
    for (const d of buildMeteorDrills(p, 'sub')) {
      expect(d.x - d.y).toBe(d.answer);
      expect(d.values).toContain(d.answer);
    }
    const run = buildTraffic(p, 'sub');
    expect(run.mission).toBe('sub');
    for (const pass of run.passes) {
      for (const [dir, drill] of Object.entries(pass.drills)) {
        expect(drill.x).toBeGreaterThan(drill.y);
        expect(drill.value).toBe(drill.x - drill.y);
        expect(drill.value === pass.number).toBe(dir === pass.dir);
      }
    }
    for (const [a, b] of trafficDecoys('sub', 13, 5, 2)) {
      expect(a).toBeGreaterThan(b);
      expect(a - b).not.toBe(8);
    }
  });

  it('gives a navigator stars flying away', () => {
    for (const f of navigatorSubPool({})) expect(f.a).toBeLessThanOrEqual(10);
    const choices = navigatorChoices(8, 3, 'sub');
    expect(choices).toContain(5);
    expect(choices).toHaveLength(4);
  });

  it('lets a − fact go to anyone past + alone in Monster Sun', () => {
    const p = (mission: Parameters<typeof canHelpWith>[0]['mission']) => ({ id: 'a', name: 'A', avatar: '🦊', mission });
    expect(canHelpWith(p('sub'), '13-5')).toBe(true);
    expect(canHelpWith(p('mul'), '13-5')).toBe(true);
    expect(canHelpWith(p('add'), '13-5')).toBe(false);
    expect(canHelpWith(p('sub'), '3+4')).toBe(true);
    expect(canHelpWith(p('sub'), '6x7')).toBe(false);
    expect(canHelpWith(p('addsub'), '6x7')).toBe(false);
    expect(canHelpWith(p('mix'), '6x7')).toBe(true);
  });

  it('counts the 100 differences and 5 kinds on the map, and the Black Sun asks them', () => {
    const all = [...subtractionTable(1), ...subtractionTable(2)].map((f) => f.key);
    expect(masterySummary({}, 'sub').untried).toBe(105);
    expect(masterySummary(masterAll([...all, ...SUB_KINDS]), 'sub').mastered).toBe(105);
    expect(masterySummary({}, 'addsub').untried).toBe(165);
    const q = nextBossQuestion(newFight(), 'sub', {}, seq(0.3, 0.6, 0.1, 0.9));
    expect(missionOfKey(q.key)).toBe('sub');
    expect(q.x - q.y).toBe(q.answer);
  });
});
