// The Wormhole challenge: a target number and five floating drills, three of
// which equal the target. Picking all three opens a wormhole that's worth a
// double boost.
//
// Within the 1-10 table no number has three *different* factor pairs (12 is
// only 2×6 and 3×4), so the three correct drills may include a swapped
// order (3×4 and 4×3) — but always at least two genuinely different pairs,
// so the round is about knowing the table, and quietly teaches that order
// doesn't matter.
//
// On the addition mission the drills are sums that make the target (3 + 5,
// 6 + 2, 1 + 7 = 8): number bonds, at the pilot's stage.

import type { Mission } from './mission';

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
  mission: Mission;
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

export function buildChallenge(level: number, mission: Mission = 'mul', stage = 1): Challenge {
  if (mission === 'add') return buildAdditionChallenge(stage);
  if (mission === 'sub') return buildSubtractionChallenge(stage);
  const targets = eligibleTargets(level);
  const target = targets[Math.floor(Math.random() * targets.length)];
  const correct = pickCorrect(target, level);
  const decoys = pickDecoys(target, correct);
  const drills = shuffle([
    ...correct.map(([x, y]) => ({ x, y, correct: true })),
    ...decoys.map(([x, y]) => ({ x, y, correct: false })),
  ]).map((d, id) => ({ ...d, id }));
  return { mission, target, drills, createdAt: Date.now() };
}

// ---------- addition ----------

const pick = <T,>(items: T[]) => items[Math.floor(Math.random() * items.length)];

/** the target and the range of each number in the drills, by stage */
function bondRange(stage: number): { target: number; lo: number; hi: number } {
  // each target has at least three ways to make it
  if (stage <= 1) return { target: 6 + Math.floor(Math.random() * 5), lo: 1, hi: 9 }; // 6-10
  if (stage === 2) return { target: 11 + Math.floor(Math.random() * 6), lo: 1, hi: 10 }; // 11-16
  return { target: pick([40, 50, 60, 70, 80, 90, 100]), lo: 11, hi: 89 }; // round numbers
}

// Three different pairs that make the target, and two decoys a number off
// (or, with two-digit numbers, sometimes a ten off) so the sum is close.
export function buildAdditionChallenge(stage: number): Challenge {
  const { target, lo, hi } = bondRange(stage);
  const pairs: Array<[number, number]> = [];
  for (let a = lo; a <= target - lo; a++) {
    const b = target - a;
    if (a <= b && b <= hi) pairs.push([a, b]);
  }
  const flip = ([a, b]: [number, number]): [number, number] => (Math.random() < 0.5 ? [a, b] : [b, a]);
  const correct = shuffle(pairs).slice(0, CORRECT_PICKS).map(flip);
  const seen = new Set(correct.map(([a, b]) => `${Math.min(a, b)}+${Math.max(a, b)}`));
  const nudges = stage >= 3 ? [-10, -1, 1, 10] : [-2, -1, 1, 2];
  const decoys: Array<[number, number]> = [];
  for (const [a, b] of shuffle([...correct])) {
    for (const d of shuffle(nudges)) {
      const pair: [number, number] = Math.random() < 0.5 ? [a + d, b] : [a, b + d];
      const key = `${Math.min(...pair)}+${Math.max(...pair)}`;
      if (pair[0] < 1 || pair[1] < 1 || seen.has(key) || decoys.length >= DRILL_COUNT - CORRECT_PICKS) continue;
      seen.add(key);
      decoys.push(pair);
      break;
    }
  }
  const drills = shuffle([
    ...correct.map(([x, y]) => ({ x, y, correct: true })),
    ...decoys.map(([x, y]) => ({ x, y, correct: false })),
  ]).map((d, id) => ({ ...d, id }));
  return { mission: 'add', target, drills, createdAt: Date.now() };
}

// ---------- subtraction ----------

/** the difference to make and the biggest number taken from, by stage */
function gapRange(stage: number): { target: number; lo: number; hi: number } {
  // each target has at least three ways to make it
  if (stage <= 1) return { target: 2 + Math.floor(Math.random() * 4), lo: 1, hi: 10 }; // 2-5, from up to 10
  if (stage === 2) return { target: 3 + Math.floor(Math.random() * 7), lo: 11, hi: 20 }; // 3-9, from the teens
  return { target: pick([20, 30, 40, 50]), lo: 31, hi: 99 }; // round numbers from two-digit ones
}

// Three different pairs whose difference is the target (9 − 4, 7 − 2, 10 − 5
// all make 5), the bigger number first, and two decoys a number off (with
// two-digit numbers, sometimes a ten off) so the difference is close.
export function buildSubtractionChallenge(stage: number): Challenge {
  const { target, lo, hi } = gapRange(stage);
  const pairs: Array<[number, number]> = [];
  for (let a = Math.max(lo, target + 1); a <= hi; a++) {
    const b = a - target;
    if (stage >= 3 ? b >= 11 && b % 10 !== 0 : b <= 10) pairs.push([a, b]);
  }
  const correct = shuffle(pairs).slice(0, CORRECT_PICKS);
  const seen = new Set(correct.map(([a, b]) => `${a}-${b}`));
  const nudges = stage >= 3 ? [-10, -1, 1, 10] : [-2, -1, 1, 2];
  const decoys: Array<[number, number]> = [];
  for (const [a, b] of shuffle([...correct])) {
    for (const d of shuffle(nudges)) {
      const pair: [number, number] = Math.random() < 0.5 ? [a + d, b] : [a, b + d];
      const key = `${pair[0]}-${pair[1]}`;
      if (pair[1] < 1 || pair[0] <= pair[1] || pair[0] > hi || seen.has(key) || decoys.length >= DRILL_COUNT - CORRECT_PICKS) continue;
      seen.add(key);
      decoys.push(pair);
      break;
    }
  }
  const drills = shuffle([
    ...correct.map(([x, y]) => ({ x, y, correct: true })),
    ...decoys.map(([x, y]) => ({ x, y, correct: false })),
  ]).map((d, id) => ({ ...d, id }));
  return { mission: 'sub', target, drills, createdAt: Date.now() };
}
