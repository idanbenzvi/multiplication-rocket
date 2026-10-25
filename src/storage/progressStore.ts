import type { Progress } from '../game/types';
import { opsOf, PILOT_MISSIONS, type PilotMission } from '../game/mission';
import { activeMission, factsKeyFor, missionOf, progressKeyFor, useProfiles } from '../profiles/useProfiles';
import { needsUpgrade, upgradeMastery } from '../game/memory';
import { combineFacts, factsView, withoutMission, type Facts } from '../game/sharedFacts';
import { clampStage, stageFor } from '../game/addition';
import { masterySummary } from '../game/masteryStats';
import { readLog } from '../stats/answerLog';

// Progress is saved per pilot profile and mission (the active pilot's
// current one), in two parts: the mission's journey (its level, fuel,
// streaks, launches, its sums' stage, the pilot's pace) under its own key,
// and the facts the pilot knows once for every mission (game/sharedFacts.ts),
// each mission seeing the ones it practises. Before a profile exists (the
// very first launch, while the welcome screen is up) it falls back to a
// scratch key, facts and all.
const SCRATCH_KEY = 'multiplication-rocket:progress:v1:unassigned';

interface Owner {
  profileId: string;
  mission: PilotMission;
}

function activeOwner(): Owner | undefined {
  const { activeId } = useProfiles.getState();
  return activeId ? { profileId: activeId, mission: activeMission() } : undefined;
}

export function defaultProgress(): Progress {
  return {
    version: 1,
    level: 1,
    fuel: 0,
    currentStreak: 0,
    bestStreak: 0,
    totalCorrectAnswers: 0,
    launchesCompleted: 0,
    mastery: {},
  };
}

// Everything above this line and the interface below are the durable contract:
// swapping to a real backend later means writing a new implementation of
// ProgressStore (e.g. one backed by fetch() calls to a DB-backed API) and
// pointing useGameStore at it instead of localProgressStore. No other file
// in the game needs to change.
export interface ProgressStore {
  load(): Progress;
  save(progress: Progress): void;
  reset(): void;
}

function readJson(key: string): Record<string, unknown> | null {
  const raw = localStorage.getItem(key);
  const parsed = raw ? (JSON.parse(raw) as unknown) : null;
  return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
}

function saveTo(key: string, value: object): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    // storage blocked/full: progress lasts for this session only
    return false;
  }
}

// ---- the facts, shared ----

function writeFacts(profileId: string, facts: Facts): boolean {
  return saveTo(factsKeyFor(profileId), { version: 1, facts });
}

/** all the facts a pilot knows, whichever mission they were answered in */
export function loadFacts(profileId: string): Facts {
  try {
    const saved = readJson(factsKeyFor(profileId));
    if (!saved) return shareFacts(profileId);
    return saved.version === 1 && saved.facts && typeof saved.facts === 'object' ? (saved.facts as Facts) : {};
  } catch {
    return {};
  }
}

// The first time a pilot's facts are read since they were shared: each
// mission's own (brought up to spaced review first if they're from before it,
// game/memory.ts) made one, a fact practised in more than one reviewed as it
// was answered last (the answer log says when), and then taken out of the
// missions' saves, which keep just their journeys.
function shareFacts(profileId: string): Facts {
  const log = readLog(profileId);
  const byMission: Partial<Record<PilotMission, Facts>> = {};
  const journeys: Array<[string, Record<string, unknown>]> = [];
  for (const mission of PILOT_MISSIONS) {
    const key = progressKeyFor(profileId, mission);
    const saved = readJson(key);
    if (!saved || !saved.mastery || typeof saved.mastery !== 'object') continue;
    let mastery = saved.mastery as Facts;
    if (needsUpgrade(mastery)) mastery = upgradeMastery(mastery, log.filter((e) => e.mission === mission));
    byMission[mission] = mastery;
    journeys.push([key, saved]);
  }
  const lastAt = new Map<string, number>();
  for (const e of log) {
    const k = `${e.mission}|${e.fact}`;
    lastAt.set(k, Math.max(lastAt.get(k) ?? -Infinity, e.at));
  }
  const facts = combineFacts(byMission, (mission, key) => lastAt.get(`${mission}|${key}`));
  // (only once the facts are safely saved do the missions let go of theirs)
  if (writeFacts(profileId, facts)) {
    for (const [key, saved] of journeys) {
      const journey = { ...saved };
      delete journey.mastery;
      saveTo(key, journey);
    }
  }
  return facts;
}

