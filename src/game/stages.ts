import type { FactStat, Progress } from './types';
import { opsOf, type Mission, type PilotMission } from './mission';
import { clampStage, stageReady } from './addition';
import { subStageReady } from './subtraction';

// The operations that climb in stages, addition and subtraction, each keep
// their own (Progress.stage, Progress.subStage): a +− pilot climbs both, each
// as its own facts are mastered.

/** an operation's stage, as a launch opens it or the banner shows it */
export interface StageStep {
  op: 'add' | 'sub';
  stage: 1 | 2 | 3;
}

export type Stages = Pick<Progress, 'stage' | 'subStage'>;

/** an operation's stage in a pilot's progress (× has none: 1) */
export function opStage(op: Mission, progress: Stages): 1 | 2 | 3 {
  return clampStage(op === 'add' ? progress.stage : op === 'sub' ? progress.subStage : 1);
}

/** the stages a mission climbs, where each is */
export function stagesOf(mission: PilotMission, progress: Stages): StageStep[] {
  return opsOf(mission)
    .filter((op): op is StageStep['op'] => op !== 'mul')
    .map((op) => ({ op, stage: opStage(op, progress) }));
}

/** a launch's stages: each the mission climbs opens the next once enough of it is mastered; unchanged otherwise (a new pilot's left unset) */
export function climbStages(mission: PilotMission, progress: Stages, mastery: Record<string, FactStat>): Stages {
  let { stage, subStage } = progress;
  const ops = opsOf(mission);
  if (ops.includes('add') && stageReady(clampStage(stage), mastery)) stage = clampStage(stage) + 1;
  if (ops.includes('sub') && subStageReady(clampStage(subStage), mastery)) subStage = clampStage(subStage) + 1;
  return { stage, subStage };
}

/** the stage that opened between two progresses, or null (subtraction's, if both did) */
export function stageOpened(before: Stages, after: Stages): StageStep | null {
  if (after.subStage !== before.subStage) return { op: 'sub', stage: clampStage(after.subStage) };
  if (after.stage !== before.stage) return { op: 'add', stage: clampStage(after.stage) };
  return null;
}
