// The flight outside the cockpit's glass, as the HUD and the space out there
// both see it (Space.tsx, WindscreenHud.tsx): where the ship's nose points,
// how big the destination looks from here, and the drive's surges.

const DEG = Math.PI / 180;

/** the ship's nose: straight ahead, a little up (the windscreen's middle) */
export const NOSE_PITCH = 10 * DEG;

/** the drive's surge, 0 … 1: now and then it kicks in a moment (Space.tsx's Surges) */
export const surge = { k: 0, goal: 0, until: 0, next: 0 };

/** how big the destination looks (its radius, radians): as near as the tank (0 … 1) says */
export function planetAngle(approach: number): number {
  const a = Math.max(0, Math.min(1, approach));
  const eased = a * a * (3 - 2 * a);
  return (2.2 + 6.5 * eased) * DEG;
}
