import type { FactStat, Progress } from './types';
import { masterySummary } from './masteryStats';
import { isMastered } from './memory';
import { BONUS_ROTATION, type BonusKind } from './bonusRounds';
import { DESTINATION_COUNT } from './levels';

// Badges a pilot earns along the way, and the ranks they add up to: every
// badge is a step from Cadet towards Honored Captain. Names and descriptions
// are translated (Strings.badges / Strings.ranks); art is optional (see
// components/badges/BadgeArt.tsx) and falls back to the emoji here.
//
// Each badge is a goal with a measurable "have / need", so a locked badge can
// show how close it is, and earning one is just have >= need.

/** things the game doesn't otherwise keep, counted only for badges */
export interface AchievementStats {
  /** correct answers in the BIG BOOST zone */
  fastAnswers: number;
  /** "struggling" facts brought back to good with a correct answer */
  comebacks: number;
  wormholes: number;
  /** bonus round kinds finished at least once */
  bonusKinds: BonusKind[];
  /** bonus rounds finished without a single wrong answer */
  perfectRounds: number;
  academyGraduated: boolean;
  /** times the Black Sun (the final boss) was cured */
  blackSun: number;
  /** local calendar days (YYYY-MM-DD) with at least one correct answer, most recent last */
  practiceDays: string[];
}

export function emptyStats(): AchievementStats {
  return { fastAnswers: 0, comebacks: 0, wormholes: 0, bonusKinds: [], perfectRounds: 0, academyGraduated: false, blackSun: 0, practiceDays: [] };
}

/** the Black Sun's badge: Master of Universal Multiples, and the Space Admiral rank with it */
export const ADMIRAL_BADGE = 'spaceAdmiral';

export type BadgeGroup = 'journey' | 'knowledge' | 'streak' | 'speed' | 'missions';
export const BADGE_GROUPS: BadgeGroup[] = ['knowledge', 'journey', 'streak', 'speed', 'missions'];

interface Ctx {
  progress: Progress;
  stats: AchievementStats;
}

export interface BadgeDef {
  id: string;
  icon: string;
  group: BadgeGroup;
  goal: (ctx: Ctx) => { have: number; need: number };
}


// "Mastered" means the same as on the practice map (memory.ts): a fact that's
// fading doesn't count towards a badge still to earn (earned ones stay).
function factKey(a: number, b: number): string {
  return `${Math.min(a, b)}x${Math.max(a, b)}`;
}

/** how many of the 2-10 times tables have every fact (×1 to ×10) mastered */
function fullTables(mastery: Record<string, FactStat>): number {
  let n = 0;
  for (let t = 2; t <= 10; t++) {
    let all = true;
    for (let k = 1; k <= 10 && all; k++) all = isMastered(mastery[factKey(t, k)]);
    if (all) n++;
  }
  return n;
}

// The facts children (and grown-ups) most often get stuck on.
const TOUGH_FACTS = ['6x7', '6x8', '7x8', '7x9', '8x9'];

const mastered = (c: Ctx) => masterySummary(c.progress.mastery).mastered;
const count = (have: number, need: number) => ({ have: Math.min(have, need), need });

