import { describe, expect, it } from 'vitest';
import { combineFacts, factsView, withoutMission, type Facts } from './sharedFacts';
import { additionTable, ADD_KINDS, stageFor } from './addition';
import { dayNumber } from './memory';
import type { FactStat } from './types';

const stat = (s: Partial<FactStat> = {}): FactStat => ({ attempts: 4, correct: 4, wrong: 0, dueScore: 1, last: '1111', box: 1, since: 100, ...s });

const facts: Facts = { '7x8': stat(), '3+4': stat(), 'tens+tens': stat(), '2x2': stat({ box: 0 }) };

describe('shared facts', () => {
  it('shows each mission the facts it practises', () => {
    expect(Object.keys(factsView(facts, 'mul')).sort()).toEqual(['2x2', '7x8']);
    expect(Object.keys(factsView(facts, 'add')).sort()).toEqual(['3+4', 'tens+tens']);
    expect(Object.keys(factsView(facts, 'mix')).sort()).toEqual(Object.keys(facts).sort());
  });

  it("drops just a mission's facts when it's reset", () => {
    expect(Object.keys(withoutMission(facts, 'mul')).sort()).toEqual(['3+4', 'tens+tens']);
    expect(withoutMission(facts, 'mix')).toEqual({});
  });

  it('keeps a fact only one mission practised as it was', () => {
    const only = stat({ attempts: 9, box: 3 });
    expect(combineFacts({ mul: { '7x8': only }, add: { '3+4': stat() } })).toEqual({ '7x8': only, '3+4': stat() });
  });

  it('adds up the answers of a fact two missions practised, and reviews it as it was answered last', () => {
    const inMul = stat({ attempts: 10, correct: 9, wrong: 1, box: 4, since: 90, last: '11111', dueScore: 0.5 });
    const inMix = stat({ attempts: 3, correct: 1, wrong: 2, box: 0, since: undefined, last: '100', dueScore: 2 });
    const lastAnswered = (m: string) => (m === 'mix' ? 2000 : 1000);
    const one = combineFacts({ mul: { '7x8': inMul }, mix: { '7x8': inMix } }, lastAnswered)['7x8'];
    expect(one).toMatchObject({ attempts: 13, correct: 10, wrong: 3, box: 0, last: '100', dueScore: 2 });
  });

  it('with nothing saying which came last, keeps the review of the one that knows it best', () => {
    const higher = stat({ box: 5, since: 50 });
    const later = stat({ box: 2, since: 120 });
    expect(combineFacts({ add: { '3+4': later }, mix: { '3+4': higher } })['3+4'].box).toBe(5);
    const sameBox = combineFacts({ add: { '3+4': stat({ box: 2, since: 60 }) }, mix: { '3+4': later } })['3+4'];
    expect(sameBox.since).toBe(120);
  });
});

describe("a mission's sums, switched to", () => {
  const today = dayNumber();
  const mastered = (keys: string[]): Facts => Object.fromEntries(keys.map((k) => [k, stat({ since: today })]));

  it('start as far on as the sums already known open', () => {
    const stage1 = additionTable(1).map((f) => f.key);
    const stage2 = additionTable(2).map((f) => f.key);
    expect(stageFor(undefined, {})).toBe(1);
    expect(stageFor(undefined, mastered(stage1))).toBe(2);
    expect(stageFor(1, mastered([...stage1, ...stage2]))).toBe(3);
    expect(stageFor(3, mastered([...stage1, ...stage2, ...ADD_KINDS]))).toBe(3);
  });

  it("never go back from where the mission's own journey has got to", () => {
    expect(stageFor(2, {})).toBe(2);
  });
});
