import type { Fact, Progress } from './types';
import { pairKey, type Mission } from './mission';
import { additionTrackKey, pickAdditionFact } from './addition';
import { pickSubtractionFact, subtractionTrackKey } from './subtraction';

// What an answer to a concrete problem is tracked under, whichever operation
// it is: the fact itself in a table, a two-digit sum's or difference's kind
// beyond it ("37+45" → "2d+2d:c", "52-27" → "2d-2d:b").

/** the key a problem's answers are tracked under */
export function trackKeyOf(op: Mission, a: number, b: number): string {
  return op === 'add' ? additionTrackKey(a, b) : op === 'sub' ? subtractionTrackKey(a, b) : pairKey('mul', a, b);
}

/** the next sum or difference at a pilot's own stage of it */
export function pickLadderFact(op: 'add' | 'sub', progress: Pick<Progress, 'stage' | 'subStage'> | null, mastery: Progress['mastery'], avoid?: string): Fact {
  return op === 'add' ? pickAdditionFact(progress?.stage ?? 1, mastery, avoid) : pickSubtractionFact(progress?.subStage ?? 1, mastery, avoid);
}
