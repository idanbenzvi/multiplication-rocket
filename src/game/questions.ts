import type { Fact, Progress } from './types';
import { pickOp, type PilotMission } from './mission';
import { buildFactPool, pickNextFact } from './facts';
import { getLevelConfig } from './levels';
import { pickAdditionFact } from './addition';
import { pickSubtractionFact } from './subtraction';

/** the next fact for a pilot's progress in a mission: the times table, or their addition or subtraction stage (on a mixed mission, either of its two, at random) */
export function pickFact(mission: PilotMission, progress: Progress, avoidKey?: string, rand: () => number = Math.random): Fact {
  const op = pickOp(mission, rand);
  if (op === 'add') return pickAdditionFact(progress.stage ?? 1, progress.mastery, avoidKey);
  if (op === 'sub') return pickSubtractionFact(progress.subStage ?? 1, progress.mastery, avoidKey);
  const { factorRange } = getLevelConfig(progress.level);
  return pickNextFact(buildFactPool(factorRange[0], factorRange[1]), progress.mastery, avoidKey);
}
