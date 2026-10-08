import type { Progress } from '../game/types';
import { progressKeyFor, useProfiles } from '../profiles/useProfiles';

// Progress is saved per pilot profile. Before a profile exists (the very
// first launch, while the welcome screen is up) it falls back to a scratch key.
function storageKey(): string {
  const { activeId } = useProfiles.getState();
  return activeId ? progressKeyFor(activeId) : 'multiplication-rocket:progress:v1:unassigned';
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

function loadFrom(key: string): Progress {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return defaultProgress();
    const parsed = JSON.parse(raw) as Partial<Progress>;
    if (parsed.version !== 1) return defaultProgress();
    return { ...defaultProgress(), ...parsed };
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
// writes a given pilot's progress rather than the active one's.
export function loadProgressFor(profileId: string): Progress {
  return loadFrom(progressKeyFor(profileId));
}

export function saveProgressFor(profileId: string, progress: Progress) {
  saveTo(progressKeyFor(profileId), progress);
}

export const localProgressStore: ProgressStore = {
  load() {
    return loadFrom(storageKey());
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
