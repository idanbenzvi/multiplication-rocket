// The launch bay's picture (public/bay/hangar.webp, made by
// scripts/bay-cycle.py) and where things are in it, in its own pixels
// (688 × 384, half the art's), and how it's laid on the screen.

export const BAY = { width: 688, height: 384 };
/** where a ship stands on the pad: the middle of its top */
export const PAD = { x: 235, y: 268, rx: 110 };
/** the lamp in the ceiling over the pad, the beam's source */
export const LAMP = { x: 237, y: 88 };
/** the sign's lit panel: from x0 to x1, its top at x0 sloping down to the right, and its height */
export const SIGN = { x0: 146, x1: 368, top: 9, slope: 0.155, height: 22 };
/** how tall a ship stands on the pad */
export const SHIP_HEIGHT = 136;
/** the smoke's box round the pad: its bottom is the floor the jets blast */
export const SMOKE_BOX = { x0: 70, x1: 400, y0: 96, y1: 324 };
/** the jets under the pad's rim: where, and which way they lean */
export const PAD_JETS = [
  { x: 152, y: 294, dx: -0.22 },
  { x: 204, y: 297, dx: -0.06 },
  { x: 266, y: 297, dx: 0.06 },
  { x: 318, y: 294, dx: 0.22 },
];

/** the least room beside the pad for a panel there (else it goes under the pad) */
const SIDE_ROOM = 360;
/**
 * a phone on its side: shorter than this, the pad's at the bottom of the
 * screen, with no room under it, so the ship chooser's panel goes beside it
 * with less room, and a pilot's card goes over the bay, laid out across it
 */
const SHORT = 500;
const SIDE_ROOM_SHORT = 250;

export interface BayLayout {
  /** the screen */
  vw: number;
  vh: number;
  /** screen px for one of the picture's */
  u: number;
  /** where the picture's top-left corner is on the screen */
  left: number;
  top: number;
  /** the pad's middle on screen */
  padX: number;
  padY: number;
  /** a panel goes beside the pad (on its right, from `sideX`), or under it */
  side: boolean;
  sideX: number;
  /** a pilot's card goes beside the pad (it needs the height too), or over the bay */
  cardSide: boolean;
  /** a short, wide screen (a phone on its side): a card over the bay is laid out across it */
  wide: boolean;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * The picture covers the screen, crisp, as big as it must be; the pad as
 * near the middle across as the picture allows, and the top kept in view
 * (the sign), whatever's cut off is cut at the bottom.
 */
export function bayLayout(vw: number, vh: number): BayLayout {
  const u = Math.max(vw / BAY.width, vh / BAY.height);
  const left = clamp(vw / 2 - PAD.x * u, vw - BAY.width * u, 0);
  const top = 0;
  const padX = left + PAD.x * u;
  const padY = top + PAD.y * u;
  const sideX = padX + (PAD.rx + 8) * u;
  const short = vh < SHORT && vw > vh;
  const side = vw - sideX >= (short ? SIDE_ROOM_SHORT : SIDE_ROOM);
  return { vw, vh, u, left, top, padX, padY, side, sideX, cardSide: side && !short, wide: short };
}
