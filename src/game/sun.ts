// Monster Sun: 2–6 phones against a glowing ASCII monster. Every phone
// drills its own questions; a right answer is a blow (the monster sheds
// characters), a wrong one heals it a little. A fact someone misses goes to
// a random teammate as a help card; when they solve it, the one who missed
// sees their answer and gets the fact again two questions later. When nobody
// answers for a while, the monster eats one of the numbers floating in space
// and gets a little of its strength back. The host phone runs sunReducer as
// the referee. See docs/plans/2026-10-10-monster-sun.md.
// Every phone drills its own pilot's mission: × and + pilots can fight
// side by side, and a missed fact only goes to a teammate who can solve it.

import { answerOfKey, missionOfKey, type Mission } from './mission';

export const MAX_PLAYERS = 6;
/** monsters in a fight */
export const SUN_MONSTERS = 3;
/** monsters in the roster (components/sun/roster.ts), a fight's three drawn from them */
export const SUN_KINDS = 25;
/** right answers each player is worth against the first monster ("5 × X") */
export const HITS_PER_PLAYER = 5;
/** help cards waiting on one phone at most */
const MAX_HELP_CARDS = 3;
/** a retry comes back after this many more of the player's own answers */
const RETRY_AFTER = 2;
/** events kept: plenty for a phone that missed a few states */
const MAX_EVENTS = 24;
const MAX_RESCUES = 12;
/** the monster gets hungry after this long without anyone answering (a random time in between) */
export const HUNGER_MIN_MS = 5000;
export const HUNGER_MAX_MS = 8000;

/** how long the monster waits, from the last answer, before it eats a number */
export function hungerDelay(rand: () => number = Math.random): number {
  return HUNGER_MIN_MS + rand() * (HUNGER_MAX_MS - HUNGER_MIN_MS);
}

export interface SunPlayerInfo {
  /** stable per phone tab, so a reloaded phone gets its seat back */
  id: string;
  name: string;
  avatar: string;
  /** the pilot's mission (a phone from before missions existed sends none: ×) */
  mission?: Mission;
}

export interface SunCard {
  id: number;
  /** the problem, e.g. "7x8" or "37+45" */
  fact: string;
  /** who missed it */
  from: string;
  /** help: a teammate's miss; retry: my own miss, after a teammate solved it */
  kind: 'help' | 'retry';
  /** served once the player has answered this many questions */
  after: number;
}

export interface SunTip {
  id: number;
  /** the teammate who solved it */
  from: string;
  fact: string;
}

export interface SunPlayer extends SunPlayerInfo {
  online: boolean;
  hits: number;
  misses: number;
  /** teammates' facts solved */
  helped: number;
  answered: number;
  inbox: SunCard[];
  /** the latest "solved for you" */
  tip: SunTip | null;
}

/**
 * What just happened, for every phone to animate: whose beam hit the
 * monster, who fed it, whose miss went to whom, who helped whom. Phones
 * play each event once (by id), so none is lost when several arrive at once.
 */
export type SunEvent =
  | { id: number; kind: 'hit' | 'miss'; by: string }
  | { id: number; kind: 'sent' | 'helped'; by: string; to: string; fact: string }
  /** nobody answered for a while: the monster ate a number (and healed by one) */
  | { id: number; kind: 'eat' };

/** a fact one pilot solved for another: "learned together" */
export interface SunRescue {
  fact: string;
  by: string;
  to: string;
}

export interface SunState {
  phase: 'lobby' | 'fight' | 'defeated' | 'summary';
  players: SunPlayer[];
  /** which monster of the fight (0-based) */
  monster: number;
  /** which monsters of the roster this fight's are, in order */
  lineup: number[];
  hp: number;
  maxHp: number;
  /** the team's right answers this game */
  blows: number;
  /** right answers in a row, by anyone on the team */
  combo: number;
  bestCombo: number;
  defeated: number;
  /** the latest events, oldest first */
  events: SunEvent[];
  rescues: SunRescue[];
  nextId: number;
}

export type SunAction =
  | { type: 'join'; player: SunPlayerInfo }
  | { type: 'leave'; id: string }
  /** the host has drawn the fight's monsters from the roster */
  | { type: 'start'; lineup?: number[] }
  | { type: 'answer'; id: string; fact: string; value: number; cardId?: number }
  /** the host's hunger timer: nobody has answered for a while */
  | { type: 'eat' }
  | { type: 'next' };

/** the biggest factor in questions against this monster */
export function sunFactorMax(monster: number): number {
  return Math.min(10, 6 + monster * 2);
}

export function maxHpFor(monster: number, players: number): number {
  return (HITS_PER_PLAYER + monster) * players;
}

