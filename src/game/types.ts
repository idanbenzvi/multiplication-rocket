export interface Fact {
  a: number;
  b: number;
  /** what answers are tracked under: "3x7", "3+4", or an addition kind ("2d+1d:c") */
  key: string;
  /** a × b, or a + b */
  answer: number;
}

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
}

export interface LevelConfig {
  level: number;
  streakToLaunch: number;
  factorRange: [number, number];
  destinationIndex: number; // into Strings.destinations — names are translated at render time
  destinationSector: number; // 1 on the first lap through the destinations, 2+ after
  destinationEmoji: string;
}
