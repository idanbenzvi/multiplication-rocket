import { useEffect, useLayoutEffect, useRef } from 'react';
import { usePause } from '../../game/gameClock';
import { useBack } from '../../native/back';
import type { Lang } from '../../i18n/strings';
import { pixelRatio } from '../../settings/quality';

// What the story's acts share (StoryOpening, StoryLaunch, StoryTitle): a
// canvas drawn every frame, Skip from the keyboard and Back, and the date and
// time for the where and when typed in before a scene (film.tsx's Slate).

/** a full-screen canvas drawn every frame (while the player's here), at the device's pixel ratio */
export function useCanvasLoop(frame: (ctx: CanvasRenderingContext2D, w: number, h: number, dt: number) => void) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const latest = useRef(frame);
  useLayoutEffect(() => {
    latest.current = frame;
  });
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (usePause.getState().away) return;
      const w = window.innerWidth;
      const h = window.innerHeight;
      const dpr = pixelRatio(2, 1);
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      latest.current(ctx, w, h, dt);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      canvas.width = canvas.height = 0;
    };
  }, []);
  return ref;
}

/** Skip, Esc and Back all do `skip` */
export function useSkip(skip: () => void) {
  useBack(skip);
  const latest = useRef(skip);
  useLayoutEffect(() => {
    latest.current = skip;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && latest.current();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
}

/** now, as the where and when puts it: "27 OCT 2026 · 09:41" (in Hebrew, "27.10.2026 · 09:41") */
export function today(lang: Lang): string {
  const now = new Date();
  const locale = lang === 'he' ? 'he-IL' : 'en-GB';
  try {
    const date = new Intl.DateTimeFormat(locale, { day: '2-digit', month: lang === 'he' ? '2-digit' : 'short', year: 'numeric' }).format(now);
    const time = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
    return `${date.toUpperCase()} · ${time}`;
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

/** the where and when: how long before it starts typing, and how long it stays once the pictures are up (seconds) */
export const SLATE = { delay: 0.45, after: 0.5, hold: 1.2 } as const;
