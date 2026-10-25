// How each destination looks (the same order as the destinations in
// levels.ts): the planet in the sky (DestinationPlanet.tsx) and the one ahead
// through the cockpit's windscreen (cockpit360/Space.tsx).

export interface Look {
  base: string;
  band: string;
  glow: string;
  bands: number; // 0 = smooth, otherwise stripe frequency (gas giants)
  ring?: string;
  /** shines by its own light: no shadow side, and a corona around it */
  sun?: boolean;
}

// Same order as the destinations in levels.ts. Stylized, not literal — the
// space station and galaxy get planet-like stand-ins in their colors.
export const LOOKS: Look[] = [
  { base: '#e8e2d0', band: '#b9b2a0', glow: '#fff6e0', bands: 0 }, // Moon
  { base: '#e8c97a', band: '#c9a24e', glow: '#fff0b8', bands: 3 }, // Venus
  { base: '#9a948c', band: '#6e6a64', glow: '#d8d2c8', bands: 0 }, // Mercury
  { base: '#ffcf4a', band: '#ff9d2a', glow: '#fff2a0', bands: 7, sun: true }, // the Sun
  { base: '#e0603a', band: '#a8402a', glow: '#ff9d76', bands: 0 }, // Mars
  { base: '#a08c7a', band: '#6e5f52', glow: '#d8c4b0', bands: 0 }, // Asteroid belt
  { base: '#e3a05f', band: '#b86d3c', glow: '#ffd29a', bands: 9 }, // Jupiter
  { base: '#e8cf8a', band: '#c4a65e', glow: '#fff0c0', bands: 6, ring: '#f2dfa8' }, // Saturn
  { base: '#9fe0e6', band: '#78c4cc', glow: '#d8fbff', bands: 3 }, // Uranus
  { base: '#4a78e0', band: '#3156a8', glow: '#8fb8ff', bands: 4 }, // Neptune
  { base: '#e8d6c0', band: '#b89a80', glow: '#fff0e0', bands: 0 }, // Pluto
  { base: '#bfe8ff', band: '#8fc8ec', glow: '#ffffff', bands: 0 }, // Comet
  { base: '#c0c4d0', band: '#8a90a0', glow: '#e8f0ff', bands: 12, ring: '#9aa4b8' }, // Space station
  { base: '#8fe07a', band: '#5ab04a', glow: '#d0ffb0', bands: 5 }, // Alien planet
  { base: '#c9a4de', band: '#8f6ab8', glow: '#ffd0ff', bands: 2, ring: '#f2a6c0' }, // Galaxy
  { base: '#3c8ae0', band: '#4caf6a', glow: '#bfe4ff', bands: 0 }, // Earth: blue seas, green land
];
