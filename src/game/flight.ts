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
  /** smoothed speed, eased toward targetSpeed() (FlightController: gently away, faster, then settling) */
  speed: CRUISE,
  /** how fast `speed` is changing (per second) */
  speedVel: 0,
  /** short-lived extra speed from a correct answer ("nitro" kick), eased toward boostGoal */
  boost: 0,
  /** the extra speed asked for: a kick adds to it, and once `boost` has built up to it, it dies away */
  boostGoal: 0,
  /** how fast `boost` is changing (per second) */
  boostVel: 0,
  /** 1 right after a wrong answer, decays to 0 — drives the braking jolt */
  jolt: 0,
  /** speed + boost: what the visuals should use */
  effective: CRUISE,
  /** 0..1 the build-up of a blast-off: the engine swelling and the ship shaking before it fires (FlyingRocket) */
  charge: 0,
  /** 1 at a blast-off's ignition, fading: the flash, the shockwave, the jolt (FlyingRocket) */
  ignition: 0,
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
  /**
   * How fast the camera is rushing at the ship's window (negative: pulling
   * back from it), as the window's growth on screen: its log-size per second.
   * The scene smears out radially from the window with it (SpeedBlur).
   */
  rush: 0,
  /**
   * 1..0 how much of the pilot shows at the window as the camera goes in
   * through it: 1 sharp, 0 blurred away and faded out, the cockpit's view
   * (or the Academy beyond) in their place (PilotFade).
   */
  pilot: 1,
};

/** a level's heading (degrees from straight up, positive = right) as flight.heading */
export function courseRotation(headingDeg: number): number {
  return (-headingDeg * Math.PI) / 180;
}

/** a one-off surge (a meteor blasted, a constellation completed, …), building up rather than all at once */
export function kick(amount: number) {
  flight.boostGoal = Math.min(1.1, flight.boostGoal + amount);
}

/** a knock: shake the camera/rocket and drop any boost (quickly, not all at once) */
export function bump() {
  flight.jolt = 1;
  flight.boostGoal = 0;
}

// ---- flying off and flying home: leaving the game for a bonus round or a game mode, and back ----

/** a blast-off's build-up (ms): the rocket crouches and shakes, its engine swells and glows, sparks pour into it */
export const CHARGE_MS = 900;
/** then the blast (ms): ignition, and away faster and faster till it's gone */
export const BLAST_MS = 700;
/** how long the rocket takes to fly off (ms) */
export const AWAY_MS = CHARGE_MS + BLAST_MS;
/** it stays gone this long after (by then a round or a mode covers the screen, and flyHome brings it back) */
export const AWAY_HOLD_MS = 2500;
/** how long the rocket takes to fly home (ms) */
export const HOME_MS = 1100;
/** when it set off, and when it set off for home, in game time (FlyingRocket flies it from there) */
export const departure = { at: -Infinity };
export const homecoming = { at: -Infinity };

/**
 * Off to a bonus round that it flies off in, or a game mode: the rocket
 * builds up to it (it crouches and shakes, its engine swells and glows,
 * sparks pour in), then ignites and blasts away up its course into the
 * distance (FlyingRocket). False with reduced motion (it doesn't go anywhere:
 * start at once).
 */
export function flyAway(): boolean {
  if (flight.motionScale < 1) return false;
  departure.at = gameNow();
  homecoming.at = -Infinity;
  return true;
}

/** where a blast-off is, `now` in game time: its build-up and its blast (each 0..1), or null when there isn't one */
export function departurePhase(now: number): { charge: number; blast: number } | null {
  const ms = now - departure.at;
  if (!(ms >= 0 && ms < AWAY_MS + AWAY_HOLD_MS)) return null;
  return { charge: Math.min(1, ms / CHARGE_MS), blast: Math.max(0, Math.min(1, (ms - CHARGE_MS) / BLAST_MS)) };
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

// ---- the porthole: a tap on it flies the camera in, to the cockpit ----

/** the porthole's height above the rocket group's origin (RocketSprite: plane centre 1.1 + porthole offset) */
export const PORTHOLE_Y = 1.17;

/**
 * Where the ship's window is in world space, as of the last frame drawn
 * (FlyingRocket writes it, with the ship's float, lean and wobble): the
 * camera flies in through it.
 */
export const portholeWorld = { x: 0, y: PORTHOLE_Y, z: 0 };

/**
 * The ship's window, in the rocket group's units (RocketSprite writes it for
 * the ship flying): how far off the centre line it is (the Explorer's visor
 * is left of it), and its glass's radius.
 */
export const porthole = { x: 0, radius: (23 / 200) * 1.1 };

// ---- the cockpit: settings open by flying the camera in through the porthole ----

/**
 * The rocket's outline on screen (CSS px) as of the last frame drawn: the
 * four corners of its art, turned with it (FlyingRocket writes them), for
 * what has to keep clear of it (the ship's computer's orb). Empty until drawn.
 */
export const rocketScreen: { quad: Array<{ x: number; y: number }> } = { quad: [] };

/** where the porthole is on screen (CSS px) as of the last frame drawn, and its glass's radius */
export const portholeScreen = { x: 0, y: 0, r: 0 };

/**
 * How far in through the porthole the camera is: 0 = the usual view, 1 =
 * through the glass. It runs from `from` to `to` over `ms` (eased), and the
 * camera's distance to the window shrinks exponentially with it, so the
 * window grows on screen at a steady rate (FlightController).
 */
export const cockpitDolly = { from: 0, to: 0, startedAt: 0, ms: 1 };

/** how much the cockpit's view shows in the window as the camera flies in to it, or back out (Cockpit.tsx writes it) */
export const cockpitView = { shown: 0 };

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
