// Flight speed model. Speed is a 0..~1.3 "how fast does it feel" value that
// drives everything visual in the scene — star streak length, motion blur,
// camera FOV/shake, engine exhaust — so they all move together.
//
// The rocket is always flying (CRUISE), and speeds up as the level's fuel
// fills and as the current correct-answer streak grows. A wrong answer resets
// both (see useGameStore.submitAnswer), so the target drops and the rocket
// visibly brakes. Reaching the destination kicks it into OVERDRIVE for the
// launch/warp transition; the new level then starts again from cruise.

export const CRUISE = 0.12;
const FUEL_SHARE = 0.45;
const STREAK_SHARE = 0.35;
const STREAK_CAP = 10;
export const OVERDRIVE = 1.25;

export function targetSpeed(fuel: number, streak: number, launching: boolean): number {
  if (launching) return OVERDRIVE;
  return (
    CRUISE +
    (Math.min(100, fuel) / 100) * FUEL_SHARE +
    (Math.min(streak, STREAK_CAP) / STREAK_CAP) * STREAK_SHARE
  );
}

// Live values written once per frame by FlightController and read by every
// scene component in its own useFrame. A plain mutable object (not React or
// zustand state) because it changes 60 times a second and must never cause
// a re-render.
export const flight = {
  /** smoothed speed, eased toward targetSpeed() */
  speed: CRUISE,
  /** short-lived extra speed from a correct answer ("nitro" kick) */
  boost: 0,
  /** 1 right after a wrong answer, decays to 0 — drives the braking jolt */
  jolt: 0,
  /** speed + boost: what the visuals should use */
  effective: CRUISE,
  /** 0..1 how close we are to the destination (fuel / 100, or 1 while launching) */
  approach: 0,
  /** reduced-motion users get much less shake and blur */
  motionScale: 1,
};

/** a one-off surge (a meteor blasted, a constellation completed, …) */
export function kick(amount: number) {
  flight.boost = Math.min(1.1, flight.boost + amount);
}

/** a knock: shake the camera/rocket and kill any boost */
export function bump() {
  flight.jolt = 1;
  flight.boost = 0;
}
