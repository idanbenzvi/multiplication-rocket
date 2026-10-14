import { describe, expect, it } from 'vitest';
import {
  buildSkyRounds,
  initialSkyState,
  MAX_MISSES,
  skyReducer,
  SKY_ROUNDS,
  splitColumns,
  type SkyRound,
  type SkyState,
} from './splitSky';

const noa = { name: 'Noa', avatar: '🐶' };
const ari = { name: 'Ari', avatar: '🐱' };
const round = (rows: number, left: number, right: number): SkyRound => ({ rows, cols: { left, right } });

function playing(rounds: SkyRound[] = [round(6, 3, 5)]): SkyState {
  let s = skyReducer(initialSkyState(), { type: 'player', side: 'left', player: noa });
  s = skyReducer(s, { type: 'player', side: 'right', player: ari });
  return skyReducer(s, { type: 'start', rounds });
}

describe('splitColumns', () => {
  it('splits off a 5 when there are more than 5 columns', () => {
    for (let i = 0; i < 50; i++) {
      const { left, right } = splitColumns(8);
      expect(left + right).toBe(8);
      expect([left, right]).toContain(5);
    }
  });

  it('otherwise splits anywhere, both halves at least 1', () => {
    for (let i = 0; i < 50; i++) {
      const { left, right } = splitColumns(4);
      expect(left + right).toBe(4);
      expect(Math.min(left, right)).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('buildSkyRounds', () => {
  it('builds a game of rounds with at least 2 rows and 3 columns', () => {
    const rounds = buildSkyRounds({});
    expect(rounds).toHaveLength(SKY_ROUNDS);
    for (const r of rounds) {
      expect(r.rows).toBeGreaterThanOrEqual(2);
      expect(r.cols.left + r.cols.right).toBeGreaterThanOrEqual(3);
      expect(r.rows * (r.cols.left + r.cols.right)).toBeLessThanOrEqual(100);
    }
  });
});

describe('skyReducer', () => {
  it('starts only with both players in', () => {
    const one = skyReducer(initialSkyState(), { type: 'player', side: 'left', player: noa });
    expect(skyReducer(one, { type: 'start', rounds: [round(6, 3, 5)] }).phase).toBe('lobby');
    expect(playing().phase).toBe('count');
  });

  it('swaps sides in the lobby', () => {
    let s = skyReducer(initialSkyState(), { type: 'player', side: 'left', player: noa });
    s = skyReducer(s, { type: 'player', side: 'right', player: ari });
    s = skyReducer(s, { type: 'swap' });
    expect(s.players.left).toEqual(ari);
    expect(s.players.right).toEqual(noa);
  });

  it('moves to the whole sky once both halves are counted', () => {
    let s = playing();
    s = skyReducer(s, { type: 'answer', side: 'left', stage: 'count', value: 18 });
    expect(s.phase).toBe('count');
    expect(s.count.left.done).toBe(true);
    s = skyReducer(s, { type: 'answer', side: 'right', stage: 'count', value: 30 });
    expect(s.phase).toBe('join');
  });

  it('reveals a half after too many misses', () => {
    let s = playing();
    for (let i = 0; i < MAX_MISSES; i++) s = skyReducer(s, { type: 'answer', side: 'left', stage: 'count', value: 17 });
    expect(s.count.left).toMatchObject({ done: true, misses: MAX_MISSES });
  });

  it('ignores answers for a finished side or the wrong stage', () => {
    let s = playing();
    s = skyReducer(s, { type: 'answer', side: 'left', stage: 'count', value: 18 });
    expect(skyReducer(s, { type: 'answer', side: 'left', stage: 'count', value: 1 })).toBe(s);
    expect(skyReducer(s, { type: 'answer', side: 'right', stage: 'join', value: 48 })).toBe(s);
  });

  it('lights the constellation when both find the whole, counting perfect rounds', () => {
    let s = playing();
    s = skyReducer(s, { type: 'answer', side: 'left', stage: 'count', value: 18 });
    s = skyReducer(s, { type: 'answer', side: 'right', stage: 'count', value: 30 });
    s = skyReducer(s, { type: 'answer', side: 'left', stage: 'join', value: 48 });
    s = skyReducer(s, { type: 'answer', side: 'right', stage: 'join', value: 48 });
    expect(s.phase).toBe('lit');
    expect(s.lit).toBe(1);
    expect(s.perfect).toBe(1);
  });

  it("doesn't count a round with a miss as perfect", () => {
    let s = playing();
    s = skyReducer(s, { type: 'answer', side: 'left', stage: 'count', value: 17 });
    s = skyReducer(s, { type: 'answer', side: 'left', stage: 'count', value: 18 });
    s = skyReducer(s, { type: 'answer', side: 'right', stage: 'count', value: 30 });
    s = skyReducer(s, { type: 'answer', side: 'left', stage: 'join', value: 48 });
    s = skyReducer(s, { type: 'answer', side: 'right', stage: 'join', value: 48 });
    expect(s.lit).toBe(1);
    expect(s.perfect).toBe(0);
  });

  it('goes to the next round, then the summary after the last', () => {
    const solve = (s: SkyState) => {
      const r = s.rounds[s.roundIndex];
      const whole = r.rows * (r.cols.left + r.cols.right);
      s = skyReducer(s, { type: 'answer', side: 'left', stage: 'count', value: r.rows * r.cols.left });
      s = skyReducer(s, { type: 'answer', side: 'right', stage: 'count', value: r.rows * r.cols.right });
      s = skyReducer(s, { type: 'answer', side: 'left', stage: 'join', value: whole });
      return skyReducer(s, { type: 'answer', side: 'right', stage: 'join', value: whole });
    };
    let s = playing([round(6, 3, 5), round(4, 2, 2)]);
    s = skyReducer(solve(s), { type: 'next' });
    expect(s.phase).toBe('count');
    expect(s.roundIndex).toBe(1);
    expect(s.count.left).toEqual({ done: false, misses: 0 });
    s = skyReducer(solve(s), { type: 'next' });
    expect(s.phase).toBe('summary');
    expect(s.lit).toBe(2);
  });

  it('plays again from the summary with the same players', () => {
    let s = playing([round(6, 3, 5)]);
    s = { ...s, phase: 'summary', lit: 1 };
    s = skyReducer(s, { type: 'start', rounds: [round(3, 1, 2)] });
    expect(s).toMatchObject({ phase: 'count', roundIndex: 0, lit: 0, perfect: 0 });
    expect(s.players.left).toEqual(noa);
  });
});
