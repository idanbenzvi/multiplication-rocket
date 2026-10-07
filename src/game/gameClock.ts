import { create } from 'zustand';

// The game's own clock. It stops while the game is paused (the player left
// the tab/app), so timers, answer speed and every bonus round pick up exactly
// where they were — a meteor that was half-way down is still half-way down.
//
// Game code uses gameNow() instead of performance.now()/Date.now(), and
// gameTimeout() instead of setTimeout, for anything that should freeze.

let pausedTotal = 0;
let pausedAt: number | null = null;

// Why the game is paused. 'away' = the player left the tab/app (shows the
// paused screen); 'academy' = the Deep Space Academy is open over the game.
// The clock runs only when there's no reason left.
export type PauseReason = 'away' | 'academy' | 'about' | 'badges';
const reasons = new Set<PauseReason>();

export const usePause = create<{ paused: boolean; away: boolean }>(() => ({ paused: false, away: false }));

/** milliseconds of *game* time (frozen while paused) */
export function gameNow(): number {
  const t = performance.now();
  return t - pausedTotal - (pausedAt !== null ? t - pausedAt : 0);
}

interface Timer {
  fn: () => void;
  remaining: number;
  startedAt: number;
  handle: number | null;
}
const timers = new Set<Timer>();

function arm(t: Timer) {
  t.startedAt = performance.now();
  t.handle = window.setTimeout(() => {
    timers.delete(t);
    t.fn();
  }, t.remaining);
}

/** like setTimeout, but in game time: it doesn't run down while paused. Returns a cancel function. */
export function gameTimeout(fn: () => void, ms: number): () => void {
  const t: Timer = { fn, remaining: Math.max(0, ms), startedAt: 0, handle: null };
  timers.add(t);
  if (pausedAt === null) arm(t);
  return () => {
    if (t.handle !== null) window.clearTimeout(t.handle);
    timers.delete(t);
  };
}

export function pauseGame(reason: PauseReason = 'away') {
  reasons.add(reason);
  usePause.setState({ away: reasons.has('away') });
  if (pausedAt !== null) return;
  pausedAt = performance.now();
  for (const t of timers) {
    if (t.handle !== null) window.clearTimeout(t.handle);
    t.handle = null;
    t.remaining = Math.max(0, t.remaining - (pausedAt - t.startedAt));
  }
  usePause.setState({ paused: true });
}

export function resumeGame(reason: PauseReason = 'away') {
  reasons.delete(reason);
  usePause.setState({ away: reasons.has('away') });
  if (reasons.size > 0 || pausedAt === null) return;
  pausedTotal += performance.now() - pausedAt;
  pausedAt = null;
  for (const t of timers) arm(t);
  usePause.setState({ paused: false });
}
