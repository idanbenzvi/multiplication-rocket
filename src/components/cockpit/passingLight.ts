import { useEffect, type RefObject } from 'react';

// Now and then something glowing passes by outside (a comet, its tail
// streaming behind it), across the top of the windscreen from one side to
// the other, and its light falls through the glass onto the dashboard: the
// hood under the glass brightest, each plate (the modules, the towers) lit on
// its edge towards it and darker away from it, casting a hard shadow away
// from it, all of it moving round as it goes by. The windscreen (CockpitSpace)
// draws it from `passer`; the dashboard is lit by CSS variables on the
// cockpit (--pass-x, --pass-k, --pass-rgb) and on each plate (--lx: which way
// the light is, -1 … 1; --lk: how much of it there is, 0 … 1).

/** between passes (s): the first comes a while after arriving */
const FIRST_S = [6, 10];
const GAP_S = [18, 32];
/** how long one takes to cross (s) */
const CROSS_S = [3.4, 4.6];
/** its light's colours: warm gold, cyan, pink */
const COLORS = [
  { css: '#ffe2a0', rgb: '255 226 160' },
  { css: '#a8f6ff', rgb: '168 246 255' },
  { css: '#ffc0f4', rgb: '255 192 244' },
];
/** the plates lit by it */
const PLATES = '.ck-module, .ck-tower, .ck-hood';

const between = ([a, b]: number[]) => a + Math.random() * (b - a);

/** what's passing by, for the windscreen to draw: where (across, 0 … 1, and down the glass, 0 … 1) and how bright */
export const passer = {
  on: false,
  x: 0,
  y: 0,
  /** how bright, 0 … 1 */
  k: 0,
  /** which way it's going: 1 to the right, -1 to the left */
  dir: 1,
  color: COLORS[0].css,
};

/** While `active`, something passes by now and then, lighting the dashboard in `root`. */
export function usePassingLight(root: RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    const box = root.current;
    if (!active || !box) return;
    let raf = 0;
    let next = performance.now() + between(FIRST_S) * 1000;
    let pass: { at: number; ms: number; dir: number; y0: number; y1: number } | null = null;
    const end = () => {
      passer.on = false;
      passer.k = 0;
      box.style.setProperty('--pass-k', '0');
      for (const el of box.querySelectorAll<HTMLElement>(PLATES)) {
        el.style.removeProperty('--lx');
        el.style.removeProperty('--lk');
      }
    };
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!pass) {
        if (now < next) return;
        if (document.hidden) {
          next = now + 2000;
          return;
        }
        const color = COLORS[Math.floor(Math.random() * COLORS.length)];
        const dir = Math.random() < 0.5 ? 1 : -1;
        // (high across the glass, dipping a little)
        const y0 = 0.12 + Math.random() * 0.18;
        pass = { at: now, ms: between(CROSS_S) * 1000, dir, y0, y1: y0 + 0.06 + Math.random() * 0.12 };
        passer.on = true;
        passer.dir = dir;
        passer.color = color.css;
        box.style.setProperty('--pass-rgb', color.rgb);
      }
      const t = (now - pass.at) / pass.ms;
      if (t >= 1) {
        pass = null;
        end();
        next = now + between(GAP_S) * 1000;
        return;
      }
      // across, from just outside one side to just outside the other
      passer.x = pass.dir > 0 ? -0.1 + 1.2 * t : 1.1 - 1.2 * t;
      passer.y = pass.y0 + (pass.y1 - pass.y0) * t;
      // (brightest crossing the middle, its light coming and going with it)
      passer.k = Math.pow(Math.sin(Math.PI * t), 0.8);
      const vw = window.innerWidth;
      const lightX = passer.x * vw;
      box.style.setProperty('--pass-x', `${lightX.toFixed(1)}px`);
      box.style.setProperty('--pass-k', passer.k.toFixed(3));
      for (const el of box.querySelectorAll<HTMLElement>(PLATES)) {
        const r = el.getBoundingClientRect();
        const off = lightX - (r.left + r.width / 2);
        const lx = Math.max(-1, Math.min(1, off / (vw * 0.45)));
        // (fainter the farther it's from the light, across and down)
        const far = Math.min(1, Math.abs(off) / (vw * 1.1)) * 0.6 + Math.min(1, Math.max(0, r.top) / (window.innerHeight * 2.2)) * 0.4;
        el.style.setProperty('--lx', lx.toFixed(3));
        el.style.setProperty('--lk', (passer.k * (1 - far)).toFixed(3));
      }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      end();
    };
  }, [root, active]);
}
