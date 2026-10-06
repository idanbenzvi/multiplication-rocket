import { create } from 'zustand';
import type { Fact, FactStat, Progress } from './types';
import { buildFactPool, getStrugglingFactKeys, nextDueScore, pickNextFact, randomizeOrder } from './facts';
import { getLevelConfig } from './levels';
import { MAX_SPEED_FACTOR, speedFactor } from './scoring';
import { buildChallenge, CHALLENGE_EVERY, type Challenge } from './wormhole';
import { isBeltLevel } from './asteroidBelt';
import { localProgressStore } from '../storage/progressStore';

export const MISTAKES_BEFORE_HEATMAP = 5;

export interface Question {
  fact: Fact;
  x: number;
  y: number;
  askedAt: number;
}

interface GameState {
  progress: Progress;
  question: Question | null;
  feedback: 'correct' | 'wrong' | null;
  flare: number;
  lastGainPercent: number;
  justLaunched: boolean;
  sessionMistakes: number;
  showHeatmap: boolean;
  /** an active Wormhole challenge replaces the question while non-null */
  challenge: Challenge | null;
  /** true while the fly-through animation plays (the boost lands at its end) */
  inWormhole: boolean;
  questionsSinceChallenge: number;
  /** the Asteroid Belt run is in progress (replaces questions until won) */
  beltRun: boolean;
  init: () => void;
  submitAnswer: (value: number, elapsedMs: number) => boolean;
  advanceQuestion: () => void;
  dismissLaunch: () => void;
  requestHeatmap: () => void;
  dismissHeatmap: () => void;
  resetProgress: () => void;
  /** player picked all the right drills: start the fly-through */
  enterWormhole: () => void;
  /** fly-through finished: apply the double boost (may launch) */
  exitWormhole: () => void;
  /** too many wrong picks: the wormhole collapses, back to normal questions */
  collapseWormhole: () => void;
  /** a fact attempted in the belt: counts toward mastery, not fuel/streak */
  recordBeltAnswer: (factKey: string, correct: boolean) => void;
  /** broke out of the belt: this completes the level (launch) */
  finishBelt: () => void;
}

function recordAttempt(mastery: Record<string, FactStat>, key: string, isCorrect: boolean) {
  const prev: FactStat = mastery[key] ?? { attempts: 0, correct: 0, wrong: 0, dueScore: 1 };
  const next: FactStat = {
    attempts: prev.attempts + 1,
    correct: prev.correct + (isCorrect ? 1 : 0),
    wrong: prev.wrong + (isCorrect ? 0 : 1),
    dueScore: nextDueScore(prev.dueScore, isCorrect),
  };
  return { ...mastery, [key]: next };
}

function launchFrom(progress: Progress) {
  return {
    level: progress.level + 1,
    launchesCompleted: progress.launchesCompleted + 1,
    currentStreak: 0,
    fuel: 0,
  };
}

// Fuel bookkeeping shared by normal answers and the wormhole boost. A full
// tank isn't enough on its own — launch is withheld while any fact is still
// "struggling" (a recent miss that hasn't been corrected yet). This is the
// mastery gate: it stops a lucky fast streak (or a wormhole) from leveling
// someone past facts they're still actually getting wrong.
function addFuel(progress: Progress, mastery: Record<string, FactStat>, gain: number) {
  let fuel = Math.min(100, progress.fuel + gain);
  let level = progress.level;
  let launchesCompleted = progress.launchesCompleted;
  let currentStreak = progress.currentStreak;
  let launched = false;
  let enterBelt = false;
  if (fuel >= 100 && getStrugglingFactKeys(mastery).length === 0) {
    if (isBeltLevel(progress.level)) {
      // Arrived at the belt: the tank stays full and the run starts; breaking
      // out is what launches (finishBelt).
      enterBelt = true;
    } else {
      launched = true;
      ({ level, launchesCompleted, currentStreak, fuel } = launchFrom(progress));
    }
  }
  return { fuel, level, launchesCompleted, currentStreak, launched, enterBelt };
}

function newQuestion(progress: Progress, avoidKey?: string): Question {
  const level = getLevelConfig(progress.level);
  const pool = buildFactPool(level.factorRange[0], level.factorRange[1]);
  const fact = pickNextFact(pool, progress.mastery, avoidKey);
  const { x, y } = randomizeOrder(fact);
  return { fact, x, y, askedAt: Date.now() };
}

