import type { FactStat } from './types';
import { buildFactPool, pickNextFact } from './facts';

// Split Sky: two phones side by side, one star array across both screens,
// split at the seam where they touch. Each child counts their own half
// (6 × 3, 6 × 5), then together they find the whole (6 × 8): the
// distributive property, 6 × 8 = 6 × 3 + 6 × 5. The host phone runs
// skyReducer as the referee and sends the state to the other phone. See
// docs/plans/2026-10-08-split-sky.md.

export type Side = 'left' | 'right';
export type SkyStage = 'count' | 'join';

export const SKY_ROUNDS = 5;
/** misses on one question before its answer is shown */
export const MAX_MISSES = 2;

export interface SkyPlayer {
  name: string;
  avatar: string;
}

export interface SkyRound {
  rows: number;
  /** columns on each phone */
  cols: Record<Side, number>;
}

export interface SideProgress {
  done: boolean;
  misses: number;
}

export interface SkyState {
  game: 'split';
  phase: 'lobby' | 'count' | 'join' | 'lit' | 'summary';
  players: Partial<Record<Side, SkyPlayer>>;
  rounds: SkyRound[];
  roundIndex: number;
  count: Record<Side, SideProgress>;
  join: Record<Side, SideProgress>;
  /** constellations lit this game */
  lit: number;
  /** rounds where neither child missed */
  perfect: number;
}

export type SkyAction =
  | { type: 'player'; side: Side; player: SkyPlayer | undefined }
  | { type: 'swap' }
  | { type: 'start'; rounds: SkyRound[] }
  | { type: 'answer'; side: Side; stage: SkyStage; value: number }
  | { type: 'next' };

// ---------- building rounds ----------

/** the columns split between the phones: a 5 off when there's room (7 × 8 = 7 × 5 + 7 × 3) */
export function splitColumns(cols: number): Record<Side, number> {
  const a = cols > 5 ? 5 : 1 + Math.floor(Math.random() * (cols - 1));
  return Math.random() < 0.5 ? { left: a, right: cols - a } : { left: cols - a, right: a };
}

// Whole facts from the host pilot's mastery weighting, at least 2 rows and
// 3 columns (so both halves have something to count), no repeats in a game.
export function buildSkyRounds(mastery: Record<string, FactStat>, n = SKY_ROUNDS): SkyRound[] {
  const pool = buildFactPool(2, 10).filter((f) => f.b >= 3);
  const rounds: SkyRound[] = [];
  const used = new Set<string>();
  for (let tries = 0; rounds.length < n && tries < 100; tries++) {
    const fact = pickNextFact(pool, mastery);
    if (used.has(fact.key)) continue;
    used.add(fact.key);
    // the long side goes across the phones; either factor works if both are 3+
    const [rows, cols] = fact.a >= 3 && Math.random() < 0.5 ? [fact.b, fact.a] : [fact.a, fact.b];
    rounds.push({ rows, cols: splitColumns(cols) });
  }
  return rounds;
}

// ---------- the referee ----------

const fresh = (): Record<Side, SideProgress> => ({ left: { done: false, misses: 0 }, right: { done: false, misses: 0 } });

export function initialSkyState(): SkyState {
  return { game: 'split', phase: 'lobby', players: {}, rounds: [], roundIndex: 0, count: fresh(), join: fresh(), lit: 0, perfect: 0 };
}

export function currentRound(s: SkyState): SkyRound | null {
  return s.rounds[s.roundIndex] ?? null;
}

/** the right answer for one phone's question */
export function expectedAnswer(round: SkyRound, side: Side, stage: SkyStage): number {
  return stage === 'count' ? round.rows * round.cols[side] : round.rows * (round.cols.left + round.cols.right);
}

const bothDone = (p: Record<Side, SideProgress>) => p.left.done && p.right.done;
const noMisses = (p: Record<Side, SideProgress>) => p.left.misses === 0 && p.right.misses === 0;

export function skyReducer(s: SkyState, action: SkyAction): SkyState {
  switch (action.type) {
    case 'player': {
      if (s.phase !== 'lobby' && !action.player) return s; // a dropped phone keeps its seat mid-game
      return { ...s, players: { ...s.players, [action.side]: action.player } };
    }
    case 'swap':
      if (s.phase !== 'lobby') return s;
      return { ...s, players: { left: s.players.right, right: s.players.left } };
    case 'start':
      if (!s.players.left || !s.players.right || action.rounds.length === 0) return s;
      if (s.phase !== 'lobby' && s.phase !== 'summary') return s;
      return { ...initialSkyState(), players: s.players, rounds: action.rounds, phase: 'count' };
    case 'answer': {
      const round = currentRound(s);
      if (!round || s.phase !== action.stage) return s;
      const progress = s[action.stage];
      const mine = progress[action.side];
      if (mine.done) return s;
      const right = action.value === expectedAnswer(round, action.side, action.stage);
      const misses = mine.misses + (right ? 0 : 1);
      const nextProgress = { ...progress, [action.side]: { done: right || misses >= MAX_MISSES, misses } };
      const next = { ...s, [action.stage]: nextProgress };
      if (!bothDone(nextProgress)) return next;
      if (action.stage === 'count') return { ...next, phase: 'join' };
      return {
        ...next,
        phase: 'lit',
        lit: s.lit + 1,
        perfect: s.perfect + (noMisses(s.count) && noMisses(nextProgress) ? 1 : 0),
      };
    }
    case 'next': {
      if (s.phase !== 'lit') return s;
      if (s.roundIndex + 1 >= s.rounds.length) return { ...s, phase: 'summary' };
      return { ...s, phase: 'count', roundIndex: s.roundIndex + 1, count: fresh(), join: fresh() };
    }
  }
}
