import { rasterizeSprite, type Porthole } from '../scene/spriteTexture';
import { goldGradient, starPoints } from '../scene/illustrations';
import { explorerRearSvg, REAR_ENGINES, REAR_WINDOWS, type ShipId } from '../scene/ships';

// The slow ships of Space Traffic, seen from behind: the same picture-book
// style as the rest of the game (thick ink outlines, flat pastel fills, a
// soft highlight). Their engines face the pilot, so each drawing says where
// its nozzles are (the canvas lights them with ion glow and trails), where
// the number is painted on its back, and where its navigation lights blink.

const INK = '#2b2033';
const NOZZLE = '#3a2e38';
const GLASS = '#bfe6f5';
const WING = '#5b4a63';

/** the hull colors: the game's pastel palette */
export const HULLS = ['#ff9d76', '#7ec4b0', '#c9a4de', '#ffd77a', '#f2a6c0', '#8fb8d9', '#a9c98f'];
/** ion engine colors, cyan the most common */
export const IONS = ['#6ad7ff', '#6ad7ff', '#6ad7ff', '#b18cff', '#ff6ad5', '#7ee08f'];

/** a point on the drawing, as fractions of its width and height (from the top left) */
interface Spot {
  x: number;
  y: number;
}

export interface ShipKind {
  svg: (hull: string) => string;
  /** height / width of the drawing */
  aspect: number;
  /** how wide the ship is, in lanes */
  width: number;
  /** nozzles: center, and radius as a fraction of the width */
  engines: Array<Spot & { r: number }>;
  /** where the number is painted on its back: center, and how tall, as fractions of the width and height */
  plate: Spot & { h: number };
  /** wingtip lights: red to port (left, seen from behind), green to starboard */
  lights: [Spot, Spot];
}

const nozzle = (cx: number, cy: number, r: number) =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${NOZZLE}" stroke="${INK}" stroke-width="${Math.max(4, r * 0.32)}"/>
   <circle cx="${cx}" cy="${cy}" r="${r * 0.55}" fill="${INK}"/>`;

export const SHIP_KINDS: ShipKind[] = [
  // a space bus: a big boxy hauler with a little bridge on top
  {
    aspect: 144 / 200,
    width: 0.95,
    engines: [
      { x: 46 / 200, y: 121 / 144, r: 17 / 200 },
      { x: 154 / 200, y: 121 / 144, r: 17 / 200 },
      { x: 100 / 200, y: 126 / 144, r: 11 / 200 },
    ],
    plate: { x: 100 / 200, y: 72 / 144, h: 0.3 },
    lights: [
      { x: 20 / 200, y: 44 / 144 },
      { x: 180 / 200, y: 44 / 144 },
    ],
    svg: (hull) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 144">
      <rect x="64" y="6" width="72" height="36" rx="14" fill="#faf3e6" stroke="${INK}" stroke-width="6"/>
      <rect x="78" y="15" width="44" height="14" rx="7" fill="${GLASS}" stroke="${INK}" stroke-width="4"/>
      <rect x="12" y="32" width="176" height="88" rx="20" fill="${hull}" stroke="${INK}" stroke-width="7"/>
      <path d="M38 42 V110 M162 42 V110" stroke="${INK}" stroke-opacity="0.22" stroke-width="5" stroke-linecap="round"/>
      <rect x="22" y="40" width="46" height="9" rx="4.5" fill="#ffffff" opacity="0.3"/>
      ${nozzle(46, 121, 17)}${nozzle(154, 121, 17)}${nozzle(100, 126, 11)}
    </svg>`,
  },
  // a round shuttle with swept wings and a tail fin
  {
    aspect: 136 / 200,
    width: 0.86,
    engines: [
      { x: 100 / 200, y: 114 / 136, r: 18 / 200 },
      { x: 24 / 200, y: 106 / 136, r: 9 / 200 },
      { x: 176 / 200, y: 106 / 136, r: 9 / 200 },
    ],
    plate: { x: 100 / 200, y: 66 / 136, h: 0.27 },
    lights: [
      { x: 10 / 200, y: 98 / 136 },
      { x: 190 / 200, y: 98 / 136 },
    ],
    svg: (hull) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 136">
      <path d="M90 26 L100 3 L110 26 Z" fill="${WING}" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
      <path d="M80 70 L8 94 L12 112 L82 100 Z M120 70 L192 94 L188 112 L118 100 Z" fill="${WING}" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/>
      <ellipse cx="100" cy="68" rx="46" ry="56" fill="${hull}" stroke="${INK}" stroke-width="7"/>
      <rect x="84" y="24" width="32" height="12" rx="6" fill="${GLASS}" stroke="${INK}" stroke-width="4"/>
      <ellipse cx="78" cy="58" rx="7" ry="26" fill="#ffffff" opacity="0.25"/>
      ${nozzle(100, 114, 18)}${nozzle(24, 106, 9)}${nozzle(176, 106, 9)}
    </svg>`,
  },
  // a flying saucer, engines under its rim
  {
    aspect: 112 / 200,
    width: 0.95,
    engines: [
      { x: 52 / 200, y: 86 / 112, r: 11 / 200 },
      { x: 100 / 200, y: 93 / 112, r: 12 / 200 },
      { x: 148 / 200, y: 86 / 112, r: 11 / 200 },
    ],
    plate: { x: 100 / 200, y: 64 / 112, h: 0.25 },
    lights: [
      { x: 10 / 200, y: 64 / 112 },
      { x: 190 / 200, y: 64 / 112 },
    ],
    svg: (hull) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 112">
      <ellipse cx="100" cy="38" rx="42" ry="30" fill="${GLASS}" stroke="${INK}" stroke-width="6"/>
      <ellipse cx="86" cy="28" rx="12" ry="8" fill="#ffffff" opacity="0.7"/>
      <ellipse cx="100" cy="64" rx="94" ry="30" fill="${hull}" stroke="${INK}" stroke-width="7"/>
      <path d="M22 66 Q100 92 178 66" fill="none" stroke="${INK}" stroke-opacity="0.22" stroke-width="5"/>
      <ellipse cx="62" cy="54" rx="26" ry="5" fill="#ffffff" opacity="0.3"/>
      ${nozzle(52, 86, 11)}${nozzle(100, 93, 12)}${nozzle(148, 86, 11)}
    </svg>`,
  },
  // a racer with twin tail fins and a stripe
  {
    aspect: 140 / 200,
    width: 0.82,
    engines: [
      { x: 70 / 200, y: 108 / 140, r: 15 / 200 },
      { x: 130 / 200, y: 108 / 140, r: 15 / 200 },
    ],
    plate: { x: 100 / 200, y: 80 / 140, h: 0.24 },
    lights: [
      { x: 45 / 200, y: 10 / 140 },
      { x: 155 / 200, y: 10 / 140 },
    ],
    svg: (hull) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 140">
      <path d="M58 62 L44 8 L80 52 Z M142 62 L156 8 L120 52 Z" fill="${WING}" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
      <path d="M38 54 Q100 30 162 54 L178 100 Q100 126 22 100 Z" fill="${hull}" stroke="${INK}" stroke-width="7" stroke-linejoin="round"/>
      <path d="M44 62 Q100 46 156 62" fill="none" stroke="#ffffff" stroke-opacity="0.45" stroke-width="7" stroke-linecap="round"/>
      ${nozzle(70, 108, 15)}${nozzle(130, 108, 15)}
    </svg>`,
  },
];

/**
 * The pilot's ship from behind, as markup to rasterize: the classic's is
 * RearShip (spaceArt.tsx), keep the two drawings the same; the Explorer's is
 * explorerRearSvg (ships.ts). In the admiral's livery for a Space Admiral.
 */
export function rearShipSvg(color = '#ff9d76', admiral = false, ship: ShipId = 'classic'): string {
  if (ship === 'explorer') return explorerRearSvg(admiral);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-50 -50 100 100">
    ${admiral ? `<defs>${goldGradient('rear-gold')}</defs>` : ''}
    <path d="M-46 14 L-14 -4 L-14 22 Z M46 14 L14 -4 L14 22 Z" fill="${admiral ? 'url(#rear-gold)' : color}" stroke="#2b2033" stroke-width="4" stroke-linejoin="round"/>
    <ellipse cx="0" cy="4" rx="22" ry="30" fill="#faf3e6" stroke="#2b2033" stroke-width="5"/>
    <circle cx="0" cy="-6" r="13" fill="#bfe6f5" stroke="#2b2033" stroke-width="4"/>
    <circle cx="-11" cy="28" r="7" fill="#6ad7ff" stroke="#2b2033" stroke-width="3"/>
    <circle cx="11" cy="28" r="7" fill="#6ad7ff" stroke="#2b2033" stroke-width="3"/>
    ${
      admiral
        ? `<polygon points="${starPoints(-25, 12, 5)}" fill="#24206e"/>
    <polygon points="${starPoints(25, 12, 5)}" fill="#24206e"/>
    <rect x="-20" y="10" width="40" height="9" rx="3" fill="#24206e" stroke="#2b2033" stroke-width="2"/>
    <polygon points="${starPoints(0, 14.6, 4.6)}" fill="#ffcf4a"/>`
        : ''
    }
  </svg>`;
}

