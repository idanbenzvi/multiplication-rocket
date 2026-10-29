import type { Texture } from 'three';

// What the Canyon Run does to the camera's lens (Effects.tsx reads it each
// frame; the canyon's scene writes it): the rock rushing past smeared out
// from where the ship's heading, through the glass only (the cockpit itself
// isn't moving past the eye); the sun's glare and its ghosts when it's in
// view and not behind the rock; and flashes over the whole view (a
// bullseye's gold, the white of diving in and climbing out).

export interface Flash {
  rgb: [number, number, number];
  /** at its brightest (performance.now ms) */
  at: number;
  /** how long it takes to get there, and to die away (s) */
  rise: number;
  fall: number;
  k: number;
}

export const fx = {
  /** how much the outside smears (0 still), out from `heading` (the screen's uv) */
  speed: 0,
  heading: [0.5, 0.6] as [number, number],
  /** a turn's smear across the glass (a share of the screen) */
  turn: [0, 0] as [number, number],
  /** the sun on the screen (uv), and its glare (0 hidden) */
  sunUV: [0.5, 0.8] as [number, number],
  sun: 0,
  /** more colour split (a boost's) */
  split: 0,
  /** the afterburner's loop (loop/): time frozen, the view gone cold and colourless (0 … 1), and the g darkening its edges */
  mono: 0,
  vignette: 0,
  /** and the sky wheeling past the glass: how far round the wheel it turns while the shutter's open (loop/live.ts's wheelAt; more than 0 pitching up, the stars going down) */
  wheel: 0,
  flashes: [] as Flash[],
  /** the cockpit's picture (Shell.tsx sets it), whose see-through glass the smear keeps to */
  pano: null as Texture | null,
};

/** a flash over the view, rising after `delay` seconds to its brightest `rise` seconds later */
export function flash(rgb: [number, number, number], k: number, rise: number, fall: number, delay = 0) {
  fx.flashes.push({ rgb, k, rise, fall, at: performance.now() + (delay + rise) * 1000 });
}

/** the flashes' light now, summed */
export function flashNow(now = performance.now()): [number, number, number, number] {
  let r = 0;
  let g = 0;
  let b = 0;
  let a = 0;
  for (let i = fx.flashes.length - 1; i >= 0; i--) {
    const f = fx.flashes[i];
    const t = (now - f.at) / 1000;
    if (t > f.fall) {
      fx.flashes.splice(i, 1);
      continue;
    }
    const k = (t < 0 ? Math.max(0, 1 + t / f.rise) ** 2 : (1 - t / f.fall) ** 2) * f.k;
    r += f.rgb[0] * k;
    g += f.rgb[1] * k;
    b += f.rgb[2] * k;
    a = Math.max(a, k);
  }
  return [r, g, b, a];
}

/** the canyon gone: the lens back to the cockpit's own */
export function resetFx() {
  fx.speed = 0;
  fx.turn = [0, 0];
  fx.sun = 0;
  fx.split = 0;
  fx.mono = 0;
  fx.vignette = 0;
  fx.wheel = 0;
}
