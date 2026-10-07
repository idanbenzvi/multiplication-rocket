import { create } from 'zustand';
import type { Progress } from './types';
import type { BonusKind } from './bonusRounds';
import { BADGES, badgeEarned, dayKey, emptyStats, rankFor, type AchievementStats } from './achievements';
import { useProfiles } from '../profiles/useProfiles';

// Per-pilot badges, saved on the device next to their progress. The game
// store reports what happened (track) along with the progress after it, and
// any badge that's now earned is stamped and queued for the "badge earned"
// toast. Badges are never taken away, except by a progress reset.

const PREFIX = 'multiplication-rocket:badges:v1';
const MAX_DAYS = 30;

export function badgesKeyFor(profileId: string): string {
  return `${PREFIX}:${profileId}`;
}

interface Saved {
  version: 1;
  /** badge id -> when it was earned (Date.now()) */
  earned: Record<string, number>;
  /** earned but not looked at yet in the badges screen */
  unseen: string[];
  stats: AchievementStats;
}

function blank(): Saved {
  return { version: 1, earned: {}, unseen: [], stats: emptyStats() };
}

function load(profileId: string | null): Saved {
  if (!profileId) return blank();
  try {
    const raw = localStorage.getItem(badgesKeyFor(profileId));
    if (!raw) return blank();
    const parsed = JSON.parse(raw) as Partial<Saved>;
    if (parsed.version !== 1) return blank();
    return { ...blank(), ...parsed, stats: { ...emptyStats(), ...parsed.stats } };
  } catch {
    return blank();
  }
}

function persist(profileId: string | null, saved: Saved) {
  if (!profileId) return;
  try {
    localStorage.setItem(badgesKeyFor(profileId), JSON.stringify(saved));
  } catch {
    // storage blocked/full: badges last for this session only
  }
}

export type AchievementEvent =
  | { type: 'answer'; correct: boolean; fast: boolean; comeback: boolean }
  | { type: 'bonus'; kind: BonusKind; perfect: boolean }
  | { type: 'academy' }
  /**
   * Nothing new happened, just (re)check the badges against this progress.
   * Used when a pilot's game loads, so progress from before badges existed
   * counts too; those arrive quietly (marked new in the badges screen)
   * instead of a burst of toasts at startup.
   */
  | { type: 'progress' };

/** one entry in the toast queue */
export interface Unlock {
  badgeId: string;
  /** the rank this badge promoted the pilot to, if it did */
  promotedTo: number | null;
}

interface AchievementsState extends Saved {
  queue: Unlock[];
  track: (event: AchievementEvent, progress: Progress) => void;
  /** the toast at the front of the queue has been shown */
  shiftQueue: () => void;
  markAllSeen: () => void;
  reset: () => void;
  reload: () => void;
  /** dev mode only: earn the next badge not earned yet (shows its toast) */
  devEarnNext: () => void;
}

function applyEvent(stats: AchievementStats, event: AchievementEvent): AchievementStats {
  switch (event.type) {
    case 'answer': {
      if (!event.correct) return stats;
      const today = dayKey();
      const days = stats.practiceDays.includes(today) ? stats.practiceDays : [...stats.practiceDays, today].slice(-MAX_DAYS);
      return {
        ...stats,
        fastAnswers: stats.fastAnswers + (event.fast ? 1 : 0),
        comebacks: stats.comebacks + (event.comeback ? 1 : 0),
        practiceDays: days,
      };
    }
    case 'bonus':
      return {
        ...stats,
        wormholes: stats.wormholes + (event.kind === 'wormhole' ? 1 : 0),
        bonusKinds: stats.bonusKinds.includes(event.kind) ? stats.bonusKinds : [...stats.bonusKinds, event.kind],
        perfectRounds: stats.perfectRounds + (event.perfect ? 1 : 0),
      };
    case 'academy':
      return { ...stats, academyGraduated: true };
    case 'progress':
      return stats;
  }
}

export const useAchievements = create<AchievementsState>((set, get) => {
  const activeId = () => useProfiles.getState().activeId;
  const saveFrom = (s: Omit<Saved, 'version'>) => persist(activeId(), { version: 1, earned: s.earned, unseen: s.unseen, stats: s.stats });

  return {
    ...load(activeId()),
    queue: [],

    track: (event, progress) => {
      const state = get();
      const stats = applyEvent(state.stats, event);
      const fresh = BADGES.filter((b) => !state.earned[b.id] && badgeEarned(b, progress, stats));
      if (fresh.length === 0 && stats === state.stats) return;

      const earned = { ...state.earned };
      const queue = [...state.queue];
      let count = Object.keys(earned).length;
      let rank = rankFor(count);
      const now = Date.now();
      for (const b of fresh) {
        earned[b.id] = now;
        count++;
        const nextRank = rankFor(count);
        if (event.type !== 'progress') queue.push({ badgeId: b.id, promotedTo: nextRank > rank ? nextRank : null });
        rank = nextRank;
      }
      const next = { earned, stats, unseen: [...state.unseen, ...fresh.map((b) => b.id)] };
      saveFrom(next);
      set({ ...next, queue });
    },

    shiftQueue: () => set({ queue: get().queue.slice(1) }),

    markAllSeen: () => {
      if (get().unseen.length === 0) return;
      const next = { ...get(), unseen: [] };
      saveFrom(next);
      set({ unseen: [] });
    },

    reset: () => {
      const id = activeId();
      try {
        if (id) localStorage.removeItem(badgesKeyFor(id));
      } catch {
        // ignore
      }
      set({ ...blank(), queue: [] });
    },

    reload: () => set({ ...load(activeId()), queue: [] }),

    devEarnNext: () => {
      const state = get();
      const badge = BADGES.find((b) => !state.earned[b.id]);
      if (!badge) return;
      const count = Object.keys(state.earned).length + 1;
      const promoted = rankFor(count) > rankFor(count - 1);
      const next = { earned: { ...state.earned, [badge.id]: Date.now() }, unseen: [...state.unseen, badge.id], stats: state.stats };
      saveFrom(next);
      set({ ...next, queue: [...state.queue, { badgeId: badge.id, promotedTo: promoted ? rankFor(count) : null }] });
    },
  };
});

// Switching pilots swaps in their badges.
useProfiles.subscribe((s, prev) => {
  if (s.activeId !== prev.activeId) useAchievements.getState().reload();
});

export function useRank(): number {
  return useAchievements((s) => rankFor(Object.keys(s.earned).length));
}
