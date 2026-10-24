import { useCallback, useEffect, useRef, useState } from 'react';
import { useBack } from '../native/back';
import { pauseGame, resumeGame } from '../game/gameClock';
import { sfx } from '../audio/sfx';

// A phone on its side is too short for the top bar above the rocket and the
// question below it. There the top bar becomes a drawer tucked off the right
// edge: swipe in from the edge, shake the phone, or tap the tab to pull it
// out. It tucks itself away again after a few quiet seconds, once a button in
// it opens something, or with a swipe back to the right. (MenuTab.tsx is its
// tab, App.css lays the sideways game out, FlightController moves the rocket
// to the left.)
//
// A phone held upright is too narrow for it: there the top bar is a slim
// strip of the pilot's badge (Station.tsx) and where they're flying to, and
// the rest waits in the station, which drops down from the badge when it's
// tapped. The flight waits while it's open, so nothing is lost to a look
// round it, and it stays until it's put away (no swipes, shakes or timer).

export const SIDEWAYS_QUERY = '(orientation: landscape) and (max-height: 500px) and (pointer: coarse)';
/** one shared query, so the 3D scene can check it every frame */
export const sidewaysQuery: MediaQueryList | null =
  typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(SIDEWAYS_QUERY) : null;

export const UPRIGHT_QUERY = '(orientation: portrait) and (max-width: 600px) and (pointer: coarse)';
const uprightQuery: MediaQueryList | null = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(UPRIGHT_QUERY) : null;

function useQuery(query: MediaQueryList | null): boolean {
  const [on, setOn] = useState(() => query?.matches ?? false);
  useEffect(() => {
    if (!query) return;
    const update = () => setOn(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, [query]);
  return on;
}

export const useSideways = () => useQuery(sidewaysQuery);
export const useUpright = () => useQuery(uprightQuery);

/** a swipe starts this near the right edge, and travels this far */
const EDGE_PX = 44;
const SWIPE_PX = 40;
/** the drawer tucks itself away after this long untouched */
const AUTO_HIDE_MS = 6000;
/** a shake: jolts this hard (m/s², gravity aside), this many within this long */
const SHAKE_MS2 = 13;
const SHAKE_JOLTS = 3;
const SHAKE_WINDOW_MS = 1000;

type MotionAccess = { requestPermission?: () => Promise<string> };

/** `kind`: the drawer (a phone on its side), the station (upright), or neither (the top bar as it is) */
export function useMenuDrawer(kind: 'drawer' | 'station' | null) {
  const enabled = kind !== null;
  const drawer = kind === 'drawer';
  const [open, setOpen] = useState(false);
  const [touched, setTouched] = useState(0);
  const askedMotion = useRef(false);

  const poke = useCallback(() => setTouched((n) => n + 1), []);
  const hide = useCallback(() => setOpen(false), []);
  useBack(enabled && open && hide);
  // iPhones only report motion once asked, from a tap: the first time the tab is tapped, so a shake works after that
  const show = useCallback(() => {
    setOpen(true);
    const motion = (window as unknown as { DeviceMotionEvent?: MotionAccess }).DeviceMotionEvent;
    if (!drawer || askedMotion.current || !motion?.requestPermission) return;
    askedMotion.current = true;
    motion.requestPermission().catch(() => {});
  }, [drawer]);

  useEffect(() => {
    if (!open || !drawer) return;
    const timer = window.setTimeout(() => setOpen(false), AUTO_HIDE_MS);
    return () => window.clearTimeout(timer);
  }, [open, touched, drawer]);

  // the station: the flight waits while it's open
  const station = kind === 'station' && open;
  useEffect(() => {
    if (!station) return;
    pauseGame('menu');
    sfx.blip(7);
    return () => {
      resumeGame('menu');
      sfx.blip(3);
    };
  }, [station]);

  // swiping in from the right edge pulls it out; a swipe to the right puts it away
  useEffect(() => {
    if (!drawer) return;
    let start: { x: number; y: number; id: number; edge: boolean } | null = null;
    const down = (e: TouchEvent) => {
      const t = e.changedTouches[0];
      start = e.touches.length > 1 || !t ? null : { x: t.clientX, y: t.clientY, id: t.identifier, edge: t.clientX >= window.innerWidth - EDGE_PX };
    };
    const move = (e: TouchEvent) => {
      const from = start;
      const t = from && Array.from(e.changedTouches).find((c) => c.identifier === from.id);
      if (!from || !t) return;
      const dx = t.clientX - from.x;
      const dy = t.clientY - from.y;
      if (Math.abs(dx) < SWIPE_PX || Math.abs(dy) > Math.abs(dx) * 0.8) return;
      if (dx < 0 && from.edge) setOpen(true);
      else if (dx > 0) setOpen(false);
      start = null;
    };
    const end = () => {
      start = null;
    };
    const opts = { capture: true, passive: true } as const;
    window.addEventListener('touchstart', down, opts);
    window.addEventListener('touchmove', move, opts);
    window.addEventListener('touchend', end, opts);
    window.addEventListener('touchcancel', end, opts);
    return () => {
      window.removeEventListener('touchstart', down, opts);
      window.removeEventListener('touchmove', move, opts);
      window.removeEventListener('touchend', end, opts);
      window.removeEventListener('touchcancel', end, opts);
    };
  }, [drawer]);

  // shaking the phone pulls it out too
  useEffect(() => {
    if (!drawer) return;
    let jolts: number[] = [];
    const motion = (e: DeviceMotionEvent) => {
      const a = e.acceleration;
      const g = e.accelerationIncludingGravity;
      let jolt: number;
      if (a?.x != null && a.y != null && a.z != null) jolt = Math.hypot(a.x, a.y, a.z);
      else if (g?.x != null && g.y != null && g.z != null) jolt = Math.abs(Math.hypot(g.x, g.y, g.z) - 9.81);
      else return;
      if (jolt < SHAKE_MS2) return;
      const now = performance.now();
      // one jolt, not every reading of it
      if (jolts.length && now - jolts[jolts.length - 1] < 120) return;
      jolts = [...jolts.filter((at) => now - at < SHAKE_WINDOW_MS), now];
      if (jolts.length < SHAKE_JOLTS) return;
      jolts = [];
      setOpen(true);
      setTouched((n) => n + 1);
    };
    window.addEventListener('devicemotion', motion);
    return () => window.removeEventListener('devicemotion', motion);
  }, [drawer]);

  useEffect(() => {
    if (!enabled || !open) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [enabled, open]);

  return { open: enabled && open, show, hide, poke };
}
