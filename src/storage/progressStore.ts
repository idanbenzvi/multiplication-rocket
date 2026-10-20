import type { Progress } from '../game/types';
import type { PilotMission } from '../game/mission';
import { activeMission, missionOf, progressKeyFor, useProfiles } from '../profiles/useProfiles';
import { needsUpgrade, upgradeMastery } from '../game/memory';
import { readLog } from '../stats/answerLog';

// Progress is saved per pilot profile and mission (the active pilot's
// current one). Before a profile exists (the very first launch, while the
// welcome screen is up) it falls back to a scratch key.
function storageKey(): string {
  const { activeId } = useProfiles.getState();
  return activeId ? progressKeyFor(activeId, activeMission()) : 'multiplication-rocket:progress:v1:unassigned';
}

function activeOwner(): { profileId: string; mission: PilotMission } | undefined {
  const { activeId } = useProfiles.getState();
  return activeId ? { profileId: activeId, mission: activeMission() } : undefined;
}

export function defaultProgress(): Progress {
  return {
    version: 1,
    level: 1,
    fuel: 0,
    currentStreak: 0,
    bestStreak: 0,
    totalCorrectAnswers: 0,
    launchesCompleted: 0,
    mastery: {},
  };
}

// Everything above this line and the interface below are the durable contract:
// swapping to a real backend later means writing a new implementation of
// ProgressStore (e.g. one backed by fetch() calls to a DB-backed API) and
// pointing useGameStore at it instead of localProgressStore. No other file
// in the game needs to change.
export interface ProgressStore {
  load(): Progress;
  save(progress: Progress): void;
  reset(): void;
}

function loadFrom(key: string, owner?: { profileId: string; mission: PilotMission }): Progress {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return defaultProgress();
    const parsed = JSON.parse(raw) as Partial<Progress>;
    if (parsed.version !== 1) return defaultProgress();
    const progress = { ...defaultProgress(), ...parsed };
    // saved before spaced review: replay each fact's answers from the log
    // into its review box, once (game/memory.ts)
    if (owner && needsUpgrade(progress.mastery)) {
      const history = readLog(owner.profileId).filter((e) => e.mission === owner.mission);
      progress.mastery = upgradeMastery(progress.mastery, history);
      saveTo(key, progress);
    }
    return progress;
  } catch {
    return defaultProgress();
  }
}

function saveTo(key: string, progress: Progress) {
  try {
    localStorage.setItem(key, JSON.stringify(progress));
  } catch {
    // storage blocked/full: progress lasts for this session only
  }
}

// A crew flight records answers for two pilots at once, so it reads and
// writes a given pilot's progress rather than the active one's (in their
// current mission, unless a fact from the other one is being recorded).
export function loadProgressFor(profileId: string, mission: PilotMission = missionOf(profileId)): Progress {
  return loadFrom(progressKeyFor(profileId, mission), { profileId, mission });
}

export function saveProgressFor(profileId: string, progress: Progress, mission: PilotMission = missionOf(profileId)) {
  saveTo(progressKeyFor(profileId, mission), progress);
}

export const localProgressStore: ProgressStore = {
  load() {
    return loadFrom(storageKey(), activeOwner());
  },
  save(progress) {
    saveTo(storageKey(), progress);
  },
  reset() {
    try {
      localStorage.removeItem(storageKey());
    } catch {
      // ignore
    }
  },
};
