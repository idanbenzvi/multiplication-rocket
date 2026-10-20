import { create } from 'zustand';
import { gameNow } from './gameClock';
import type { Fact } from './types';
import { pickNextFact, randomizeOrder, recordAttempt } from './facts';
import {
  buildDocking,
  checkDock,
  crewKey,
  dockMultiplier,
  DOCK_EVERY,
  fuelPerAnswer,
  MAX_DOCK_TRIES,
  navigatorAddPool,
  navigatorChoices,
  poolFor,
  type Docking,
  type DockResult,
  type Seat,
} from './crew';
import { missionOfKey, pairKey } from './mission';
import { pickFact } from './questions';
import { clampStage } from './addition';
import { missionOf, timedBoostOf } from '../profiles/useProfiles';
import { loadProgressFor, saveProgressFor } from '../storage/progressStore';
import { appendToLog } from '../stats/answerLog';
import { nextPace, paceMs } from './scoring';
import { useGameStore } from './useGameStore';
import { playTrack } from '../audio/useAudio';

// A Crew Flight session (see game/crew.ts for the rules). Answers go into
// each pilot's own mastery map and answer history, so crew play counts as
// practice; the shared tank and the crew level belong to the pair. Each
// pilot's questions come from their own mission, so an older child on ×
// and a younger one on + can fly together.

export interface CrewMember {
  profileId: string;
  seat: Seat;
}

export interface CrewQuestion {
  kind: 'question';
  /** whose turn: index into members */
  member: 0 | 1;
  fact: Fact;
  x: number;
  y: number;
  askedAt: number;
  /** navigator questions: the four answer buttons */
  choices: number[];
}

export interface CrewDocking {
  kind: 'docking';
  /** game time it started: tells one round from the next */
  startedAt: number;
  docking: Docking;
  /** tries used so far */
  tries: number;
  /** the last pick that was revealed */
  last: { a: number; b: number; result: DockResult } | null;
}

export interface MemberStats {
  correct: number;
  answered: number;
}

interface Saved {
  level: number;
  launches: number;
}

// one entry per pair of pilots (useProfiles.remove() clears a deleted pilot's)
const CREW_PREFIX = 'multiplication-rocket:crew:v1';

export function crewStorageKey(idA: string, idB: string): string {
  return `${CREW_PREFIX}:${crewKey(idA, idB)}`;
}

function loadCrew(idA: string, idB: string): Saved {
  try {
    const raw = localStorage.getItem(crewStorageKey(idA, idB));
    if (raw) {
      const p = JSON.parse(raw) as Partial<Saved>;
      return { level: Math.max(1, p.level ?? 1), launches: p.launches ?? 0 };
    }
  } catch {
    // fall through
  }
  return { level: 1, launches: 0 };
}

function saveCrew(idA: string, idB: string, saved: Saved) {
  try {
    localStorage.setItem(crewStorageKey(idA, idB), JSON.stringify(saved));
  } catch {
    // storage blocked: the crew level lasts for this session only
  }
}

interface CrewState {
  /** the setup sheet (pick two pilots and their seats) is open */
  setupOpen: boolean;
  /** a crew flight is under way (it replaces the solo game) */
  active: boolean;
  members: [CrewMember, CrewMember] | null;
  turn: CrewQuestion | CrewDocking | null;
  feedback: 'correct' | 'wrong' | null;
  /** whose question comes next */
  nextMember: 0 | 1;
  /** questions since the last docking round */
  sinceDock: number;
  /** the shared tank, 0-100 */
  fuel: number;
  /** how much of the current tank each member poured in */
  contributions: [number, number];
  level: number;
  /** launches over the pair's whole history */
  launches: number;
  /** this flight only, for the summary */
  missionLaunches: number;
  docks: number;
  stats: [MemberStats, MemberStats];
  /** the tank filled: the launch shows once the current turn has played out */
  pendingLaunch: boolean;
  /** the launch overlay is showing */
  launching: boolean;
  /** the end-of-flight summary is showing */
  summary: boolean;
  openSetup: () => void;
  closeSetup: () => void;
  start: (members: [CrewMember, CrewMember]) => void;
  /** a question answered: returns whether it was right */
  answer: (value: number, elapsedMs: number) => boolean;
  /** after an answer's feedback: the next turn (a question or a docking round) */
  next: () => void;
  /** both picked a number in a docking round */
  dock: (a: number, b: number) => DockResult;
  /** the docking round is over (docked, or out of tries) */
  finishDocking: () => void;
  dismissLaunch: () => void;
  /** end the flight: show the summary */
  land: () => void;
  /** leave the summary: back to solo play */
  close: () => void;
}

