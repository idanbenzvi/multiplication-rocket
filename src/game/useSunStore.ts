import { create } from 'zustand';
import { factAnswer, hungerDelay, initialSunState, nextLineup, sunFactorMax, sunReducer, type SunAction, type SunCard, type SunPlayerInfo, type SunState } from './sun';
import { buildFactPool, pickNextFact } from './facts';
import { recordOwn } from './ownAnswers';
import { pairKey, parsePair } from './mission';
import { additionTrackKey, pickAdditionFact } from './addition';
import { hostGroup, joinLink, type Group, type Link, type LinkError, type LinkStatus } from '../net/peerLink';
import { activeMission, activeProfile, pilotName, useProfiles } from '../profiles/useProfiles';
import { loadProgressFor } from '../storage/progressStore';
import { pauseGame, resumeGame } from './gameClock';
import { playTrack } from '../audio/useAudio';
import { useGameStore } from './useGameStore';

// A Monster Sun session on this phone (see sun.ts). The host runs the
// referee and sends the whole state to every phone after each change; a
// guest sends only who it is and its own answers, and the host puts each
// answer down to the phone it came from. Each phone records its own
// pilot's answers.

type Role = 'host' | 'guest';

type Msg =
  | { t: 'hello'; player: SunPlayerInfo }
  | { t: 'answer'; fact: string; value: number; cardId?: number }
  | { t: 'state'; state: SunState };

export interface SunQuestion {
  fact: string;
  /** in the order shown */
  x: number;
  y: number;
  card?: SunCard;
}

interface SunStore {
  open: boolean;
  role: Role | null;
  code: string;
  status: LinkStatus | null;
  error: LinkError | null;
  myId: string;
  state: SunState;
  openSun: () => void;
  closeSun: () => void;
  host: () => Promise<void>;
  join: (code: string) => Promise<void>;
  /** guest: the same code again after the link dropped */
  reconnect: () => Promise<void>;
  /** back to the Host / Join choice */
  leave: () => void;
  /** host only: a fresh fight (also "play again") */
  start: () => void;
  /** host only: the next monster */
  next: () => void;
  /** this phone's answer to a question from nextQuestion() */
  answer: (q: SunQuestion, value: number) => void;
}

let link: Link | null = null;
let group: Group | null = null;
/** host: which player each connection belongs to */
const connPlayer = new Map<string, string>();
/** cards this phone has answered, in case the next one is asked before the referee's reply */
const answeredCards = new Set<number>();
/** host: the monster's hunger, counting down from the last answer */
let hunger = 0;
/** a new monster assembles itself before it gets hungry */
const ARRIVAL_MS = 2000;
/** host: the monsters still to come, each once before any comes again */
let deck: number[] = [];

// One id per phone tab: a reload keeps it, so the phone gets its seat back.
function phoneId(): string {
  const KEY = 'multiplication-rocket:sun-id';
  try {
    const saved = sessionStorage.getItem(KEY);
    if (saved) return saved;
    const id = Math.random().toString(36).slice(2, 10);
    sessionStorage.setItem(KEY, id);
    return id;
  } catch {
    return Math.random().toString(36).slice(2, 10);
  }
}

// Set by SunMonster so names fall back to the translated "Pilot".
export const sunNames = { fallback: 'Pilot' };

function me(): SunPlayerInfo {
  const p = activeProfile();
  return { id: useSunStore.getState().myId, name: pilotName(p, sunNames.fallback), avatar: p?.avatar ?? '🙂', mission: activeMission() };
}

function isMsg(m: unknown): m is Msg {
  return !!m && typeof m === 'object' && typeof (m as { t?: unknown }).t === 'string';
}

function isPlayerInfo(p: unknown): p is SunPlayerInfo {
  const x = p as SunPlayerInfo;
  return (
    !!x &&
    typeof x.id === 'string' &&
    typeof x.name === 'string' &&
    typeof x.avatar === 'string' &&
    (x.mission === undefined || x.mission === 'mul' || x.mission === 'add')
  );
}

/**
 * This phone's next question: a waiting help or retry card first, otherwise
 * one of its pilot's own facts, weighted by their mastery (facts they miss
 * come up more): on ×, up to this monster's biggest table; on +, from
 * their own addition stage.
 */
export function nextQuestion(avoid?: string): SunQuestion {
  const { state, myId } = useSunStore.getState();
  const mine = state.players.find((p) => p.id === myId);
  const card = mine?.inbox.find((c) => c.after <= mine.answered && !answeredCards.has(c.id));
  const flip = Math.random() < 0.5;
  const pair = card && parsePair(card.fact);
  if (card && pair) {
    return { fact: card.fact, x: flip ? pair.b : pair.a, y: flip ? pair.a : pair.b, card };
  }
  const id = useProfiles.getState().activeId;
  const progress = id ? loadProgressFor(id) : null;
  const mastery = progress?.mastery ?? {};
  const fact =
    activeMission() === 'add'
      ? pickAdditionFact(progress?.stage ?? 1, mastery, avoid)
      : pickNextFact(buildFactPool(2, sunFactorMax(state.monster)), mastery, avoid);
  // what's sent is the problem itself (a stage-3 sum is tracked by its kind)
  const key = activeMission() === 'add' ? pairKey('add', fact.a, fact.b) : fact.key;
  return { fact: key, x: flip ? fact.b : fact.a, y: flip ? fact.a : fact.b };
}

