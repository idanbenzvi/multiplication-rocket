import { create } from 'zustand';
import { currentTrack, playTrack, type Track } from '../../audio/useAudio';
import { frame } from './geometry';
import { BANK_QUAD, QUADS, STOPS, type ScreenId, type Stop } from './screens';
import { baseFov, HOME, lookTo, view } from './view';

// Whether the cockpit is open, for everything that opens it (⚙️ in the top
// bar), and where in it the pilot is looking: ahead, or zoomed into one of
// its screens (whose page then opens over it, Panel.tsx). CockpitHost shows
// it. The cockpit has its own music (Starboard View); leaving it goes back
// to whatever was playing.

interface CockpitState {
  phase: 'closed' | 'open' | 'leaving';
  /** opened under the white of arriving at a destination (a Canyon Run's: canyon/arrival.ts), not flown into */
  arriving: boolean;
  /** the button it opened from (it opens out of it when it can't fly in through the window), to go back to after */
  from: HTMLElement | null;
  before: Track;
  /** the stop the view was last turned to (by the arrows, a tap or a click) */
  stop: Stop;
  /** a screen zoomed into, its page open */
  focused: ScreenId | null;
  /** from a tap (so the browser lets its music start); arriving, it keeps the run's music, and goes back to `before` */
  open: (from?: HTMLElement | null, arriving?: { before: Track }) => void;
  /** flying back out */
  close: () => void;
  /** out: gone */
  gone: () => void;
  /** gone at once, without flying out (a game mode starting from inside it) */
  dismiss: () => void;
  /** turn to a stop: ahead, or into a screen */
  turnTo: (stop: Stop) => void;
  /** the next stop round to the right (1) or left (-1) */
  step: (dir: 1 | -1) => void;
  /** back out of a screen, to look round from where it is */
  unfocus: () => void;
  /** turn to the bank of screens on the left wall, all four in view */
  toBank: () => void;
}

const ASPECT = () => window.innerWidth / Math.max(1, window.innerHeight);

/** how much of the view a screen fills, zoomed in: most of it on a computer; across the whole of a phone held upright */
export function screenFill(aspect = ASPECT()): number {
  return aspect >= 1.15 ? 0.8 : 0.96;
}

/** the look (and field of view) for a stop */
export function stopLook(stop: Stop, aspect = ASPECT()) {
  if (stop === 'ahead') return { look: HOME, fov: baseFov(aspect) };
  return frame(QUADS[stop], aspect, screenFill(aspect));
}

export const useCockpit = create<CockpitState>((set, get) => ({
  phase: 'closed',
  arriving: false,
  from: null,
  before: 'theme',
  stop: 'ahead',
  focused: null,
  open: (from = null, arriving) => {
    if (get().phase !== 'closed') return;
    const before = arriving?.before ?? currentTrack();
    if (!arriving) playTrack('cockpit');
    set({ phase: 'open', arriving: !!arriving, from, before, stop: 'ahead', focused: null });
  },
  close: () => {
    const { phase, before } = get();
    if (phase !== 'open') return;
    // (unless something else has changed the music meanwhile: a crew flight ending…)
    if (currentTrack() === 'cockpit') playTrack(before);
    set({ phase: 'leaving', focused: null });
  },
  gone: () => {
    const { from } = get();
    set({ phase: 'closed', arriving: false, from: null, focused: null });
    from?.focus({ preventScroll: true });
  },
  dismiss: () => {
    const { phase, before } = get();
    if (phase === 'closed') return;
    if (currentTrack() === 'cockpit') playTrack(before);
    set({ phase: 'closed', arriving: false, from: null, focused: null });
  },
  turnTo: (stop) => {
    const { look, fov } = stopLook(stop);
    // (a screen a long way round takes a moment longer to come round to)
    lookTo(look, fov, stop === 'ahead' ? 10 : 9);
    set({ stop, focused: stop === 'ahead' ? null : stop });
  },
  step: (dir) => {
    const { stop } = get();
    const i = STOPS.indexOf(stop);
    get().turnTo(STOPS[(i + dir + STOPS.length) % STOPS.length]);
  },
  toBank: () => {
    const { look, fov } = frame(BANK_QUAD, ASPECT(), 0.88);
    lookTo(look, Math.max(fov, view.base * 0.7), 9);
    set({ stop: 'pilot', focused: null });
  },
  unfocus: () => {
    if (!get().focused) return;
    // back out to look round, still facing that way
    lookTo({ yaw: view.goal.yaw, pitch: view.goal.pitch }, view.base, 10);
    set({ focused: null });
  },
}));
