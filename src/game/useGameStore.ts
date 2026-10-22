import { create } from 'zustand';
import { gameNow, gameTimeout } from './gameClock';
import type { Fact, FactStat, Progress } from './types';
import { getStrugglingFactKeys, randomizeOrder, recordAttempt } from './facts';
import { getLevelConfig } from './levels';
import { MAX_SPEED_FACTOR, nextPace, paceMs, speedFactor, speedZone, UNTIMED_SPEED_FACTOR } from './scoring';
import { buildChallenge, CHALLENGE_EVERY, type Challenge } from './wormhole';
import { nextBonusRound, type BonusKind } from './bonusRounds';
import { pickFact } from './questions';
import { clampStage, stageReady } from './addition';
import { localProgressStore } from '../storage/progressStore';
import { useSettings } from '../settings/useSettings';
import { activeMission, activeTimedBoost, useProfiles } from '../profiles/useProfiles';
import { pickOp, type Mission } from './mission';
import { appendToLog, clearLog, type AnswerSource } from '../stats/answerLog';
import { resetBossRecord } from '../storage/bossRecord';
import { useAchievements } from './useAchievements';
import { AWAY_MS, flyAway, flyHome, kick } from './flight';

/**
 * Bonus rounds the rocket leaves the game for (each in its own ship, which
 * races away, blasts off or jumps to lightspeed at the end): it flies off
 * before them and home after them. The others play over the rocket.
 */
const FLIES_OFF: ReadonlySet<BonusKind> = new Set(['traffic', 'battle', 'stranded', 'stardust', 'road']);

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
  /** this launch also opened the next addition stage */
  stageUp: boolean;
  sessionMistakes: number;
  showHeatmap: boolean;
  /** the map opened by itself after a run of mistakes (vs. "Stop & Review") */
  heatmapAuto: boolean;
  /** an active Wormhole challenge replaces the question while non-null */
  challenge: Challenge | null;
  /** true while the fly-through animation plays (the boost lands at its end) */
  inWormhole: boolean;
  questionsSinceChallenge: number;
  /** a bonus round in progress (replaces the question) */
  bonusRound: Exclude<BonusKind, 'wormhole'> | null;
  /** the rocket is flying off for this round, which starts once it's gone (flyAway) */
  departing: Exclude<BonusKind, 'wormhole'> | null;
  /**
   * the question (its askedAt) the pilot asked the ship's computer for help with
   * (ShipComputer): its answer gets the steady boost, not the clock's, and
   * doesn't count towards their pace or the parents' speed chart
   */
  helpedAt: number | null;
  markHelped: () => void;
  /** the operation the bonus round (or wormhole) in progress is about: a mixed mission's is picked for each round */
  bonusOp: Mission;
  /** the bonus kinds still to come, in a random order (see nextBonusRound) */
  bonusQueue: BonusKind[];
  /** bumped on every new bonus round; used as its React key so each one starts fresh */
  bonusNonce: number;
  /** the Deep Space Academy (learn multiplication from scratch) is open */
  academyOpen: boolean;
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
  /**
   * A Meteor Shower / Constellation round finished: record its answers in
   * the mastery map, add its fuel (may launch), back to normal questions.
   */
  finishBonusRound: (result: { fuelGain: number; answers: Array<{ factKey: string; correct: boolean }> }) => void;
  /** open the Deep Space Academy, if nothing else is going on */
  openAcademy: () => void;
  closeAcademy: () => void;
  /** dev mode only: jump straight into a bonus round */
  devStartBonus: (kind: BonusKind) => void;
  /** dev mode only: complete the level now (launch overlay + warp) */
  devLaunch: () => void;
  /** dev mode only: set the tank to a given fuel level */
  devSetFuel: (fuel: number) => void;
}

function launchFrom(progress: Progress) {
  return {
    level: progress.level + 1,
    launchesCompleted: progress.launchesCompleted + 1,
    currentStreak: 0,
    fuel: 0,
  };
}

