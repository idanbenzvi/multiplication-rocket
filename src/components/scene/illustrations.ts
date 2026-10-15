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

/** the rocket, with one window, or with two for a crew */
export function rocketSvg(accent: string, crew = false): string {
  const windows = crew
    ? CREW_PORTHOLES.map((w) => windowSvg(accent, w.y * 400, w.radius * 200, 25, 7)).join('')
    : windowSvg(accent, 188, 23, 36, 8);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 400">
    <path d="M60 255 L18 345 L72 315 Z" fill="#5b4a63" stroke="${INK}" stroke-width="7" stroke-linejoin="round"/>
    <path d="M140 255 L182 345 L128 315 Z" fill="#5b4a63" stroke="${INK}" stroke-width="7" stroke-linejoin="round"/>
    <rect x="70" y="300" width="60" height="26" rx="9" fill="#3a2e38" stroke="${INK}" stroke-width="7"/>
    <path d="M100 18 C150 18 165 118 165 218 L165 300 C165 320 148 330 100 330 C52 330 35 320 35 300 L35 218 C35 118 50 18 100 18 Z"
          fill="#faf3e6" stroke="${INK}" stroke-width="8" stroke-linejoin="round"/>
    <path d="M100 18 C130 18 150 68 158 128 L42 128 C50 68 70 18 100 18 Z" fill="${accent}" stroke="${INK}" stroke-width="8" stroke-linejoin="round"/>
    <rect x="35" y="252" width="130" height="28" fill="${accent}" stroke="${INK}" stroke-width="6"/>
    ${windows}
    <ellipse cx="66" cy="150" rx="11" ry="88" fill="#ffffff" opacity="0.16" transform="rotate(-6 66 150)"/>
  </svg>`;
}
