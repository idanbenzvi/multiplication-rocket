import { create } from 'zustand';
import { buildSkyRounds, expectedAnswer, type Side, type SkyPlayer, type SkyStage } from './splitSky';
import { buildEclipseRounds } from './eclipse';
import { duoReducer, initialDuoState, type DuoAction, type DuoGame, type DuoState } from './duo';
import { recordOwn } from './ownAnswers';
import { hostLink, joinLink, type Link, type LinkError, type LinkStatus } from '../net/peerLink';
import { activeProfile, pilotName, useProfiles } from '../profiles/useProfiles';
import { loadProgressFor } from '../storage/progressStore';
import { pauseGame, resumeGame } from './gameClock';
import { useGameStore } from './useGameStore';

// A two-phone session on this phone (Split Sky or Eclipse Hunters, see
// duo.ts). The host runs the referee
// and sends the whole state to the other phone after every change, so a
// reconnecting phone just gets the latest state; the guest only sends its
// own answers. Each phone records its own pilot's answers.

type Role = 'host' | 'guest';

type Msg =
  | { t: 'hello'; player: SkyPlayer }
  | { t: 'act'; action: DuoAction }
  | { t: 'state'; state: DuoState; guestSide: Side };

interface SkyStore {
  open: boolean;
  role: Role | null;
  code: string;
  status: LinkStatus | null;
  error: LinkError | null;
  mySide: Side;
  state: DuoState;
  openSky: () => void;
  closeSky: () => void;
  host: () => Promise<void>;
  join: (code: string) => Promise<void>;
  /** guest: try the same code again after the link dropped */
  reconnect: () => Promise<void>;
  /** back to the Host / Join choice */
  leave: () => void;
  /** host only */
  swapSides: () => void;
  /** host only, in the lobby or summary: which game to play */
  chooseGame: (game: DuoGame) => void;
  /** host only: a fresh game (also "play again") */
  startGame: () => void;
  /** host only: on to the next round once the constellation has been admired */
  nextRound: () => void;
  /** Split Sky: this phone's answer */
  answer: (stage: SkyStage, value: number) => void;
  /** Eclipse Hunters: this phone's next tick */
  orbit: (value: number) => void;
  /** Eclipse Hunters: when this phone thinks the moons line up */
  predict: (value: number) => void;
}

let link: Link | null = null;

const other = (s: Side): Side => (s === 'left' ? 'right' : 'left');

function me(fallback: string): SkyPlayer {
  const p = activeProfile();
  return { name: pilotName(p, fallback), avatar: p?.avatar ?? '🙂' };
}

function isMsg(m: unknown): m is Msg {
  return !!m && typeof m === 'object' && typeof (m as { t?: unknown }).t === 'string';
}

function isAnswer(a: DuoAction): a is Extract<DuoAction, { side: Side; value: number }> {
  return a.type === 'answer' || a.type === 'orbit' || a.type === 'predict';
}

function factKey(a: number, b: number) {
  return `${Math.min(a, b)}x${Math.max(a, b)}`;
}

// Set by SplitSky so names fall back to the translated "Pilot".
export const skyNames = { fallback: 'Pilot' };