function questionFor(members: [CrewMember, CrewMember], member: 0 | 1): CrewQuestion {
  const { profileId, seat } = members[member];
  const mission = missionOf(profileId);
  const progress = loadProgressFor(profileId);
  const { mastery } = progress;
  const fact =
    seat === 'pilot'
      ? pickFact(mission, progress)
      : pickNextFact(mission === 'add' ? navigatorAddPool(mastery) : poolFor(seat, mastery), mastery);
  const { x, y } = randomizeOrder(fact);
  return { kind: 'question', member, fact, x, y, askedAt: gameNow(), choices: seat === 'navigator' ? navigatorChoices(x, y, mission) : [] };
}

// Into the pilot's progress for the fact's mission: only facts of their own
// mission are recorded (a docking round in the other one plays along).
function record(profileId: string, factKey: string, correct: boolean, ms: number | null) {
  const mission = missionOfKey(factKey);
  if (mission !== missionOf(profileId)) return;
  const progress = loadProgressFor(profileId, mission);
  saveProgressFor(
    profileId,
    {
      ...progress,
      mastery: recordAttempt(progress.mastery, factKey, correct),
      totalCorrectAnswers: progress.totalCorrectAnswers + (correct ? 1 : 0),
      // a right answer against the clock moves the pilot's pace, as in their solo flights
      pace: correct && ms !== null && timedBoostOf(profileId) ? nextPace(progress.pace, ms) : progress.pace,
    },
    mission,
  );
  appendToLog(profileId, [{ fact: factKey, correct, ms, source: 'crew' }]);
}

// Docking is played together, so in a mixed crew it's an addition round
// (at the stage of the pilot who is further back): the one both can play.
function dockingFor(members: [CrewMember, CrewMember]): Docking {
  const withNavigator = members.some((m) => m.seat === 'navigator');
  const adders = members.filter((m) => missionOf(m.profileId) === 'add');
  if (adders.length > 0) {
    const stages = adders.map((m) => clampStage(loadProgressFor(m.profileId, 'add').stage));
    const lead = adders.find((m) => m.seat === 'pilot') ?? adders[0];
    return buildDocking(loadProgressFor(lead.profileId, 'add').mastery, withNavigator, 'add', Math.min(...stages));
  }
  // targets come through the pilot's (or first member's) hard facts
  const lead = members.find((m) => m.seat === 'pilot') ?? members[0];
  return buildDocking(loadProgressFor(lead.profileId).mastery, withNavigator);
}

const freshMission = {
  turn: null,
  feedback: null,
  nextMember: 0 as const,
  sinceDock: 0,
  fuel: 0,
  contributions: [0, 0] as [number, number],
  missionLaunches: 0,
  docks: 0,
  stats: [
    { correct: 0, answered: 0 },
    { correct: 0, answered: 0 },
  ] as [MemberStats, MemberStats],
  pendingLaunch: false,
  launching: false,
  summary: false,
};

