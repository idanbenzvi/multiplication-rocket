import { create } from 'zustand';

// How much the game draws (docs/plans/2026-10-29-adaptive-quality.md). A
// device that can't keep up (under 30 frames a second for 3 seconds running)
// is drawn lighter, a step at a time, until it can: first everything a little
// less sharp, then less sharp still, and without the glow, the speed blur, the
// aurora and the frosted glass behind the panels. Once it's been smooth (50
// frames a second and more) for a while, it tries the step above again, and
// waits longer each time that step proves too much. The level's kept for this
// device. In the cockpit's Systems a grown-up can fix it instead: Auto (this),
// High (everything, always) or Low (the lightest, always).

export type QualityMode = 'auto' | 'high' | 'low';
/** 0 everything; 1 lighter; 2 lightest */
export type Tier = 0 | 1 | 2;

const STORAGE_KEY = 'multiplication-rocket:quality';
/** the lightest step */
const MAX_TIER: Tier = 2;
/** the sharpest each step draws (times the screen's pixels): a canvas's own limit applies too */
const SHARPEST = [Infinity, 1, 0.75];

/** under this many frames a second, it's struggling (under 30, with room for a screen held to 30 a second, as a phone saving its battery does); at this many or more, it's smooth */
export const LOW_FPS = 28;
export const SMOOTH_FPS = 50;
/** struggling this long (s) steps down */
export const DOWN_AFTER_S = 3;
/** smooth this long (s) tries the step above, doubled each time it fell back from there soon after */
export const UP_AFTER_S = 15;
/** stepping down this soon (s) after stepping up is falling back */
const FELL_BACK_S = 60;
/** at most this many doublings (15 s → 4 min) */
const MAX_BOUNCES = 4;
/** after a change (or at the start), how long (s) before judging: what's changed settles first */
export const SETTLE_S = 4;

interface Saved {
  mode: QualityMode;
  tier: Tier;
}

function load(): Saved {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { mode: 'auto', tier: 0 };
    const parsed = JSON.parse(raw) as Partial<Saved>;
    const mode = parsed.mode === 'high' || parsed.mode === 'low' ? parsed.mode : 'auto';
    const tier = parsed.tier === 1 || parsed.tier === 2 ? parsed.tier : 0;
    return { mode, tier };
  } catch {
    return { mode: 'auto', tier: 0 };
  }
}

function save({ mode, tier }: Saved) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ mode, tier }));
  } catch {
    // (this time only)
  }
}

const effectiveOf = ({ mode, tier }: Saved): Tier => (mode === 'high' ? 0 : mode === 'low' ? MAX_TIER : tier);

interface QualityState extends Saved {
  /** what's drawn now: Auto's step, or the one chosen */
  effective: Tier;
  setMode: (mode: QualityMode) => void;
}

export const useQuality = create<QualityState>((set, get) => {
  const saved = load();
  return {
    ...saved,
    effective: effectiveOf(saved),
    setMode: (mode) => {
      const next = { mode, tier: get().tier };
      set({ mode, effective: effectiveOf(next) });
      save(next);
    },
  };
});

/** what's drawn now (0 everything … 2 lightest) */
export const qualityTier = (): Tier => useQuality.getState().effective;

/** what's drawn now, as a hook (for what can change as it draws: the 3D scenes) */
export const useQualityTier = (): Tier => useQuality((s) => s.effective);

/**
 * How sharp a canvas draws: the screen's pixels, at most `max` of them, and
 * at most what this step allows; but never under `floor` (where there's
 * writing to keep crisp). Read as a canvas is made or resized.
 */
export function pixelRatio(max: number, floor = 0, tier: Tier = qualityTier()): number {
  const screen = window.devicePixelRatio || 1;
  return Math.max(Math.min(screen, max, SHARPEST[tier]), Math.min(screen, floor));
}

// ---- Auto: judging how it's keeping up ----

