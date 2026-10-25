import { CRUISE, flight } from '../../game/flight';

// The flight outside the cockpit's glass, as the HUD and the space out there
// both see it (Space.tsx, WindscreenHud.tsx): where the ship's nose points,
// how big the destination looks from here, and how fast the ship is going.
// The speed is one for all of them, the stars streaming past, the numbers
// floating by and the HUD's readout: the flight's own as the game paused for
// the cockpit (the pilot's tank and their streak, game/flight.ts), with the
// boost of a right answer just given dying away as it would have outside,
// wavering a little as an engine's hum does, and knocked back a touch by a
// bump. Nothing else moves it, so the HUD's speed hovers where the stars say.

const DEG = Math.PI / 180;

/** the ship's nose: straight ahead, a little up (the windscreen's middle) */
export const NOSE_PITCH = 10 * DEG;

/** the ship's speed now (0 … 1.3, as flight.effective), what's left of a right answer's boost, how hard the last bump knocked it (0 … 1), and how far it's come since the cockpit opened (the HUD's km) */
export const drive = { k: CRUISE, boost: 0, knock: 0, km: 0 };

/** the cockpit opening: the flight as it is, nothing flown yet */
export function startDrive() {
  drive.boost = flight.boost;
  drive.knock = 0;
  drive.km = 0;
}

/** how much faster than the speed the HUD's range counts down (so a minute's flying shows) */
export const COUNTDOWN = 6;

/** the HUD's readout of a speed (km/s, made up) */
export function hudSpeed(k: number): number {
  return 7.8 + k * 46;
}

/** a frame of the drive: the flight's speed, its waver (a couple of percent, never quite repeating) and a bump's knock dying away */
export function stepDrive(t: number, dt: number) {
  const waver = 0.012 * Math.sin(t * 0.83) + 0.008 * Math.sin(t * 2.17 + 1.3) + 0.004 * Math.sin(t * 5.9 + 2.1);
  // (a boost halves in about a second, as the flight's does)
  drive.boost *= Math.exp(-dt * 0.8);
  drive.knock *= Math.exp(-dt * 1.5);
  drive.k = Math.min(1.3, flight.speed + drive.boost) * (1 + waver - 0.06 * drive.knock);
  drive.km += hudSpeed(drive.k) * COUNTDOWN * dt;
}

/** how big the destination looks (its radius, radians): as near as the tank (0 … 1) says */
export function planetAngle(approach: number): number {
  const a = Math.max(0, Math.min(1, approach));
  const eased = a * a * (3 - 2 * a);
  return (2.2 + 6.5 * eased) * DEG;
}

// (in development, the live drive for the browser's console and the tests)
if (import.meta.env.DEV) (window as unknown as { __ck3drive: typeof drive }).__ck3drive = drive;
