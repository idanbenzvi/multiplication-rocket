import { initialSkyState, skyReducer, type SkyAction, type SkyState } from './splitSky';
import { eclipseReducer, initialEclipseState, type EclipseAction, type EclipseState } from './eclipse';

// The two-phone games share one connection, lobby and pair of seats. The
// state the host sends is one game's, told apart by `game`; in the lobby
// the host can switch game and both players keep their seats.

export type DuoGame = 'split' | 'eclipse';
export type DuoState = SkyState | EclipseState;
export type DuoAction = SkyAction | EclipseAction | { type: 'game'; game: DuoGame };

export function initialDuoState(game: DuoGame = 'split'): DuoState {
  return game === 'split' ? initialSkyState() : initialEclipseState();
}

export function duoReducer(s: DuoState, action: DuoAction): DuoState {
  if (action.type === 'game') {
    if (s.phase !== 'lobby' && s.phase !== 'summary') return s;
    if (s.game === action.game && s.phase === 'lobby') return s;
    return { ...initialDuoState(action.game), players: s.players };
  }
  if (s.game === 'split') {
    if (action.type === 'orbit' || action.type === 'predict') return s;
    return skyReducer(s, action as SkyAction);
  }
  if (action.type === 'answer') return s;
  return eclipseReducer(s, action as EclipseAction);
}
