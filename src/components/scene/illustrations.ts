// Hand-drawn (by hand, in SVG markup — no external art assets or generative
// image tools were available) picture-book style illustrations: thick dark
// outlines, flat color fills, a soft painted highlight. Rasterized to a
// texture by spriteTexture.ts and rendered as a billboarded sprite so the
// hero props read as storybook cutouts rather than 3D-modeled objects.

const INK = '#2b2033';

export function rocketSvg(accent: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 400">
    <path d="M60 255 L18 345 L72 315 Z" fill="#5b4a63" stroke="${INK}" stroke-width="7" stroke-linejoin="round"/>
    <path d="M140 255 L182 345 L128 315 Z" fill="#5b4a63" stroke="${INK}" stroke-width="7" stroke-linejoin="round"/>
    <rect x="70" y="300" width="60" height="26" rx="9" fill="#3a2e38" stroke="${INK}" stroke-width="7"/>
    <path d="M100 18 C150 18 165 118 165 218 L165 300 C165 320 148 330 100 330 C52 330 35 320 35 300 L35 218 C35 118 50 18 100 18 Z"
          fill="#faf3e6" stroke="${INK}" stroke-width="8" stroke-linejoin="round"/>
    <path d="M100 18 C130 18 150 68 158 128 L42 128 C50 68 70 18 100 18 Z" fill="${accent}" stroke="${INK}" stroke-width="8" stroke-linejoin="round"/>
    <rect x="35" y="252" width="130" height="28" fill="${accent}" stroke="${INK}" stroke-width="6"/>
    <circle cx="100" cy="188" r="36" fill="${accent}" stroke="${INK}" stroke-width="8"/>
    <circle cx="100" cy="188" r="23" fill="#bfe6f5" stroke="${INK}" stroke-width="5"/>
    <circle cx="90" cy="178" r="7" fill="#ffffff" opacity="0.85"/>
    <ellipse cx="66" cy="150" rx="11" ry="88" fill="#ffffff" opacity="0.16" transform="rotate(-6 66 150)"/>
  </svg>`;
}

export function towerSvg(accent: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 400">
    <path d="M40 385 L54 40 L66 40 L58 385 Z" fill="#8a7a68" stroke="${INK}" stroke-width="7" stroke-linejoin="round"/>
    <path d="M120 385 L106 40 L94 40 L102 385 Z" fill="#8a7a68" stroke="${INK}" stroke-width="7" stroke-linejoin="round"/>
    <path d="M46 95 L114 335 M114 95 L46 335 M46 175 L114 255 M114 175 L46 255"
          stroke="${INK}" stroke-width="6" fill="none" opacity="0.55"/>
    <rect x="30" y="345" width="100" height="32" fill="#ffd77a" stroke="${INK}" stroke-width="7"/>
    <path d="M32 345 L48 377 M58 345 L74 377 M84 345 L100 377 M110 345 L126 377"
          stroke="${INK}" stroke-width="8"/>
    <rect x="58" y="145" width="72" height="20" rx="5" fill="${accent}" stroke="${INK}" stroke-width="7"/>
    <circle cx="60" cy="32" r="12" fill="${accent}" stroke="${INK}" stroke-width="6"/>
  </svg>`;
}