export const BADGES: BadgeDef[] = [
  // knowledge: what the pilot actually knows
  { id: 'firstStar', icon: '⭐', group: 'knowledge', goal: (c) => count(mastered(c), 1) },
  { id: 'starCluster', icon: '✨', group: 'knowledge', goal: (c) => count(mastered(c), 10) },
  { id: 'galaxyMind', icon: '🌟', group: 'knowledge', goal: (c) => count(mastered(c), 30) },
  { id: 'tableTamer', icon: '📐', group: 'knowledge', goal: (c) => count(fullTables(c.progress.mastery), 1) },
  { id: 'fiveTables', icon: '🧮', group: 'knowledge', goal: (c) => count(fullTables(c.progress.mastery), 5) },
  {
    id: 'toughNut',
    icon: '🥜',
    group: 'knowledge',
    goal: (c) => count(TOUGH_FACTS.filter((k) => isMastered(c.progress.mastery[k])).length, TOUGH_FACTS.length),
  },
  { id: 'neverGiveUp', icon: '💪', group: 'knowledge', goal: (c) => count(c.stats.comebacks, 10) },
  { id: 'grandMaster', icon: '👑', group: 'knowledge', goal: (c) => count(mastered(c), 55) },

  // journey: launches and practice
  { id: 'liftoff', icon: '🚀', group: 'journey', goal: (c) => count(c.progress.launchesCompleted, 1) },
  { id: 'starHopper', icon: '🪐', group: 'journey', goal: (c) => count(c.progress.launchesCompleted, 5) },
  { id: 'galaxyExplorer', icon: '🌌', group: 'journey', goal: (c) => count(c.progress.launchesCompleted, DESTINATION_COUNT) },
  { id: 'deepSpace', icon: '🛸', group: 'journey', goal: (c) => count(c.progress.launchesCompleted, 2 * DESTINATION_COUNT) },
  { id: 'hundredRight', icon: '💯', group: 'journey', goal: (c) => count(c.progress.totalCorrectAnswers, 100) },
  { id: 'thousandRight', icon: '🏆', group: 'journey', goal: (c) => count(c.progress.totalCorrectAnswers, 1000) },
  { id: 'regularFlyer', icon: '📅', group: 'journey', goal: (c) => count(c.stats.practiceDays.length, 3) },
  { id: 'loyalFlyer', icon: '🗓️', group: 'journey', goal: (c) => count(c.stats.practiceDays.length, 10) },

  // streaks
  { id: 'onFire', icon: '🔥', group: 'streak', goal: (c) => count(c.progress.bestStreak, 5) },
  { id: 'blazing', icon: '☄️', group: 'streak', goal: (c) => count(c.progress.bestStreak, 10) },
  { id: 'supernova', icon: '💥', group: 'streak', goal: (c) => count(c.progress.bestStreak, 20) },

  // speed
  { id: 'quickThinker', icon: '⚡', group: 'speed', goal: (c) => count(c.stats.fastAnswers, 25) },
  { id: 'lightspeed', icon: '🌠', group: 'speed', goal: (c) => count(c.stats.fastAnswers, 250) },

  // missions: bonus rounds and the Academy
  { id: 'wormholeRider', icon: '🌀', group: 'missions', goal: (c) => count(c.stats.wormholes, 1) },
  { id: 'missionSpecialist', icon: '🎯', group: 'missions', goal: (c) => count(c.stats.bonusKinds.length, BONUS_ROTATION.length) },
  { id: 'flawless', icon: '💎', group: 'missions', goal: (c) => count(c.stats.perfectRounds, 5) },
  { id: 'academyGraduate', icon: '🎓', group: 'missions', goal: (c) => count(c.stats.academyGraduated ? 1 : 0, 1) },
  // the final boss: it makes its pilot a Space Admiral (see rankFor)
  { id: ADMIRAL_BADGE, icon: '🌞', group: 'missions', goal: (c) => count(c.stats.blackSun, 1) },
];

export const BADGE_BY_ID: Record<string, BadgeDef> = Object.fromEntries(BADGES.map((b) => [b.id, b]));

export function badgeEarned(badge: BadgeDef, progress: Progress, stats: AchievementStats): boolean {
  const { have, need } = badge.goal({ progress, stats });
  return have >= need;
}

// Ranks, by number of badges earned. Honored Captain needs nearly all of
// them, so an Honored Captain has really shown what they know. Above it is
// Space Admiral, which no number of badges reaches: only curing the Black
// Sun, the final boss, does (it can come straight from any rank).
export const RANK_ICONS = ['🔰', '🎗️', '🎖️', '🏅', '🥇', '⭐', '🌟', '🌞'];
export const RANK_THRESHOLDS = [0, 3, 6, 10, 14, 18, 23];
export const ADMIRAL_RANK = RANK_THRESHOLDS.length;

export function rankFor(earnedCount: number, admiral = false): number {
  if (admiral) return ADMIRAL_RANK;
  let rank = 0;
  for (let i = 0; i < RANK_THRESHOLDS.length; i++) if (earnedCount >= RANK_THRESHOLDS[i]) rank = i;
  return rank;
}

/** a pilot's rank from the badges they've earned (id -> when) */
export function rankOf(earned: Record<string, number>): number {
  return rankFor(Object.keys(earned).length, !!earned[ADMIRAL_BADGE]);
}

/** local calendar day, so "practice days" line up with the child's days */
export function dayKey(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
