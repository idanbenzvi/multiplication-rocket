import { createContext } from 'react';
import { create } from 'zustand';
import { unlockTrack, type Track } from '../../audio/useAudio';
import type { ShipId } from '../scene/ships';
import type { BayLayout } from './layout';

// The launch bay (LaunchBay.tsx) is open while some screen is showing in it:
// choosing a pilot, a pilot's card, choosing a ship (BayScreen). Each holds
// it open, saying what the sign over the pad reads and which ship stands on
// the pad; the last one opened is the one showing.

/** a ship standing on the pad */
export interface PadShipSpec {
  ship: ShipId;
  /** the classic rocket's colour */
  accent: string;
  admiral: boolean;
  /** the pilot, at the window */
  avatar?: string;
}

interface Holder {
  id: number;
  sign: string;
  ship: PadShipSpec | null;
}

export interface Launch {
  /** the ship's gone */
  onDone: () => void;
}

interface BayState {
  holders: Holder[];
  /** the ship on the pad taking off */
  launch: Launch | null;
  layout: BayLayout | null;
  /** where the screens showing in the bay draw */
  slot: HTMLElement | null;
}

export const useBay = create<BayState>(() => ({ holders: [], launch: null, layout: null, slot: null }));

/** how hard the pad's jets fire (PadSmoke), idling and all out as a ship takes off (PadShip): 0 … 2 */
export const PAD_IDLE = 0.5;
export const padEngine = { thrust: PAD_IDLE };

/** inside a screen in the bay (BayScreen): puts a ship on the pad (undefined: back to the screen's own) */
export const BayShip = createContext<((ship: PadShipSpec | null | undefined) => void) | null>(null);

/** what was playing before the bay opened, to go back to (LaunchBay) */
export const bayMusic: { before: Track } = { before: 'theme' };

/**
 * From the tap that launches a ship: the bay closes once it's gone, without a
 * tap, and a browser that only plays sound after one would keep the music
 * that was playing before from coming back.
 */
export function primeBayExit() {
  unlockTrack(bayMusic.before);
}

/** the screen showing: the last one opened */
export const topHolder = (s: BayState): Holder | null => s.holders[s.holders.length - 1] ?? null;

const sameShip = (a: PadShipSpec | null, b: PadShipSpec | null) =>
  a === b || (!!a && !!b && a.ship === b.ship && a.accent === b.accent && a.admiral === b.admiral && a.avatar === b.avatar);

let nextId = 1;

export function holdBay(sign: string, ship: PadShipSpec | null): number {
  const id = nextId++;
  useBay.setState((s) => ({ holders: [...s.holders, { id, sign, ship }] }));
  return id;
}

export function updateHold(id: number, sign: string, ship: PadShipSpec | null) {
  const held = useBay.getState().holders.find((h) => h.id === id);
  if (!held || (held.sign === sign && sameShip(held.ship, ship))) return;
  useBay.setState((s) => ({ holders: s.holders.map((h) => (h.id === id ? { id, sign, ship } : h)) }));
}

export function releaseBay(id: number) {
  useBay.setState((s) => ({ holders: s.holders.filter((h) => h.id !== id) }));
}

/** the ship on the pad takes off */
export function launchShip(launch: Launch) {
  useBay.setState({ launch });
}

export function launchDone() {
  const { launch } = useBay.getState();
  useBay.setState({ launch: null });
  launch?.onDone();
}