export const useCrewStore = create<CrewState>((set, get) => {
  // Pours fuel into the shared tank. A full tank launches once the current
  // turn has played out (see beginLaunch), so its celebration isn't cut short.
  const pour = (amounts: [number, number]) => {
    const { fuel, contributions } = get();
    const total = fuel + amounts[0] + amounts[1];
    set({
      fuel: Math.min(100, total),
      contributions: [contributions[0] + amounts[0], contributions[1] + amounts[1]],
      pendingLaunch: total >= 100,
    });
  };

  const beginLaunch = (extra: Partial<CrewState> = {}) => {
    const { members, level, launches, missionLaunches } = get();
    const saved = { level: level + 1, launches: launches + 1 };
    if (members) saveCrew(members[0].profileId, members[1].profileId, saved);
    set({ ...saved, missionLaunches: missionLaunches + 1, pendingLaunch: false, launching: true, ...extra });
  };

  const advance = () => {
    const { members, nextMember, sinceDock } = get();
    if (!members) return;
    if (sinceDock >= DOCK_EVERY) {
      const docking = dockingFor(members);
      set({ turn: { kind: 'docking', startedAt: gameNow(), docking, tries: 0, last: null }, feedback: null, sinceDock: 0 });
      return;
    }
    set({
      turn: questionFor(members, nextMember),
      feedback: null,
      nextMember: nextMember === 0 ? 1 : 0,
      sinceDock: sinceDock + 1,
    });
  };

  return {
    setupOpen: false,
    active: false,
    members: null,
    level: 1,
    launches: 0,
    ...freshMission,

    openSetup: () => set({ setupOpen: true }),
    closeSetup: () => set({ setupOpen: false }),

    start: (members) => {
      const saved = loadCrew(members[0].profileId, members[1].profileId);
      set({ ...freshMission, ...saved, members, active: true, setupOpen: false });
      // the crew's soundtrack (already playing if the launch button started it)
      playTrack('crew');
      advance();
    },

    answer: (value, elapsedMs) => {
      const { turn, members, level, stats, feedback } = get();
      if (!turn || turn.kind !== 'question' || !members || feedback) return false;
      const member = members[turn.member];
      const correct = value === turn.fact.answer;
      // the pace they raced (the answer moves it)
      const pace = paceMs(loadProgressFor(member.profileId).pace);
      record(member.profileId, turn.fact.key, correct, member.seat === 'pilot' ? elapsedMs : null);
      const nextStats = [...stats] as [MemberStats, MemberStats];
      nextStats[turn.member] = { correct: stats[turn.member].correct + (correct ? 1 : 0), answered: stats[turn.member].answered + 1 };
      set({ feedback: correct ? 'correct' : 'wrong', stats: nextStats });
      if (correct) {
        const gain = fuelPerAnswer(member.seat, level, elapsedMs, timedBoostOf(member.profileId), pace);
        pour(turn.member === 0 ? [gain, 0] : [0, gain]);
      }
      return correct;
    },

    next: () => {
      // only from an answered question: a late timer after the launch
      // overlay already moved on must not skip a turn
      const { feedback, launching, summary, pendingLaunch } = get();
      if (!feedback || launching || summary) return;
      if (pendingLaunch) beginLaunch();
      else advance();
    },

    dock: (a, b) => {
      const { turn, members, level, docks } = get();
      if (!turn || turn.kind !== 'docking' || !members) return 'under';
      const { mission } = turn.docking;
      const result = checkDock(a, b, turn.docking.target, mission);
      const tries = turn.tries + 1;
      set({ turn: { ...turn, tries, last: { a, b, result } } });
      if (result === 'dock') {
        // A miss isn't evidence of not knowing a fact (5 × 6 = 30 is right,
        // just not the station's number), so only a dock is recorded.
        const key = pairKey(mission, a, b);
        for (const m of members) record(m.profileId, key, true, null);
        set({ docks: docks + 1 });
        // the docking bonus is earned together: half each
        const share = (fuelPerAnswer('navigator', level, 0) * dockMultiplier(tries)) / 2;
        pour([share, share]);
      }
      return result;
    },

    finishDocking: () => {
      const { turn } = get();
      if (!turn || turn.kind !== 'docking') return;
      if (turn.last?.result !== 'dock' && turn.tries < MAX_DOCK_TRIES) return;
      if (get().pendingLaunch) beginLaunch({ turn: null });
      else advance();
    },

    dismissLaunch: () => {
      set({ launching: false, fuel: 0, contributions: [0, 0] });
      advance();
    },

    land: () => {
      // a full tank still counts, even when landing before its launch played
      if (get().pendingLaunch) beginLaunch();
      set({ summary: true, launching: false });
    },

    close: () => {
      set({ ...freshMission, active: false, members: null });
      playTrack('theme');
      // the solo pilot's progress may have changed (if they were in the crew)
      useGameStore.getState().init();
    },
  };
});
