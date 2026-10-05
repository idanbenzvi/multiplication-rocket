// Pastel storybook palette (Wayfinder-inspired: hand-illustrated, muted,
// natural — not saturated neon) used for the rocket's per-level accent color.
const PALETTE = ['#ff9d76', '#7ec4b0', '#c9a4de', '#ffd77a', '#f2a6c0', '#8fb8d9', '#a9c98f'];

export function colorForLevel(level: number): string {
  return PALETTE[(level - 1) % PALETTE.length];
}

export interface SkyTheme {
  top: string;
  bottom: string;
  fog: string;
}

// A different dusk sky for each launch-to-launch passage, so the world looks
// visibly new every time the player sets off again rather than replaying the
// same backdrop. Each trio is a deliberately paired top/horizon/fog set.
const SKY_THEMES: SkyTheme[] = [
  { top: '#241b3f', bottom: '#ffb37a', fog: '#5c4a7a' }, // twilight indigo -> coral
  { top: '#2a1f4d', bottom: '#ff8fa3', fog: '#5c3d5e' }, // deep violet -> rose
  { top: '#1c2b4a', bottom: '#ffd77a', fog: '#4a5a72' }, // midnight blue -> gold
  { top: '#3a2350', bottom: '#7ec4b0', fog: '#4a6a68' }, // plum -> seafoam dawn
  { top: '#1a1a3d', bottom: '#c9a4de', fog: '#4a4570' }, // navy -> lavender
  { top: '#2f1b3d', bottom: '#f2a6c0', fog: '#5c3d52' }, // aubergine -> pink
  { top: '#132436', bottom: '#8fb8d9', fog: '#3d5266' }, // deep teal -> sky blue
];

export function skyForLevel(level: number): SkyTheme {
  return SKY_THEMES[(level - 1) % SKY_THEMES.length];
}
