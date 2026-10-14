import type { Fact, Progress } from './types';
import type { Mission } from './mission';
import { buildFactPool, pickNextFact } from './facts';
import { getLevelConfig } from './levels';
import { pickAdditionFact } from './addition';

/** the next fact for a pilot's progress in a mission: the times table, or their addition stage */
export function pickFact(mission: Mission, progress: Progress, avoidKey?: string): Fact {
  if (mission === 'add') return pickAdditionFact(progress.stage ?? 1, progress.mastery, avoidKey);
  const { factorRange } = getLevelConfig(progress.level);
  return pickNextFact(buildFactPool(factorRange[0], factorRange[1]), progress.mastery, avoidKey);
}
