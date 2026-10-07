import type { FactStat } from '../game/types';
import type { LoggedAnswer } from './answerLog';
import { masterySummary } from '../game/masteryStats';

// Parent-dashboard metrics, computed from a pilot's answer log (and their
// all-time mastery totals for "hardest facts"). Pure functions — no React.

/** a wrong answer faster than this is counted as a likely guess ("rushing") */
export const FAST_MS = 2000;
/** days with fewer answers than this are too small to judge consistency from */
const MIN_DAY_FOR_CONSISTENCY = 5;

export type Range = 7 | 30 | 'all';

export interface Day {
  key: string; // YYYY-MM-DD (local)
  date: Date;
  answered: number;
  correct: number;
  wrong: number;
  accuracy: number | null; // 0..1
  /** median ms of correct, timed answers */
  medianMs: number | null;
  timed: number;
  fastWrong: number;
  /** fastWrong / timed */
  rushRate: number | null;
}

export interface PeriodStats {
  answered: number;
  accuracy: number | null;
  medianMs: number | null;
  rushRate: number | null;
  /** std-dev of daily accuracy, in percentage points */
  consistencySd: number | null;
  daysPracticed: number;
}

export interface Dashboard {
  days: Day[]; // contiguous, oldest → newest (empty days included)
  current: PeriodStats;
  previous: PeriodStats | null; // the same-length period just before (null for 'all' with little history)
  mastered: number;
  practice: number;
  untried: number;
  hardest: Array<{ fact: string; accuracy: number; attempts: number }>;
  improved: Array<{ fact: string; before: number; after: number }>;
  totalLogged: number;
}

function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function startOfDay(t: number): Date {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function stddev(values: number[]): number | null {
  if (values.length < 2) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length);
}

function bucketDays(entries: LoggedAnswer[], from: Date, to: Date): Day[] {
  const byKey = new Map<string, LoggedAnswer[]>();
  for (const e of entries) {
    const k = dayKey(new Date(e.at));
    const list = byKey.get(k);
    if (list) list.push(e);
    else byKey.set(k, [e]);
  }
  const days: Day[] = [];
  for (const d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
    const key = dayKey(d);
    const list = byKey.get(key) ?? [];
    const correct = list.filter((e) => e.correct).length;
    const timedList = list.filter((e) => e.source === 'question' && e.ms !== null);
    const fastWrong = timedList.filter((e) => !e.correct && (e.ms as number) < FAST_MS).length;
    days.push({
      key,
      date: new Date(d),
      answered: list.length,
      correct,
      wrong: list.length - correct,
      accuracy: list.length ? correct / list.length : null,
      medianMs: median(timedList.filter((e) => e.correct).map((e) => e.ms as number)),
      timed: timedList.length,
      fastWrong,
      rushRate: timedList.length ? fastWrong / timedList.length : null,
    });
  }
  return days;
}

function periodStats(entries: LoggedAnswer[], days: Day[]): PeriodStats {
  const correct = entries.filter((e) => e.correct).length;
  const timed = entries.filter((e) => e.source === 'question' && e.ms !== null);
  const fastWrong = timed.filter((e) => !e.correct && (e.ms as number) < FAST_MS).length;
  const dailyAcc = days.filter((d) => d.answered >= MIN_DAY_FOR_CONSISTENCY).map((d) => (d.accuracy as number) * 100);
  return {
    answered: entries.length,
    accuracy: entries.length ? correct / entries.length : null,
    medianMs: median(timed.filter((e) => e.correct).map((e) => e.ms as number)),
    rushRate: timed.length ? fastWrong / timed.length : null,
    consistencySd: stddev(dailyAcc),
    daysPracticed: days.filter((d) => d.answered > 0).length,
  };
}

export function computeDashboard(
  log: LoggedAnswer[],
  mastery: Record<string, FactStat>,
  range: Range,
  now = Date.now(),
): Dashboard {
  const today = startOfDay(now);
  const firstLogged = log.length ? startOfDay(Math.min(...log.map((e) => e.at))) : today;
  const span = range === 'all' ? Math.max(1, Math.round((today.getTime() - firstLogged.getTime()) / 86400000) + 1) : range;
  const from = new Date(today);
  from.setDate(from.getDate() - (span - 1));
  const inRange = log.filter((e) => e.at >= from.getTime());
  const days = bucketDays(inRange, from, today);

  // the same-length window just before, for "vs previous" deltas
  let previous: PeriodStats | null = null;
  if (range !== 'all') {
    const prevFrom = new Date(from);
    prevFrom.setDate(prevFrom.getDate() - range);
    const prevTo = new Date(from);
    prevTo.setDate(prevTo.getDate() - 1);
    const prevEntries = log.filter((e) => e.at >= prevFrom.getTime() && e.at < from.getTime());
    if (prevEntries.length) previous = periodStats(prevEntries, bucketDays(prevEntries, prevFrom, prevTo));
  }

  // hardest facts: all-time totals, at least 3 tries, lowest accuracy first
  const hardest = Object.entries(mastery)
    .filter(([, s]) => s.attempts >= 3 && s.correct < s.attempts)
    .map(([fact, s]) => ({ fact, accuracy: s.correct / s.attempts, attempts: s.attempts }))
    .sort((a, b) => a.accuracy - b.accuracy || b.attempts - a.attempts)
    .slice(0, 5);

  // most improved: within the range, first half of a fact's tries vs second half
  const byFact = new Map<string, LoggedAnswer[]>();
  for (const e of inRange) {
    const l = byFact.get(e.fact);
    if (l) l.push(e);
    else byFact.set(e.fact, [e]);
  }
  const improved: Dashboard['improved'] = [];
  for (const [fact, list] of byFact) {
    if (list.length < 6) continue;
    const half = Math.floor(list.length / 2);
    const acc = (l: LoggedAnswer[]) => l.filter((e) => e.correct).length / l.length;
    const before = acc(list.slice(0, half));
    const after = acc(list.slice(half));
    if (after - before >= 0.2) improved.push({ fact, before, after });
  }
  improved.sort((a, b) => b.after - b.before - (a.after - a.before));

  const summary = masterySummary(mastery);
  return {
    days,
    current: periodStats(inRange, days),
    previous,
    mastered: summary.mastered,
    practice: summary.practice,
    untried: summary.untried,
    hardest,
    improved: improved.slice(0, 3),
    totalLogged: log.length,
  };
}
