import { create } from 'zustand';
import type { Variants } from 'motion/react';
import { sfx } from '../audio/sfx';

// Going from the game into a game mode (and back) is one continuous flight,
// not a cut: the menu dissolves while a space-time ripple spreads from the
// card that was tapped, the stars stretch into hyperspace, the new mode
// opens behind them at top speed, and the warp slows and clears to show it
// (its panel zooms in out of the blur: .sky-panel's modeArrive). The warp
// itself is drawn by ModeWarp.tsx; this is what starts it.

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
}

export const useModeWarp = create<ModeWarpState>(() => ({ run: null }));

/** the middle of what was tapped, where the ripple starts */
export function originOf(el: Element | null | undefined): Point {
  const r = el?.getBoundingClientRect();
  return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: window.innerWidth / 2, y: window.innerHeight / 2 };
}

/** warp from what's on screen to what `action` opens (or back); one at a time */
export function warpTo(action: () => void, from?: Element | null) {
  if (useModeWarp.getState().run) return;
  sfx.warp();
  useModeWarp.setState({ run: { id: performance.now(), origin: originOf(from), action } });
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
