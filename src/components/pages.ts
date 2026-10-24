import { useEffect, useRef } from 'react';
import { create } from 'zustand';

// The top bar's screens (the badges, the game modes, the pilots, About) are
// each opened by their own button, which owns them. The cockpit's doors open
// the same ones: they ask here, and the button that owns it opens it (on a
// phone held upright, the top bar's buttons are there but out of sight).

export type Page = 'badges' | 'modes' | 'pilot' | 'about';

const usePageRequests = create<{ page: Page | null; n: number }>(() => ({ page: null, n: 0 }));

/** from a tap (so the browser lets a screen's music start) */
export function openPage(page: Page) {
  usePageRequests.setState((s) => ({ page, n: s.n + 1 }));
}

/** the owner of `page` opens it when asked */
export function usePageRequest(page: Page, open: () => void) {
  const latest = useRef(open);
  useEffect(() => {
    latest.current = open;
  });
  useEffect(
    () =>
      usePageRequests.subscribe((s, before) => {
        if (s.n !== before.n && s.page === page) latest.current();
      }),
    [page],
  );
}
