import { gameNow } from './gameClock';

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
  /**
   * The level's course, as a turn of the whole moving world (the rocket, the
   * streaks, the stars, the sky) around the screen: radians, counter-clockwise
   * (three.js rotation.z). Eased toward the level's heading when it changes.
   */
  heading: 0,
  /** how fast the heading is turning (radians / second), for the eased turn */
  headingVel: 0,
};

/** a level's heading (degrees from straight up, positive = right) as flight.heading */
export function courseRotation(headingDeg: number): number {
  return (-headingDeg * Math.PI) / 180;
}

/** a one-off surge (a meteor blasted, a constellation completed, …) */
export function kick(amount: number) {
  flight.boost = Math.min(1.1, flight.boost + amount);
}

/** a knock: shake the camera/rocket and kill any boost */
export function bump() {
  flight.jolt = 1;
  flight.boost = 0;
}

// ---- flying off and flying home: leaving the game for a bonus round or a game mode, and back ----

/** how long the rocket takes to fly off (ms) */
export const AWAY_MS = 750;
/** it stays gone this long after (by then a round or a mode covers the screen, and flyHome brings it back) */
export const AWAY_HOLD_MS = 2500;
/** how long the rocket takes to fly home (ms) */
export const HOME_MS = 1100;
/** when it set off, and when it set off for home, in game time (FlyingRocket flies it from there) */
export const departure = { at: -Infinity };
export const homecoming = { at: -Infinity };

/**
 * Off to a bonus round that it flies off in, or a game mode: the rocket pulls
 * back for a beat, engines flaring, then blasts away up its course into the
 * distance. False with reduced motion (it doesn't go anywhere: start at once).
 */
export function flyAway(): boolean {
  if (flight.motionScale < 1) return false;
  departure.at = gameNow();
  homecoming.at = -Infinity;
  kick(1.1);
  return true;
}

/**
 * Back from a bonus round it left in (or a game mode, or the splash): the
 * rocket flies in from just behind the camera to its place, engines blazing,
 * and brakes into it. Not with reduced motion: it's simply there.
 */
export function flyHome() {
  if (flight.motionScale < 1) return;
  departure.at = -Infinity;
  homecoming.at = gameNow();
  kick(1.1);
}

// ---- tapping the porthole: the camera zooms in a step per tap ----

/** the porthole's height above the rocket group's origin (RocketSprite: plane centre 1.1 + porthole offset) */
export const PORTHOLE_Y = 1.17;

/** the porthole is PORTHOLE_Y above this point this frame, in world space (FlyingRocket writes it) */
export const rocketWorld = { x: 0, y: 0 };

/** tap stage 0-3; diveAt = performance.now() when the third tap started the dive */
export const portholeZoom = { level: 0, lastTap: 0, diveAt: 0 };
/** without another tap within this, the zoom eases back out */
export const ZOOM_RESET_MS = 1400;
/** the final rush into the window, before the Academy opens */
export const DIVE_MS = 950;

// ---- the cockpit: settings open by flying the camera in through the porthole ----

/** the porthole's glass, in world units (RocketSprite: ROCKET_PORTHOLE.radius × WIDTH) */
export const PORTHOLE_RADIUS = (23 / 200) * 1.1;

/** where the porthole is on screen (CSS px) as of the last frame drawn, and its glass's radius */
export const portholeScreen = { x: 0, y: 0, r: 0 };

/**
 * How far in through the porthole the camera is: 0 = the usual view, 1 =
 * through the glass. It runs from `from` to `to` over `ms` (eased), and the
 * camera's distance to the window shrinks exponentially with it, so the
 * window grows on screen at a steady rate (FlightController).
 */
export const cockpitDolly = { from: 0, to: 0, startedAt: 0, ms: 1 };

export function cockpitDollyAt(now: number): number {
  const d = cockpitDolly;
  const k = Math.min(1, Math.max(0, (now - d.startedAt) / d.ms));
  const eased = k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2;
  return d.from + (d.to - d.from) * eased;
}

/** fly in (to 1) or back out (to 0), from wherever the camera is now */
export function moveCockpitDolly(to: number, ms: number) {
  const now = performance.now();
  cockpitDolly.from = cockpitDollyAt(now);
  cockpitDolly.to = to;
  cockpitDolly.startedAt = now;
  cockpitDolly.ms = ms;
}
