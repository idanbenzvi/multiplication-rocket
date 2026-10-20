import type { FactStat } from './types';

// Spaced review: a fact a pilot has mastered comes back now and then to be
// checked, a little later each time it's remembered (a Leitner box system,
// see docs/plans/2026-10-20-spaced-review.md). Its box says how long it can
// wait: a day after it's first mastered, then 3 days, a week, two weeks, a
// month, two months, four. Remembered once its wait is over, it moves up a
// box; a right answer before then changes nothing (practice on the same day
// isn't spacing), and a miss starts its checks over. Left well past its
// check, it's fading: amber on the practice map, not counted as mastered,
// and asked again soon.

/** days a fact can wait for its next check, by box (box 0: not mastered yet) */
export const REVIEW_DAYS = [0, 1, 3, 7, 14, 30, 60, 120];
export const TOP_BOX = REVIEW_DAYS.length - 1;
/** mastery goes by this many of the latest answers… */
export const RECENT_ANSWERS = 5;
/** …this share of them right */
export const MASTERED_SHARE = 0.8;
/** the question picker's weight for a fact whose check is due, and for a fading one (a new fact's is 1) */
export const DUE_WEIGHT = 1.5;
export const FADING_WEIGHT = 2.5;

export type FactStatus = 'untried' | 'practice' | 'mastered' | 'fading';

/** the calendar day on this device (days since 1 January 1970), so "tomorrow" starts at midnight */
export function dayNumber(ms = Date.now()): number {
  return Math.floor((ms - new Date(ms).getTimezoneOffset() * 60_000) / 86_400_000);
}

/** a fact in this box is fading this many days after its last check: twice its wait, and a week past it at least */
export function fadeDays(box: number): number {
  const wait = REVIEW_DAYS[Math.min(box, TOP_BOX)];
  return Math.max(2 * wait, wait + 7);
}

/** the share of `last` that was right */
export function recentShare(last: string): number {
  if (!last) return 0;
  let right = 0;
  for (const c of last) if (c === '1') right++;
  return right / last.length;
}

export function factStatus(stat: FactStat | undefined, day = dayNumber()): FactStatus {
  if (!stat || stat.attempts === 0) return 'untried';
  // saved before reviews, and not upgraded yet: judged the old way
  if (stat.box === undefined) return stat.correct / stat.attempts >= MASTERED_SHARE ? 'mastered' : 'practice';
  if (stat.box === 0) return 'practice';
  return day - (stat.since ?? day) >= fadeDays(stat.box) ? 'fading' : 'mastered';
}

/** mastered, and not fading: the practice map's green */
export function isMastered(stat: FactStat | undefined, day = dayNumber()): boolean {
  return factStatus(stat, day) === 'mastered';
}

const waitOver = (box: number, since: number | undefined, day: number) => day - (since ?? day) >= REVIEW_DAYS[Math.min(box, TOP_BOX)];

/** mastered (or fading), and its wait is over */
export function isDue(stat: FactStat | undefined, day = dayNumber()): boolean {
  return !!stat?.box && waitOver(stat.box, stat.since, day);
}

type Review = Pick<FactStat, 'last' | 'box' | 'since'>;

/** a fact's box after one more answer, on `day` */
export function review(prev: Review, correct: boolean, day: number): Review {
  const last = ((prev.last ?? '') + (correct ? '1' : '0')).slice(-RECENT_ANSWERS);
  const holds = recentShare(last) >= MASTERED_SHARE;
  const box = prev.box ?? 0;
  if (box === 0) return correct && holds ? { last, box: 1, since: day } : { last, box: 0 };
  // a miss starts its checks over: from tomorrow if it was a slip, from scratch if not
  if (!correct) return holds ? { last, box: 1, since: day } : { last, box: 0 };
  if (waitOver(box, prev.since, day)) return { last, box: Math.min(TOP_BOX, box + 1), since: day };
  return { last, box, since: prev.since };
}

/** how often the question picker asks a fact: its dueScore, but a check that's due comes up soon */
export function pickWeight(stat: FactStat | undefined, day = dayNumber()): number {
  const weight = stat?.dueScore ?? 1;
  const status = factStatus(stat, day);
  if (status === 'fading') return Math.max(weight, FADING_WEIGHT);
  if (status === 'mastered' && isDue(stat, day)) return Math.max(weight, DUE_WEIGHT);
  return weight;
}

/** a mastery map has facts saved before reviews */
export function needsUpgrade(mastery: Record<string, FactStat>): boolean {
  for (const key in mastery) if (mastery[key].box === undefined) return true;
  return false;
}

/**
 * Brings facts saved before reviews up to date: each one's answers are
 * replayed from the answer log (oldest first), so its box comes out as if
 * reviews had always been there. A fact the log has nothing on (its answers
 * all came before it, or were trimmed) keeps the old verdict, mastered at
 * 80% of all its answers, and is checked from today.
 */
export function upgradeMastery(
  mastery: Record<string, FactStat>,
  history: ReadonlyArray<{ fact: string; correct: boolean; at: number }>,
  today = dayNumber(),
): Record<string, FactStat> {
  const byFact = new Map<string, Array<{ correct: boolean; at: number }>>();
  for (const e of history) {
    if (mastery[e.fact]?.box !== undefined) continue;
    const list = byFact.get(e.fact);
    if (list) list.push(e);
    else byFact.set(e.fact, [e]);
  }
  const next: Record<string, FactStat> = {};
  for (const [key, stat] of Object.entries(mastery)) {
    if (stat.box !== undefined) {
      next[key] = stat;
      continue;
    }
    const answers = byFact.get(key);
    if (answers?.length) {
      let r: Review = {};
      for (const a of [...answers].sort((x, y) => x.at - y.at)) r = review(r, a.correct, dayNumber(a.at));
      next[key] = { ...stat, ...r };
      continue;
    }
    const n = Math.min(stat.attempts, RECENT_ANSWERS);
    const share = stat.attempts > 0 ? stat.correct / stat.attempts : 0;
    const right = Math.round(share * n);
    const last = '0'.repeat(n - right) + '1'.repeat(right);
    next[key] = share >= MASTERED_SHARE && stat.attempts > 0 ? { ...stat, last, box: 1, since: today } : { ...stat, last, box: 0 };
  }
  return next;
}
