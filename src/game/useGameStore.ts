import { create } from 'zustand';
import type { Fact, FactStat, Progress } from './types';
import { buildFactPool, getStrugglingFactKeys, nextDueScore, pickNextFact, randomizeOrder } from './facts';
import { getLevelConfig } from './levels';
import { speedFactor } from './scoring';
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
  init: () => void;
  submitAnswer: (value: number, elapsedMs: number) => boolean;
  advanceQuestion: () => void;
  dismissLaunch: () => void;
  requestHeatmap: () => void;
  dismissHeatmap: () => void;
  resetProgress: () => void;
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

  init: () => {
    const progress = localProgressStore.load();
    set({
      progress,
      question: newQuestion(progress),
      feedback: null,
      flare: 0,
      justLaunched: false,
      sessionMistakes: 0,
      showHeatmap: false,
    });
  },

  submitAnswer: (value: number, elapsedMs: number) => {
    const { progress, question } = get();
    if (!question) return false;
    const isCorrect = value === question.fact.product;
    const level = getLevelConfig(progress.level);

    const prevStat: FactStat = progress.mastery[question.fact.key] ?? {
      attempts: 0,
      correct: 0,
      wrong: 0,
      dueScore: 1,
    };
    const updatedStat: FactStat = {
      attempts: prevStat.attempts + 1,
      correct: prevStat.correct + (isCorrect ? 1 : 0),
      wrong: prevStat.wrong + (isCorrect ? 0 : 1),
      dueScore: nextDueScore(prevStat.dueScore, isCorrect),
    };
    const nextMastery = { ...progress.mastery, [question.fact.key]: updatedStat };

    let currentStreak = progress.currentStreak;
    let bestStreak = progress.bestStreak;
    let levelNum = progress.level;
    let launchesCompleted = progress.launchesCompleted;
    let totalCorrectAnswers = progress.totalCorrectAnswers;
    let fuel = progress.fuel;
    let launched = false;
    let gainPercent = 0;

    if (isCorrect) {
      currentStreak += 1;
      totalCorrectAnswers += 1;
      bestStreak = Math.max(bestStreak, currentStreak);

      const factor = speedFactor(elapsedMs);
      const baseIncrement = 100 / level.streakToLaunch;
      gainPercent = baseIncrement * factor;
      fuel = Math.min(100, fuel + gainPercent);

      // A full tank isn't enough on its own — launch is withheld while any
      // fact is still "struggling" (a recent miss that hasn't been corrected
      // yet). This is the mastery gate: it stops a lucky fast streak from
      // leveling someone past facts they're still actually getting wrong.
      if (fuel >= 100 && getStrugglingFactKeys(nextMastery).length === 0) {
        launched = true;
        launchesCompleted += 1;
        levelNum += 1;
        currentStreak = 0;
        fuel = 0;
      }
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
      sessionMistakes: triggerHeatmap ? 0 : nextMistakes,
      showHeatmap: triggerHeatmap ? true : get().showHeatmap,
      // Keep showing the just-answered question (with its feedback color) until
      // advanceQuestion() is called — swapping it here would erase the color
      // flash before the player ever sees it.
    });

    return isCorrect;
  },

  advanceQuestion: () => {
    const { progress, question, justLaunched, showHeatmap } = get();
    if (justLaunched || showHeatmap) return; // overlays own their own dismissal flow
    set({ question: newQuestion(progress, question?.fact.key), feedback: null, flare: 0 });
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
    });
  },
}));
