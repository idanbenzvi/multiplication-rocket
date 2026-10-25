import { length, screenQuad, type Quad, type UV } from './geometry';

// What's where in the cockpit's panorama (public/cockpit/nasa-punk-360.webp,
// made from the art by scripts/cockpit-360.py, which measured these): its
// seven screens, which the game's own screens go on, the parts of it that do
// something when touched (the joystick, the panel overhead, the remote on the
// floor), and its little lit buttons, which blink.
//
// Round the pilot from the left: the 2 × 2 bank of screens on the left wall
// (the pilot, their badges, the sound, the ship's systems), the windscreen
// straight ahead with its HUD and the console screen under it (the practice
// map), and the tall screen on the right wall (the game modes).

export type ScreenId = 'pilot' | 'badges' | 'sound' | 'systems' | 'map' | 'modes';
/** where the view can be turned to: a screen, or straight ahead out of the windscreen */
export type Stop = ScreenId | 'ahead';
export type HotspotId = 'stick' | 'overhead' | 'remote';

export interface ScreenSpot {
  id: ScreenId;
  /** its corners in the panorama (u, v), clockwise from the top left */
  corners: [UV, UV, UV, UV];
  /** the colour of its light, falling on the cockpit round it */
  glow: string;
  /** how wide its page is (CSS px), laid out flat as it's drawn on the screen (its height follows the screen's shape) */
  width: number;
  icon: string;
}

export const SCREENS: ScreenSpot[] = [
  {
    id: 'pilot',
    corners: [[0.1968, 0.3931], [0.2637, 0.3903], [0.2624, 0.4701], [0.1999, 0.4729]],
    glow: '#ffb05c',
    width: 460,
    icon: '🧑‍🚀',
  },
  {
    id: 'badges',
    corners: [[0.274, 0.391], [0.3372, 0.4], [0.3324, 0.4736], [0.2716, 0.4701]],
    glow: '#ffd36b',
    width: 460,
    icon: '🏅',
  },
  {
    id: 'sound',
    corners: [[0.1999, 0.4889], [0.2624, 0.4861], [0.263, 0.5646], [0.2009, 0.5667]],
    glow: '#5cf2ff',
    width: 460,
    icon: '🎵',
  },
  {
    id: 'systems',
    corners: [[0.272, 0.4854], [0.3321, 0.4882], [0.3314, 0.5611], [0.2716, 0.5646]],
    glow: '#7dffb0',
    width: 460,
    icon: '⚙️',
  },
  {
    id: 'map',
    corners: [[0.4605, 0.5278], [0.5395, 0.5278], [0.5436, 0.6278], [0.4557, 0.6278]],
    glow: '#5cffc8',
    width: 560,
    icon: '🗺️',
  },
  {
    id: 'modes',
    corners: [[0.7404, 0.3715], [0.7984, 0.3715], [0.7981, 0.5819], [0.74, 0.5813]],
    glow: '#ff6ad5',
    width: 340,
    icon: '🎮',
  },
];

export const SCREEN_BY_ID = Object.fromEntries(SCREENS.map((s) => [s.id, s])) as Record<ScreenId, ScreenSpot>;

/** each screen's glass, a thousand px from the seat (CSS 3D works in px, and likes things at a distance) */
export const QUADS = Object.fromEntries(SCREENS.map((s) => [s.id, screenQuad(s.corners, 1000)])) as Record<ScreenId, Quad>;

/** a page `width` px wide for a quad, as tall as the quad's shape makes it (so nothing on it is squashed) */
export function pageSize(quad: Quad, width: number): [number, number] {
  return [width, Math.round((width * length(quad.down)) / length(quad.across))];
}

/** the windscreen: the HUD's glass, drawn on it (a little inside its frame) */
export const WINDSCREEN: [UV, UV, UV, UV] = [
  [0.405, 0.378],
  [0.595, 0.378],
  [0.595, 0.512],
  [0.405, 0.512],
];
export const WINDSCREEN_QUAD = screenQuad(WINDSCREEN, 1000);
export const WINDSCREEN_PX = pageSize(WINDSCREEN_QUAD, 1280);

/** the parts that do something when touched: their corners, as the screens' */
export interface Hotspot {
  id: HotspotId;
  corners: [UV, UV, UV, UV];
  icon: string;
}

export const HOTSPOTS: Hotspot[] = [
  // the joystick: grab it to fly on (back to the flight)
  { id: 'stick', corners: [[0.4835, 0.632], [0.5165, 0.632], [0.519, 0.765], [0.481, 0.765]], icon: '🕹️' },
  // the panel overhead, at the top of the windscreen: what the game is (About)
  { id: 'overhead', corners: [[0.469, 0.333], [0.531, 0.333], [0.531, 0.362], [0.469, 0.362]], icon: 'ℹ️' },
  // the remote on the floor by the left seat: for grown-ups (the parents' dashboard)
  { id: 'remote', corners: [[0.31, 0.852], [0.392, 0.852], [0.392, 0.93], [0.31, 0.93]], icon: '👪' },
];

export const HOTSPOT_QUADS = Object.fromEntries(HOTSPOTS.map((h) => [h.id, screenQuad(h.corners, 1000)])) as Record<HotspotId, Quad>;

/**
 * Where the arrows (and ← →) turn the view next, in the order a head
 * turning to the right comes to them: ahead, the modes on the right wall,
 * round behind to the bank on the left wall (down each column), then the
 * console's map, and ahead again.
 */
export const STOPS: Stop[] = ['ahead', 'modes', 'pilot', 'sound', 'badges', 'systems', 'map'];

/** the bank of four on the left wall, as one: from the pilot's top left to the systems' bottom right */
export const BANK_QUAD = screenQuad(
  [SCREENS[0].corners[0], SCREENS[1].corners[1], SCREENS[3].corners[2], SCREENS[2].corners[3]],
  1000,
);

/** the little lit buttons (u, v, their size, a share of the picture's width, and their colour), blinking each in its own time */
export const LEDS: Array<{ at: UV; size: number; color: string }> = [
  // the panel overhead: its orange switch, a knob, a toggle
  { at: [0.4758, 0.354], size: 0.0035, color: '#ff7a1a' },
  { at: [0.509, 0.341], size: 0.0022, color: '#5cf2ff' },
  { at: [0.5245, 0.354], size: 0.0025, color: '#7dffb0' },
  // on the dashboard, by the left stick
  { at: [0.3201, 0.6113], size: 0.0035, color: '#ff7a1a' },
  // the console: four by the stick, the button on its top, three to the right
  { at: [0.4616, 0.6756], size: 0.0034, color: '#ff8a1e' },
  { at: [0.4676, 0.6769], size: 0.0034, color: '#ff8a1e' },
  { at: [0.4606, 0.6889], size: 0.0034, color: '#ff8a1e' },
  { at: [0.4665, 0.69], size: 0.0034, color: '#ff8a1e' },
  { at: [0.4985, 0.6408], size: 0.0026, color: '#ff3d3d' },
  { at: [0.5371, 0.6686], size: 0.003, color: '#ff8a1e' },
  { at: [0.5474, 0.7259], size: 0.004, color: '#ff8a1e' },
  { at: [0.5487, 0.7512], size: 0.004, color: '#ff8a1e' },
  // on the dashboard, by the right stick
  { at: [0.7441, 0.6407], size: 0.003, color: '#ff7a1a' },
  // the remote's two red buttons
  { at: [0.3519, 0.8786], size: 0.005, color: '#ff3d3d' },
  { at: [0.3672, 0.8735], size: 0.008, color: '#ff2a2a' },
];
