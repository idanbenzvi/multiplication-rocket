import type { FactStat } from './types';

// Shared by the full practice map and the hover preview, so they always agree.

/** green = mastered → red = needs practice; dim = not tried yet */
export function masteryCellStyle(stat: FactStat | undefined): { background: string; color: string } {
  if (!stat || stat.attempts === 0) {
    return { background: 'rgba(255,255,255,0.05)', color: '#5f6b8c' };
  }
  const ratio = stat.correct / stat.attempts;
  const hue = ratio * 120; // 0 = red, 120 = green
  return {
    background: `hsl(${hue}, 70%, 32%)`,
    color: `hsl(${hue}, 90%, 85%)`,
  };
}

/** counts over the 55 distinct facts of the 1-10 table (3×4 and 4×3 are one fact) */
export function masterySummary(mastery: Record<string, FactStat>) {
  let mastered = 0;
  let practice = 0;
  let untried = 0;
  for (let a = 1; a <= 10; a++) {
    for (let b = a; b <= 10; b++) {
      const s = mastery[`${a}x${b}`];
      if (!s || s.attempts === 0) untried++;
      else if (s.correct / s.attempts >= 0.8) mastered++;
      else practice++;
    }
  }
  return { mastered, practice, untried };
}
