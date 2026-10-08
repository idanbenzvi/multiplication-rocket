import type { FactStat } from './types';
import { buildFactPool, pickNextFact } from './facts';
import { MAX_MISSES, type Side, type SideProgress, type SkyPlayer } from './splitSky';

// Eclipse Hunters: each phone has one moon, going round every 3 ticks on
// one phone and every 4 on the other. Each child skip-counts their own moon
// (3, 6, 9, 12, 15… and 4, 8, 12, 16…), then together they work out when
// both line up first: the eclipse. The periods never share a factor, so
// that's exactly their product, 3 × 4 = 12. Each phone sees only its own
// list, so finding the number in both means comparing out loud.
// The host phone runs eclipseReducer as the referee (see duo.ts).

export const ECLIPSE_ROUNDS = 4;
const MAX_ECLIPSE = 60;

export interface EclipseRound {
  periods: Record<Side, number>;
  /** the first tick both moons line up (the product: the periods are coprime) */
  eclipse: number;
  /** how many multiples each phone counts: one or two orbits past the eclipse */
  steps: Record<Side, number>;
}

export interface OrbitProgress {
  /** multiples counted so far */
  step: number;
  /** misses on the current step */
  misses: number;
  /** misses this round, for "perfect" */
  totalMisses: number;
}

export interface EclipseState {
  game: 'eclipse';
  phase: 'lobby' | 'orbit' | 'predict' | 'eclipse' | 'summary';
  players: Partial<Record<Side, SkyPlayer>>;
  rounds: EclipseRound[];
  roundIndex: number;
  orbit: Record<Side, OrbitProgress>;
  predict: Record<Side, SideProgress>;
  eclipses: number;
  perfect: number;
}

export type EclipseAction =
  | { type: 'player'; side: Side; player: SkyPlayer | undefined }
  | { type: 'swap' }
  | { type: 'start'; rounds: EclipseRound[] }
  | { type: 'orbit'; side: Side; value: number }
  | { type: 'predict'; side: Side; value: number }
  | { type: 'next' };

// ---------- building rounds ----------

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function buildEclipseRounds(mastery: Record<string, FactStat>, n = ECLIPSE_ROUNDS): EclipseRound[] {
  const pool = buildFactPool(2, 10).filter((f) => f.a !== f.b && gcd(f.a, f.b) === 1 && f.product <= MAX_ECLIPSE);
  const rounds: EclipseRound[] = [];
  const used = new Set<string>();
  for (let tries = 0; rounds.length < n && tries < 100; tries++) {
    const fact = pickNextFact(pool, mastery);
    if (used.has(fact.key)) continue;
    used.add(fact.key);
    const [left, right] = Math.random() < 0.5 ? [fact.a, fact.b] : [fact.b, fact.a];
    const beyond = () => 1 + Math.floor(Math.random() * 2);
    rounds.push({
      periods: { left, right },
      eclipse: fact.product,
      steps: { left: fact.product / left + beyond(), right: fact.product / right + beyond() },
    });
  }
  return rounds;
}

/** the next tick (period × k) among the slips skip-counting children make, smallest first */
export function orbitChoices(period: number, k: number): number[] {
  const next = period * k;
  const slips = shuffle([next + period, next + 1, next - 1, next + 2, next - 2].filter((v) => v > 0 && v !== next));
  return [next, ...new Set(slips)].slice(0, 4).sort((a, b) => a - b);
}

// The eclipse, plus the slips: the tick before it in my list, the next
// common one, the two periods added up instead of multiplied, and so on.
export function predictChoices(round: EclipseRound, side: Side): number[] {
  const { eclipse, periods } = round;
  const mine = periods[side];
  const theirs = periods[side === 'left' ? 'right' : 'left'];
  const slips = [eclipse - mine, eclipse + mine, mine + theirs, eclipse - theirs, eclipse * 2, eclipse + 1];
  const picked: number[] = [];
  for (const v of slips) if (v > 0 && v !== eclipse && !picked.includes(v) && picked.length < 3) picked.push(v);
  return shuffle([eclipse, ...picked]);
}

// ---------- the referee ----------

const freshOrbit = (): Record<Side, OrbitProgress> => ({
  left: { step: 0, misses: 0, totalMisses: 0 },
  right: { step: 0, misses: 0, totalMisses: 0 },
});
const freshPredict = (): Record<Side, SideProgress> => ({ left: { done: false, misses: 0 }, right: { done: false, misses: 0 } });

export function initialEclipseState(): EclipseState {
  return {
    game: 'eclipse',
    phase: 'lobby',
    players: {},
    rounds: [],
    roundIndex: 0,
    orbit: freshOrbit(),
    predict: freshPredict(),
    eclipses: 0,
    perfect: 0,
  };
}

export function eclipseReducer(s: EclipseState, action: EclipseAction): EclipseState {
  const round = s.rounds[s.roundIndex];
  switch (action.type) {
    case 'player':
      if (s.phase !== 'lobby' && !action.player) return s; // a dropped phone keeps its seat mid-game
      return { ...s, players: { ...s.players, [action.side]: action.player } };
    case 'swap':
      if (s.phase !== 'lobby') return s;
      return { ...s, players: { left: s.players.right, right: s.players.left } };
    case 'start':
      if (!s.players.left || !s.players.right || action.rounds.length === 0) return s;
      if (s.phase !== 'lobby' && s.phase !== 'summary') return s;
      return { ...initialEclipseState(), players: s.players, rounds: action.rounds, phase: 'orbit' };
    case 'orbit': {
      if (!round || s.phase !== 'orbit') return s;
      const mine = s.orbit[action.side];
      if (mine.step >= round.steps[action.side]) return s;
      const right = action.value === round.periods[action.side] * (mine.step + 1);
      const misses = mine.misses + (right ? 0 : 1);
      const advance = right || misses >= MAX_MISSES;
      const next: OrbitProgress = {
        step: mine.step + (advance ? 1 : 0),
        misses: advance ? 0 : misses,
        totalMisses: mine.totalMisses + (right ? 0 : 1),
      };
      const orbit = { ...s.orbit, [action.side]: next };
      const done = orbit.left.step >= round.steps.left && orbit.right.step >= round.steps.right;
      return { ...s, orbit, phase: done ? 'predict' : 'orbit' };
    }
    case 'predict': {
      if (!round || s.phase !== 'predict') return s;
      const mine = s.predict[action.side];
      if (mine.done) return s;
      const right = action.value === round.eclipse;
      const misses = mine.misses + (right ? 0 : 1);
      const predict = { ...s.predict, [action.side]: { done: right || misses >= MAX_MISSES, misses } };
      if (!predict.left.done || !predict.right.done) return { ...s, predict };
      const clean =
        s.orbit.left.totalMisses + s.orbit.right.totalMisses + predict.left.misses + predict.right.misses === 0;
      return { ...s, predict, phase: 'eclipse', eclipses: s.eclipses + 1, perfect: s.perfect + (clean ? 1 : 0) };
    }
    case 'next':
      if (s.phase !== 'eclipse') return s;
      if (s.roundIndex + 1 >= s.rounds.length) return { ...s, phase: 'summary' };
      return { ...s, phase: 'orbit', roundIndex: s.roundIndex + 1, orbit: freshOrbit(), predict: freshPredict() };
  }
}
