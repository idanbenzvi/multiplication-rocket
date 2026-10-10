// Monster Sun: 2–6 phones against a glowing ASCII monster. Every phone
// drills its own questions; a right answer is a blow (the monster sheds
// characters), a wrong one heals it a little. A fact someone misses goes to
// a random teammate as a help card; when they solve it, the one who missed
// sees their answer and gets the fact again two questions later. The host
// phone runs sunReducer as the referee. See docs/plans/2026-10-10-monster-sun.md.

export const MAX_PLAYERS = 6;
export const SUN_MONSTERS = 3;
/** right answers each player is worth against the first monster ("5 × X") */
export const HITS_PER_PLAYER = 5;
/** help cards waiting on one phone at most */
const MAX_HELP_CARDS = 3;
/** a retry comes back after this many more of the player's own answers */
const RETRY_AFTER = 2;

export interface SunPlayerInfo {
  /** stable per phone tab, so a reloaded phone gets its seat back */
  id: string;
  name: string;
  avatar: string;
}

export interface SunCard {
  id: number;
  /** canonical fact key, e.g. "7x8" */
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

export interface SunState {
  phase: 'lobby' | 'fight' | 'defeated' | 'summary';
  players: SunPlayer[];
  /** which monster (0-based) */
  monster: number;
  hp: number;
  maxHp: number;
  /** running counts, so every phone can animate each blow and heal */
  blows: number;
  heals: number;
  defeated: number;
  nextId: number;
}

export type SunAction =
  | { type: 'join'; player: SunPlayerInfo }
  | { type: 'leave'; id: string }
  | { type: 'start' }
  | { type: 'answer'; id: string; fact: string; value: number; cardId?: number }
  | { type: 'next' };

/** the biggest factor in questions against this monster */
export function sunFactorMax(monster: number): number {
  return Math.min(10, 6 + monster * 2);
}

export function maxHpFor(monster: number, players: number): number {
  return (HITS_PER_PLAYER + monster) * players;
}

export function factProduct(fact: string): number | null {
  const m = /^(\d{1,2})x(\d{1,2})$/.exec(fact);
  return m ? Number(m[1]) * Number(m[2]) : null;
}

/** the card this player answers next, before their own questions */
export function dueCard(p: SunPlayer): SunCard | undefined {
  return p.inbox.find((c) => c.after <= p.answered);
}

export function initialSunState(): SunState {
  return { phase: 'lobby', players: [], monster: 0, hp: 0, maxHp: 0, blows: 0, heals: 0, defeated: 0, nextId: 1 };
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
      const { id, name, avatar } = action.player;
      if (s.players.some((p) => p.id === id)) {
        return { ...s, players: update(s, id, (p) => ({ ...p, name, avatar, online: true })) };
      }
      if (s.players.length >= MAX_PLAYERS) return s;
      const players = [...s.players, fresh({ id, name, avatar })];
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
      return { ...initialSunState(), nextId: s.nextId, players, phase: 'fight', hp, maxHp: hp };
    }

    case 'answer': {
      if (s.phase !== 'fight') return s;
      const me = s.players.find((p) => p.id === action.id);
      const product = factProduct(action.fact);
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

      if (correct && card?.kind === 'help') {
        // the one who missed sees who solved it, and gets the fact back soon
        const tip: SunTip = { id: nextId++, from: me.id, fact: card.fact };
        const retryId = nextId++;
        players = players.map((p) =>
          p.id === card.from
            ? { ...p, tip, inbox: [...p.inbox, { id: retryId, fact: card.fact, from: me.id, kind: 'retry', after: p.answered + RETRY_AFTER }] }
            : p,
        );
      } else if (!correct && !card) {
        // my own miss goes to a teammate (not passed on again if they miss it too)
        const mates = players.filter((p) => p.online && p.id !== me.id && p.inbox.filter((c) => c.kind === 'help').length < MAX_HELP_CARDS);
        if (mates.length > 0) {
          const to = mates[Math.min(mates.length - 1, Math.floor(rand() * mates.length))];
          const help: SunCard = { id: nextId++, fact: action.fact, from: me.id, kind: 'help', after: 0 };
          players = players.map((p) => (p.id === to.id ? { ...p, inbox: [...p.inbox, help] } : p));
        }
      }

      const hp = correct ? s.hp - 1 : Math.min(s.maxHp, s.hp + 1);
      const beaten = hp <= 0;
      return {
        ...s,
        players,
        nextId,
        hp: Math.max(0, hp),
        blows: s.blows + (correct ? 1 : 0),
        heals: s.heals + (correct || hp === s.hp ? 0 : 1),
        phase: beaten ? 'defeated' : 'fight',
        defeated: s.defeated + (beaten ? 1 : 0),
      };
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
