import { describe, expect, it } from 'vitest';
import {
  dueCard,
  initialSunState,
  MAX_PLAYERS,
  maxHpFor,
  SUN_MONSTERS,
  sunFactorMax,
  sunReducer,
  type SunAction,
  type SunState,
} from './sun';

const noa = { id: 'n', name: 'Noa', avatar: '🐶' };
const ari = { id: 'a', name: 'Ari', avatar: '🐱' };
const tal = { id: 't', name: 'Tal', avatar: '🦊' };

// the first other online player, so tests know who gets the help card
const first = () => 0;
const run = (s: SunState, ...actions: SunAction[]) => actions.reduce((x, a) => sunReducer(x, a, first), s);

function fighting(players = [noa, ari]): SunState {
  return run(initialSunState(), ...players.map((player) => ({ type: 'join' as const, player })), { type: 'start' });
}
const player = (s: SunState, id: string) => s.players.find((p) => p.id === id)!;
const right = (id: string, fact = '3x4', cardId?: number): SunAction => ({ type: 'answer', id, fact, value: product(fact), cardId });
const wrong = (id: string, fact = '3x4', cardId?: number): SunAction => ({ type: 'answer', id, fact, value: product(fact) + 1, cardId });
function product(fact: string) {
  const [a, b] = fact.split('x').map(Number);
  return a * b;
}

describe('lobby', () => {
  it('seats players once each, up to the limit', () => {
    let s = run(initialSunState(), { type: 'join', player: noa }, { type: 'join', player: { ...noa, name: 'Noa 2' } });
    expect(s.players).toHaveLength(1);
    expect(s.players[0].name).toBe('Noa 2');
    for (let i = 0; i < MAX_PLAYERS + 2; i++) s = run(s, { type: 'join', player: { id: `p${i}`, name: `P${i}`, avatar: '🙂' } });
    expect(s.players).toHaveLength(MAX_PLAYERS);
  });

  it('frees a seat in the lobby, keeps it (offline) in a fight', () => {
    let s = run(initialSunState(), { type: 'join', player: noa }, { type: 'join', player: ari }, { type: 'leave', id: 'a' });
    expect(s.players.map((p) => p.id)).toEqual(['n']);
    s = run(fighting(), { type: 'leave', id: 'a' });
    expect(player(s, 'a').online).toBe(false);
    s = run(s, { type: 'join', player: ari });
    expect(player(s, 'a').online).toBe(true);
  });

  it('needs two players to start', () => {
    const one = run(initialSunState(), { type: 'join', player: noa });
    expect(run(one, { type: 'start' }).phase).toBe('lobby');
    const s = fighting();
    expect(s).toMatchObject({ phase: 'fight', monster: 0, hp: 10, maxHp: 10 });
  });
});

describe('the fight', () => {
  it('a right answer is a blow, a wrong one heals the monster (never past full)', () => {
    let s = run(fighting(), right('n'), right('n'));
    expect(s).toMatchObject({ hp: 8, blows: 2 });
    expect(player(s, 'n')).toMatchObject({ hits: 2, answered: 2 });
    s = run(s, wrong('a'));
    expect(s).toMatchObject({ hp: 9, heals: 1 });
    s = run(fighting(), wrong('a'));
    expect(s.hp).toBe(10);
  });

  it('ignores answers that are not a fact, and answers outside a fight', () => {
    const s = fighting();
    expect(run(s, { type: 'answer', id: 'n', fact: 'banana', value: 1 })).toBe(s);
    expect(run(s, { type: 'answer', id: 'zz', fact: '2x2', value: 4 })).toBe(s);
    const lobby = run(initialSunState(), { type: 'join', player: noa });
    expect(run(lobby, right('n'))).toBe(lobby);
  });

  it('sends a missed fact to a teammate, never to the one who missed', () => {
    for (const rand of [() => 0, () => 0.99]) {
      const s = sunReducer(fighting([noa, ari, tal]), wrong('a', '7x8'), rand);
      expect(player(s, 'a').inbox).toEqual([]);
      const cards = [...player(s, 'n').inbox, ...player(s, 't').inbox];
      expect(cards).toHaveLength(1);
      expect(cards[0]).toMatchObject({ fact: '7x8', from: 'a', kind: 'help' });
    }
  });

  it('never sends to an offline teammate', () => {
    const s = run(fighting([noa, ari, tal]), { type: 'leave', id: 'n' }, wrong('a', '7x8'));
    expect(player(s, 't').inbox).toHaveLength(1);
    expect(player(s, 'n').inbox).toHaveLength(0);
  });

  it('a solved help card tips off the one who missed and gives them a retry', () => {
    let s = run(fighting(), wrong('a', '7x8'));
    const card = player(s, 'n').inbox[0];
    expect(dueCard(player(s, 'n'))).toEqual(card);
    s = run(s, right('n', '7x8', card.id));
    expect(player(s, 'n')).toMatchObject({ helped: 1, inbox: [] });
    const ariNow = player(s, 'a');
    expect(ariNow.tip).toMatchObject({ from: 'n', fact: '7x8' });
    expect(ariNow.inbox).toEqual([expect.objectContaining({ fact: '7x8', kind: 'retry', after: ariNow.answered + 2 })]);
    // the retry waits for two more of Ari's own answers
    expect(dueCard(ariNow)).toBeUndefined();
    s = run(s, right('a'), right('a'));
    expect(dueCard(player(s, 'a'))).toMatchObject({ fact: '7x8', kind: 'retry' });
  });

  it('a missed help or retry card is not passed on again', () => {
    let s = run(fighting(), wrong('a', '7x8'));
    const card = player(s, 'n').inbox[0];
    s = run(s, wrong('n', '7x8', card.id));
    expect(player(s, 'n').inbox).toEqual([]);
    expect(player(s, 'a').inbox).toEqual([]);
  });

  it('ignores a card answer for a card that is not there or a different fact', () => {
    const s = run(fighting(), wrong('a', '7x8'));
    const card = player(s, 'n').inbox[0];
    expect(run(s, right('n', '7x8', 999))).toBe(s);
    expect(run(s, right('n', '3x4', card.id))).toBe(s);
  });

  it('defeats the monster at zero and brings a tougher one', () => {
    let s = fighting();
    for (let i = 0; i < 10; i++) s = run(s, right(i % 2 ? 'a' : 'n'));
    expect(s).toMatchObject({ phase: 'defeated', hp: 0, defeated: 1 });
    expect(run(s, right('n'))).toBe(s);
    s = run(s, { type: 'next' });
    expect(s).toMatchObject({ phase: 'fight', monster: 1, hp: maxHpFor(1, 2), maxHp: 12 });
  });

  it('ends with a summary after the last monster', () => {
    let s = fighting();
    for (let m = 0; m < SUN_MONSTERS; m++) {
      while (s.phase === 'fight') s = run(s, right('n'));
      s = run(s, { type: 'next' });
    }
    expect(s).toMatchObject({ phase: 'summary', defeated: SUN_MONSTERS });
    s = run(s, { type: 'start' });
    expect(s).toMatchObject({ phase: 'fight', monster: 0, defeated: 0 });
    expect(player(s, 'n').hits).toBe(0);
  });

  it('a player joining mid-fight makes the monster stronger by their share', () => {
    const s = run(fighting(), right('n'), { type: 'join', player: tal });
    expect(s).toMatchObject({ hp: 14, maxHp: 15 });
  });
});

describe('sunFactorMax', () => {
  it('opens up bigger tables for each monster', () => {
    expect([0, 1, 2].map(sunFactorMax)).toEqual([6, 8, 10]);
  });
});
