import type { Mission } from './mission';

// Near-miss wrong answers for multiple-choice questions.

function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Wrong answers a child would plausibly give: a neighboring fact (one factor
// off by one — the classic slip), and failing that, nearby numbers.
export function distractors(x: number, y: number, count: number, mission: Mission = 'mul'): number[] {
  if (mission === 'add') return additionDistractors(x, y, count);
  const answer = x * y;
  const near = new Set<number>();
  for (const [a, b] of [
    [x + 1, y],
    [x - 1, y],
    [x, y + 1],
    [x, y - 1],
    [x + 1, y - 1],
    [x - 1, y + 1],
  ]) {
    const v = a * b;
    if (a >= 1 && b >= 1 && v !== answer && v > 0) near.add(v);
  }
  const picks = shuffle([...near]).slice(0, count);
  for (let d = 1; picks.length < count; d++) {
    for (const v of [answer + d, answer - d]) {
      if (picks.length < count && v > 0 && v !== answer && !picks.includes(v)) picks.push(v);
    }
  }
  return picks;
}

// Addition slips: counting on one or two too many or too few, and with
// two-digit numbers a slipped ten (forgetting to carry is exactly 10 short).
// How many sit below the answer is random, so it isn't always the one in
// the middle of the choices.
export function additionDistractors(x: number, y: number, count: number): number[] {
  const answer = x + y;
  const tens = x >= 10 || y >= 10;
  const carried = (x % 10) + (y % 10) >= 10;
  const below = [answer - 1, answer - 2, answer - 3];
  const above = [answer + 1, answer + 2, answer + 3];
  if (tens) {
    // forgot to carry → 10 short; a ten counted twice → 10 over
    (carried ? below : above).unshift(carried ? answer - 10 : answer + 10);
    (carried ? above : below).push(carried ? answer + 10 : answer - 10);
  }
  const lows = below.filter((v) => v > 0);
  const slot = Math.min(lows.length, count, Math.floor(Math.random() * (count + 1)));
  const picks = [...shuffle(lows.slice(0, 3)).slice(0, slot), ...shuffle(above.slice(0, 3)).slice(0, count - slot)];
  for (let d = 4; picks.length < count; d++) {
    for (const v of [answer + d, answer - d]) {
      if (picks.length < count && v > 0 && !picks.includes(v)) picks.push(v);
    }
  }
  return picks;
}
