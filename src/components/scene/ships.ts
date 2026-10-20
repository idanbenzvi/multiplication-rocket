import { CREW_PORTHOLES, goldGradient, ROCKET_PORTHOLE, rocketSvg, starPoints } from './illustrations';
import type { Porthole } from './spriteTexture';

// The ships a pilot can fly (docs/plans/2026-10-20-ships.md): the classic
// rocket (illustrations.ts), and two from concept art the player brought in:
// the Explorer, an egg of a ship with a navy nose, a glass visor with the
// cockpit behind it, cyan light lines, an open engine bay over a copper bell
// and four swept landing legs tipped orange; and Nova, lilac and rose gold,
// with mint-glowing light lines, a cream panel scrolled with filigree round a
// great round window, a rose-gold engine bay and four curving legs.
//
// Their fronts are the concept art itself, cut out of its background
// (public/ships/, made by scripts/ship-cutout.py), laid into the rocket's own
// 200 × 400 frame: the window at the height of the classic's porthole, the
// engine bell's bottom on the centre line (the plume comes out of it). The
// windows are off the centre line (the ships are seen three-quarters on), so
// the camera's dive and the taps go by each ship's window. Their backs, in the
// bonus rounds that fly behind the pilot's ship, are drawn here to match.

export type ShipId = 'classic' | 'explorer' | 'nova';
/** in the hangar's order: the newest last */
export const SHIPS: readonly ShipId[] = ['classic', 'explorer', 'nova'];

/** a window a pilot looks out of: a Porthole without its emoji */
export type ShipWindow = Omit<Porthole, 'emoji'>;

export interface ShipArt {
  /** the drawing (the whole ship, or what goes over its picture), viewBox 200 × 400 */
  svg: string;
  /** a picture under the drawing, and where it goes, as fractions of the frame */
  picture?: { url: string; x: number; y: number; width: number; height: number };
  /** where the pilots look out */
  windows: readonly ShipWindow[];
  /** the ship's own box in the frame (x, y, width, height), for a picture of just the ship */
  bounds: readonly [number, number, number, number];
  /** how far down the frame its engine's nozzle ends (where the plume starts) */
  nozzle: number;
}

const FRAME_W = 200;
const FRAME_H = 400;
const deg = (d: number) => (d * Math.PI) / 180;

/**
 * The Explorer's visor: an oval of glass (it's turned a little towards the
 * left), with the cockpit's seat right of its middle, where the pilot sits.
 */
export const EXPLORER_VISOR: ShipWindow = {
  x: 72.67 / FRAME_W,
  y: 188 / FRAME_H,
  radius: 21.35 / FRAME_W,
  ry: 24.86 / FRAME_W,
  tilt: deg(-8.3),
  seat: { dx: 9.6 / FRAME_W, dy: 3.7 / FRAME_W, size: 1.45 },
  tint: 'rgba(40, 200, 255, 0.22)',
  glare: false,
};

/**
 * Nova's window: round glass in a rose-gold frame, turned a little towards
 * the right, with the seat on its left, facing the cockpit's screens.
 */
export const NOVA_WINDOW: ShipWindow = {
  x: 125.49 / FRAME_W,
  y: 188 / FRAME_H,
  radius: 21.35 / FRAME_W,
  ry: 23.57 / FRAME_W,
  tilt: deg(14.4),
  seat: { dx: -7.7 / FRAME_W, dy: 2.1 / FRAME_W, size: 1.45 },
  tint: 'rgba(40, 225, 210, 0.2)',
  glare: false,
};

/** the ships drawn from their concept art: the cut-out's place in the frame (ship-cutout.py prints them) */
const PICTURED = {
  explorer: { x: 6.02, y: 56.41, width: 187.09, height: 306.62, window: EXPLORER_VISOR, nozzle: 326, bounds: [6, 56, 187, 307], medal: [74, 242] },
  nova: { x: 11.47, y: 46.51, width: 174.21, height: 342, window: NOVA_WINDOW, nozzle: 357.9, bounds: [11, 46, 175, 343], medal: [126, 252] },
} as const;

