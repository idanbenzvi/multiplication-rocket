import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';

// The Android Back button (docs/plans/2026-10-21-android.md). Each screen,
// sheet or dialog says what Back does while it's open (useBack): what its
// own close, cancel or quit button does. Back runs the one opened last; with
// nothing open (the game itself, a bonus round) it sends the app to the
// background instead of quitting it, so a stray press never loses a game
// (the game pauses while it's away, as it does in a hidden browser tab).

const stack: Array<{ run: () => void }> = [];

/** while `onBack` is given, Back runs it (the latest screen to ask goes first) */
export function useBack(onBack: (() => void) | false | null | undefined) {
  const handler = useRef(onBack);
  useEffect(() => {
    handler.current = onBack;
  });
  const active = !!onBack;
  useEffect(() => {
    if (!active) return;
    const entry = { run: () => (handler.current || undefined)?.() };
    stack.push(entry);
    return () => {
      const i = stack.indexOf(entry);
      if (i >= 0) stack.splice(i, 1);
    };
  }, [active]);
}

/** Back, from wherever it came: false if nothing was open to close */
export function goBack(): boolean {
  const top = stack[stack.length - 1];
  if (!top) return false;
  top.run();
  return true;
}

/**
 * In the Android app: the Back button closes what's open, or sends the app
 * to the background; and the app going to the background (Back, Home, a
 * call, the screen locking) pauses the game, as leaving a browser tab does,
 * and coming back is told too (PauseController listens for pagehide and
 * pageshow; a WebView doesn't always say it's hidden or shown).
 */
export function listenForBack() {
  if (!Capacitor.isNativePlatform()) return;
  void App.addListener('backButton', () => {
    if (!goBack()) void App.minimizeApp();
  });
  void App.addListener('appStateChange', ({ isActive }) => {
    window.dispatchEvent(new Event(isActive ? 'pageshow' : 'pagehide'));
  });
}
