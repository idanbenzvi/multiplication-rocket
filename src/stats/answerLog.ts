// Per-pilot answer history for the parent dashboard. Mastery totals alone
// can't show change over time, so every answer is logged here: when, which
// fact, right or wrong, how long it took (normal questions only — bonus
// rounds have no comparable timer), and where it came from.
//
// Stored on the device only, compactly, capped at the most recent entries.

export type AnswerSource = 'question' | 'meteor' | 'battle' | 'stranded' | 'constellation' | 'stardust' | 'crew' | 'sky';

export interface LoggedAnswer {
  /** Date.now() when answered (wall-clock, so days line up with the calendar) */
  at: number;
  /** canonical fact key, e.g. "3x7" */
  fact: string;
  correct: boolean;
  /** response time in ms (paused time excluded); null when not timed */
  ms: number | null;
  source: AnswerSource;
}

const PREFIX = 'multiplication-rocket:log:v1';
const MAX_ENTRIES = 6000;
// append only: the index is what's stored
const SOURCES: AnswerSource[] = ['question', 'meteor', 'battle', 'stranded', 'constellation', 'stardust', 'crew', 'sky'];

// compact row: [at, fact, correct 0/1, ms | -1, source index]
type Row = [number, string, 0 | 1, number, number];

export function logKeyFor(profileId: string): string {
  return `${PREFIX}:${profileId}`;
}

function readRows(profileId: string): Row[] {
  try {
    const raw = localStorage.getItem(logKeyFor(profileId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Row[]) : [];
  } catch {
    return [];
  }
}

export function readLog(profileId: string): LoggedAnswer[] {
  return readRows(profileId).map(([at, fact, c, ms, src]) => ({
    at,
    fact,
    correct: c === 1,
    ms: ms >= 0 ? ms : null,
    source: SOURCES[src] ?? 'question',
  }));
}

export function appendToLog(profileId: string | null, entries: Array<Omit<LoggedAnswer, 'at'> & { at?: number }>) {
  if (!profileId || entries.length === 0) return;
  try {
    const rows = readRows(profileId);
    for (const e of entries) {
      rows.push([
        e.at ?? Date.now(),
        e.fact,
        e.correct ? 1 : 0,
        e.ms === null ? -1 : Math.round(e.ms),
        Math.max(0, SOURCES.indexOf(e.source)),
      ]);
    }
    const trimmed = rows.length > MAX_ENTRIES ? rows.slice(rows.length - MAX_ENTRIES) : rows;
    localStorage.setItem(logKeyFor(profileId), JSON.stringify(trimmed));
  } catch {
    // storage full/blocked: the game carries on, the history just has a gap
  }
}

export function clearLog(profileId: string) {
  try {
    localStorage.removeItem(logKeyFor(profileId));
  } catch {
    // ignore
  }
}