export const useSunStore = create<SunStore>((set, get) => {
  // host: apply an action and send the result to every phone
  const dispatch = (action: SunAction) => {
    const before = get().state;
    const state = sunReducer(before, action);
    if (state !== before) {
      set({ state });
      group?.broadcast({ t: 'state', state } satisfies Msg);
    }
    // the quiet time starts over with every answer, and with every new monster
    if (action.type === 'answer') hungry();
    else if (action.type === 'start' || action.type === 'next') hungry(ARRIVAL_MS);
  };

  // host: when nobody answers for 5–8 seconds, the monster eats a number (and again, while it stays quiet)
  const hungry = (extra = 0) => {
    window.clearTimeout(hunger);
    if (get().role !== 'host' || get().state.phase !== 'fight') return;
    hunger = window.setTimeout(() => {
      dispatch({ type: 'eat' });
      hungry();
    }, extra + hungerDelay());
  };

  const resetLink = () => {
    window.clearTimeout(hunger);
    link?.close();
    link = null;
    group?.close();
    group = null;
    connPlayer.clear();
    answeredCards.clear();
  };

  const onStatus = (status: LinkStatus, error?: LinkError) => set({ status, error: error ?? null });

  return {
    open: false,
    role: null,
    code: '',
    status: null,
    error: null,
    myId: phoneId(),
    state: initialSunState(),

    openSun: () => {
      pauseGame('sun');
      // Monster Sun has its own soundtrack (openSun runs from a tap, so it may start)
      playTrack('sun');
      set({ open: true, role: null, status: null, error: null, state: initialSunState() });
    },

    closeSun: () => {
      resetLink();
      set({ open: false, role: null, status: null, error: null, code: '', state: initialSunState() });
      resumeGame('sun');
      playTrack('theme');
      // this pilot's practice map may have changed
      useGameStore.getState().init();
    },

    host: async () => {
      resetLink();
      set({ role: 'host', code: '', state: sunReducer(initialSunState(), { type: 'join', player: me() }) });
      try {
        const { code, group: g } = await hostGroup('sun', {
          onStatus,
          onJoin: (conn) => group?.send(conn, { t: 'state', state: get().state } satisfies Msg),
          onLeave: (conn) => {
            const id = connPlayer.get(conn);
            connPlayer.delete(conn);
            // gone, unless the same phone is already back on a newer connection
            if (id && ![...connPlayer.values()].includes(id)) dispatch({ type: 'leave', id });
          },
          onMessage: (conn, m) => {
            if (!isMsg(m)) return;
            if (m.t === 'hello' && isPlayerInfo(m.player) && m.player.id !== get().myId) {
              connPlayer.set(conn, m.player.id);
              dispatch({ type: 'join', player: m.player });
              // a seat may have been refused (game full): it still needs the state
              group?.send(conn, { t: 'state', state: get().state } satisfies Msg);
            } else if (m.t === 'answer') {
              const id = connPlayer.get(conn);
              if (id && typeof m.fact === 'string' && typeof m.value === 'number') {
                dispatch({ type: 'answer', id, fact: m.fact, value: m.value, cardId: typeof m.cardId === 'number' ? m.cardId : undefined });
              }
            }
          },
        });
        if (get().role !== 'host') return g.close(); // left while connecting
        group = g;
        set({ code });
      } catch {
        // status already says what went wrong
      }
    },

    join: async (code) => {
      resetLink();
      set({ role: 'guest', code, state: initialSunState() });
      try {
        const l = await joinLink(
          code,
          {
            onStatus,
            onConnect: () => l.send({ t: 'hello', player: me() } satisfies Msg),
            onMessage: (m) => {
              if (isMsg(m) && m.t === 'state') set({ state: m.state });
            },
          },
          'sun',
        );
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
      set({ role: null, status: null, error: null, code: '', state: initialSunState() });
    },

    start: () => {
      if (get().role !== 'host') return;
      // the fight's three monsters, from the deck
      const next = nextLineup(deck);
      const before = get().state;
      dispatch({ type: 'start', lineup: next.lineup });
      if (get().state !== before) deck = next.deck;
    },

    next: () => {
      if (get().role === 'host') dispatch({ type: 'next' });
    },

    answer: (q, value) => {
      const { state, role, myId } = get();
      if (state.phase !== 'fight') return;
      const pair = parsePair(q.fact);
      if (pair) {
        const tracked = pair.mission === 'add' ? additionTrackKey(pair.a, pair.b) : q.fact;
        recordOwn(tracked, value === factAnswer(q.fact), 'sun');
      }
      if (q.card) answeredCards.add(q.card.id);
      if (role === 'host') dispatch({ type: 'answer', id: myId, fact: q.fact, value, cardId: q.card?.id });
      else link?.send({ t: 'answer', fact: q.fact, value, cardId: q.card?.id } satisfies Msg);
    },
  };
});
