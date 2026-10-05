import type { Progress } from '../game/types';

const STORAGE_KEY = 'multiplication-rocket:progress:v1';

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
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultProgress();
      const parsed = JSON.parse(raw) as Partial<Progress>;
      if (parsed.version !== 1) return defaultProgress();
      return { ...defaultProgress(), ...parsed };
    } catch {
      return defaultProgress();
    }
  },
  save(progress) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  },
  reset() {
    localStorage.removeItem(STORAGE_KEY);
  },
};
