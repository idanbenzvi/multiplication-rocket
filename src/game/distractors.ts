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
export function distractors(x: number, y: number, count: number): number[] {
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