/** the answer to a problem a phone sent, or null for anything malformed */
export function factAnswer(fact: string): number | null {
  return answerOfKey(fact);
}

/** a + fact can go to anyone, a × fact only to someone on the × mission */
export function canHelpWith(p: SunPlayerInfo, fact: string): boolean {
  return missionOfKey(fact) === 'add' || (p.mission ?? 'mul') === 'mul';
}

/** the card this player answers next, before their own questions */
export function dueCard(p: SunPlayer): SunCard | undefined {
  return p.inbox.find((c) => c.after <= p.answered);
}

export function initialSunState(): SunState {
  return { phase: 'lobby', players: [], monster: 0, lineup: [0, 1, 2], hp: 0, maxHp: 0, blows: 0, combo: 0, bestCombo: 0, defeated: 0, events: [], rescues: [], nextId: 1 };
}

/** which monster of the roster the fight's current one is (the classic three for a state from before there were more) */
export function monsterKind(s: SunState): number {
  const kind = s.lineup?.[s.monster];
  return typeof kind === 'number' && kind >= 0 && kind < SUN_KINDS ? kind : s.monster % SUN_KINDS;
}

function shuffle<T>(items: T[], rand: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(rand() * (i + 1)));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * The next fight's monsters, drawn from what's left of the deck: every
 * monster once, shuffled, before any comes again (a fresh deck leaves out
 * the ones already drawn for this fight, so none comes twice in one fight).
 */
export function nextLineup(deck: number[], rand: () => number = Math.random): { lineup: number[]; deck: number[] } {
  let pile = deck.filter((k) => Number.isInteger(k) && k >= 0 && k < SUN_KINDS);
  const lineup: number[] = [];
  while (lineup.length < SUN_MONSTERS) {
    if (pile.length === 0) {
      pile = shuffle(
        Array.from({ length: SUN_KINDS }, (_, k) => k).filter((k) => !lineup.includes(k)),
        rand,
      );
    }
    const next = pile.shift() as number;
    if (!lineup.includes(next)) lineup.push(next);
  }
  return { lineup, deck: pile };
}

/** a lineup a phone sent: three different monsters of the roster, or null */
function validLineup(lineup: unknown): number[] | null {
  if (!Array.isArray(lineup) || lineup.length !== SUN_MONSTERS) return null;
  if (!lineup.every((k) => Number.isInteger(k) && k >= 0 && k < SUN_KINDS)) return null;
  return new Set(lineup).size === lineup.length ? (lineup as number[]) : null;
}

const fresh = (info: SunPlayerInfo): SunPlayer => ({
  ...info,
  online: true,
  hits: 0,
  misses: 0,
  helped: 0,
  answered: 0,
  inbox: [],
  tip: null,
});

const online = (s: SunState) => s.players.filter((p) => p.online).length;

function update(s: SunState, id: string, fn: (p: SunPlayer) => SunPlayer): SunPlayer[] {
  return s.players.map((p) => (p.id === id ? fn(p) : p));
}

