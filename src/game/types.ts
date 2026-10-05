export interface Fact {
  a: number;
  b: number;
  key: string;
  product: number;
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
}

export interface LevelConfig {
  level: number;
  streakToLaunch: number;
  factorRange: [number, number];
  destinationIndex: number; // into Strings.destinations — names are translated at render time
  destinationSector: number; // 1 on the first lap through the destinations, 2+ after
  destinationEmoji: string;
}
