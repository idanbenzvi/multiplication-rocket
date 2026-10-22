import { create } from 'zustand';
import type { Variants } from 'motion/react';
import { sfx } from '../audio/sfx';
import { CHARGE_MS, flyAway } from '../game/flight';

// Going from the game into a game mode (and back) is one continuous flight,
// not a cut: the rocket blasts off (flyOffTo) as the menu dissolves, then a
// space-time ripple spreads from the card that was tapped, the stars stretch
// into hyperspace, the new mode opens behind them at top speed, and the warp
// slows and clears to show it (its panel zooms in out of the blur:
// .sky-panel's modeArrive). The warp itself is drawn by ModeWarp.tsx; this is
// what starts it.

/** the swap happens here, behind the warp at full cover */
export const PEAK_MS = 800;
/** the warp has cleared */
export const END_MS = 1600;
/** with reduced motion: a plain fade through the dark */
export const CALM_PEAK_MS = 250;
export const CALM_END_MS = 650;

interface Point {
  x: number;
  y: number;
}

export interface WarpRun {
  id: number;
  origin: Point;
  action: () => void;
}

interface ModeWarpState {
  run: WarpRun | null;
  /** a warp starts shortly (the rocket blasting off first: flyOffTo) */
  due: boolean;
}

export const useModeWarp = create<ModeWarpState>(() => ({ run: null, due: false }));

/** the middle of what was tapped, where the ripple starts */
export function originOf(el: Element | null | undefined): Point {
  const r = el?.getBoundingClientRect();
  return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: window.innerWidth / 2, y: window.innerHeight / 2 };
}

/** the rocket is well on its way when the warp follows it (flyOffTo): just after its ignition */
const LIFTOFF_MS = CHARGE_MS + 300;

/** warp from what's on screen to what `action` opens (or back), after `delayMs`; one at a time */
export function warpTo(action: () => void, from?: Element | null, delayMs = 0) {
  const { run, due } = useModeWarp.getState();
  if (run || due) return;
  // (where it was tapped, now: it may be gone by the time the warp starts)
  const origin = originOf(from);
  const go = () => {
    sfx.warp();
    useModeWarp.setState({ run: { id: performance.now(), origin, action }, due: false });
  };
  if (delayMs <= 0) {
    go();
    return;
  }
  useModeWarp.setState({ due: true });
  window.setTimeout(go, delayMs);
}

/** leave the game for a game mode: the rocket blasts off (flyAway), and the warp follows it */
export function flyOffTo(action: () => void, from?: Element | null) {
  const { run, due } = useModeWarp.getState();
  if (run || due) return;
  // (the rocket sounds its own build-up and blast: FlyingRocket)
  const flying = flyAway();
  warpTo(action, from, flying ? LIFTOFF_MS : 0);
}

/**
 * A sheet that leaves into a warp dissolves (grows, blurs, fades) instead of
 * sliding away; one handing over to another sheet shrinks back. Pass the way
 * it leaves as AnimatePresence's `custom`, so the exit knows it.
 */
export type SheetLeave = 'warp' | 'handoff' | null;
export const SHEET_VARIANTS: Variants = {
  exit: (how: SheetLeave) =>
    how === 'warp'
      ? { opacity: 0, scale: 1.12, filter: 'blur(12px)', transition: { duration: 0.45, ease: 'easeIn' } }
      : how === 'handoff'
        ? { opacity: 0, scale: 0.92, transition: { duration: 0.22 } }
        : { y: 40, opacity: 0 },
};
/** its dimmed backdrop stays until the warp covers the screen, or crossfades with the next sheet's */
export const BACKDROP_VARIANTS: Variants = {
  exit: (how: SheetLeave) =>
    how === 'warp' ? { opacity: 0, transition: { delay: 0.45, duration: 0.3 } } : { opacity: 0, transition: { duration: 0.3 } },
};