/** the admiral's medal, under a pictured ship's window */
function medal(x: number, y: number): string {
  return `<path d="M${x - 7} ${y - 1} L${x - 14} ${y + 14} L${x - 5} ${y + 10} Z M${x + 7} ${y - 1} L${x + 14} ${y + 14} L${x + 5} ${y + 10} Z" fill="#c2185b" stroke="#1a2030" stroke-width="2" stroke-linejoin="round"/>
  <circle cx="${x}" cy="${y}" r="10" fill="url(#ship-gold)" stroke="#1a2030" stroke-width="2.6"/>
  <circle cx="${x}" cy="${y}" r="6.5" fill="#24206e"/>
  <polygon points="${starPoints(x, y + 0.5, 4.6)}" fill="#ffcf4a"/>`;
}

/**
 * A ship's front, as the rocket flies: in the level's colour (the classic's
 * nose and band), in the admiral's livery for a Space Admiral (a pictured
 * ship's trim turns gold, and it wears the medal). A crew always flies the
 * classic rocket with its two windows: it's everyone's.
 */
export function shipArt(ship: ShipId, accent: string, crew = false, admiral = false): ShipArt {
  if (crew || ship === 'classic') {
    return { svg: rocketSvg(accent, crew, admiral), windows: crew ? CREW_PORTHOLES : [ROCKET_PORTHOLE], bounds: [14, 13, 172, 337], nozzle: 326 };
  }
  const p = PICTURED[ship];
  return {
    svg: admiral ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 400"><defs>${goldGradient('ship-gold')}</defs>${medal(p.medal[0], p.medal[1])}</svg>` : '',
    picture: {
      url: `./ships/${ship}${admiral ? '-admiral' : ''}.webp`,
      x: p.x / FRAME_W,
      y: p.y / FRAME_H,
      width: p.width / FRAME_W,
      height: p.height / FRAME_H,
    },
    windows: [p.window],
    bounds: p.bounds,
    nozzle: p.nozzle,
  };
}

/** a pictured ship is detailed: it's drawn into a texture twice the classic's size */
export function spriteSize(ship: ShipId, crew = false): [number, number] {
  return ship !== 'classic' && !crew ? [520, 1040] : [260, 520];
}

// ---------- seen from behind ----------

const INK = '#141a2a';
const NAVY = '#2b3552';
const CYAN = '#45f0fa';
const ORANGE = '#f07f2a';
const GOLD = '#ffcf4a';

/**
 * The Explorer from behind (viewBox -50 -50 100 100, like the classic's
 * RearShip): its egg of a hull, the navy nose beyond, the visor's dome on
 * top, the cyan line down its side, the copper bell glowing at the back, and
 * its four legs splayed out, tipped orange (gold, with a gold star on the
 * nose, for a Space Admiral). `id` keeps its gradients apart from another
 * copy's on the same page.
 */
