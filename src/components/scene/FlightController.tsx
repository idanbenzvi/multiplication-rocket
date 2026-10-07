import { useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { PerspectiveCamera, Vector3 } from 'three';
import { useGameStore } from '../../game/useGameStore';
import { DIVE_MS, flight, portholeZoom, rocketWorld, targetSpeed, ZOOM_RESET_MS } from '../../game/flight';

const CAMERA_POS = new Vector3(0.9, 0.2, 5.0);
const LOOK_AT = new Vector3(0, 0.5, 0);
const BASE_FOV = 50;
const MAX_FOV_KICK = 16;

// Porthole zoom: how far toward the window each tap stage takes the camera
// (0 = normal view, 1 = through the glass). The window sits 1.17 above the
// rocket group's origin (RocketSprite: plane centre 1.1 + porthole offset).
const ZOOM_STAGES = [0, 0.38, 0.64, 0.8];
const PORTHOLE_Y = 1.17;
const zoomTarget = new Vector3();
const zoomEye = new Vector3();
const zoomLook = new Vector3();
const baseEye = new Vector3();
let zoomValue = 0;

// Easing rates (per second). Braking is deliberately quicker than speeding
// up, so a wrong answer is felt immediately instead of a slow coast-down.
const ACCEL_RATE = 1.4;
const BRAKE_RATE = 3.2;
const BOOST_DECAY = 2.2;
const JOLT_DECAY = 3.0;

// Owns the flight state (game/flight.ts) and the camera. Everything else in
// the scene only reads `flight`.
export function FlightController() {
  const { camera } = useThree();

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
        if (state.inWormhole && !prev.inWormhole) flight.boost = 1.1;
        if (state.feedback === prev.feedback || state.feedback === null) return;
        if (state.feedback === 'correct') {
          // Faster answers flare bigger (store's flare is 0..1), so they kick harder.
          flight.boost = Math.min(0.6, flight.boost + 0.18 + state.flare * 0.3);
        } else {
          flight.jolt = 1;
          flight.boost = 0;
        }
      }),
    [],
  );

  useFrame(({ clock }, rawDelta) => {
    const dt = Math.min(rawDelta, 0.1); // a tab switch shouldn't teleport the speed
    const { progress, justLaunched } = useGameStore.getState();

    const target = targetSpeed(progress.fuel, progress.currentStreak, justLaunched);
    const rate = target > flight.speed ? ACCEL_RATE : BRAKE_RATE;
    flight.speed += (target - flight.speed) * (1 - Math.exp(-rate * dt));
    flight.boost *= Math.exp(-BOOST_DECAY * dt);
    flight.jolt *= Math.exp(-JOLT_DECAY * dt);
    flight.effective = flight.speed + flight.boost;
    flight.approach = justLaunched ? 1 : progress.fuel / 100;

    // Camera: FOV widens with speed (the classic racing-game speed cue), plus
    // a high-frequency rumble at speed and a hard knock on a wrong answer.
    const s = Math.min(flight.effective, 1.3);
    const m = flight.motionScale;
    const t = clock.elapsedTime;
    const rumble = s * s * 0.025 * m;
    const knock = flight.jolt * 0.12 * m;
    // porthole zoom: ease toward the tap stage (or through the glass on the dive)
    const z = portholeZoom;
    const nowMs = performance.now();
    let zoomGoal = 0;
    if (z.diveAt) {
      const k = Math.min(1, (nowMs - z.diveAt) / DIVE_MS);
      zoomGoal = ZOOM_STAGES[3] + (1 - ZOOM_STAGES[3]) * k * k; // accelerating rush in
    } else if (z.level > 0 && nowMs - z.lastTap < ZOOM_RESET_MS) {
      zoomGoal = ZOOM_STAGES[z.level];
    }
    const zoomRate = z.diveAt ? 14 : zoomGoal > zoomValue ? 7 : 2.5;
    zoomValue += (zoomGoal - zoomValue) * (1 - Math.exp(-zoomRate * dt));
    const calm = 1 - zoomValue; // no rumble with your nose against the glass

    baseEye.set(
      CAMERA_POS.x + ((Math.sin(t * 47) + Math.sin(t * 31)) * rumble + Math.sin(t * 25) * knock) * calm,
      CAMERA_POS.y + ((Math.sin(t * 53) + Math.cos(t * 37)) * rumble + Math.cos(t * 21) * knock) * calm,
      CAMERA_POS.z,
    );
    if (zoomValue > 0.001) {
      zoomTarget.set(rocketWorld.x, rocketWorld.y + PORTHOLE_Y, 0);
      // slide along the line from the window to the usual camera spot; at 1
      // the camera is inside the near plane, so the ship vanishes: "in"
      const dist = baseEye.distanceTo(zoomTarget);
      zoomEye.copy(baseEye).sub(zoomTarget).normalize().multiplyScalar(dist * (1 - zoomValue) + 0.04).add(zoomTarget);
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
      const fov = speedFov;
      if (Math.abs(camera.fov - fov) > 0.01) {
        camera.fov = fov;
        camera.updateProjectionMatrix();
      }
    }
  }, -1); // before everything else, so readers see this frame's values

  return null;
}
