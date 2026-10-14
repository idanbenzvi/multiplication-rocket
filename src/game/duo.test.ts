import { describe, expect, it } from 'vitest';
import { duoReducer, initialDuoState } from './duo';

const noa = { name: 'Noa', avatar: '🐶' };

describe('duoReducer', () => {
  it('switches game in the lobby, keeping the players', () => {
    let s = duoReducer(initialDuoState(), { type: 'player', side: 'left', player: noa });
    s = duoReducer(s, { type: 'game', game: 'eclipse' });
    expect(s).toMatchObject({ game: 'eclipse', phase: 'lobby' });
    expect(s.players.left).toEqual(noa);
  });

  it("ignores the other game's actions", () => {
    const split = initialDuoState('split');
    expect(duoReducer(split, { type: 'orbit', side: 'left', value: 3 })).toBe(split);
    const eclipse = initialDuoState('eclipse');
    expect(duoReducer(eclipse, { type: 'answer', side: 'left', stage: 'count', value: 3 })).toBe(eclipse);
  });

  it("doesn't switch game in the middle of one", () => {
    let s = duoReducer(initialDuoState(), { type: 'player', side: 'left', player: noa });
    s = duoReducer(s, { type: 'player', side: 'right', player: noa });
    s = duoReducer(s, { type: 'start', rounds: [{ rows: 2, cols: { left: 1, right: 2 } }] });
    expect(duoReducer(s, { type: 'game', game: 'eclipse' })).toBe(s);
  });
});
