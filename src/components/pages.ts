import { useEffect, useRef } from 'react';
import { create } from 'zustand';

// The top bar's screens (About, the pilots) are each opened by their own
// button, which owns them. The cockpit opens the same ones: it asks here,
// and the button that owns it opens it (on a phone, where the top bar keeps
// only the pilot and ⚙️, the rest are there but out of sight).

export type Page = 'about' | 'pilots' | 'editPilot';

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
