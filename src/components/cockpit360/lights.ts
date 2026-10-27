import type { Vec3 } from './geometry';
import type { ScreenId } from './screens';

// The light in the cockpit, live (Shell.tsx lights its walls with it): how
// bright each screen's glow is (brighter hovered, brightest zoomed into),
// the windscreen's HUD, the hotspot under the hand, something passing by
// outside (Space.tsx), and the flicker of a shudder (view.ts).

export const glowLights = {
  /** the cockpit's own light, a little under the art's full brightness so the glows show */
  ambient: 0.9,
  /** its colour (the Canyon Run's: warm in the sun, cool in the rock's shadow) */
  tint: [1, 1, 1] as [number, number, number],
  /** a shudder's flicker, 1 at its start, dying away */
  flicker: 0,
  /** the windscreen's HUD: brighter the faster the ship goes */
  hud: 0,
  /** each screen's glow, 0 … 1 */
  screens: { pilot: 0, badges: 0, sound: 0, systems: 0, map: 0, modes: 0 } as Record<ScreenId, number>,
  /** the hotspot under the hand: where, its colour, how much */
  hot: null as null | { dir: Vec3; color: string; k: number },
  /** something passing by outside: where it is, its colour, how bright (0 when there's nothing) */
  passing: { dir: [0, 1, 0] as Vec3, color: '#ffe2a0', k: 0 },
};
