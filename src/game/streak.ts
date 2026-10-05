// How hard the game celebrates a correct answer, by current streak. Shared
// by the praise text, the spark bursts and the sound effects so they all
// escalate together.
export type StreakTier = 0 | 1 | 2 | 3;

export function streakTier(streak: number): StreakTier {
  if (streak >= 10) return 3;
  if (streak >= 5) return 2;
  if (streak >= 3) return 1;
  return 0;
}

export const MILESTONE_EVERY = 5;

export function isMilestone(streak: number): boolean {
  return streak > 0 && streak % MILESTONE_EVERY === 0;
}
