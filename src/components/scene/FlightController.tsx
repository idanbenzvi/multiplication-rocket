import { useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { MathUtils, PerspectiveCamera, Vector3 } from 'three';
import { useGameStore } from '../../game/useGameStore';
import { usePause } from '../../game/gameClock';
import { engineHum } from '../../audio/sfx';
import { sidewaysQuery } from '../useMenuDrawer';
import { getLevelConfig } from '../../game/levels';
import {
  cockpitDolly,
  cockpitDollyAt,
  courseRotation,
  cockpitView,
  flight,
  porthole,
  portholeScreen,
  portholeWorld,
  targetSpeed,
} from '../../game/flight';

const CAMERA_POS = new Vector3(0.9, 0.2, 5.0);
const LOOK_AT = new Vector3(0, 0.5, 0);
const BASE_FOV = 50;
const MAX_FOV_KICK = 16;
/** how much the view tightens through a blast-off's build-up (degrees) */
const CHARGE_FOV = 5;
// A phone on its side: the question sits on the right, so the picture slides
// over (by this share of its width) and the rocket flies on the left.
const SIDEWAYS_SHIFT = 0.22;
let sideShift = 0;

// The camera's way toward the window (portholeWorld), flying into the
// cockpit: 0 = the normal view, 1 = through the glass.
/** fully zoomed, the camera is this far from the window (inside the near plane) */
const NEAREST = 0.04;
const zoomTarget = new Vector3();
const zoomEye = new Vector3();
const zoomLook = new Vector3();
const baseEye = new Vector3();
const portholeEdge = new Vector3();
const cameraRight = new Vector3();
let zoomValue = 0;
/** the window's size on screen, last frame, as a log of how much it has grown (for flight.rush) */
let grownBefore = 0;
/** the dive goes through the pilot at the window: they blur away between these zooms (and come back pulling out) */
const PILOT_GONE_FROM = 0.82;
const PILOT_GONE_AT = 0.97;

// The speed follows where it's headed like something with weight: a
// critically damped spring, so a change sets off gently, speeds up, and
// settles without overshooting, rather than jumping (an answer, right or
// wrong, never changes how fast the stars stream all at once). Its rates
// (per second): braking is quicker than speeding up, so a wrong answer is
// still felt soon (half the way down in half a second) rather than a slow
// coast-down; speeding up, half the way in about two thirds of a second.
const ACCEL_RATE = 2.6;
const BRAKE_RATE = 3.4;
// A boost (a right answer's "nitro", a kick) builds up the same way, quickly
// (about half a second), and only once it has does it die away; dropped (a
// wrong answer, a bump), it eases off as quickly.
const BOOST_RATE = 7;
const BOOST_DECAY = 2.2;
/** built up this far toward its goal, a boost starts dying away */
const BOOST_BUILT = 0.85;
const JOLT_DECAY = 3.0;
/** the springs are stepped this finely (s), however long the frame */
const SPRING_STEP = 1 / 120;

/** one step of a critically damped spring: `x` moving at `v`, pulled toward `goal` at `rate` */
function spring(x: number, v: number, goal: number, rate: number, dt: number): [number, number] {
  const nv = v + (rate * rate * (goal - x) - 2 * rate * v) * dt;
  return [x + nv * dt, nv];
}
// A new level's course: the world turns to it like a ship banking, easing in
// and settling without overshoot (a critically damped spring; ~1.5 s).
const TURN_RATE = 3.2;
let courseSet = false;

// The engine heard through the rocket's window (sfx.engineHum): as loud as
// the camera is close to it, for as long as it's close. Tapping the window
// brings it up a step at a time and the dive into it to its fullest, and it
// fades out as the camera pulls back; the Academy or the cockpit opening (the
// game pausing) silences it.
let humLevel = 0;
function humFor(closeness: number) {
  // (a frame can still run just after the game pauses: it mustn't start the hum again)
  const level = closeness < 0.03 || usePause.getState().paused ? 0 : closeness ** 1.6;
  if (level === 0 ? humLevel === 0 : Math.abs(level - humLevel) < 0.02) return;
  humLevel = level;
  engineHum(level, level === 0 ? 0.4 : 0.15);
}

// Owns the flight state (game/flight.ts) and the camera. Everything else in
// the scene only reads `flight`.
export function FlightController() {
  const { camera } = useThree();

  // (the scene stops drawing while paused: the hum stops with it, and picks up again after)
  const paused = usePause((s) => s.paused);
  useEffect(() => {
    if (!paused) return;
    humLevel = 0;
    engineHum(0, 0.3);
  }, [paused]);

  useEffect(() => {
    flight.motionScale = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0.25 : 1;
    camera.position.copy(CAMERA_POS);
    camera.lookAt(LOOK_AT);
  }, [camera]);

  // Answer feedback → one-off impulses. Subscribing (rather than selecting)
  // keeps this out of React renders entirely.
  useEffect(
    () =>
      useGameStore.subscribe((state, prev) => {
        // Diving into a wormhole: a huge surge that carries out the other side.
        if (state.inWormhole && !prev.inWormhole) flight.boostGoal = 1.1;
        if (state.feedback === prev.feedback || state.feedback === null) return;
        if (state.feedback === 'correct') {
          // Faster answers flare bigger (store's flare is 0..1), so they kick harder.
          flight.boostGoal = Math.min(0.6, flight.boostGoal + 0.18 + state.flare * 0.3);
        } else {
          // (the knock is at once; the stars slow down from where they are)
          flight.jolt = 1;
          flight.boostGoal = 0;
        }
      }),
    [],
  );

  useFrame(({ clock, size }, rawDelta) => {
    const dt = Math.min(rawDelta, 0.1); // a tab switch shouldn't teleport the speed
    const { progress, justLaunched } = useGameStore.getState();

    const target = targetSpeed(progress.fuel, progress.currentStreak, justLaunched);
    const rate = target > flight.speed ? ACCEL_RATE : BRAKE_RATE;
    for (let left = dt; left > 1e-6; left -= SPRING_STEP) {
      const step = Math.min(SPRING_STEP, left);
      [flight.speed, flight.speedVel] = spring(flight.speed, flight.speedVel, target, rate, step);
      [flight.boost, flight.boostVel] = spring(flight.boost, flight.boostVel, flight.boostGoal, BOOST_RATE, step);
      if (flight.boost >= flight.boostGoal * BOOST_BUILT) flight.boostGoal *= Math.exp(-BOOST_DECAY * step);
    }
    // (eased out of a boost, nothing's left below zero)
    if (flight.boost < 0) [flight.boost, flight.boostVel] = [0, 0];
    flight.jolt *= Math.exp(-JOLT_DECAY * dt);
    flight.effective = flight.speed + flight.boost;
    flight.approach = justLaunched ? 1 : progress.fuel / 100;

    // The level's course: the turn starts as the new level begins (the launch
    // overlay shows the level being left). With reduced motion there is no
    // turn to watch: the new course is simply there when the overlay closes.
    const calmTurn = flight.motionScale < 1;
    const courseLevel = justLaunched && !calmTurn ? progress.level - 1 : progress.level;
    const course = courseRotation(getLevelConfig(courseLevel).headingDeg);
    if (!courseSet || calmTurn) {
      // (the first frame starts on course rather than turning from straight up)
      flight.heading = course;
      flight.headingVel = 0;
      courseSet = true;
    } else {
      const pull = TURN_RATE * TURN_RATE * (course - flight.heading) - 2 * TURN_RATE * flight.headingVel;
      flight.headingVel += pull * dt;
      flight.heading += flight.headingVel * dt;
    }

    // Camera: FOV widens with speed (the classic racing-game speed cue), plus
    // a high-frequency rumble at speed and a hard knock on a wrong answer.
    const s = Math.min(flight.effective, 1.3);
    const m = flight.motionScale;
    const t = clock.elapsedTime;
    // (a blast-off's build-up rumbles harder and harder, and its ignition knocks)
    const rumble = (s * s * 0.025 + flight.charge * flight.charge * 0.03) * m;
    const knock = (flight.jolt * 0.12 + flight.ignition * 0.1) * m;
    // (out of the cockpit, eased back to the usual view)
    const nowMs = performance.now();
    zoomValue *= Math.exp(-2.5 * dt);
    zoomTarget.set(portholeWorld.x, portholeWorld.y, portholeWorld.z);
    // Opening the settings flies in through the window to the cockpit (and
    // back out): ever closer by the same factor each moment, so the window
    // grows on screen at a steady rate. It overrides the taps' zoom.
    const dolly = cockpitDollyAt(nowMs);
    if (dolly > 0 || cockpitDolly.to > 0) {
      const far = CAMERA_POS.distanceTo(zoomTarget) + NEAREST;
      const d = far * (NEAREST / far) ** dolly;
      zoomValue = Math.max(0, 1 - (d - NEAREST) / (far - NEAREST));
    }
    const calm = 1 - zoomValue; // no rumble with your nose against the glass
    humFor(zoomValue);

    // how fast the window grows on screen (the camera's distance to it shrinking), for the radial blur
    const span = CAMERA_POS.distanceTo(zoomTarget);
    const grown = Math.log((span + NEAREST) / (span * (1 - zoomValue) + NEAREST));
    if (dt > 0) flight.rush += ((grown - grownBefore) / dt - flight.rush) * (1 - Math.exp(-15 * dt));
    grownBefore = grown;
    // the pilot at the window gives way to the cockpit's view as it shows, or to the dive rushing through
    flight.pilot = Math.min(1 - cockpitView.shown, 1 - MathUtils.smoothstep(zoomValue, PILOT_GONE_FROM, PILOT_GONE_AT));

    baseEye.set(
      CAMERA_POS.x + ((Math.sin(t * 47) + Math.sin(t * 31)) * rumble + Math.sin(t * 25) * knock) * calm,
      CAMERA_POS.y + ((Math.sin(t * 53) + Math.cos(t * 37)) * rumble + Math.cos(t * 21) * knock) * calm,
      CAMERA_POS.z,
    );
    if (zoomValue > 0.001) {
      // slide along the line from the window to the usual camera spot; at 1
      // the camera is inside the near plane, so the ship vanishes: "in"
      const dist = baseEye.distanceTo(zoomTarget);
      zoomEye.copy(baseEye).sub(zoomTarget).normalize().multiplyScalar(dist * (1 - zoomValue) + NEAREST).add(zoomTarget);
      camera.position.copy(zoomEye);
      // Same viewing direction (and FOV) as normal: dollying straight along
      // the line to the window keeps the window under the child's finger,
      // so the 2nd and 3rd taps land on it too — it just gets bigger.
      zoomLook.copy(LOOK_AT).sub(baseEye).add(zoomEye);
      camera.lookAt(zoomLook);
    } else {
      camera.position.copy(baseEye);
      camera.lookAt(LOOK_AT);
    }
    if (camera instanceof PerspectiveCamera) {
      const speedFov = BASE_FOV + Math.min(s, 1.1) * MAX_FOV_KICK * (0.5 + 0.5 * m);
      // the view tightens a little as a blast-off builds up (it widens with the speed once it fires)
      const fov = speedFov - CHARGE_FOV * flight.charge * m;
      // the picture slides, not the camera: the rocket keeps its look, just further left
      sideShift += ((sidewaysQuery?.matches ? SIDEWAYS_SHIFT : 0) - sideShift) * (1 - Math.exp(-5 * dt));
      const film = sideShift * camera.getFilmWidth() * camera.aspect * 2 * Math.tan(MathUtils.degToRad(fov) / 2);
      if (Math.abs(camera.fov - fov) > 0.01 || Math.abs(camera.filmOffset - film) > 0.001) {
        camera.fov = fov;
        camera.filmOffset = film;
        camera.updateProjectionMatrix();
      }
    }

    // where the window is on screen, for the cockpit seen through it (Cockpit.tsx)
    camera.updateMatrixWorld();
    cameraRight.setFromMatrixColumn(camera.matrixWorld, 0);
    portholeEdge.copy(zoomTarget).addScaledVector(cameraRight, porthole.radius).project(camera);
    zoomTarget.project(camera);
    portholeScreen.x = size.left + ((zoomTarget.x + 1) / 2) * size.width;
    portholeScreen.y = size.top + ((1 - zoomTarget.y) / 2) * size.height;
    portholeScreen.r = (Math.abs(portholeEdge.x - zoomTarget.x) / 2) * size.width;
  }, -1); // before everything else, so readers see this frame's values

  return null;
}
