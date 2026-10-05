// The Wormhole challenge: a target number and five floating drills, three of
// which equal the target. Picking all three opens a wormhole that's worth a
// double boost.
//
// Within the 1-10 table no number has three *different* factor pairs (12 is
// only 2×6 and 3×4), so the three correct drills may include a swapped
// order (3×4 and 4×3) — but always at least two genuinely different pairs,
// so the round is about knowing the table, and quietly teaches that order
// doesn't matter.

export const CHALLENGE_EVERY = 6; // every Nth question becomes a challenge
export const CORRECT_PICKS = 3;
export const DRILL_COUNT = 5;
export const WRONG_PICKS_ALLOWED = 1; // the second wrong pick collapses the wormhole

export interface Drill {
  id: number;
  x: number;
  y: number;
  correct: boolean;
}

export interface Challenge {
  target: number;
  drills: Drill[];
  createdAt: number;
}

const MIN = 1;
const MAX = 10;

function orderedPairs(n: number): Array<[number, number]> {
  const pairs: Array<[number, number]> = [];
  for (let x = MIN; x <= MAX; x++) {
    if (n % x === 0 && n / x >= MIN && n / x <= MAX) pairs.push([x, n / x]);
  }
  return pairs;
}

function unorderedCount(pairs: Array<[number, number]>): number {
  return pairs.filter(([x, y]) => x <= y).length;
}

// Targets that can carry a round: ≥3 drills that equal it, from ≥2 distinct
// pairs. Low levels may use easy ones (6, 8, 10); from level 3 on, the ×1
// tricks are dropped so it's never "1×12"-style freebies.
function eligibleTargets(level: number): number[] {
  const targets: number[] = [];
  for (let n = 4; n <= MAX * MAX; n++) {
    let pairs = orderedPairs(n);
    if (level >= 3) pairs = pairs.filter(([x, y]) => x !== 1 && y !== 1);
    if (pairs.length >= CORRECT_PICKS && unorderedCount(pairs) >= 2) targets.push(n);
  }
  return targets;
}

function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickCorrect(target: number, level: number): Array<[number, number]> {
  let pairs = orderedPairs(target);
  if (level >= 3) pairs = pairs.filter(([x, y]) => x !== 1 && y !== 1);
  // Retry until the three picks span at least two distinct factor pairs.
  for (;;) {
    const picks = shuffle(pairs).slice(0, CORRECT_PICKS);
    const distinct = new Set(picks.map(([x, y]) => `${Math.min(x, y)}x${Math.max(x, y)}`));
    if (distinct.size >= 2) return picks;
  }
}

// Decoys are near-misses that look plausible: one factor matches a correct
// drill and the other is off by one or two, so the product lands close to
// the target instead of being an obvious throwaway.
function pickDecoys(target: number, correct: Array<[number, number]>): Array<[number, number]> {
  const seen = new Set(correct.map(([x, y]) => `${x}x${y}`));
  const candidates: Array<[number, number]> = [];
  for (const [x, y] of correct) {
    for (const d of [-2, -1, 1, 2]) {
      for (const [a, b] of [
        [x, y + d],
        [x + d, y],
      ]) {
        if (a < MIN || a > MAX || b < MIN || b > MAX || a * b === target) continue;
        const key = `${a}x${b}`;
        if (seen.has(key)) continue;
        seen.add(key);
        candidates.push([a, b]);
      }
    }
  }
  return shuffle(candidates).slice(0, DRILL_COUNT - CORRECT_PICKS);
}

export function buildChallenge(level: number): Challenge {
  const targets = eligibleTargets(level);
  const target = targets[Math.floor(Math.random() * targets.length)];
  const correct = pickCorrect(target, level);
  const decoys = pickDecoys(target, correct);
  const drills = shuffle([
    ...correct.map(([x, y]) => ({ x, y, correct: true })),
    ...decoys.map(([x, y]) => ({ x, y, correct: false })),
  ]).map((d, id) => ({ ...d, id }));
  return { target, drills, createdAt: Date.now() };
}