// An addition pilot (or a mixed one: its sums) moves up a stage on a launch,
// once enough of the stage is mastered (see addition.ts): advancing through
// the levels, on success. The stage only changes when a new one opens (a new
// pilot has none saved yet).
function nextStage(progress: Progress, mastery: Record<string, FactStat>): number | undefined {
  if (activeMission() === 'mul' || !stageReady(clampStage(progress.stage), mastery)) return progress.stage;
  return clampStage(progress.stage) + 1;
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
  let stage = progress.stage;
  let launched = false;
  if (fuel >= 100 && getStrugglingFactKeys(mastery).length === 0) {
    launched = true;
    ({ level, launchesCompleted, currentStreak, fuel } = launchFrom(progress));
    stage = nextStage(progress, mastery);
  }
  return { fuel, level, launchesCompleted, currentStreak, launched, stage, stageUp: stage !== progress.stage };
}

function newQuestion(progress: Progress, avoidKey?: string): Question {
  const fact = pickFact(activeMission(), progress, avoidKey);
  const { x, y } = randomizeOrder(fact);
  return { fact, x, y, askedAt: gameNow() };
}

/** what the bonus round in progress is about (× or +): the rounds build themselves for it */
export function roundOp(): Mission {
  return useGameStore.getState().bonusOp;
}

/** a bonus round begins: straight away, or (one the rocket leaves the game for) once it has flown off */
function startBonus(kind: Exclude<BonusKind, 'wormhole'>) {
  useGameStore.setState({ bonusOp: pickOp(activeMission()) });
  const begin = () => useGameStore.setState((s) => ({ bonusRound: kind, departing: null, bonusNonce: s.bonusNonce + 1 }));
  if (!FLIES_OFF.has(kind) || !flyAway()) {
    begin();
    return;
  }
  useGameStore.setState({ departing: kind });
  gameTimeout(() => {
    // (unless something else took over meanwhile: a reset, another pilot)
    if (useGameStore.getState().departing === kind) begin();
  }, AWAY_MS);
}

