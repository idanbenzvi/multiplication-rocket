import { useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { PerspectiveCamera, Vector3 } from 'three';
import { useGameStore } from '../../game/useGameStore';
import { BELT_SPEED, flight, targetSpeed } from '../../game/flight';

const CAMERA_POS = new Vector3(0.9, 0.2, 5.0);
const LOOK_AT = new Vector3(0, 0.5, 0);
const BASE_FOV = 50;
const MAX_FOV_KICK = 16;

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
    const { progress, justLaunched, beltRun } = useGameStore.getState();

    const target = beltRun ? BELT_SPEED : targetSpeed(progress.fuel, progress.currentStreak, justLaunched);
    const rate = target > flight.speed ? ACCEL_RATE : BRAKE_RATE;
    flight.speed += (target - flight.speed) * (1 - Math.exp(-rate * dt));
    flight.boost *= Math.exp(-BOOST_DECAY * dt);
    flight.jolt *= Math.exp(-JOLT_DECAY * dt);
    flight.effective = flight.speed + flight.boost;
    flight.approach = justLaunched ? 1 : beltRun ? 0 : progress.fuel / 100;

    // Camera: FOV widens with speed (the classic racing-game speed cue), plus
    // a high-frequency rumble at speed and a hard knock on a wrong answer.
    const s = Math.min(flight.effective, 1.3);
    const m = flight.motionScale;
    const t = clock.elapsedTime;
    const rumble = s * s * 0.025 * m;
    const knock = flight.jolt * 0.12 * m;
    camera.position.set(
      CAMERA_POS.x + (Math.sin(t * 47) + Math.sin(t * 31)) * rumble + Math.sin(t * 25) * knock,
      CAMERA_POS.y + (Math.sin(t * 53) + Math.cos(t * 37)) * rumble + Math.cos(t * 21) * knock,
      CAMERA_POS.z,
    );
    camera.lookAt(LOOK_AT);
    if (camera instanceof PerspectiveCamera) {
      const fov = BASE_FOV + Math.min(s, 1.1) * MAX_FOV_KICK * (0.5 + 0.5 * m);
      if (Math.abs(camera.fov - fov) > 0.01) {
        camera.fov = fov;
        camera.updateProjectionMatrix();
      }
    }
  }, -1); // before everything else, so readers see this frame's values

  return null;
}
