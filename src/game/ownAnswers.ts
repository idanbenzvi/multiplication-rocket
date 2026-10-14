import { recordAttempt } from './facts';
import { missionOfKey } from './mission';
import { missionOf, useProfiles } from '../profiles/useProfiles';
import { loadProgressFor, saveProgressFor } from '../storage/progressStore';
import { appendToLog, type AnswerSource } from '../stats/answerLog';

// In the multi-phone games each phone records its own pilot's answers: the
// ones in their own mission (an addition pilot helping with a × fact, or
// the other way round, plays along without it counting toward either).

export function recordOwn(key: string, correct: boolean, source: AnswerSource) {
  const id = useProfiles.getState().activeId;
  if (!id || missionOfKey(key) !== missionOf(id)) return;
  const progress = loadProgressFor(id);
  saveProgressFor(id, {
    ...progress,
    mastery: recordAttempt(progress.mastery, key, correct),
    totalCorrectAnswers: progress.totalCorrectAnswers + (correct ? 1 : 0),
  });
  appendToLog(id, [{ fact: key, correct, ms: null, source }]);
}