// ---- a mission's progress: its journey, and its view of the facts ----

function loadJourney(key: string): Progress {
  try {
    const saved = readJson(key) as Partial<Progress> | null;
    return saved?.version === 1 ? { ...defaultProgress(), ...saved } : defaultProgress();
  } catch {
    return defaultProgress();
  }
}

function loadOwned({ profileId, mission }: Owner): Progress {
  return { ...loadJourney(progressKeyFor(profileId, mission)), mastery: factsView(loadFacts(profileId), mission) };
}

function saveOwned({ profileId, mission }: Owner, progress: Progress) {
  const { mastery, ...journey } = progress;
  saveTo(progressKeyFor(profileId, mission), journey);
  writeFacts(profileId, { ...loadFacts(profileId), ...mastery });
}

// A crew flight records answers for two pilots at once, so it reads and
// writes a given pilot's progress rather than the active one's (in their
// current mission, unless a fact from the other one is being recorded).
export function loadProgressFor(profileId: string, mission: PilotMission = missionOf(profileId)): Progress {
  return loadOwned({ profileId, mission });
}

export function saveProgressFor(profileId: string, progress: Progress, mission: PilotMission = missionOf(profileId)) {
  saveOwned({ profileId, mission }, progress);
}

export const localProgressStore: ProgressStore = {
  load() {
    const owner = activeOwner();
    return owner ? loadOwned(owner) : loadJourney(SCRATCH_KEY);
  },
  save(progress) {
    const owner = activeOwner();
    if (owner) saveOwned(owner, progress);
    else saveTo(SCRATCH_KEY, progress);
  },
  // the mission's journey, and the facts it practises (for every mission that shares them)
  reset() {
    const owner = activeOwner();
    try {
      if (!owner) {
        localStorage.removeItem(SCRATCH_KEY);
        return;
      }
      localStorage.removeItem(progressKeyFor(owner.profileId, owner.mission));
      writeFacts(owner.profileId, withoutMission(loadFacts(owner.profileId), owner.mission));
    } catch {
      // ignore
    }
  },
};

// ---- switching missions ----

/** a pilot setting off in a mission: its journey as they left it (a new one at level 1), its sums as far on as the facts they already know open */
export function prepareMission(profileId: string, mission: PilotMission) {
  if (!opsOf(mission).includes('add')) return;
  const progress = loadProgressFor(profileId, mission);
  const stage = stageFor(progress.stage, progress.mastery);
  if (stage !== clampStage(progress.stage)) saveProgressFor(profileId, { ...progress, stage }, mission);
}

export interface MissionStats {
  /** flown before (it has a journey saved) */
  played: boolean;
  level: number;
  correct: number;
  /** its facts mastered, of all it practises */
  mastered: number;
  facts: number;
}

/** how a pilot is getting on in a mission, for the switcher and their card */
export function missionStats(profileId: string, mission: PilotMission): MissionStats {
  const progress = loadProgressFor(profileId, mission);
  let played = false;
  try {
    played = localStorage.getItem(progressKeyFor(profileId, mission)) !== null;
  } catch {
    // ignore
  }
  const counts = masterySummary(progress.mastery, mission);
  const facts = counts.mastered + counts.fading + counts.practice + counts.untried;
  return { played, level: progress.level, correct: progress.totalCorrectAnswers, mastered: counts.mastered, facts };
}
