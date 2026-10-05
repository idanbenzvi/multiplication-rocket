import type { LevelConfig } from './types';

// Pacing reference for this level: roughly how many correct answers at "average"
// speed it takes to fill the fuel meter to 100 (see game/scoring.ts). The meter
// itself is continuous and speed-weighted, so a fast player launches in fewer
// answers than this and a slow one needs more — this number just sets how much
// fuel each correct answer is worth (100 / this) and ramps difficulty per level.
function streakForLevel(level: number): number {
  if (level <= 8) return 5 + (level - 1) * 2; // 5, 7, 9, ... 19
  return 19 + Math.floor((level - 8) / 2);
}

// x and y are always drawn independently and uniformly from the full 1-10
// range at every level — difficulty progression comes entirely from the
// per-level fuel pacing and the weighted question picker re-serving facts
// the child has gotten wrong, not from narrowing the number range.
const FULL_FACTOR_RANGE: [number, number] = [1, 10];

// Display names live in i18n/strings.ts (Strings.destinations), same order.
const DESTINATION_EMOJIS = ['🌕', '🔴', '☄️', '🟠', '🪐', '🔵', '🟦', '💫', '🛰️', '👽', '🌌'];

const cache = new Map<number, LevelConfig>();

export function getLevelConfig(level: number): LevelConfig {
  const cached = cache.get(level);
  if (cached) return cached;
  const index = (level - 1) % DESTINATION_EMOJIS.length;
  const config: LevelConfig = {
    level,
    streakToLaunch: streakForLevel(level),
    factorRange: FULL_FACTOR_RANGE,
    destinationIndex: index,
    destinationSector: Math.floor((level - 1) / DESTINATION_EMOJIS.length) + 1,
    destinationEmoji: DESTINATION_EMOJIS[index],
  };
  cache.set(level, config);
  return config;
}
