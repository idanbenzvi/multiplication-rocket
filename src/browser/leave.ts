import { IN_APP } from '../storage/backup';

// On a computer, closing the tab (or the window, or reloading) asks first, so
// a stray click on the ✕ doesn't end a flight (docs/plans/2026-10-29-leave-fullscreen-haptics.md).
// The browser asks in its own words ("Leave site?"): a page can't word it any
// more, and it's only asked once the page has been clicked or typed in. Not
// on phones and tablets (their browsers seldom ask, and a tab's closed there
// from the tab switcher), not in the Android app, not on the dev server (it
// reloads the page itself on every change), and not when the game itself
// leaves: reloading with a restored backup, or opening the email app.

/** the game leaving the page itself: no question, for a moment */
let quietUntil = 0;

/** the game's about to leave the page (or open another app from it): don't ask */
export function leaveQuietly() {
  quietUntil = performance.now() + 1500;
}

export function askBeforeLeaving() {
  if (import.meta.env.DEV || IN_APP) return;
  if (!window.matchMedia?.('(hover: hover) and (pointer: fine)').matches) return;
  window.addEventListener('beforeunload', (e) => {
    if (performance.now() < quietUntil) return;
    e.preventDefault();
    // (older browsers ask only when this is set)
    e.returnValue = '';
  });
}
