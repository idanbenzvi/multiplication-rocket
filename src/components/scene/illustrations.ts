// Hand-drawn (by hand, in SVG markup — no external art assets or generative
// image tools were available) picture-book style illustrations: thick dark
// outlines, flat color fills, a soft painted highlight. Rasterized to a
// texture by spriteTexture.ts and rendered as a billboarded sprite so the
// hero props read as storybook cutouts rather than 3D-modeled objects.

const INK = '#2b2033';

// The rocket's porthole glass in the artwork below (viewBox 200×400:
// circle cx=100 cy=188 r=23), as fractions — where the pilot's avatar goes.
export const ROCKET_PORTHOLE = { x: 100 / 200, y: 188 / 400, radius: 23 / 200 };

// Flying together, the rocket has two smaller windows, one above the other
// (cy=160 and cy=219, glass r=17): a pilot looks out of each.
export const CREW_PORTHOLES = [
  { x: 100 / 200, y: 160 / 400, radius: 17 / 200 },
  { x: 100 / 200, y: 219 / 400, radius: 17 / 200 },
] as const;

/** a round window: a rim in the accent color, the glass, and a glint */
function windowSvg(accent: string, cy: number, glass: number, rim: number, stroke: number): string {
  return `<circle cx="100" cy="${cy}" r="${rim}" fill="${accent}" stroke="${INK}" stroke-width="${stroke}"/>
    <circle cx="100" cy="${cy}" r="${glass}" fill="#bfe6f5" stroke="${INK}" stroke-width="${Math.round(stroke * 0.6)}"/>
    <circle cx="${100 - glass * (10 / 23)}" cy="${cy - glass * (10 / 23)}" r="${glass * (7 / 23)}" fill="#ffffff" opacity="0.85"/>`;
}

/** a five-pointed star's points, centred on (cx, cy) */
export function starPoints(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    pts.push(`${(cx + Math.cos(a) * rr).toFixed(1)},${(cy + Math.sin(a) * rr).toFixed(1)}`);
  }
  return pts.join(' ');
}

/** the admiral's gold: a gradient's stops (offset, colour) */
export const GOLD_STOPS = [
  ['0', '#fff3c4'],
  ['0.45', '#ffcf4a'],
  ['1', '#d48b12'],
] as const;

/** the admiral's gold, as an SVG gradient (`id`) */
export function goldGradient(id: string): string {
  return `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
      ${GOLD_STOPS.map(([offset, c]) => `<stop offset="${offset}" stop-color="${c}"/>`).join('')}
    </linearGradient>`;
}

const GOLD_RIM = '#ffcf4a';
const NAVY = '#24206e';

/**
 * The rocket, with one window, or with two for a crew. A Space Admiral's
 * (`admiral`: they've cured the Black Sun) wears the admiral's livery
 * instead of the level's colour: a gold nose cone with a navy star, gold
 * fins and window rim, gold pinstripes down the hull, a navy band with five
 * gold stars, and the admiral's medal under the window.
 */
export function rocketSvg(accent: string, crew = false, admiral = false): string {
  const rim = admiral ? GOLD_RIM : accent;
  const windows = crew
    ? CREW_PORTHOLES.map((w) => windowSvg(rim, w.y * 400, w.radius * 200, 25, 7)).join('')
    : windowSvg(rim, 188, 23, 36, 8);
  const fin = admiral ? 'url(#rocket-gold)' : '#5b4a63';
  const cone = admiral ? 'url(#rocket-gold)' : accent;
  const band = admiral ? NAVY : accent;
  const livery = admiral
    ? `<path d="M52 140 C47 185 46 225 47 252 M148 140 C153 185 154 225 153 252" fill="none" stroke="#e0a526" stroke-width="3.5" stroke-linecap="round"/>
    <polygon points="${starPoints(100, 88, 16)}" fill="${NAVY}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
    ${[56, 78, 100, 122, 144].map((x) => `<polygon points="${starPoints(x, 266, 7)}" fill="${GOLD_RIM}" stroke="#8a5a08" stroke-width="1.2"/>`).join('')}
    ${
      crew
        ? ''
        : `<path d="M93 236 L86 251 L95 247 Z M107 236 L114 251 L105 247 Z" fill="#c2185b" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>
    <circle cx="100" cy="237" r="10" fill="url(#rocket-gold)" stroke="${INK}" stroke-width="3"/>
    <circle cx="100" cy="237" r="6.5" fill="${NAVY}"/>
    <polygon points="${starPoints(100, 237.5, 4.6)}" fill="${GOLD_RIM}"/>`
    }`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 400">
    ${admiral ? `<defs>${goldGradient('rocket-gold')}</defs>` : ''}
    <path d="M60 255 L18 345 L72 315 Z" fill="${fin}" stroke="${INK}" stroke-width="7" stroke-linejoin="round"/>
    <path d="M140 255 L182 345 L128 315 Z" fill="${fin}" stroke="${INK}" stroke-width="7" stroke-linejoin="round"/>
    <rect x="70" y="300" width="60" height="26" rx="9" fill="#3a2e38" stroke="${INK}" stroke-width="7"/>
    <path d="M100 18 C150 18 165 118 165 218 L165 300 C165 320 148 330 100 330 C52 330 35 320 35 300 L35 218 C35 118 50 18 100 18 Z"
          fill="#faf3e6" stroke="${INK}" stroke-width="8" stroke-linejoin="round"/>
    <path d="M100 18 C130 18 150 68 158 128 L42 128 C50 68 70 18 100 18 Z" fill="${cone}" stroke="${INK}" stroke-width="8" stroke-linejoin="round"/>
    <rect x="35" y="252" width="130" height="28" fill="${band}" stroke="${INK}" stroke-width="6"/>
    ${windows}
    ${livery}
    <ellipse cx="66" cy="150" rx="11" ry="88" fill="#ffffff" opacity="0.16" transform="rotate(-6 66 150)"/>
  </svg>`;
}
