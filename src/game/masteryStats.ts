import type { FactStat } from './types';
import { opsOf, pairKey, type PilotMission } from './mission';
import { ADD_KINDS } from './addition';
import { SUB_KINDS, subtractionTable } from './subtraction';
import { dayNumber, factStatus, recentShare, TOP_BOX } from './memory';

// Shared by the full practice map and the hover preview, so they always agree.

/**
 * Dim = not tried yet; red = needs practice (brighter as it gets closer);
 * green = mastered (deeper the longer it's been remembered); amber = fading,
 * time for a check (the map also gives it a dashed outline: its status is
 * 'fading').
 */
export function masteryCellStyle(stat: FactStat | undefined, day = dayNumber()): { background: string; color: string } {
  const status = factStatus(stat, day);
  if (!stat || status === 'untried') return { background: 'rgba(255,255,255,0.05)', color: '#5f6b8c' };
  if (status === 'fading') return { background: 'hsl(36, 78%, 30%)', color: 'hsl(42, 100%, 82%)' };
  if (status === 'practice') {
    const share = stat.last !== undefined ? recentShare(stat.last) : stat.correct / stat.attempts;
    const hue = Math.round(share * 22); // red, turning orange-red as it gets closer
    return { background: `hsl(${hue}, 70%, ${30 + Math.round(share * 6)}%)`, color: `hsl(${hue}, 90%, 86%)` };
  }
  const strength = ((stat.box ?? 1) - 1) / (TOP_BOX - 1); // 0 just mastered, 1 the top box
  const hue = Math.round(108 + strength * 18);
  return {
    background: `hsl(${hue}, ${Math.round(56 + strength * 22)}%, ${Math.round(27 + strength * 9)}%)`,
    color: `hsl(${hue}, 90%, 86%)`,
  };
}

/**
 * Counts over the mission's facts: the 55 distinct facts of the 1-10 times
 * table (3×4 and 4×3 are one fact), or the 55 of the 1-10 addition table
 * plus the 5 kinds of two-digit sum, or the 100 differences of the
 * subtraction table plus its 5 kinds, or (mixed) both of the mission's. Fading facts (mastered
 * once, now due a check) are counted on their own, not as mastered.
 */
export function masterySummary(mastery: Record<string, FactStat>, mission: PilotMission = 'mul', day = dayNumber()) {
  const counts = { mastered: 0, fading: 0, practice: 0, untried: 0 };
  const keys: string[] = [];
  for (const op of opsOf(mission)) {
    if (op === 'sub') {
      keys.push(...subtractionTable(1).map((f) => f.key), ...subtractionTable(2).map((f) => f.key), ...SUB_KINDS);
      continue;
    }
    for (let a = 1; a <= 10; a++) {
      for (let b = a; b <= 10; b++) keys.push(pairKey(op, a, b));
    }
    if (op === 'add') keys.push(...ADD_KINDS);
  }
  for (const key of keys) counts[factStatus(mastery[key], day)]++;
  return counts;
}
