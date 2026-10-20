// Reaction-time reward curve, matched 1:1 to the on-screen timer in
// QuestionForm.tsx so what the child sees is exactly what they earn: under
// the pilot's pace = big fuel boost, over twice it = small boost, linear ramp
// between.
//
// The pace is each pilot's own (saved with their progress, see nextPace): it
// starts at 5 s and follows how fast they really answer, so a child who
// needs longer gets more time to earn the big boost, and a quick one gets a
// clock worth beating. It's quick to give more time and slow to take it
// back: a few slow answers are enough to ease it off, but speeding up only
// tightens it a little at a time.

/** a new pilot's pace: the big boost under 5 s, the small one past 10 s */
export const DEFAULT_PACE_MS = 5000;
export const MIN_PACE_MS = 2500;
export const MAX_PACE_MS = 10000;
/** the defaults' cut-offs (the pace, and twice it) */
export const FAST_MS = DEFAULT_PACE_MS;
export const SLOW_MS = 2 * DEFAULT_PACE_MS;
export const MAX_SPEED_FACTOR = 2;
export const MIN_SPEED_FACTOR = 0.3;
/** without the clock (a pilot with the speed boost switched off, a crew's navigator): every right answer earns the middle of the range */
export const UNTIMED_SPEED_FACTOR = (MAX_SPEED_FACTOR + MIN_SPEED_FACTOR) / 2;

export type SpeedZone = 'fast' | 'mid' | 'slow';

export function speedZone(elapsedMs: number, paceMs = DEFAULT_PACE_MS): SpeedZone {
  if (elapsedMs < paceMs) return 'fast';
  if (elapsedMs < 2 * paceMs) return 'mid';
  return 'slow';
}

export function speedFactor(elapsedMs: number, paceMs = DEFAULT_PACE_MS): number {
  const clamped = Math.min(2 * paceMs, Math.max(paceMs, elapsedMs));
  const t = (clamped - paceMs) / paceMs;
  return MAX_SPEED_FACTOR - t * (MAX_SPEED_FACTOR - MIN_SPEED_FACTOR);
}

// ---------- the pilot's own pace ----------

/** a pilot's pace: the big boost's window, and their latest right answers' times it follows */
export interface Pace {
  ms: number;
  recent: number[];
}

/** the window is this much longer than their typical right answer, so a typical one just makes the big boost */
const HEADROOM = 1.25;
/** how many of the latest right answers say what's typical (their median, so one distracted answer doesn't count) */
const RECENT = 5;
/** it waits for this many before it moves at all */
const SETTLED = 3;
/** how far it moves towards their pace with each answer: more time is given quickly, taken back slowly */
const GIVE = 0.5;
const TAKE = 0.08;

export function paceMs(pace: Pace | undefined): number {
  return pace?.ms ?? DEFAULT_PACE_MS;
}

/** the pace after one more right answer, answered in `answerMs` (against the clock) */
export function nextPace(pace: Pace | undefined, answerMs: number): Pace {
  const ms = paceMs(pace);
  // (a question left far too long counts as a slow answer, no slower)
  const recent = [...(pace?.recent ?? []), Math.round(Math.min(Math.max(0, answerMs), 2 * MAX_PACE_MS))].slice(-RECENT);
  if (recent.length < SETTLED) return { ms, recent };
  const sorted = [...recent].sort((a, b) => a - b);
  const mid = sorted.length / 2;
  const typical = sorted.length % 2 ? sorted[Math.floor(mid)] : (sorted[mid - 1] + sorted[mid]) / 2;
  const goal = Math.min(MAX_PACE_MS, Math.max(MIN_PACE_MS, typical * HEADROOM));
  const rate = goal > ms ? GIVE : TAKE;
  // (and settles on it once it's that close)
  const next = Math.abs(goal - ms) < 25 ? goal : ms + (goal - ms) * rate;
  return { ms: Math.round(next), recent };
}
