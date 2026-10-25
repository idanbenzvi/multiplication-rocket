import { yawDelta, type Look } from './geometry';

// Where the pilot is looking, live: read and written every frame (by the
// camera, the screens laid on the panorama, the blur), so a plain mutable
// object, not React state. A look heads for its goal on springs (critically
// damped: it sets off at once, slows and settles without overshooting), the
// field of view too, so turning to a screen and zooming into it are one
// glide. A drag moves the look itself, and lets go with a fling; resting the
// mouse at the edge of the screen turns that way; and the head follows the
// mouse a little (sway), so the cockpit never sits quite still. On top of it
// all, the flight's shudders (shake), now and then, as the old cockpit had.

const DEG = Math.PI / 180;

export const LIMITS = {
  /** how far down and up the head turns (radians) */
  pitchMin: -70 * DEG,
  pitchMax: 78 * DEG,
  /** the narrowest field of view (zoomed into a screen) and the widest (looking round) */
  fovMin: 18 * DEG,
  fovMax: 104 * DEG,
};

/** the field of view looking round: 70° tall across a landscape screen; upright, wide enough across to take in the windscreen */
export function baseFov(aspect: number): number {
  if (aspect >= 1.15) return 70 * DEG;
  const across = 66 * DEG;
  return Math.min(100 * DEG, Math.max(74 * DEG, 2 * Math.atan(Math.tan(across / 2) / aspect)));
}

/** straight ahead: a little down, taking in the windscreen and the console under it */
export const HOME: Look = { yaw: 0, pitch: -5 * DEG };

export const view = {
  yaw: HOME.yaw,
  pitch: HOME.pitch,
  fov: 70 * DEG,
  /** where the springs are taking it */
  goal: { yaw: HOME.yaw, pitch: HOME.pitch, fov: 70 * DEG },
  vYaw: 0,
  vPitch: 0,
  vFov: 0,
  /** the springs' stiffness (rad/s): brisk looking round, a touch slower turning to a screen */
  omega: 11,
  /** a drag holds the look itself */
  dragging: false,
  /** after a drag, its fling (rad/s), dying away */
  flingYaw: 0,
  flingPitch: 0,
  /** turning by itself, the mouse resting at an edge (rad/s) */
  panYaw: 0,
  panPitch: 0,
  /** the head following the mouse a little (radians), and where it's going */
  sway: { yaw: 0, pitch: 0 },
  swayGoal: { yaw: 0, pitch: 0 },
  /** the flight's shudder (radians), added to the look */
  shake: { yaw: 0, pitch: 0, roll: 0 },
  /** how fast the view's moving, 0 … 1 (the blur) */
  motion: 0,
  /** how far into a screen, 0 … 1 (its edges blur and darken) */
  zoom: 0,
  /** the zoom's rate (its log-size per second): the radial blur, out from the middle */
  rush: 0,
  /** the field of view looking round, for this screen's shape */
  base: 70 * DEG,
  /** reduced motion: no shudders, no sway, no blur */
  calm: false,
};

/** the look as the camera has it this frame, shudder and sway and all */
export function shownLook(): Look & { roll: number } {
  return {
    yaw: view.yaw + view.sway.yaw + view.shake.yaw,
    pitch: view.pitch + view.sway.pitch + view.shake.pitch,
    roll: view.shake.roll,
  };
}

/** head for a look (and a field of view), on the springs */
export function lookTo(look: Look, fov: number, omega = 11) {
  view.goal.yaw = view.yaw + yawDelta(view.yaw, look.yaw);
  view.goal.pitch = Math.max(LIMITS.pitchMin, Math.min(LIMITS.pitchMax, look.pitch));
  view.goal.fov = Math.max(LIMITS.fovMin, Math.min(LIMITS.fovMax, fov));
  view.omega = omega;
  view.flingYaw = 0;
  view.flingPitch = 0;
  // (with reduced motion, it's there at once: no sweep of the whole view)
  if (view.calm) {
    view.yaw = view.goal.yaw;
    view.pitch = view.goal.pitch;
    view.fov = view.goal.fov;
    view.vYaw = view.vPitch = view.vFov = 0;
  }
}

/** jump straight there (opening) */
export function lookAt(look: Look, fov: number) {
  lookTo(look, fov);
  view.yaw = view.goal.yaw;
  view.pitch = view.goal.pitch;
  view.fov = view.goal.fov;
  view.vYaw = view.vPitch = view.vFov = 0;
}

/** has it got where it's going? */
export function settled(): boolean {
  return (
    Math.abs(yawDelta(view.yaw, view.goal.yaw)) < 0.004 &&
    Math.abs(view.goal.pitch - view.pitch) < 0.004 &&
    Math.abs(view.goal.fov - view.fov) < 0.004
  );
}

// ---- the flight's shudders ----

/** between them (s): the first a little after arriving */
const FIRST_S = [3, 6];
const GAP_S = [6, 14];
/** how long one lasts (s), how big (radians) and how quickly it dies away (s) */
const BUMP_S = 1.1;
const BUMP_RAD = [0.0035, 0.0075];
const DECAY_S = 0.26;
const between = ([a, b]: number[]) => a + Math.random() * (b - a);

interface Bump {
  at: number;
  k: number;
  fx: number;
  fy: number;
  phase: number;
}
const bumps: Bump[] = [];
let nextBump = 0;
/** called with each bump's strength (0 … 1): the rumble, the flicker */
let onBump: ((strength: number) => void) | null = null;

