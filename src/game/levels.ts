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

const DESTINATIONS: Array<{ name: string; emoji: string }> = [
  { name: 'The Moon', emoji: '🌕' },
  { name: 'Mars', emoji: '🔴' },
  { name: 'The Asteroid Belt', emoji: '☄️' },
  { name: 'Jupiter', emoji: '🟠' },
  { name: 'Saturn', emoji: '🪐' },
  { name: 'Uranus', emoji: '🔵' },
  { name: 'Neptune', emoji: '🟦' },
  { name: 'A Comet', emoji: '💫' },
  { name: 'A Space Station', emoji: '🛰️' },
  { name: 'An Alien Planet', emoji: '👽' },
  { name: 'A Distant Galaxy', emoji: '🌌' },
];

function destinationForLevel(level: number): { name: string; emoji: string } {
  const index = (level - 1) % DESTINATIONS.length;
  const lap = Math.floor((level - 1) / DESTINATIONS.length);
  const base = DESTINATIONS[index];
  return lap === 0 ? base : { name: `${base.name} (Sector ${lap + 1})`, emoji: base.emoji };
}

const cache = new Map<number, LevelConfig>();

export function getLevelConfig(level: number): LevelConfig {
  const cached = cache.get(level);
  if (cached) return cached;
  const destination = destinationForLevel(level);
  const config: LevelConfig = {
    level,
    streakToLaunch: streakForLevel(level),
    factorRange: FULL_FACTOR_RANGE,
    destinationName: destination.name,
    destinationEmoji: destination.emoji,
  };
  cache.set(level, config);
  return config;
}
