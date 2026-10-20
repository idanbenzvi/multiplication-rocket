export interface Fact {
  a: number;
  b: number;
  /** what answers are tracked under: "3x7", "3+4", or an addition kind ("2d+1d:c") */
  key: string;
  /** a × b, or a + b */
  answer: number;
}

import type { Pace } from './scoring';

export interface FactStat {
  attempts: number;
  correct: number;
  wrong: number;
  dueScore: number;
}

export interface Progress {
  version: number;
  level: number;
  fuel: number; // 0-100, continuous meter fed by speed-scaled correct answers; launch fires at 100
  currentStreak: number;
  bestStreak: number;
  totalCorrectAnswers: number;
  launchesCompleted: number;
  mastery: Record<string, FactStat>;
  /** addition only: the stage reached (1: sums within 10, 2: within 20, 3: within 100) */
  stage?: number;
  /** how fast this pilot answers: the speed boost's window follows it (scoring.ts); the default until they've answered against the clock */
  pace?: Pace;
}

export interface LevelConfig {
  level: number;
  streakToLaunch: number;
  factorRange: [number, number];
  destinationIndex: number; // into Strings.destinations — names are translated at render time
  destinationSector: number; // 1 on the first lap through the destinations, 2+ after
  destinationEmoji: string;
  /** the course this level flies, in degrees from straight up (positive: the nose leans right) */
  headingDeg: number;
}
