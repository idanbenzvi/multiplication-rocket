import type { PilotMission } from '../game/mission';

// What a pilot has done against the Black Sun (game/blackSun.ts), in each
// mission, saved next to their progress: whether it has opened for them (it
// stays open once it has, even if a fact slips back under 80% later), whether
// they've looked at it since, and how often they've cured it.

export interface BossRecord {
  unlocked: boolean;
  /** opened at least once (till then its card says it's new) */
  seen: boolean;
  wins: number;
  bestRun: number;
}

const PREFIX = 'multiplication-rocket:boss:v1';

export function bossKeyFor(profileId: string): string {
  return `${PREFIX}:${profileId}`;
}

const blank = (): BossRecord => ({ unlocked: false, seen: false, wins: 0, bestRun: 0 });

function readAll(profileId: string): Partial<Record<PilotMission, Partial<BossRecord>>> {
  try {
    const raw = localStorage.getItem(bossKeyFor(profileId));
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function loadBossRecord(profileId: string | null, mission: PilotMission): BossRecord {
  if (!profileId) return blank();
  return { ...blank(), ...readAll(profileId)[mission] };
}

export function saveBossRecord(profileId: string | null, mission: PilotMission, patch: Partial<BossRecord>): BossRecord {
  const next = { ...loadBossRecord(profileId, mission), ...patch };
  if (!profileId) return next;
  try {
    localStorage.setItem(bossKeyFor(profileId), JSON.stringify({ ...readAll(profileId), [mission]: next }));
  } catch {
    // storage blocked/full: it lasts for this session only
  }
  return next;
}

/** a progress reset is a fresh start: the Black Sun waits for this mission to be mastered again */
export function resetBossRecord(profileId: string | null, mission: PilotMission) {
  if (!profileId) return;
  const all = readAll(profileId);
  delete all[mission];
  try {
    localStorage.setItem(bossKeyFor(profileId), JSON.stringify(all));
  } catch {
    // ignore
  }
}
