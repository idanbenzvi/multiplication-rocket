import { describe, expect, it } from 'vitest';
import {
  buildEclipseRounds,
  ECLIPSE_ROUNDS,
  eclipseReducer,
  initialEclipseState,
  orbitChoices,
  predictChoices,
  type EclipseRound,
  type EclipseState,
} from './eclipse';
import { MAX_MISSES } from './splitSky';

const noa = { name: 'Noa', avatar: '🐶' };
const ari = { name: 'Ari', avatar: '🐱' };
const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
const round = (left: number, right: number, stepsL: number, stepsR: number): EclipseRound => ({
  periods: { left, right },
  eclipse: left * right,
  steps: { left: stepsL, right: stepsR },
});

function playing(rounds: EclipseRound[] = [round(3, 4, 5, 4)]): EclipseState {
  let s = eclipseReducer(initialEclipseState(), { type: 'player', side: 'left', player: noa });
  s = eclipseReducer(s, { type: 'player', side: 'right', player: ari });
  return eclipseReducer(s, { type: 'start', rounds });
}

function countAll(s: EclipseState): EclipseState {
  const r = s.rounds[s.roundIndex];
  for (const side of ['left', 'right'] as const) {
    for (let k = s.orbit[side].step + 1; k <= r.steps[side]; k++) {
      s = eclipseReducer(s, { type: 'orbit', side, value: r.periods[side] * k });
    }
  }
  return s;
}

describe('buildEclipseRounds', () => {
  it('picks different coprime periods whose product is the first eclipse', () => {
    for (let i = 0; i < 30; i++) {
      const rounds = buildEclipseRounds({});
      expect(rounds).toHaveLength(ECLIPSE_ROUNDS);
      for (const r of rounds) {
        const { left, right } = r.periods;
        expect(left).not.toBe(right);
        expect(Math.min(left, right)).toBeGreaterThanOrEqual(2);
        expect(Math.max(left, right)).toBeLessThanOrEqual(10);
        expect(gcd(left, right)).toBe(1);
        expect(r.eclipse).toBe(left * right);
        expect(r.eclipse).toBeLessThanOrEqual(60);
      }
    }
  });

  it('counts each moon one or two orbits past the eclipse', () => {
    for (const r of buildEclipseRounds({})) {
      for (const side of ['left', 'right'] as const) {
        const beyond = r.steps[side] - r.eclipse / r.periods[side];
        expect([1, 2]).toContain(beyond);
      }
    }
  });
});

describe('eclipseReducer', () => {
  it('counts orbits one multiple at a time', () => {
    let s = playing();
    s = eclipseReducer(s, { type: 'orbit', side: 'left', value: 3 });
    expect(s.orbit.left.step).toBe(1);
    s = eclipseReducer(s, { type: 'orbit', side: 'left', value: 7 });
    expect(s.orbit.left).toMatchObject({ step: 1, misses: 1 });
    s = eclipseReducer(s, { type: 'orbit', side: 'left', value: 6 });
    expect(s.orbit.left).toMatchObject({ step: 2, misses: 0, totalMisses: 1 });
  });

  it('reveals a step after too many misses', () => {
    let s = playing();
    for (let i = 0; i < MAX_MISSES; i++) s = eclipseReducer(s, { type: 'orbit', side: 'right', value: 5 });
    expect(s.orbit.right).toMatchObject({ step: 1, misses: 0, totalMisses: MAX_MISSES });
  });

  it('moves to the prediction once both moons are counted, not before', () => {
    let s = playing();
    const r = s.rounds[0];
    for (let k = 1; k <= r.steps.left; k++) s = eclipseReducer(s, { type: 'orbit', side: 'left', value: 3 * k });
    expect(s.phase).toBe('orbit');
    // a finished moon ignores more answers
    expect(eclipseReducer(s, { type: 'orbit', side: 'left', value: 18 })).toBe(s);
    s = countAll(s);
    expect(s.phase).toBe('predict');
  });

  it('ignores predictions during the orbit stage', () => {
    const s = playing();
    expect(eclipseReducer(s, { type: 'predict', side: 'left', value: 12 })).toBe(s);
  });

  it('shows the eclipse when both predict it, counting perfect rounds', () => {
    let s = countAll(playing());
    s = eclipseReducer(s, { type: 'predict', side: 'left', value: 12 });
    expect(s.phase).toBe('predict');
    s = eclipseReducer(s, { type: 'predict', side: 'right', value: 12 });
    expect(s).toMatchObject({ phase: 'eclipse', eclipses: 1, perfect: 1 });
  });

  it('a missed orbit step spoils the perfect round', () => {
    let s = eclipseReducer(playing(), { type: 'orbit', side: 'left', value: 4 });
    s = countAll(s);
    s = eclipseReducer(s, { type: 'predict', side: 'left', value: 12 });
    s = eclipseReducer(s, { type: 'predict', side: 'right', value: 12 });
    expect(s).toMatchObject({ eclipses: 1, perfect: 0 });
  });

  it('goes round by round to the summary', () => {
    let s = playing([round(3, 4, 5, 4), round(2, 5, 6, 3)]);
    const finish = (x: EclipseState) => {
      x = countAll(x);
      const e = x.rounds[x.roundIndex].eclipse;
      x = eclipseReducer(x, { type: 'predict', side: 'left', value: e });
      return eclipseReducer(x, { type: 'predict', side: 'right', value: e });
    };
    s = eclipseReducer(finish(s), { type: 'next' });
    expect(s).toMatchObject({ phase: 'orbit', roundIndex: 1 });
    expect(s.orbit.left).toEqual({ step: 0, misses: 0, totalMisses: 0 });
    s = eclipseReducer(finish(s), { type: 'next' });
    expect(s).toMatchObject({ phase: 'summary', eclipses: 2 });
  });
});

describe('choices', () => {
  it('offers the next tick among skip-counting slips, smallest first', () => {
    for (const [p, k] of [
      [2, 1],
      [3, 4],
      [7, 6],
    ]) {
      const c = orbitChoices(p, k);
      expect(c).toContain(p * k);
      expect(new Set(c).size).toBe(c.length);
      expect(c.length).toBeGreaterThanOrEqual(3);
      expect([...c].sort((a, b) => a - b)).toEqual(c);
      expect(c.every((v) => v > 0)).toBe(true);
    }
  });

  it('offers the eclipse among four different numbers', () => {
    const c = predictChoices(round(3, 4, 5, 4), 'left');
    expect(c).toHaveLength(4);
    expect(new Set(c).size).toBe(4);
    expect(c).toContain(12);
  });
});
