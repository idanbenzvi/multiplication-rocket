import { prepareHyperspeed, type HyperspeedOptions } from './reactbits/Hyperspeed';
import { hyperspeedPresets } from './reactbits/HyperSpeedPresets';

// The launch screen's hyperspeed (LaunchOverlay). Module-level so the
// reference is stable: Hyperspeed rebuilds its whole three.js scene whenever
// effectOptions changes identity, and takes over the one built ahead of time
// only for these same options.
const PRESET = hyperspeedPresets.one as unknown as HyperspeedOptions; // preset tuples widen to number[]
export const LAUNCH_WARP: Partial<HyperspeedOptions> = {
  ...PRESET,
  initialBoostMs: 1800,
  colors: {
    ...PRESET.colors,
    background: 0x140e24,
    leftCars: [0xff9d76, 0xffd77a, 0xf2a6c0],
    rightCars: [0xc9a4de, 0x7ec4b0, 0x8fb8d9],
    sticks: 0xffd77a,
  },
};

/**
 * Builds the launch screen's hyperspeed ahead of time, when the browser is
 * idle, while the tank fills: building it and compiling its shaders as the
 * screen opened stalled the game for a moment, just as the level was won.
 */
export function prepareLaunchWarp() {
  const idle = window.requestIdleCallback ?? ((fn: () => void) => window.setTimeout(fn, 200));
  idle(() => prepareHyperspeed(LAUNCH_WARP));
}
