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

export const localProgressStore: ProgressStore = {
  load() {
    try {
      const raw = localStorage.getItem(storageKey());
      if (!raw) return defaultProgress();
      const parsed = JSON.parse(raw) as Partial<Progress>;
      if (parsed.version !== 1) return defaultProgress();
      return { ...defaultProgress(), ...parsed };
    } catch {
      return defaultProgress();
    }
  },
  save(progress) {
    try {
      localStorage.setItem(storageKey(), JSON.stringify(progress));
    } catch {
      // storage blocked/full: progress lasts for this session only
    }
  },
  reset() {
    try {
      localStorage.removeItem(storageKey());
    } catch {
      // ignore
    }
  },
};
