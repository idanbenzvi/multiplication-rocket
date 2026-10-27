import type { PilotMission } from '../game/mission';

// What a pilot has flown in the cockpit's Canyon Run, in each mission, saved
// next to their progress: the level whose fuel a run last paid (a run pays
// fuel once a level; the rest are for fun), their most bullseyes in a run,
// and how many runs they've flown.

export interface CanyonRecord {
  paidLevel: number;
  best: number;
  runs: number;
}

const PREFIX = 'multiplication-rocket:canyon:v1';

export function canyonKeyFor(profileId: string): string {
  return `${PREFIX}:${profileId}`;
}

const blank = (): CanyonRecord => ({ paidLevel: 0, best: 0, runs: 0 });

function readAll(profileId: string): Partial<Record<PilotMission, Partial<CanyonRecord>>> {
  try {
    const raw = localStorage.getItem(canyonKeyFor(profileId));
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function loadCanyonRecord(profileId: string | null, mission: PilotMission): CanyonRecord {
  if (!profileId) return blank();
  return { ...blank(), ...readAll(profileId)[mission] };
}

export function saveCanyonRecord(profileId: string | null, mission: PilotMission, patch: Partial<CanyonRecord>): CanyonRecord {
  const next = { ...loadCanyonRecord(profileId, mission), ...patch };
  if (!profileId) return next;
  try {
    localStorage.setItem(canyonKeyFor(profileId), JSON.stringify({ ...readAll(profileId), [mission]: next }));
  } catch {
    // storage blocked/full: it lasts for this session only
  }
  return next;
}