export const useSkyStore = create<SkyStore>((set, get) => {
  // host: apply an action and send the result to the other phone
  const dispatch = (action: DuoAction) => {
    const state = duoReducer(get().state, action);
    if (state === get().state) return;
    set({ state });
    broadcast();
  };
  const broadcast = () => link?.send({ t: 'state', state: get().state, guestSide: other(get().mySide) } satisfies Msg);

  // this phone's own answer: the host judges it directly, the guest sends it over
  const act = (action: DuoAction) => {
    if (get().role === 'host') dispatch(action);
    else link?.send({ t: 'act', action } satisfies Msg);
  };

  const resetLink = () => {
    link?.close();
    link = null;
  };

  const onStatus = (status: LinkStatus, error?: LinkError) => set({ status, error: error ?? null });

  return {
    open: false,
    role: null,
    code: '',
    status: null,
    error: null,
    mySide: 'left',
    state: initialDuoState(),

    openSky: () => {
      pauseGame('sky');
      set({ open: true, role: null, status: null, error: null, state: initialDuoState() });
    },

    closeSky: () => {
      resetLink();
      set({ open: false, role: null, status: null, error: null, code: '', state: initialDuoState() });
      resumeGame('sky');
      // this pilot's practice map may have changed
      useGameStore.getState().init();
    },

    host: async () => {
      resetLink();
      const mySide: Side = 'left';
      set({ role: 'host', mySide, code: '', state: duoReducer(initialDuoState(), { type: 'player', side: mySide, player: me(skyNames.fallback) }) });
      try {
        const { code, link: l } = await hostLink({
          onStatus: (status, error) => {
            onStatus(status, error);
            // the other phone dropped: in the lobby its seat opens up again
            if (status === 'lost') dispatch({ type: 'player', side: other(get().mySide), player: undefined });
          },
          onConnect: broadcast,
          onMessage: (m) => {
            if (!isMsg(m)) return;
            const guestSide = other(get().mySide);
            if (m.t === 'hello') dispatch({ type: 'player', side: guestSide, player: m.player });
            // the other phone may only answer, and only for its own side
            else if (m.t === 'act' && isAnswer(m.action) && m.action.side === guestSide) dispatch(m.action);
          },
        });
        if (get().role !== 'host') return l.close(); // left while connecting
        link = l;
        set({ code });
      } catch {
        // status already says what went wrong
      }
    },

    join: async (code) => {
      resetLink();
      set({ role: 'guest', code, state: initialDuoState() });
      try {
        const l = await joinLink(code, {
          onStatus,
          onConnect: () => l.send({ t: 'hello', player: me(skyNames.fallback) } satisfies Msg),
          onMessage: (m) => {
            if (isMsg(m) && m.t === 'state') set({ state: m.state, mySide: m.guestSide });
          },
        });
        if (get().role !== 'guest') return l.close();
        link = l;
      } catch {
        // status already says what went wrong
      }
    },

    reconnect: async () => {
      const { code, role } = get();
      if (role === 'guest' && code) await get().join(code);
    },

    leave: () => {
      resetLink();
      set({ role: null, status: null, error: null, code: '', state: initialDuoState() });
    },

    swapSides: () => {
      if (get().role !== 'host' || get().state.phase !== 'lobby') return;
      set({ mySide: other(get().mySide) });
      dispatch({ type: 'swap' });
      broadcast(); // guestSide changed even if nothing else did
    },

    chooseGame: (game) => {
      if (get().role === 'host') dispatch({ type: 'game', game });
    },

    startGame: () => {
      if (get().role !== 'host') return;
      const id = useProfiles.getState().activeId;
      const mastery = id ? loadProgressFor(id).mastery : {};
      if (get().state.game === 'split') dispatch({ type: 'start', rounds: buildSkyRounds(mastery) });
      else dispatch({ type: 'start', rounds: buildEclipseRounds(mastery) });
    },

    nextRound: () => {
      if (get().role === 'host') dispatch({ type: 'next' });
    },

    answer: (stage, value) => {
      const { state, mySide } = get();
      if (state.game !== 'split') return;
      const round = state.rounds[state.roundIndex];
      if (!round || state.phase !== stage || state[stage][mySide].done) return;
      // each phone records its own pilot's answer: the half fact, or the whole one
      const correct = value === expectedAnswer(round, mySide, stage);
      const cols = stage === 'count' ? round.cols[mySide] : round.cols.left + round.cols.right;
      recordOwn(factKey(round.rows, cols), correct, 'sky');
      act({ type: 'answer', side: mySide, stage, value });
    },

    orbit: (value) => {
      const { state, mySide } = get();
      if (state.game !== 'eclipse' || state.phase !== 'orbit') return;
      const round = state.rounds[state.roundIndex];
      const { step } = state.orbit[mySide];
      if (!round || step >= round.steps[mySide]) return;
      // each tick is a times-table fact: period × orbit number
      const period = round.periods[mySide];
      recordOwn(factKey(period, step + 1), value === period * (step + 1), 'eclipse');
      act({ type: 'orbit', side: mySide, value });
    },

    predict: (value) => {
      const { state, mySide } = get();
      if (state.game !== 'eclipse' || state.phase !== 'predict' || state.predict[mySide].done) return;
      const round = state.rounds[state.roundIndex];
      if (!round) return;
      recordOwn(factKey(round.periods.left, round.periods.right), value === round.eclipse, 'eclipse');
      act({ type: 'predict', side: mySide, value });
    },
  };
});