export function explorerRearSvg(admiral = false, id = 'xr'): string {
  const tip = admiral ? GOLD : ORANGE;
  const fin = (s: 1 | -1) => {
    const x = (v: number) => (v * s).toFixed(1);
    return `<path d="M${x(12)} -6 L${x(35)} -31 L${x(40)} -27 L${x(31)} -13 L${x(16)} 3 Z" fill="${NAVY}" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>
    <path d="M${x(35)} -31 L${x(40)} -27 L${x(37.5)} -23.5 L${x(32.5)} -27.5 Z" fill="${tip}"/>
    <path d="M${x(14)} 8 L${x(43)} 29 L${x(46)} 39 L${x(39)} 41 L${x(22)} 27 L${x(12)} 23 Z" fill="url(#${id}-hull)" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/>
    <path d="M${x(14)} 8 L${x(43)} 29 L${x(46)} 39 L${x(41.5)} 34 L${x(16)} 15 Z" fill="${NAVY}"/>
    <path d="M${x(46)} 39 L${x(39)} 41 L${x(38)} 36.5 L${x(44.5)} 34.5 Z" fill="${tip}"/>
    <path d="M${x(27)} 21 L${x(33)} 25.5" stroke="${CYAN}" stroke-width="2" stroke-linecap="round"/>`;
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-50 -50 100 100">
    <defs>
      <linearGradient id="${id}-hull" x1="0" y1="0" x2="1" y2="0.3">
        <stop offset="0" stop-color="#f4f1ea"/><stop offset="0.55" stop-color="#dcd6cc"/><stop offset="1" stop-color="#aaa49c"/>
      </linearGradient>
      <radialGradient id="${id}-navy" cx="0.38" cy="0.25" r="0.85">
        <stop offset="0" stop-color="#617699"/><stop offset="0.55" stop-color="${NAVY}"/><stop offset="1" stop-color="#1b2236"/>
      </radialGradient>
      <radialGradient id="${id}-bell" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stop-color="#fff3d2"/><stop offset="0.35" stop-color="#ffb35a"/><stop offset="0.72" stop-color="#c4652c"/><stop offset="1" stop-color="#55291a"/>
      </radialGradient>
      <radialGradient id="${id}-glass" cx="0.38" cy="0.32" r="0.75">
        <stop offset="0" stop-color="#bff6ff"/><stop offset="0.35" stop-color="#36c6ef"/><stop offset="1" stop-color="#0f3c66"/>
      </radialGradient>
      ${admiral ? goldGradient(`${id}-gold`) : ''}
    </defs>
    ${fin(-1)}${fin(1)}
    <path d="M0 -35 C14 -35 22.5 -14 22.5 6 C22.5 22 13.5 32.5 0 32.5 C-13.5 32.5 -22.5 22 -22.5 6 C-22.5 -14 -14 -35 0 -35 Z" fill="url(#${id}-hull)" stroke="${INK}" stroke-width="3"/>
    <path d="M22.5 5 C22.5 21 14 31.5 3 32.4 C9.5 23 12.6 12 12.8 -1 C16.5 -2.5 20.5 -1 22.5 5 Z" fill="url(#${id}-navy)"/>
    <path d="M12.6 -9 C13.6 6 11.5 19 3.5 30.5" fill="none" stroke="${CYAN}" stroke-width="1.9" stroke-linecap="round"/>
    <path d="M0 -35 C10 -35 16.4 -26 19 -16.5 C10 -19.8 -10 -19.8 -19 -16.5 C-16.4 -26 -10 -35 0 -35 Z" fill="url(#${id}-navy)" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>
    <path d="M-18.4 -15.4 C-9.6 -18.6 9.6 -18.6 18.4 -15.4" fill="none" stroke="${CYAN}" stroke-width="1.9" stroke-linecap="round"/>
    ${admiral ? `<polygon points="${starPoints(0, -26, 5.5)}" fill="url(#${id}-gold)" stroke="${INK}" stroke-width="1.2"/>` : ''}
    <ellipse cx="0" cy="-5" rx="12" ry="9.6" fill="${NAVY}" stroke="${tip}" stroke-width="1.8"/>
    <ellipse cx="0" cy="-5" rx="9" ry="7" fill="url(#${id}-glass)" stroke="#c9ced6" stroke-width="1.4"/>
    <path d="M-4.5 6.6 L4.5 6.6 L3.3 8.8 L-3.3 8.8 Z" fill="${tip}"/>
    <path d="M-14 5 L-16 9 M14 5 L16 9 M-9 12 L9 12" stroke="#8a857e" stroke-width="0.8" stroke-linecap="round"/>
    <circle cx="-15" cy="1" r="0.9" fill="#8a857e"/><circle cx="15" cy="1" r="0.9" fill="#8a857e"/>
    <circle cx="0" cy="20" r="11.5" fill="#2a2a2d" stroke="${INK}" stroke-width="2.4"/>
    <path d="M-10 15 Q0 9 10 15 M-11 21 L-7 21 M7 21 L11 21" stroke="#7d7a76" stroke-width="1.3" fill="none" stroke-linecap="round"/>
    <circle cx="0" cy="20.5" r="8.4" fill="url(#${id}-bell)" stroke="#3a1f14" stroke-width="1.6"/>
    <circle cx="0" cy="20.5" r="3.6" fill="#fff6dc" opacity="0.9"/>
  </svg>`;
}

// Nova's palette, from its concept art
const N_INK = '#3b2f52';
const ROSE = '#e3a28a';
const MINT = '#5ff2dc';
const CREAM = '#f7f0e6';

/**
 * Nova from behind (viewBox -50 -50 100 100): its lilac egg of a hull, the
 * paler nose beyond with a mint ring, a rose-gold collar over a mint line,
 * mint lines down its sides, the window's dome in its rose-gold frame, the
 * rose-gold engine bay glowing at the back, and its four legs curving out,
 * striped cream and mint and tipped rose gold (gold, with a gold star on the
 * nose, for a Space Admiral).
 */
export function novaRearSvg(admiral = false, id = 'nr'): string {
  const rose = admiral ? GOLD : ROSE;
  const roseDark = admiral ? '#d48b12' : '#b97561';
  const leg = (s: 1 | -1) => {
    const x = (v: number) => (v * s).toFixed(1);
    return `<path d="M${x(11)} -8 C${x(20)} -12 ${x(28)} -19 ${x(32)} -30 C${x(35)} -32 ${x(39)} -29 ${x(38)} -25 C${x(34)} -15 ${x(25)} -6 ${x(15)} 1 Z" fill="#a597cf" stroke="${N_INK}" stroke-width="2.2" stroke-linejoin="round"/>
    <path d="M${x(31.6)} -28.6 C${x(34.5)} -32.4 ${x(39.2)} -29.6 ${x(38.2)} -25 C${x(36.4)} -26.6 ${x(34)} -27.8 ${x(31.6)} -28.6 Z" fill="${rose}"/>
    <path d="M${x(15)} -5 C${x(23)} -10 ${x(29)} -17 ${x(33)} -26" fill="none" stroke="${MINT}" stroke-width="1.5" stroke-linecap="round"/>
    <path d="M${x(14)} 6 C${x(27)} 9 ${x(39)} 18 ${x(45)} 33 C${x(46.5)} 37.5 ${x(44)} 41.5 ${x(40)} 40.5 C${x(36)} 31 ${x(26)} 24 ${x(12)} 22 Z" fill="url(#${id}-lav)" stroke="${N_INK}" stroke-width="2.4" stroke-linejoin="round"/>
    <path d="M${x(15)} 10 C${x(27)} 13 ${x(36)} 21 ${x(41.5)} 34" fill="none" stroke="${CREAM}" stroke-width="3.2" stroke-linecap="round"/>
    <path d="M${x(14)} 14.5 C${x(25)} 17.5 ${x(34)} 24.5 ${x(39)} 35.5" fill="none" stroke="${MINT}" stroke-width="1.5" stroke-linecap="round"/>
    <path d="M${x(45)} 33 C${x(46.5)} 37.5 ${x(44)} 41.5 ${x(40)} 40.5 C${x(39.2)} 38.6 ${x(38.4)} 37 ${x(37.6)} 35.6 C${x(40.4)} 35.4 ${x(43)} 34.4 ${x(45)} 33 Z" fill="${rose}" stroke="${N_INK}" stroke-width="1.2" stroke-linejoin="round"/>`;
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-50 -50 100 100">
    <defs>
      <linearGradient id="${id}-lav" x1="0" y1="0" x2="1" y2="0.3">
        <stop offset="0" stop-color="#e2d9f5"/><stop offset="0.55" stop-color="#c3b6e6"/><stop offset="1" stop-color="#998bc6"/>
      </linearGradient>
      <radialGradient id="${id}-nose" cx="0.4" cy="0.3" r="0.8">
        <stop offset="0" stop-color="#f1ecfb"/><stop offset="1" stop-color="#bcaee2"/>
      </radialGradient>
      <radialGradient id="${id}-bell" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stop-color="#fff6e6"/><stop offset="0.35" stop-color="#ffc39e"/><stop offset="0.72" stop-color="${roseDark}"/><stop offset="1" stop-color="#5a3238"/>
      </radialGradient>
      <radialGradient id="${id}-glass" cx="0.38" cy="0.32" r="0.75">
        <stop offset="0" stop-color="#d6fffa"/><stop offset="0.35" stop-color="#3fd9cf"/><stop offset="1" stop-color="#0f5763"/>
      </radialGradient>
      ${admiral ? goldGradient(`${id}-gold`) : ''}
    </defs>
    ${leg(-1)}${leg(1)}
    <path d="M0 -35 C14 -35 22.5 -14 22.5 6 C22.5 22 13.5 32.5 0 32.5 C-13.5 32.5 -22.5 22 -22.5 6 C-22.5 -14 -14 -35 0 -35 Z" fill="url(#${id}-lav)" stroke="${N_INK}" stroke-width="2.8"/>
    <path d="M0 -35 C10 -35 16.6 -25 19.5 -14 C10 -18 -10 -18 -19.5 -14 C-16.6 -25 -10 -35 0 -35 Z" fill="url(#${id}-nose)" stroke="${N_INK}" stroke-width="2.2" stroke-linejoin="round"/>
    <path d="M-6.5 -29 C-3 -30.6 3 -30.6 6.5 -29" fill="none" stroke="${MINT}" stroke-width="1.6" stroke-linecap="round"/>
    ${admiral ? `<polygon points="${starPoints(0, -24, 5.5)}" fill="url(#${id}-gold)" stroke="${N_INK}" stroke-width="1.2"/>` : ''}
    <path d="M-19.5 -14 C-10 -18 10 -18 19.5 -14 L20.6 -10.5 C10 -14.4 -10 -14.4 -20.6 -10.5 Z" fill="${rose}" stroke="${N_INK}" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="M-20.8 -8.6 C-10 -12.4 10 -12.4 20.8 -8.6" fill="none" stroke="${MINT}" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M-16.6 -5 C-18 7 -15.6 18 -9 27.6 M16.6 -5 C18 7 15.6 18 9 27.6" fill="none" stroke="${MINT}" stroke-width="1.4" stroke-linecap="round"/>
    <ellipse cx="0" cy="-5" rx="12" ry="9.6" fill="${rose}" stroke="${N_INK}" stroke-width="1.6"/>
    <ellipse cx="0" cy="-5" rx="9" ry="7" fill="url(#${id}-glass)" stroke="#d9cfee" stroke-width="1.3"/>
    <circle cx="-13.6" cy="-5" r="1.3" fill="${MINT}"/><circle cx="13.6" cy="-5" r="1.3" fill="${MINT}"/>
    <path d="M-4.4 12.6 c-2.4 -1.8 -1.6 -4.6 0.9 -4.2 M4.4 12.6 c2.4 -1.8 1.6 -4.6 -0.9 -4.2" fill="none" stroke="${rose}" stroke-width="0.9" stroke-linecap="round"/>
    <path d="M-15.5 24 C-8 28.5 8 28.5 15.5 24" fill="none" stroke="${rose}" stroke-width="3" stroke-linecap="round"/>
    <circle cx="0" cy="20" r="11.5" fill="#5e4650" stroke="${N_INK}" stroke-width="2.2"/>
    <path d="M-10 15 Q0 9 10 15 M-11 21 L-7 21 M7 21 L11 21" stroke="${rose}" stroke-width="1.4" fill="none" stroke-linecap="round"/>
    <circle cx="0" cy="20.5" r="8.4" fill="url(#${id}-bell)" stroke="#4a2a30" stroke-width="1.6"/>
    <circle cx="0" cy="20.5" r="3.6" fill="#fff8ec" opacity="0.9"/>
  </svg>`;
}

/** a ship from behind, as markup (the classic's is in traffic/trafficArt.ts's rearShipSvg) */
export function rearSvg(ship: Exclude<ShipId, 'classic'>, admiral = false): string {
  return ship === 'nova' ? novaRearSvg(admiral) : explorerRearSvg(admiral);
}

/** where the pilot looks out of their ship from behind, and its engines' glows, as fractions of the drawing */
export const REAR_WINDOWS: Record<ShipId, { x: number; y: number; radius: number }> = {
  classic: { x: 0.5, y: 0.44, radius: 0.13 },
  explorer: { x: 0.5, y: 0.45, radius: 0.09 },
  nova: { x: 0.5, y: 0.45, radius: 0.09 },
};
export const REAR_ENGINES: Record<ShipId, Array<{ x: number; y: number; r: number }>> = {
  classic: [
    { x: 39 / 100, y: 78 / 100, r: 7 / 100 },
    { x: 61 / 100, y: 78 / 100, r: 7 / 100 },
  ],
  explorer: [{ x: 0.5, y: 0.705, r: 0.085 }],
  nova: [{ x: 0.5, y: 0.705, r: 0.085 }],
};
