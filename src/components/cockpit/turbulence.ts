import { useEffect, type RefObject } from 'react';
import { sfx } from '../../audio/sfx';

// Flight jitter: now and then the cockpit gives a little shudder, as a ship
// in flight would. Every so often (BUMP_GAP_S) the whole view shakes a few
// pixels and settles, sometimes twice over; the space beyond the glass
// jolts a little against the frame, the pilot's bobble-head wobbles harder,
// and a faint rumble goes with it. It only ever moves in whole pixels (the
// text never blurs), never while a control is being held, and never with
// reduced motion.

/** between bumps (s): the first comes a little after arriving */
const FIRST_S = [3, 6];
const BUMP_GAP_S = [6, 15];
/** how long one shakes (s), how far (px, at its start), and how quickly it dies away (s) */
const BUMP_S = 0.9;
const BUMP_PX = [1.6, 3.2];
const DECAY_S = 0.24;
/** the space beyond the glass moves this much more than the frame (it isn't bolted to it) */
const SPACE_K = 1.8;
/** the wobble's frequencies across and down (Hz) */
const FX = [9, 12];
const FY = [11, 15];

const between = ([a, b]: number[]) => a + Math.random() * (b - a);

interface Bump {
  at: number;
  px: number;
  fx: number;
  fy: number;
  phase: number;
}

/**
 * While `active`, the view in `scroll` (and the space in it, and the
 * bobble-head in `root`) shudders now and then. Held off while a pointer is
 * down in `root`.
 */
export function useTurbulence(root: RefObject<HTMLElement | null>, scroll: RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    const box = root.current;
    const view = scroll.current;
    if (!active || !box || !view) return;
    let holding = false;
    const down = () => {
      holding = true;
    };
    const up = () => {
      holding = false;
    };
    box.addEventListener('pointerdown', down);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);

    const bumps: Bump[] = [];
    let next = performance.now() + between(FIRST_S) * 1000;
    let raf = 0;
    let shown = '';
    const set = (x: number, y: number, sx: number, sy: number) => {
      const key = `${x},${y},${sx},${sy}`;
      if (key === shown) return;
      shown = key;
      view.style.translate = x || y ? `${x}px ${y}px` : '';
      view.style.setProperty('--bump-x', `${sx}px`);
      view.style.setProperty('--bump-y', `${sy}px`);
    };
    const bump = (now: number, strength: number) => {
      bumps.push({ at: now, px: between(BUMP_PX) * strength, fx: between(FX), fy: between(FY), phase: Math.random() * Math.PI * 2 });
      sfx.rumble(strength);
      const bobble = box.querySelector('.ck-bobble');
      bobble?.classList.remove('is-jiggling');
      // (restarted: a fresh wobble each bump)
      void (bobble as HTMLElement | null)?.offsetWidth;
      bobble?.classList.add('is-jiggling');
    };
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (now >= next) {
        if (holding || document.hidden) next = now + 1500;
        else {
          bump(now, 1);
          // now and then a second, smaller one hard on its heels
          if (Math.random() < 0.35) window.setTimeout(() => !holding && bump(performance.now(), 0.6), 260 + Math.random() * 240);
          next = now + between(BUMP_GAP_S) * 1000;
        }
      }
      // (holding a control, it dies away at once)
      for (let i = bumps.length - 1; i >= 0; i--) if (holding || (now - bumps[i].at) / 1000 > BUMP_S) bumps.splice(i, 1);
      let x = 0;
      let y = 0;
      for (const b of bumps) {
        const t = (now - b.at) / 1000;
        const k = b.px * Math.exp(-t / DECAY_S);
        x += k * Math.sin(2 * Math.PI * b.fx * t + b.phase);
        y += k * 0.8 * Math.sin(2 * Math.PI * b.fy * t + b.phase * 1.7);
      }
      // whole pixels: crisp text
      set(Math.round(x), Math.round(y), Math.round(-x * SPACE_K), Math.round(-y * SPACE_K));
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      box.removeEventListener('pointerdown', down);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      view.style.translate = '';
      view.style.removeProperty('--bump-x');
      view.style.removeProperty('--bump-y');
    };
  }, [root, scroll, active]);
}
