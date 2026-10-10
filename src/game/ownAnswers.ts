import { recordAttempt } from './facts';
import { useProfiles } from '../profiles/useProfiles';
import { loadProgressFor, saveProgressFor } from '../storage/progressStore';
import { appendToLog, type AnswerSource } from '../stats/answerLog';

// In the multi-phone games each phone records its own pilot's answers.

export function recordOwn(key: string, correct: boolean, source: AnswerSource) {
  const id = useProfiles.getState().activeId;
  if (!id) return;
  const progress = loadProgressFor(id);
  saveProgressFor(id, {
    ...progress,
    mastery: recordAttempt(progress.mastery, key, correct),
    totalCorrectAnswers: progress.totalCorrectAnswers + (correct ? 1 : 0),
  });
  appendToLog(id, [{ fact: key, correct, ms: null, source }]);
}
