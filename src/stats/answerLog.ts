// Per-pilot answer history for the parent dashboard. Mastery totals alone
// can't show change over time, so every answer is logged here: when, which
// fact, right or wrong, how long it took (normal questions only — bonus
// rounds have no comparable timer), and where it came from.
//
// Stored on the device only, compactly, capped at the most recent entries.
// The missions share one log: each answer says which one it was answered in
// (answers from before mixed missions don't, and go by their fact's key).

import { missionOfKey, PILOT_MISSIONS, type PilotMission } from '../game/mission';
import { missionOf } from '../profiles/useProfiles';

export type AnswerSource = 'question' | 'meteor' | 'battle' | 'stranded' | 'constellation' | 'stardust' | 'crew' | 'sky' | 'eclipse' | 'sun' | 'road' | 'traffic' | 'boss' | 'canyon';

export interface LoggedAnswer {
  /** Date.now() when answered (wall-clock, so days line up with the calendar) */
  at: number;
  /** what the answer is tracked under, e.g. "3x7", "3+4" or "2d+1d:c" */
  fact: string;
  correct: boolean;
  /** response time in ms (paused time excluded); null when not timed */
  ms: number | null;
  source: AnswerSource;
  /** the mission it was answered in */
  mission: PilotMission;
}

const PREFIX = 'multiplication-rocket:log:v1';
const MAX_ENTRIES = 6000;
// append only: the index is what's stored
const SOURCES: AnswerSource[] = ['question', 'meteor', 'battle', 'stranded', 'constellation', 'stardust', 'crew', 'sky', 'eclipse', 'sun', 'road', 'traffic', 'boss', 'canyon'];

// compact row: [at, fact, correct 0/1, ms | -1, source index, mission index (missing on older rows)]
type Row = [number, string, 0 | 1, number, number, number?];

/** the mission an answer was given in (an older row's, by its fact) */
function missionOfRow(row: Row): PilotMission {
  return PILOT_MISSIONS[row[5] ?? -1] ?? missionOfKey(row[1]);
}

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
  return readRows(profileId).map((row) => ({
    at: row[0],
    fact: row[1],
    correct: row[2] === 1,
    ms: row[3] >= 0 ? row[3] : null,
    source: SOURCES[row[4]] ?? 'question',
    mission: missionOfRow(row),
  }));
}

/** a pilot's answers, in the mission they're on now */
export function appendToLog(profileId: string | null, entries: Array<Omit<LoggedAnswer, 'at' | 'mission'> & { at?: number }>) {
  if (!profileId || entries.length === 0) return;
  try {
    const rows = readRows(profileId);
    const mission = PILOT_MISSIONS.indexOf(missionOf(profileId));
    for (const e of entries) {
      rows.push([
        e.at ?? Date.now(),
        e.fact,
        e.correct ? 1 : 0,
        e.ms === null ? -1 : Math.round(e.ms),
        Math.max(0, SOURCES.indexOf(e.source)),
        mission,
      ]);
    }
    const trimmed = rows.length > MAX_ENTRIES ? rows.slice(rows.length - MAX_ENTRIES) : rows;
    localStorage.setItem(logKeyFor(profileId), JSON.stringify(trimmed));
  } catch {
    // storage full/blocked: the game carries on, the history just has a gap
  }
}

/** forget a pilot's history: all of it, or just one mission's */
export function clearLog(profileId: string, mission?: PilotMission) {
  try {
    if (!mission) {
      localStorage.removeItem(logKeyFor(profileId));
      return;
    }
    const rows = readRows(profileId).filter((row) => missionOfRow(row) !== mission);
    localStorage.setItem(logKeyFor(profileId), JSON.stringify(rows));
  } catch {
    // ignore
  }
}
