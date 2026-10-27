import { create } from 'zustand';
import { useGameStore } from '../../../game/useGameStore';
import { getLevelConfig } from '../../../game/levels';
import { activeMission, useProfiles } from '../../../profiles/useProfiles';
import { playTrack } from '../../../audio/useAudio';
import { loadCanyonRecord, saveCanyonRecord } from '../../../storage/canyonRecord';
import { Builder } from './builder';
import type { Quality } from './chunk';
import { flash, resetFx } from './fx';
import { buildGates, runLength, type Gate, type GateResult } from './gates';
import { Run } from './run';

// The Canyon Run, from the cockpit: the orange buttons by the stick start
// it (MANUAL); a countdown in the cockpit while the canyon's first stretch
// is built, then a white-out and the dive in (canyon/World.tsx flies it);
// out of the climb at its end, back in the cockpit, what was flown. Its
// answers count towards the pilot's facts as any round's do, and its fuel is
// paid once a level (a run after that is for the fun of it), short of a
// launch: that's the game's, outside, on the next right answer.

export type CanyonPhase = 'off' | 'intro' | 'flight' | 'results';

/** the countdown before diving in (s), the white-out at its end */
export const INTRO_S = 3.2;
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
  /** one for each run (its scene's key) */
  runId: number;
  /** the last gate flown, for the windscreen to call out (and the bullseyes in a row, with it) */
  shout: { id: number; result: GateResult; combo: number } | null;
  summary: Summary | null;
  /** from the tap on MANUAL */
  start: (quality: Quality, calm: boolean) => void;
  /** the countdown's done: into the canyon */
  fly: () => void;
  /** a gate flown */
  gate: (result: GateResult) => void;
  /** out of the canyon (`finished`: its end, else ended early), what was flown counted */
  land: (finished: boolean) => void;
  /** back to the cockpit */
  close: () => void;
}

/** the run in progress, outside React: its flight, and its canyon's builder */
export const live = {
  run: null as Run | null,
  builder: null as Builder | null,
  quality: 'high' as Quality,
  calm: false,
};

let introTimer = 0;

export const useCanyon = create<CanyonState>((set, get) => ({
  phase: 'off',
  runId: 0,
  shout: null,
  summary: null,
  start: (quality, calm) => {
    if (get().phase !== 'off' && get().phase !== 'results') return;
    const progress = useGameStore.getState().progress;
    const gates = buildGates(progress, activeMission());
    const seed = Math.floor(Math.random() * 2 ** 31);
    live.builder?.dispose();
    live.builder = new Builder({ seed, gates: gates.map((g) => g.d), end: runLength(gates.length) }, quality);
    // (the first stretch built while the countdown runs)
    live.builder.want(0, 10);
    live.run = new Run(live.builder.canyon, gates, calm);
    live.quality = quality;
    live.calm = calm;
    playTrack('crew');
    // the white-out at the countdown's end
    flash([1, 0.97, 0.92], calm ? 0.7 : 1.15, 0.75, 1.0, INTRO_S - 0.75);
    window.clearTimeout(introTimer);
    introTimer = window.setTimeout(() => get().fly(), INTRO_S * 1000);
    set({ phase: 'intro', runId: get().runId + 1, shout: null, summary: null });
  },
  fly: () => {
    if (get().phase === 'intro') set({ phase: 'flight' });
  },
  gate: (result) => set((s) => ({ shout: { id: (s.shout?.id ?? 0) + 1, result, combo: live.run?.combo ?? 0 } })),
  land: (finished) => {
    window.clearTimeout(introTimer);
    const run = live.run;
    const { phase } = get();
    if (!run || (phase !== 'flight' && phase !== 'intro')) return;
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
    });
    live.builder?.dispose();
    live.builder = null;
    live.run = null;
    resetFx();
    playTrack('cockpit');
    if (!finished) {
      set({ phase: 'off', shout: null, summary: null });
      return;
    }
    set({
      phase: 'results',
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
    if (get().phase === 'flight' || get().phase === 'intro') get().land(false);
    set({ phase: 'off', shout: null, summary: null });
  },
}));