export interface Watch {
  /** how long (s) it's been struggling, in a row */
  bad: number;
  /** how long (s) it's been smooth, in a row */
  good: number;
  /** how long (s) still to wait before judging */
  settle: number;
  /** how long (s) since it last stepped up (Infinity: it hasn't) */
  sinceUp: number;
  /** how many times it's fallen back soon after stepping up (each doubles the wait to try again) */
  bounces: number;
}

export const freshWatch = (): Watch => ({ bad: 0, good: 0, settle: SETTLE_S, sinceUp: Infinity, bounces: 0 });

/** how long (s) it must be smooth to try the step above */
export const upAfter = (w: Watch) => UP_AFTER_S * 2 ** Math.min(w.bounces, MAX_BOUNCES);

/** `seconds` more of drawing at `fps`: the step to draw at next, and the watch kept */
export function judge(tier: Tier, w: Watch, fps: number, seconds: number): { tier: Tier; watch: Watch } {
  const watch = { ...w, sinceUp: w.sinceUp + seconds };
  if (watch.settle > 0) {
    watch.settle = Math.max(0, watch.settle - seconds);
    return { tier, watch };
  }
  if (fps < LOW_FPS) {
    watch.bad += seconds;
    watch.good = 0;
  } else if (fps >= SMOOTH_FPS) {
    watch.good += seconds;
    watch.bad = 0;
  } else {
    // (keeping up, just: stay)
    watch.bad = 0;
    watch.good = 0;
  }
  if (watch.bad >= DOWN_AFTER_S && tier < MAX_TIER) {
    const fellBack = watch.sinceUp < FELL_BACK_S;
    return { tier: (tier + 1) as Tier, watch: { ...watch, bad: 0, good: 0, settle: SETTLE_S, bounces: watch.bounces + (fellBack ? 1 : 0) } };
  }
  if (watch.good >= upAfter(watch) && tier > 0) {
    return { tier: (tier - 1) as Tier, watch: { ...watch, bad: 0, good: 0, settle: SETTLE_S, sinceUp: 0 } };
  }
  return { tier, watch };
}

/** a frame further apart than this is a hitch (something loading or opening), not how it's keeping up */
const HITCH_MS = 250;
/** frames are counted over this long (ms) before each judgement */
const WINDOW_MS = 1000;

/** what's drawn changing: CSS can follow it, and canvases sized on a resize take it up now */
function apply(tier: Tier) {
  document.documentElement.dataset.quality = String(tier);
}

let watching = false;

/** at the start: Auto watching the frames, and the page told what's drawn */
export function startQuality() {
  if (watching) return;
  watching = true;
  let watch = freshWatch();
  let shown = qualityTier();
  let mode = useQuality.getState().mode;
  apply(shown);
  useQuality.subscribe((s) => {
    // (Auto chosen again: judged afresh)
    if (s.mode !== mode) {
      mode = s.mode;
      watch = freshWatch();
    }
    if (s.effective === shown) return;
    shown = s.effective;
    apply(shown);
    window.dispatchEvent(new Event('resize'));
  });

  let last = performance.now();
  let frames = 0;
  let counted = 0;
  const tick = (now: number) => {
    const gap = now - last;
    last = now;
    // (only while it's to be seen; a hitch isn't counted, but the frames either side are)
    if (document.visibilityState === 'visible' && gap < HITCH_MS) {
      frames++;
      counted += gap;
    }
    if (counted >= WINDOW_MS) {
      const s = useQuality.getState();
      if (s.mode === 'auto') {
        const next = judge(s.tier, watch, (frames * 1000) / counted, counted / 1000);
        watch = next.watch;
        if (next.tier !== s.tier) {
          const saved = { mode: s.mode, tier: next.tier };
          useQuality.setState({ tier: next.tier, effective: effectiveOf(saved) });
          save(saved);
        }
      }
      frames = 0;
      counted = 0;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
