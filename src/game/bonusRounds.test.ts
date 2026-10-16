import { describe, expect, it } from 'vitest';
import { BONUS_ROTATION, nextBonusRound, type BonusKind } from './bonusRounds';

const KINDS = BONUS_ROTATION.length;

/** the first `n` bonus rounds of a session, as the game plays them */
function session(n: number): BonusKind[] {
  let queue: BonusKind[] = [];
  const kinds: BonusKind[] = [];
  for (let i = 0; i < n; i++) {
    const next = nextBonusRound(queue);
    kinds.push(next.kind);
    queue = next.queue;
  }
  return kinds;
}

describe('bonus round order', () => {
  it('plays every kind once in each run of eight', () => {
    const kinds = session(KINDS * 20);
    for (let i = 0; i < kinds.length; i += KINDS) {
      expect(kinds.slice(i, i + KINDS).sort()).toEqual([...BONUS_ROTATION].sort());
    }
  });

  it('never plays the same kind twice in a row, even where one shuffle meets the next', () => {
    for (let s = 0; s < 50; s++) {
      const kinds = session(KINDS * 4);
      kinds.slice(1).forEach((kind, i) => expect(kind).not.toBe(kinds[i]));
    }
  });

  it('opens with a different round from session to session', () => {
    const firsts = new Set(Array.from({ length: 400 }, () => session(1)[0]));
    expect(firsts.size).toBe(KINDS);
  });
});
