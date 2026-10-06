import { useSettings } from '../settings/useSettings';

// Phone/tablet vibration via the Vibration API. Supported on Android
// (Chrome, Firefox, Samsung Internet); Apple doesn't implement it in any iOS
// browser, so on iPhone/iPad these are silent no-ops.
export const canVibrate = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

function buzz(pattern: number[]) {
  if (!canVibrate || !useSettings.getState().vibration) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // some browsers throw if called before any user interaction — ignore
  }
}

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
};
