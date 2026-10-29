import { useSettings } from '../settings/useSettings';

// Phone vibration (docs/plans/2026-10-29-leave-fullscreen-haptics.md).
//
// Android (Chrome, Firefox, Samsung Internet, and the Android app) has the
// Vibration API, so each of the game's moments has a buzz of its own: a tick
// for a pick, a rev for a right answer, a thump for a mistake, the engines
// charging and a rumble building to a roar for a launch, a swell for a warp,
// a slow wobble for a monster waking, a boom, a celebration…
//
// No iPhone browser has it. The one buzz a web page can get there is the tick
// Safari (iOS 17.4 and later) gives a switch (<input type="checkbox" switch>)
// as it's flipped, and since iOS 26.5 only a finger's own tap does it, never
// the page. So on an iPhone the answers' buttons and the keypad's keys each
// carry an invisible switch over them (TapTick.tsx): a tick under the finger
// as an answer's tapped, and nothing more. iPads have nothing to buzz with.

export const canVibrate = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
/** an iPhone: a tick as a switch is tapped, but nothing the page can start */
export const canTick = !canVibrate && typeof navigator !== 'undefined' && /iPhone|iPod/.test(navigator.userAgent);
/** the device has some buzz to give (the cockpit's Vibration switch shows) */
export const canFeel = canVibrate || canTick;

/** how long a pattern (buzz, pause, buzz…, in ms) runs */
const length = (pattern: number[]) => pattern.reduce((sum, ms) => sum + ms, 0);

/** when what's buzzing now ends (performance.now()) */
let busyUntil = 0;
let waiting = 0;

/**
 * Buzz `pattern` now, cutting off whatever's buzzing; or, `after`, once
 * that's done (a celebration on top of the answer's own buzz).
 */
function buzz(pattern: number[], after = false) {
  if (!canVibrate || !useSettings.getState().vibration) return;
  const now = performance.now();
  const wait = after ? Math.max(0, busyUntil - now) : 0;
  window.clearTimeout(waiting);
  const start = () => {
    try {
      navigator.vibrate(pattern);
    } catch {
      // some browsers throw if called before any user interaction — ignore
    }
  };
  if (wait > 0) waiting = window.setTimeout(start, wait);
  else start();
  busyUntil = now + wait + length(pattern);
}

/** the engines charging for `seconds`: short pulses, longer and closer together, up to the blast-off */
export function chargePattern(seconds: number): number[] {
  const total = Math.max(200, seconds * 1000);
  const pattern: number[] = [];
  let t = 0;
  while (t < total) {
    const k = t / total;
    const on = Math.round(10 + 30 * k);
    const off = Math.round(110 - 90 * k);
    pattern.push(on, off);
    t += on + off;
  }
  // (ending on a buzz, not a pause)
  pattern.pop();
  return pattern;
}

let lastScrape = -Infinity;

export const haptics = {
  /**
   * Correct: an "accelerating" rev — pulses get longer while the gaps
   * shrink, ending in one long buzz. Longer streaks rev a little further.
   */
  correct(streak = 1) {
    const pattern = [25, 70, 35, 50, 45, 32, 60, 18, 90];
    if (streak >= 5) pattern.push(12, 140);
    buzz(pattern);
  },
  /** Wrong / bump: one heavy thump and a small rebound. */
  thump() {
    buzz([85, 45, 25]);
  },
  /** A quick tick (e.g. a correct pick in the wormhole). */
  tick() {
    buzz([18]);
  },
  /** A celebration (a streak's milestone, a badge, a round won): ta-da-DAA, once the answer's own buzz is done. */
  cheer(big = false) {
    buzz(big ? [40, 50, 40, 50, 40, 50, 260] : [40, 60, 40, 60, 170], true);
  },
  /** The engines charging for `seconds` before a blast-off. */
  charge(seconds: number) {
    buzz(chargePattern(seconds));
  },
  /** Lift-off: a rumble building to a roar. */
  launch() {
    buzz([30, 60, 40, 45, 55, 35, 70, 25, 90, 20, 140, 15, 280]);
  },
  /** A warp or a hyperdrive jump: a quick swell. */
  warp() {
    buzz([15, 40, 25, 30, 40, 22, 60, 15, 180]);
  },
  /** Into a wormhole: a longer swell, round and round. */
  wormhole() {
    buzz([15, 45, 20, 40, 30, 32, 45, 25, 65, 18, 90, 12, 220]);
  },
  /** A monster waking: a slow, heavy wobble. */
  monster() {
    buzz([90, 110, 70, 110, 160]);
  },
  /** An explosion or a mighty hit: one big boom, dying away. */
  boom() {
    buzz([200, 60, 80, 50, 35]);
  },
  /** A bump or a jolt, by how hard (about 0 to 2). */
  bump(strength = 1) {
    buzz([Math.round(20 + 35 * Math.min(Math.max(strength, 0), 2))]);
  },
  /** A sharp cut (the afterburner loop's slash). */
  slash() {
    buzz([10, 25, 45]);
  },
  /** Time stopping dead: one crisp tap. */
  freeze() {
    buzz([30]);
  },
  /** The title's glitch: a stutter. */
  glitch() {
    buzz([10, 30, 14, 25, 8, 40, 12, 30, 50]);
  },
  /** The Canyon Run's gates: a bullseye rings (more with the combo), close is a tap, a miss a dull knock. */
  gate(verdict: 'bullseye' | 'close' | 'miss', combo = 0) {
    if (verdict === 'bullseye') buzz([20, 35, 30, 35, 70 + 10 * Math.min(combo, 5)]);
    else if (verdict === 'close') buzz([35]);
    else buzz([70, 40, 20]);
  },
  /** Scraping a canyon wall: a gritty buzz, by how hard (0 to 1), at most every 120 ms. */
  scrape(strength: number) {
    const now = performance.now();
    if (now - lastScrape < 120) return;
    lastScrape = now;
    buzz([Math.round(12 + 30 * Math.min(Math.max(strength, 0), 1))]);
  },
  /** Crashing into something: a hard knock and a rattle. */
  crash() {
    buzz([140, 50, 50, 40, 25]);
  },
};
