import type { Fact, FactStat } from './types';

// Canonical pool: a <= b so "3x7" and "7x3" are the same tracked fact.
// randomizeOrder() below still shows either order to the player.
export function buildFactPool(min: number, max: number): Fact[] {
  const facts: Fact[] = [];
  for (let a = min; a <= max; a++) {
    for (let b = a; b <= max; b++) {
      facts.push({ a, b, key: `${a}x${b}`, product: a * b });
    }
  }
  return facts;
}

const DUE_SCORE_MIN = 0.2;
const DUE_SCORE_MAX = 12;
const WRONG_PENALTY = 3;
const CORRECT_DECAY = 0.6;

// A fact's dueScore is its weight in the random question picker. Wrong answers
// push it up sharply so the fact resurfaces soon; correct answers decay it back
// down, but never below a floor so every fact still gets occasional review.
export function nextDueScore(previous: number | undefined, wasCorrect: boolean): number {
  const base = previous ?? 1;
  const updated = wasCorrect ? base * CORRECT_DECAY : base + WRONG_PENALTY;
  return Math.min(DUE_SCORE_MAX, Math.max(DUE_SCORE_MIN, updated));
}

/** one more answer to a fact, folded into a pilot's mastery map (returns a new map) */
export function recordAttempt(mastery: Record<string, FactStat>, key: string, isCorrect: boolean): Record<string, FactStat> {
  const prev: FactStat = mastery[key] ?? { attempts: 0, correct: 0, wrong: 0, dueScore: 1 };
  const next: FactStat = {
    attempts: prev.attempts + 1,
    correct: prev.correct + (isCorrect ? 1 : 0),
    wrong: prev.wrong + (isCorrect ? 0 : 1),
    dueScore: nextDueScore(prev.dueScore, isCorrect),
  };
  return { ...mastery, [key]: next };
}

export function pickNextFact(
  pool: Fact[],
  mastery: Record<string, FactStat>,
  avoidKey?: string,
): Fact {
  const candidates = pool.length > 1 ? pool.filter((f) => f.key !== avoidKey) : pool;
  const weights = candidates.map((f) => mastery[f.key]?.dueScore ?? 1);
  const total = weights.reduce((sum, w) => sum + w, 0);
  let roll = Math.random() * total;
  for (let i = 0; i < candidates.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return candidates[i];
  }
  return candidates[candidates.length - 1];
}

export function randomizeOrder(fact: Fact): { x: number; y: number } {
  return Math.random() < 0.5 ? { x: fact.a, y: fact.b } : { x: fact.b, y: fact.a };
}

// A fact counts as "struggling" once a recent miss has pushed its dueScore
// above this bar — roughly two clean correct answers in a row are needed to
// bring it back down (see nextDueScore's decay). Used to gate leveling: a
// full fuel tank isn't enough to launch while facts are still in this state.
const STRUGGLE_DUE_SCORE_THRESHOLD = 2;

export function getStrugglingFactKeys(mastery: Record<string, FactStat>): string[] {
  return Object.entries(mastery)
    .filter(([, stat]) => stat.dueScore > STRUGGLE_DUE_SCORE_THRESHOLD)
    .map(([key]) => key);
}

export function formatFactKey(key: string): string {
  return key.replace('x', ' × ');
}