/** the pilot's ship from behind: its engines and its canopy, as fractions of the drawing (the classic's two engines, the Explorer's bell) */
export const pilotEngines = (ship: ShipId = 'classic'): Array<Spot & { r: number }> => REAR_ENGINES[ship];
export const pilotCanopy = (ship: ShipId = 'classic') => REAR_WINDOWS[ship];

// ---------- rasterized once, drawn every frame ----------

const sprites = new Map<string, HTMLCanvasElement>();
const loading = new Set<string>();

/** a drawing rasterized onto a canvas, or null while it's still being drawn (it's started on the first ask) */
export function sprite(svg: string, width: number, height: number, porthole?: Porthole): HTMLCanvasElement | null {
  const key = porthole ? `${svg}|${porthole.emoji}` : svg;
  const done = sprites.get(key);
  if (done || loading.has(key)) return done ?? null;
  loading.add(key);
  rasterizeSprite(svg, width, height, porthole)
    .then((canvas) => sprites.set(key, canvas))
    .catch(() => {})
    .finally(() => loading.delete(key));
  return null;
}

/** the traffic drawings, all hulls of every kind, ready before the first ship turns up */
export function warmTraffic() {
  SHIP_KINDS.forEach((_, i) => HULLS.forEach((hull) => trafficSprite(i, hull)));
}

export function trafficSprite(kind: number, hull: string): HTMLCanvasElement | null {
  const k = SHIP_KINDS[kind];
  return sprite(k.svg(hull), 256, Math.round(256 * k.aspect));
}

/** '#6ad7ff' with an alpha, for canvas gradients */
export function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

const glows = new Map<string, HTMLCanvasElement>();

/** a soft round light: a white-hot core in a halo of the color (drawn additively, scaled to size) */
export function glow(color: string): HTMLCanvasElement {
  const cached = glows.get(color);
  if (cached) return cached;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255, 255, 255, 1)');
    g.addColorStop(0.16, rgba(color, 0.95));
    g.addColorStop(0.42, rgba(color, 0.32));
    g.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  }
  glows.set(color, c);
  return c;
}