export function startShudders(listener: (strength: number) => void) {
  onBump = listener;
  nextBump = performance.now() + between(FIRST_S) * 1000;
  bumps.length = 0;
}
export function stopShudders() {
  onBump = null;
  bumps.length = 0;
}

/** a shudder now (a bump, or the joystick being grabbed) */
export function shudder(strength = 1, now = performance.now()) {
  bumps.push({ at: now, k: between(BUMP_RAD) * strength, fx: 7 + Math.random() * 5, fy: 9 + Math.random() * 6, phase: Math.random() * Math.PI * 2 });
  onBump?.(strength);
}

function shake(now: number, holding: boolean) {
  if (onBump && now >= nextBump) {
    if (holding || document.hidden) nextBump = now + 1500;
    else {
      shudder(1, now);
      // now and then a second, smaller one hard on its heels
      if (Math.random() < 0.35) window.setTimeout(() => onBump && shudder(0.55), 240 + Math.random() * 240);
      nextBump = now + between(GAP_S) * 1000;
    }
  }
  let yaw = 0;
  let pitch = 0;
  let roll = 0;
  for (let i = bumps.length - 1; i >= 0; i--) {
    const b = bumps[i];
    const t = (now - b.at) / 1000;
    if (t > BUMP_S) {
      bumps.splice(i, 1);
      continue;
    }
    const k = b.k * Math.exp(-t / DECAY_S);
    yaw += k * Math.sin(2 * Math.PI * b.fx * t + b.phase);
    pitch += k * 0.8 * Math.sin(2 * Math.PI * b.fy * t + b.phase * 1.7);
    roll += k * 0.6 * Math.sin(2 * Math.PI * (b.fx * 0.7) * t + b.phase * 0.6);
  }
  // and the engine's hum, always, very faintly
  const s = now / 1000;
  yaw += 0.00035 * Math.sin(s * 31.1) + 0.00025 * Math.sin(s * 47.3);
  pitch += 0.0003 * Math.sin(s * 39.7 + 1.3);
  view.shake.yaw = yaw;
  view.shake.pitch = pitch;
  view.shake.roll = roll;
}

// ---- each frame ----

function spring(x: number, v: number, goal: number, omega: number, dt: number): [number, number] {
  // (critically damped, stepped exactly for this frame's dt)
  const d = x - goal;
  const e = Math.exp(-omega * dt);
  const nx = goal + (d + (v + omega * d) * dt) * e;
  const nv = (v - omega * (v + omega * d) * dt) * e;
  return [nx, nv];
}

/** move the view on by dt seconds */
export function stepView(dt: number, now: number, holding: boolean) {
  const v = view;
  if (!v.dragging) {
    // a fling dying away, and turning at the edge
    v.goal.yaw += (v.flingYaw + v.panYaw) * dt;
    v.goal.pitch = Math.max(LIMITS.pitchMin, Math.min(LIMITS.pitchMax, v.goal.pitch + (v.flingPitch + v.panPitch) * dt));
    const fade = Math.exp(-dt * 3.2);
    v.flingYaw *= fade;
    v.flingPitch *= fade;
    if (Math.abs(v.flingYaw) < 0.002) v.flingYaw = 0;
    if (Math.abs(v.flingPitch) < 0.002) v.flingPitch = 0;
    const fov0 = v.fov;
    [v.yaw, v.vYaw] = spring(v.yaw, v.vYaw, v.yaw + yawDelta(v.yaw, v.goal.yaw), v.omega, dt);
    [v.pitch, v.vPitch] = spring(v.pitch, v.vPitch, v.goal.pitch, v.omega, dt);
    [v.fov, v.vFov] = spring(v.fov, v.vFov, v.goal.fov, v.omega * 0.9, dt);
    v.rush = dt > 0 ? -(Math.log(Math.tan(v.fov / 2)) - Math.log(Math.tan(fov0 / 2))) / dt : 0;
  } else {
    v.rush = 0;
  }
  // (the goal never drifts far round: keep both within a turn of each other)
  if (Math.abs(v.yaw) > Math.PI * 4) {
    const k = Math.round(v.yaw / (Math.PI * 2)) * Math.PI * 2;
    v.yaw -= k;
    v.goal.yaw -= k;
  }
  if (!v.calm) {
    const s = 1 - Math.exp(-dt * 3);
    v.sway.yaw += (v.swayGoal.yaw - v.sway.yaw) * s;
    v.sway.pitch += (v.swayGoal.pitch - v.sway.pitch) * s;
    shake(now, holding);
  } else {
    v.sway.yaw = v.sway.pitch = 0;
    v.shake.yaw = v.shake.pitch = v.shake.roll = 0;
  }
  const turning = Math.hypot(v.vYaw, v.vPitch) + Math.hypot(v.flingYaw, v.flingPitch) * 0.6;
  const target = v.calm ? 0 : Math.min(1, turning * 0.32 + Math.abs(v.rush) * 0.5);
  v.motion += (target - v.motion) * (1 - Math.exp(-dt * 14));
  // how far into a screen: how much narrower than looking round
  const z = Math.max(0, Math.min(1, (v.base - v.fov) / (v.base * 0.55)));
  v.zoom = v.calm ? 0 : z;
}

// (in development, the live view for the browser's console and the tests)
if (import.meta.env.DEV) (window as unknown as { __ck3view: typeof view }).__ck3view = view;
