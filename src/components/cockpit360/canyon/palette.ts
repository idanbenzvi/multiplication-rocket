import { LOOKS } from '../../scene/planetLooks';

// The canyon's colours, a little of the world it's on: its sandstone, sand
// and the light bounced off them leaning towards that destination's own
// colours (Mars redder, Neptune bluer, the alien planet greener), its air
// towards its glow; and the light of the star in its sky (the next
// destination, hanging where the sun would) leaning towards that one's. Each
// colour keeps its own brightness and takes some of the other's hue, so the
// rock's layers stay as light and dark as they were.

export type Rgb = [number, number, number];

/** the sandstone's layers, bottom up (each colour, and how thick, in units), repeating every 64 */
export const STRATA: Array<[string, number]> = [
  ['#7a2c38', 6],
  ['#a5432f', 5],
  ['#c8653b', 8],
  ['#e5965c', 4],
  ['#f2cf9e', 1.5],
  ['#c05845', 6],
  ['#8a3a52', 2.5],
  ['#d27848', 8],
  ['#ae4936', 5],
  ['#eeb47b', 3],
  ['#93394a', 4],
  ['#cf6f44', 11],
];

export interface CanyonPalette {
  /** sRGB, for the strata's texture */
  strata: Array<[string, number]>;
  /** the rest linear, as the shaders take them */
  sand: [Rgb, Rgb];
  sunLight: Rgb;
  skyLight: Rgb;
  bounce: Rgb;
  /** the air near the horizon, and towards the star */
  hazeLow: Rgb;
  hazeSun: Rgb;
  skyHigh: Rgb;
  skyTop: Rgb;
  cloud: Rgb;
}

/** how much of the world's colour the rock and sand take, the air, and the light the star's */
const ROCK = 0.42;
const AIR = 0.3;
const STARLIGHT = 0.3;

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toSrgb = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);

export function hexToLinear(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return [toLinear(((n >> 16) & 255) / 255), toLinear(((n >> 8) & 255) / 255), toLinear((n & 255) / 255)];
}

export function linearToHex([r, g, b]: Rgb): string {
  const byte = (c: number) => Math.round(Math.min(1, Math.max(0, toSrgb(Math.max(0, c)))) * 255);
  return `#${((1 << 24) | (byte(r) << 16) | (byte(g) << 8) | byte(b)).toString(16).slice(1)}`;
}

const luminance = ([r, g, b]: Rgb) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** `c` leaning `k` of the way to `toward`'s hue, keeping its own brightness */
export function tint(c: Rgb, toward: Rgb, k: number): Rgb {
  const lc = luminance(c);
  const lt = Math.max(luminance(toward), 0.02);
  return c.map((v, i) => v + ((toward[i] / lt) * lc - v) * k) as Rgb;
}

export function canyonPalette(world: number | null, star: number | null): CanyonPalette {
  const w = world === null ? null : LOOKS[((world % LOOKS.length) + LOOKS.length) % LOOKS.length];
  const s = star === null ? null : LOOKS[((star % LOOKS.length) + LOOKS.length) % LOOKS.length];
  const rock = (c: Rgb, hex?: string, k = ROCK) => (hex ? tint(c, hexToLinear(hex), k) : c);
  return {
    strata: STRATA.map(([hex, h], i) => [w ? linearToHex(tint(hexToLinear(hex), hexToLinear(i % 2 ? w.band : w.base), ROCK)) : hex, h]),
    sand: [rock([0.5, 0.21, 0.1], w?.base), rock([0.78, 0.4, 0.2], w?.base)],
    bounce: rock([0.42, 0.17, 0.09], w?.base),
    skyLight: rock([0.26, 0.2, 0.46], w?.glow, 0.15),
    hazeLow: rock([0.46, 0.25, 0.5], w?.glow, AIR),
    skyHigh: rock([0.16, 0.06, 0.26], w?.band, 0.2),
    skyTop: rock([0.03, 0.016, 0.085], w?.band, 0.2),
    sunLight: rock([2.4, 1.776, 1.2], s?.glow, STARLIGHT),
    hazeSun: rock([1.0, 0.5, 0.3], s?.glow, 0.35),
    cloud: rock([1.0, 0.45, 0.5], s?.glow, 0.3),
  };
}
