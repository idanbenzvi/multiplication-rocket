import { create } from 'zustand';
import { useGameStore } from '../../../game/useGameStore';
import { getLevelConfig } from '../../../game/levels';
import { activeMission, useProfiles } from '../../../profiles/useProfiles';
import { isTouchDevice } from '../../../settings/useSettings';
import { playTrack } from '../../../audio/useAudio';
import { loadCanyonRecord, saveCanyonRecord } from '../../../storage/canyonRecord';
import { useCockpit } from '../store';
import { Builder } from './builder';
import type { Quality } from './chunk';
import { flash, resetFx } from './fx';
import { buildGates, runLength, type Gate, type GateResult } from './gates';
import { PACE_START, Run } from './run';

// The Canyon Run. From the cockpit, the orange buttons by the stick start
// it (MANUAL): a countdown in the cockpit while the canyon's first stretch
// is built, then a white-out and the dive in (canyon/World.tsx flies it).
// Or at a level's end, now and then (arrival.ts): the canyon's built while
// the ship dives into its destination's air (Descent.tsx), the cockpit
// opens under the white, and the white clears on the dive in. Out of the
// climb at its end, what was flown; after an arrival's, back to the flight.
// Its answers count towards the pilot's facts as any round's do, and its
// fuel is paid once a level (a run after that is for the fun of it), short
// of a launch: that's the game's, outside, on the next right answer. Its
// pace carries on from the pilot's last run.

export type CanyonPhase = 'off' | 'ready' | 'intro' | 'flight' | 'results';
/** how it was started: MANUAL in the cockpit, or arriving at a destination */
export type CanyonEntry = 'manual' | 'arrival';

/** the countdown before diving in (s), the white-out at its end */
export const INTRO_S = 3.2;
/** arriving: how long the canyon's name stays up as the white clears (s) */
export const TITLE_S = 4.2;
/** a gate's fuel, a share of a right answer's, for a bullseye and for close */
const FUEL = { bullseye: 0.5, close: 0.2, miss: 0 };

export interface Summary {
  gates: Gate[];
  results: GateResult[];
  bullseyes: number;
  close: number;
  bestCombo: number;
  /** fuel added (0 when this level's was paid by an earlier run) */
  fuel: number;
  /** this level's fuel was paid already */
  forFun: boolean;
  /** the most bullseyes this pilot's flown in a run */
  best: boolean;
}

interface CanyonState {
  phase: CanyonPhase;
  entry: CanyonEntry;
  /** one for each run (its scene's key) */
  runId: number;
  /** arriving: the world's held behind the white, and the canyon's first stretch is there */
  veil: boolean;
  seen: boolean;
  /** arriving: the canyon's name is up (the gate's fact waits under it) */
  titled: boolean;
  /** the last gate flown, for the windscreen to call out (and the bullseyes in a row, with it) */
  shout: { id: number; result: GateResult; combo: number } | null;
  summary: Summary | null;
  /** MANUAL's tap, or an arrival (built while the descent plays: 'ready' till the cockpit's open) */
  start: (quality: Quality, calm: boolean, entry?: CanyonEntry, level?: number) => void;
  /** the countdown's done, or the cockpit's open on an arrival: into the canyon */
  fly: () => void;
  /** the white's clearing: the run goes on */
  unveil: () => void;
  /** a gate flown */
  gate: (result: GateResult) => void;
  /** out of the canyon (`finished`: its end, else ended early), what was flown counted */
  land: (finished: boolean) => void;
  /** back to the cockpit (or, after an arrival, the flight) */
  close: () => void;
}

/** the run in progress, outside React: its flight, its canyon's builder, and where it is */
export const live = {
  run: null as Run | null,
  builder: null as Builder | null,
  quality: 'high' as Quality,
  calm: false,
  /** the destination the canyon's on, and the one hanging in its sky as its star */
  place: { world: 0, star: 1 },
};

/** a phone or a small tablet: the lighter canyon */
export function runQuality(): Quality {
  return isTouchDevice && Math.min(window.innerWidth, window.innerHeight) < 820 ? 'low' : 'high';
}

export function calmMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

let introTimer = 0;
let titleTimer = 0;