export const useGameStore = create<GameState>((set, get) => ({
  progress: localProgressStore.load(),
  question: null,
  feedback: null,
  flare: 0,
  lastGainPercent: 0,
  justLaunched: false,
  sessionMistakes: 0,
  showHeatmap: false,
  challenge: null,
  inWormhole: false,
  questionsSinceChallenge: 0,
  beltRun: false,

  init: () => {
    const progress = localProgressStore.load();
    // Reloaded mid-run (or with a full tank on a belt level): go straight
    // back into the belt rather than asking for another answer first.
    const beltRun =
      isBeltLevel(progress.level) && progress.fuel >= 100 && getStrugglingFactKeys(progress.mastery).length === 0;
    set({
      progress,
      question: newQuestion(progress),
      feedback: null,
      flare: 0,
      justLaunched: false,
      sessionMistakes: 0,
      showHeatmap: false,
      challenge: null,
      inWormhole: false,
      questionsSinceChallenge: 0,
      beltRun,
    });
  },

  submitAnswer: (value: number, elapsedMs: number) => {
    const { progress, question } = get();
    if (!question) return false;
    const isCorrect = value === question.fact.product;
    const level = getLevelConfig(progress.level);

    const nextMastery = recordAttempt(progress.mastery, question.fact.key, isCorrect);

    let currentStreak = progress.currentStreak;
    let bestStreak = progress.bestStreak;
    let levelNum = progress.level;
    let launchesCompleted = progress.launchesCompleted;
    let totalCorrectAnswers = progress.totalCorrectAnswers;
    let fuel = progress.fuel;
    let launched = false;
    let enterBelt = false;
    let gainPercent = 0;

    if (isCorrect) {
      currentStreak += 1;
      totalCorrectAnswers += 1;
      bestStreak = Math.max(bestStreak, currentStreak);

      const factor = speedFactor(elapsedMs);
      const baseIncrement = 100 / level.streakToLaunch;
      gainPercent = baseIncrement * factor;
      const result = addFuel({ ...progress, currentStreak }, nextMastery, gainPercent);
      fuel = result.fuel;
      levelNum = result.level;
      launchesCompleted = result.launchesCompleted;
      currentStreak = result.currentStreak;
      launched = result.launched;
      enterBelt = result.enterBelt;
    } else {
      currentStreak = 0;
      // A banked full tank is safe from an unrelated mistake — only clearing
      // every struggling fact (not further correct/wrong answers) affects it
      // once it's reached 100, so mastery cleanup never feels like starting
      // the meter over from scratch.
      fuel = fuel >= 100 ? 100 : 0;
    }

    const nextProgress: Progress = {
      ...progress,
      level: levelNum,
      fuel,
      currentStreak,
      bestStreak,
      totalCorrectAnswers,
      launchesCompleted,
      mastery: nextMastery,
    };

    localProgressStore.save(nextProgress);

    // Five mistakes (since the last time the heatmap was shown) trigger it
    // automatically — the counter is session-only, not persisted, since it's
    // just a "time for a check-in" pacing signal, not long-term progress.
    const nextMistakes = isCorrect ? get().sessionMistakes : get().sessionMistakes + 1;
    const triggerHeatmap = !isCorrect && nextMistakes >= MISTAKES_BEFORE_HEATMAP;

    set({
      progress: nextProgress,
      feedback: isCorrect ? 'correct' : 'wrong',
      // Normalized 0-1 burst for the flame flash — faster answers flare bigger.
      flare: isCorrect ? Math.min(1, gainPercent / (100 / level.streakToLaunch) / 1.75) : 0,
      lastGainPercent: gainPercent,
      justLaunched: launched,
      beltRun: enterBelt || get().beltRun,
      sessionMistakes: triggerHeatmap ? 0 : nextMistakes,
      showHeatmap: triggerHeatmap ? true : get().showHeatmap,
      // Keep showing the just-answered question (with its feedback color) until
      // advanceQuestion() is called — swapping it here would erase the color
      // flash before the player ever sees it.
    });

    return isCorrect;
  },

  advanceQuestion: () => {
    const { progress, question, justLaunched, showHeatmap, questionsSinceChallenge } = get();
    if (justLaunched || showHeatmap || get().beltRun) return; // overlays own their own dismissal flow
    const count = questionsSinceChallenge + 1;
    if (count >= CHALLENGE_EVERY) {
      set({ challenge: buildChallenge(progress.level), questionsSinceChallenge: 0, feedback: null, flare: 0 });
      return;
    }
    set({
      question: newQuestion(progress, question?.fact.key),
      questionsSinceChallenge: count,
      feedback: null,
      flare: 0,
    });
  },

  enterWormhole: () => {
    if (!get().challenge) return;
    set({ inWormhole: true });
  },

  exitWormhole: () => {
    const { progress } = get();
    // "Double boost": twice what the fastest possible normal answer earns.
    const gain = (100 / getLevelConfig(progress.level).streakToLaunch) * MAX_SPEED_FACTOR * 2;
    const result = addFuel(progress, progress.mastery, gain);
    const nextProgress: Progress = {
      ...progress,
      fuel: result.fuel,
      level: result.level,
      launchesCompleted: result.launchesCompleted,
      currentStreak: result.currentStreak,
    };
    localProgressStore.save(nextProgress);
    set({
      progress: nextProgress,
      challenge: null,
      inWormhole: false,
      justLaunched: result.launched,
      beltRun: result.enterBelt || get().beltRun,
      lastGainPercent: gain,
      question: newQuestion(nextProgress),
      feedback: null,
      flare: 0,
    });
  },

  recordBeltAnswer: (factKey, correct) => {
    const { progress } = get();
    const nextProgress = { ...progress, mastery: recordAttempt(progress.mastery, factKey, correct) };
    localProgressStore.save(nextProgress);
    set({ progress: nextProgress });
  },

  finishBelt: () => {
    const { progress } = get();
    const nextProgress: Progress = { ...progress, ...launchFrom(progress) };
    localProgressStore.save(nextProgress);
    set({ progress: nextProgress, beltRun: false, justLaunched: true, question: newQuestion(nextProgress), feedback: null, flare: 0 });
  },

  collapseWormhole: () => {
    const { progress } = get();
    set({ challenge: null, inWormhole: false, question: newQuestion(progress), feedback: null, flare: 0 });
  },

  dismissLaunch: () => {
    const { progress } = get();
    set({ justLaunched: false, feedback: null, flare: 0, question: newQuestion(progress) });
  },

  requestHeatmap: () => {
    set({ showHeatmap: true });
  },

  dismissHeatmap: () => {
    const { progress } = get();
    set({ showHeatmap: false, sessionMistakes: 0, question: newQuestion(progress) });
  },

  resetProgress: () => {
    localProgressStore.reset();
    const progress = localProgressStore.load();
    set({
      progress,
      question: newQuestion(progress),
      feedback: null,
      flare: 0,
      justLaunched: false,
      sessionMistakes: 0,
      showHeatmap: false,
      challenge: null,
      inWormhole: false,
      questionsSinceChallenge: 0,
      beltRun: false,
    });
  },
}));
