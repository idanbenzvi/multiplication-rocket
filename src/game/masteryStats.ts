import type { FactStat } from './types';
import { opsOf, pairKey, type PilotMission } from './mission';
import { ADD_KINDS } from './addition';
import { isMastered } from './facts';

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

/**
 * Counts over the mission's facts: the 55 distinct facts of the 1-10 times
 * table (3×4 and 4×3 are one fact), or the 55 of the 1-10 addition table
 * plus the 5 kinds of two-digit sum, or (mixed) both.
 */
export function masterySummary(mastery: Record<string, FactStat>, mission: PilotMission = 'mul') {
  let mastered = 0;
  let practice = 0;
  let untried = 0;
  const keys: string[] = [];
  for (const op of opsOf(mission)) {
    for (let a = 1; a <= 10; a++) {
      for (let b = a; b <= 10; b++) keys.push(pairKey(op, a, b));
    }
    if (op === 'add') keys.push(...ADD_KINDS);
  }
  for (const key of keys) {
    const s = mastery[key];
    if (!s || s.attempts === 0) untried++;
    else if (isMastered(s)) mastered++;
    else practice++;
  }
  return { mastered, practice, untried };
}