export function sunReducer(s: SunState, action: SunAction, rand: () => number = Math.random): SunState {
  switch (action.type) {
    case 'join': {
      const { id, name, avatar, mission } = action.player;
      if (s.players.some((p) => p.id === id)) {
        return { ...s, players: update(s, id, (p) => ({ ...p, name, avatar, mission, online: true })) };
      }
      if (s.players.length >= MAX_PLAYERS) return s;
      const players = [...s.players, fresh({ id, name, avatar, mission })];
      if (s.phase === 'lobby' || s.phase === 'summary') return { ...s, players };
      // joining mid-fight: the monster grows by the newcomer's share
      const share = HITS_PER_PLAYER + s.monster;
      return { ...s, players, hp: s.phase === 'fight' ? s.hp + share : s.hp, maxHp: s.maxHp + share };
    }

    case 'leave':
      if (s.phase === 'lobby') return { ...s, players: s.players.filter((p) => p.id !== action.id) };
      return { ...s, players: update(s, action.id, (p) => ({ ...p, online: false })) };

    case 'start': {
      if (s.phase !== 'lobby' && s.phase !== 'summary') return s;
      const players = s.players.filter((p) => p.online).map(fresh);
      if (players.length < 2) return s;
      const hp = maxHpFor(0, players.length);
      const lineup = validLineup(action.lineup) ?? nextLineup([], rand).lineup;
      return { ...initialSunState(), nextId: s.nextId, players, lineup, phase: 'fight', hp, maxHp: hp };
    }

    case 'answer': {
      if (s.phase !== 'fight') return s;
      const me = s.players.find((p) => p.id === action.id);
      const product = factAnswer(action.fact);
      if (!me || product === null) return s;
      const card = action.cardId === undefined ? undefined : me.inbox.find((c) => c.id === action.cardId);
      if (action.cardId !== undefined && (!card || card.fact !== action.fact)) return s;
      const correct = action.value === product;
      let { nextId } = s;

      let players = update(s, me.id, (p) => ({
        ...p,
        answered: p.answered + 1,
        hits: p.hits + (correct ? 1 : 0),
        misses: p.misses + (correct ? 0 : 1),
        helped: p.helped + (correct && card?.kind === 'help' ? 1 : 0),
        inbox: card ? p.inbox.filter((c) => c !== card) : p.inbox,
      }));

      const events: SunEvent[] = [{ id: nextId++, kind: correct ? 'hit' : 'miss', by: me.id }];
      let { rescues } = s;
      if (correct && card?.kind === 'help') {
        // the one who missed sees who solved it, and gets the fact back soon
        const tip: SunTip = { id: nextId++, from: me.id, fact: card.fact };
        const retryId = nextId++;
        players = players.map((p) =>
          p.id === card.from
            ? { ...p, tip, inbox: [...p.inbox, { id: retryId, fact: card.fact, from: me.id, kind: 'retry', after: p.answered + RETRY_AFTER }] }
            : p,
        );
        events.push({ id: nextId++, kind: 'helped', by: me.id, to: card.from, fact: card.fact });
        rescues = [...rescues, { fact: card.fact, by: me.id, to: card.from }].slice(-MAX_RESCUES);
      } else if (!correct && !card) {
        // my own miss goes to a teammate (not passed on again if they miss it too)
        const mates = players.filter(
          (p) => p.online && p.id !== me.id && canHelpWith(p, action.fact) && p.inbox.filter((c) => c.kind === 'help').length < MAX_HELP_CARDS,
        );
        if (mates.length > 0) {
          const to = mates[Math.min(mates.length - 1, Math.floor(rand() * mates.length))];
          const help: SunCard = { id: nextId++, fact: action.fact, from: me.id, kind: 'help', after: 0 };
          players = players.map((p) => (p.id === to.id ? { ...p, inbox: [...p.inbox, help] } : p));
          events.push({ id: nextId++, kind: 'sent', by: me.id, to: to.id, fact: action.fact });
        }
      }

      const hp = correct ? s.hp - 1 : Math.min(s.maxHp, s.hp + 1);
      const beaten = hp <= 0;
      const combo = correct ? s.combo + 1 : 0;
      return {
        ...s,
        players,
        nextId,
        hp: Math.max(0, hp),
        blows: s.blows + (correct ? 1 : 0),
        combo,
        bestCombo: Math.max(s.bestCombo, combo),
        events: [...s.events, ...events].slice(-MAX_EVENTS),
        rescues,
        phase: beaten ? 'defeated' : 'fight',
        defeated: s.defeated + (beaten ? 1 : 0),
      };
    }

    case 'eat': {
      // a number for a snack, and a little strength back (it can't eat when it's at full strength)
      if (s.phase !== 'fight' || s.hp >= s.maxHp) return s;
      const event: SunEvent = { id: s.nextId, kind: 'eat' };
      return { ...s, hp: s.hp + 1, nextId: s.nextId + 1, events: [...s.events, event].slice(-MAX_EVENTS) };
    }

    case 'next': {
      if (s.phase !== 'defeated') return s;
      const monster = s.monster + 1;
      if (monster >= SUN_MONSTERS) return { ...s, phase: 'summary' };
      const hp = maxHpFor(monster, Math.max(1, online(s)));
      return { ...s, phase: 'fight', monster, hp, maxHp: hp };
    }
  }
}

// ---------- the summary ----------

export type SunAward = 'helper' | 'smasher' | 'sharp' | 'brave';

/**
 * One award for every pilot, so everyone leaves with something: the best
 * helper, the most hits, the sharpest aim (fewest misses for their answers),
 * and "brave pilot" for the rest. Helping comes first: it's the point.
 */
export function sunAwards(players: SunPlayer[]): Record<string, SunAward> {
  const out: Record<string, SunAward> = {};
  const free = () => players.filter((p) => !(p.id in out) && p.answered > 0);
  const best = (score: (p: SunPlayer) => number, min = 1) => {
    const ranked = free().filter((p) => score(p) >= min);
    return ranked.reduce<SunPlayer | null>((a, p) => (!a || score(p) > score(a) ? p : a), null);
  };
  const helper = best((p) => p.helped);
  if (helper) out[helper.id] = 'helper';
  const smasher = best((p) => p.hits);
  if (smasher) out[smasher.id] = 'smasher';
  const sharp = best((p) => (p.answered >= 3 ? p.hits / p.answered : 0), 0.6);
  if (sharp) out[sharp.id] = 'sharp';
  for (const p of players) out[p.id] ??= 'brave';
  return out;
}