export const useCanyon = create<CanyonState>((set, get) => ({
  phase: 'off',
  entry: 'manual',
  runId: 0,
  veil: false,
  seen: false,
  titled: false,
  shout: null,
  summary: null,
  start: (quality, calm, entry = 'manual', level) => {
    if (get().phase !== 'off' && get().phase !== 'results') return;
    const again = get().phase === 'results';
    const progress = useGameStore.getState().progress;
    // (on the destination being flown to; arriving, the one just reached; flown again, the same one)
    if (!again || level !== undefined) {
      const on = level ?? progress.level;
      live.place = { world: getLevelConfig(on).destinationIndex, star: getLevelConfig(on + 1).destinationIndex };
    }
    const gates = buildGates(progress, activeMission());
    const seed = Math.floor(Math.random() * 2 ** 31);
    const record = loadCanyonRecord(useProfiles.getState().activeId, activeMission());
    live.builder?.dispose();
    live.builder = new Builder({ seed, gates: gates.map((g) => g.d), end: runLength(gates.length) }, quality);
    // (the first stretch built while the countdown, or the descent, runs)
    live.builder.want(0, 10);
    live.run = new Run(live.builder.canyon, gates, calm, record.pace ?? PACE_START);
    live.quality = quality;
    live.calm = calm;
    playTrack('canyon');
    window.clearTimeout(introTimer);
    window.clearTimeout(titleTimer);
    if (entry === 'arrival' && !again) {
      set({ phase: 'ready', entry, runId: get().runId + 1, veil: true, seen: false, titled: false, shout: null, summary: null });
      return;
    }
    // the white-out at the countdown's end
    flash([1, 0.97, 0.92], calm ? 0.7 : 1.15, 0.75, 1.0, INTRO_S - 0.75);
    introTimer = window.setTimeout(() => get().fly(), INTRO_S * 1000);
    set({ phase: 'intro', entry: again ? get().entry : entry, runId: get().runId + 1, veil: false, seen: false, titled: false, shout: null, summary: null });
  },
  fly: () => {
    const { phase } = get();
    if (phase === 'intro' || phase === 'ready') set({ phase: 'flight' });
  },
  unveil: () => {
    if (!get().veil) return;
    // (the white clearing, on the lens too)
    flash([1, 0.97, 0.92], live.calm ? 0.6 : 1, 0.01, 0.9);
    set({ veil: false, titled: true });
    titleTimer = window.setTimeout(() => set({ titled: false }), TITLE_S * 1000);
  },
  gate: (result) => set((s) => ({ shout: { id: (s.shout?.id ?? 0) + 1, result, combo: live.run?.combo ?? 0 } })),
  land: (finished) => {
    window.clearTimeout(introTimer);
    window.clearTimeout(titleTimer);
    const run = live.run;
    const { phase, entry } = get();
    if (!run || (phase !== 'flight' && phase !== 'intro' && phase !== 'ready')) return;
    const { results, gates } = run;
    const { activeId } = useProfiles.getState();
    const mission = activeMission();
    const progress = useGameStore.getState().progress;
    const record = loadCanyonRecord(activeId, mission);
    const pays = results.length > 0 && record.paidLevel !== progress.level;
    const base = 100 / getLevelConfig(progress.level).streakToLaunch;
    const fuel = pays ? results.reduce((sum, r) => sum + FUEL[r.verdict] * base, 0) : 0;
    if (results.length) {
      useGameStore.getState().finishCanyonRun({
        fuelGain: fuel,
        answers: results.map((r) => ({ factKey: gates[r.gate].factKey, correct: r.verdict === 'bullseye' })),
      });
    }
    const bullseyes = results.filter((r) => r.verdict === 'bullseye').length;
    saveCanyonRecord(activeId, mission, {
      paidLevel: pays ? progress.level : record.paidLevel,
      best: Math.max(record.best, bullseyes),
      runs: record.runs + (results.length ? 1 : 0),
      // (the next run starts at the pace this one ended at)
      pace: results.length ? run.pace : record.pace,
    });
    live.builder?.dispose();
    live.builder = null;
    live.run = null;
    resetFx();
    // (the cockpit's music, which the cockpit gives back to the game's as it closes)
    playTrack('cockpit');
    if (!finished) {
      set({ phase: 'off', veil: false, titled: false, shout: null, summary: null });
      // (an arrival's ended early: back to the flight)
      if (entry === 'arrival') useCockpit.getState().close();
      return;
    }
    set({
      phase: 'results',
      titled: false,
      shout: null,
      summary: {
        gates,
        results,
        bullseyes,
        close: results.filter((r) => r.verdict === 'close').length,
        bestCombo: run.bestCombo,
        fuel,
        forFun: !pays,
        best: bullseyes > record.best && bullseyes > 0,
      },
    });
  },
  close: () => {
    window.clearTimeout(introTimer);
    const { phase, entry } = get();
    if (phase === 'flight' || phase === 'intro' || phase === 'ready') {
      get().land(false);
      return;
    }
    set({ phase: 'off', veil: false, shout: null, summary: null });
    if (phase === 'results' && entry === 'arrival') useCockpit.getState().close();
  },
}));
