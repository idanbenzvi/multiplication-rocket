import { create } from 'zustand';
import { answerBoss, CHECKPOINT_EVERY, dodgeFireball, newFight, nextBossQuestion, RUN_TO_WIN, type BossFight, type BossOutcome, type BossQuestion } from './blackSun';
import { recordOwn } from './ownAnswers';
import { activeMission, useProfiles } from '../profiles/useProfiles';
import { loadProgressFor } from '../storage/progressStore';
import { loadBossRecord, saveBossRecord, type BossRecord } from '../storage/bossRecord';
import { pauseGame, resumeGame } from './gameClock';
import { playGameMusic, playTrack } from '../audio/useAudio';
import { useGameStore } from './useGameStore';
import { useAchievements } from './useAchievements';

// The Black Sun on this device (blackSun.ts has the rules). It opens over
// the game, which waits paused underneath, like the other game modes; each
// answer goes into the pilot's own mastery map. The fight's moments (the
// bolts, the fireballs, the cure) are played out by the overlay
// (components/boss/BlackSun.tsx), which asks for each next question.

/**
 * intro: the ship arrives and the rules are read; fight: answering; cured:
 * the 15th answer is in and the finale plays (the win is already saved).
 */
export type BossPhase = 'intro' | 'fight' | 'cured';

interface BossStore {
  open: boolean;
  phase: BossPhase;
  fight: BossFight;
  question: BossQuestion | null;
  /** the active pilot's record in their mission (re-read on open, and after a win) */
  record: BossRecord;
  openBoss: () => void;
  closeBoss: () => void;
  /** from the intro: the fight starts */
  begin: () => void;
  /** a fresh fight, from the finale */
  again: () => void;
  /** the pilot's answer to the current question (null if there's none to answer) */
  answer: (value: number) => { outcome: BossOutcome; gained: number; correct: boolean; fight: BossFight } | null;
  /** the fireball has passed or hit; how much life the sun got back */
  resolveFireball: (dodged: boolean) => number;
  /** the next question, once the last one has played out */
  ask: () => void;
  /** re-read the active pilot's record (they changed, or their mission did) */
  refresh: () => void;
  /** every fact of their mission is mastered: it opens for them, for good */
  unlock: () => void;
  /** dev mode only: the run jumps to one short of the cure */
  devAlmost: () => void;
}

function mastery() {
  const id = useProfiles.getState().activeId;
  return id ? loadProgressFor(id).mastery : {};
}

function readRecord(): BossRecord {
  return loadBossRecord(useProfiles.getState().activeId, activeMission());
}

export const useBossStore = create<BossStore>((set, get) => ({
  open: false,
  phase: 'intro',
  fight: newFight(),
  question: null,
  record: readRecord(),

  openBoss: () => {
    pauseGame('boss');
    // its own soundtrack, from the tap (browsers only start music from one)
    playTrack('boss');
    const record = saveBossRecord(useProfiles.getState().activeId, activeMission(), { seen: true });
    set({ open: true, phase: 'intro', fight: newFight(), question: null, record });
  },

  closeBoss: () => {
    set({ open: false, phase: 'intro', fight: newFight(), question: null, record: readRecord() });
    resumeGame('boss');
    playGameMusic();
    // this pilot's practice map has changed
    useGameStore.getState().init();
  },

  begin: () => {
    if (get().phase !== 'intro') return;
    set({ phase: 'fight', fight: newFight(), question: null });
  },

  again: () => {
    playTrack('boss');
    set({ phase: 'fight', fight: newFight(), question: null });
  },

  answer: (value) => {
    const { question, fight, phase } = get();
    if (phase !== 'fight' || !question || fight.fireball) return null;
    const correct = value === question.answer;
    recordOwn(question.track, correct, 'boss');
    const r = answerBoss(fight, question, correct);
    set({ fight: r.fight, question: null });
    if (r.outcome === 'won') {
      // saved at once, so leaving during the finale still counts it
      const id = useProfiles.getState().activeId;
      const before = readRecord();
      const record = saveBossRecord(id, activeMission(), { wins: before.wins + 1, bestRun: RUN_TO_WIN });
      if (id) useAchievements.getState().track({ type: 'boss' }, loadProgressFor(id));
      set({ phase: 'cured', record });
    }
    return { ...r, correct };
  },

  resolveFireball: (dodged) => {
    const r = dodgeFireball(get().fight, dodged);
    set({ fight: r.fight });
    return r.gained;
  },

  ask: () => {
    const { fight, phase } = get();
    if (phase !== 'fight' || fight.fireball) return;
    set({ question: { ...nextBossQuestion(fight, activeMission(), mastery()) } });
  },

  refresh: () => set({ record: readRecord() }),

  unlock: () => {
    if (readRecord().unlocked) return;
    set({ record: saveBossRecord(useProfiles.getState().activeId, activeMission(), { unlocked: true }) });
  },

  devAlmost: () => {
    const { fight, phase } = get();
    if (phase !== 'fight' || fight.fireball) return;
    const run = RUN_TO_WIN - 1;
    set({ fight: { ...fight, run, checkpoint: Math.floor(run / CHECKPOINT_EVERY) * CHECKPOINT_EVERY, bestRun: Math.max(fight.bestRun, run) } });
  },
}));