export const useGameStore = create<GameState>((set, get) => ({
  progress: localProgressStore.load(),
  question: null,
  feedback: null,
  flare: 0,
  lastGainPercent: 0,
  justLaunched: false,
  stageUp: false,
  sessionMistakes: 0,
  showHeatmap: false,
  heatmapAuto: false,
  challenge: null,
  inWormhole: false,
  questionsSinceChallenge: 0,
  bonusRound: null,
  departing: null,
  helpedAt: null,
  markHelped: () => set((s) => ({ helpedAt: s.question?.askedAt ?? null })),
  bonusOp: 'mul',
  bonusQueue: [],
  bonusNonce: 0,
  academyOpen: false,

  init: () => {
    const progress = localProgressStore.load();
    set({
      progress,
      question: newQuestion(progress),
      feedback: null,
      flare: 0,
      justLaunched: false,
      stageUp: false,
      sessionMistakes: 0,
      showHeatmap: false,
      challenge: null,
      inWormhole: false,
      questionsSinceChallenge: 0,
      bonusRound: null,
      departing: null,
    });
    useAchievements.getState().track({ type: 'progress' }, progress);
  },

  submitAnswer: (value: number, elapsedMs: number) => {
    const { progress, question } = get();
    if (!question) return false;
    const isCorrect = value === question.fact.answer;
    const level = getLevelConfig(progress.level);

    const nextMastery = recordAttempt(progress.mastery, question.fact.key, isCorrect);
    // worked out with the ship's computer: not a race against the clock (no time in the log either)
    const helped = get().helpedAt === question.askedAt;
    appendToLog(useProfiles.getState().activeId, [
      { fact: question.fact.key, correct: isCorrect, ms: helped ? null : elapsedMs, source: 'question' },
    ]);

    let currentStreak = progress.currentStreak;
    let bestStreak = progress.bestStreak;
    let levelNum = progress.level;
    let launchesCompleted = progress.launchesCompleted;
    let totalCorrectAnswers = progress.totalCorrectAnswers;
    let fuel = progress.fuel;
    let stage = progress.stage;
    let launched = false;
    let stageUp = false;
    let gainPercent = 0;
    const timed = activeTimedBoost() && !helped;
    // the clock they raced is the pace they had (this answer moves it for the next one)
    const pace = paceMs(progress.pace);

    if (isCorrect) {
      currentStreak += 1;
      totalCorrectAnswers += 1;
      bestStreak = Math.max(bestStreak, currentStreak);

      // racing the clock at their own pace, or (with the speed boost switched off for this pilot) a steady boost every time
      const factor = timed ? speedFactor(elapsedMs, pace) : UNTIMED_SPEED_FACTOR;
      const baseIncrement = 100 / level.streakToLaunch;
      gainPercent = baseIncrement * factor;
      const result = addFuel({ ...progress, currentStreak }, nextMastery, gainPercent);
      fuel = result.fuel;
      levelNum = result.level;
      launchesCompleted = result.launchesCompleted;
      currentStreak = result.currentStreak;
      launched = result.launched;
      stage = result.stage;
      stageUp = result.stageUp;
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
      stage,
      pace: isCorrect && timed ? nextPace(progress.pace, elapsedMs) : progress.pace,
    };

    localProgressStore.save(nextProgress);
    // A comeback: a fact that was "struggling" is back on track thanks to this answer.
    const struggling = (m: Record<string, FactStat>) => getStrugglingFactKeys(m).includes(question.fact.key);
    useAchievements.getState().track(
      {
        type: 'answer',
        correct: isCorrect,
        fast: isCorrect && !helped && speedZone(elapsedMs, pace) === 'fast',
        comeback: isCorrect && struggling(progress.mastery) && !struggling(nextMastery),
      },
      nextProgress,
    );

    // Five mistakes (since the last time the heatmap was shown) trigger it
    // automatically — the counter is session-only, not persisted, since it's
    // just a "time for a check-in" pacing signal, not long-term progress.
    const nextMistakes = isCorrect ? get().sessionMistakes : get().sessionMistakes + 1;
    // Opt-in (settings): opening a board unprompted mid-game is confusing
    // unless the player asked for it.
    const triggerHeatmap =
      !isCorrect && nextMistakes >= MISTAKES_BEFORE_HEATMAP && useSettings.getState().mistakeReview;

    set({
      progress: nextProgress,
      feedback: isCorrect ? 'correct' : 'wrong',
      // Normalized 0-1 burst for the flame flash — faster answers flare bigger.
      flare: isCorrect ? Math.min(1, gainPercent / (100 / level.streakToLaunch) / 1.75) : 0,
      lastGainPercent: gainPercent,
      justLaunched: launched,
      stageUp,
      sessionMistakes: triggerHeatmap ? 0 : nextMistakes,
      showHeatmap: triggerHeatmap ? true : get().showHeatmap,
      heatmapAuto: triggerHeatmap ? true : get().heatmapAuto,
      // Keep showing the just-answered question (with its feedback color) until
      // advanceQuestion() is called — swapping it here would erase the color
      // flash before the player ever sees it.
    });

    return isCorrect;
  },

  advanceQuestion: () => {
    const { progress, question, justLaunched, showHeatmap, questionsSinceChallenge } = get();
    if (justLaunched || showHeatmap) return; // overlays own their own dismissal flow
    const count = questionsSinceChallenge + 1;
    if (count >= CHALLENGE_EVERY) {
      const { kind, queue } = nextBonusRound(get().bonusQueue);
      const next = { questionsSinceChallenge: 0, bonusQueue: queue, feedback: null, flare: 0 };
      if (kind === 'wormhole') {
        const op = pickOp(activeMission());
        set({ ...next, bonusOp: op, challenge: buildChallenge(progress.level, op, clampStage(progress.stage)) });
      } else {
        set(next);
        startBonus(kind);
      }
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
      stage: result.stage,
    };
    localProgressStore.save(nextProgress);
    useAchievements.getState().track({ type: 'bonus', kind: 'wormhole', perfect: false }, nextProgress);
    set({
      progress: nextProgress,
      challenge: null,
      inWormhole: false,
      justLaunched: result.launched,
      stageUp: result.stageUp,
      lastGainPercent: gain,
      question: newQuestion(nextProgress),
      feedback: null,
      flare: 0,
    });
    // out of the tunnel: the rocket flies home
    flyHome();
  },


  finishBonusRound: ({ fuelGain, answers }) => {
    const { progress, bonusRound } = get();
    const source: AnswerSource = bonusRound ?? 'question';
    appendToLog(
      useProfiles.getState().activeId,
      answers.map((a) => ({ fact: a.factKey, correct: a.correct, ms: null, source })),
    );
    let mastery = progress.mastery;
    for (const a of answers) mastery = recordAttempt(mastery, a.factKey, a.correct);
    const result = addFuel({ ...progress, mastery }, mastery, fuelGain);
    const nextProgress: Progress = {
      ...progress,
      mastery,
      fuel: result.fuel,
      level: result.level,
      launchesCompleted: result.launchesCompleted,
      currentStreak: result.currentStreak,
      stage: result.stage,
    };
    localProgressStore.save(nextProgress);
    if (bonusRound) {
      const perfect = answers.length > 0 && answers.every((a) => a.correct);
      useAchievements.getState().track({ type: 'bonus', kind: bonusRound, perfect }, nextProgress);
    }
    set({
      progress: nextProgress,
      bonusRound: null,
      justLaunched: result.launched,
      stageUp: result.stageUp,
      lastGainPercent: fuelGain,
      question: newQuestion(nextProgress),
      feedback: null,
      flare: 0,
    });
    // back in the game: the rocket flies home from a round it flew off in; one played over it just surges on
    if (bonusRound && FLIES_OFF.has(bonusRound)) flyHome();
    else kick(0.6);
  },

  openAcademy: () => {
    const s = get();
    if (s.academyOpen || s.justLaunched || s.showHeatmap || s.challenge || s.bonusRound || s.departing) return;
    set({ academyOpen: true });
    // this pilot has found the secret: stop the porthole's "tap me" shimmer
    const { activeId, update } = useProfiles.getState();
    if (activeId) update(activeId, { academySeen: true });
  },

  closeAcademy: () => {
    set({ academyOpen: false });
  },

  devStartBonus: (kind) => {
    const { progress } = get();
    const clear = { justLaunched: false, showHeatmap: false, inWormhole: false, feedback: null, flare: 0 };
    if (kind === 'wormhole') {
      const op = pickOp(activeMission());
      set({ ...clear, bonusRound: null, bonusOp: op, challenge: buildChallenge(progress.level, op, clampStage(progress.stage)) });
    } else {
      set({ ...clear, challenge: null });
      startBonus(kind);
    }
  },

  devLaunch: () => {
    const { progress } = get();
    const stage = nextStage(progress, progress.mastery);
    const nextProgress: Progress = { ...progress, ...launchFrom(progress), stage };
    localProgressStore.save(nextProgress);
    useAchievements.getState().track({ type: 'progress' }, nextProgress);
    set({ progress: nextProgress, justLaunched: true, stageUp: stage !== progress.stage, challenge: null, bonusRound: null, question: newQuestion(nextProgress) });
  },

  devSetFuel: (fuel) => {
    const { progress } = get();
    const nextProgress: Progress = { ...progress, fuel };
    localProgressStore.save(nextProgress);
    set({ progress: nextProgress });
  },

  collapseWormhole: () => {
    const { progress } = get();
    set({ challenge: null, inWormhole: false, question: newQuestion(progress), feedback: null, flare: 0 });
  },

  dismissLaunch: () => {
    const { progress } = get();
    set({ justLaunched: false, stageUp: false, feedback: null, flare: 0, question: newQuestion(progress) });
  },

  requestHeatmap: () => {
    set({ showHeatmap: true, heatmapAuto: false });
  },

  dismissHeatmap: () => {
    const { progress } = get();
    set({ showHeatmap: false, sessionMistakes: 0, question: newQuestion(progress) });
  },

  resetProgress: () => {
    localProgressStore.reset();
    // a reset is a fresh start: the dashboard's history (of this mission) goes too
    const activeId = useProfiles.getState().activeId;
    if (activeId) clearLog(activeId, activeMission());
    resetBossRecord(activeId, activeMission());
    useAchievements.getState().reset();
    const progress = localProgressStore.load();
    set({
      progress,
      question: newQuestion(progress),
      feedback: null,
      flare: 0,
      justLaunched: false,
      stageUp: false,
      sessionMistakes: 0,
      showHeatmap: false,
      challenge: null,
      inWormhole: false,
      questionsSinceChallenge: 0,
      bonusRound: null,
      departing: null,
    });
  },
}));
