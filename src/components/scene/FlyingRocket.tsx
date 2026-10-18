import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { flight, HOME_MS, homecoming, PORTHOLE_Y, rocketWorld } from '../../game/flight';
import { gameNow } from '../../game/gameClock';
import { RocketSprite } from './RocketSprite';
import { EngineExhaust } from './EngineExhaust';

interface Props {
  level: number;
}

// Where the engine bell's bottom edge lands in group space (RocketSprite is
// a 2.3-tall plane centered at y=1.1; the nozzle is ~81% down the artwork).
const NOZZLE_Y = 0.4;

const easeOut = (t: number) => 1 - (1 - t) ** 3;
/** eases out past the end and back */
const easeOutBack = (t: number) => 1 + 2.4 * (t - 1) ** 3 + 1.4 * (t - 1) ** 2;
const HOME = { x: 0, y: 0, z: 0, bank: 0 };

/**
 * Flying home (flyHome), `now` in game time: how far the rocket still is from
 * its place, along its course. It sets off from near the camera, well back
 * along its course (so it comes up from the bottom of the screen behind its
 * own tail), rushes ahead, overshoots its place a little as it brakes and
 * settles back, banking out of the turn on the way.
 */
function homeOffset(now: number) {
  const k = (now - homecoming.at) / HOME_MS;
  if (!(k >= 0 && k < 1)) return HOME;
  const e = easeOut(k);
  return { x: 0, y: -3.4 * (1 - easeOutBack(k)), z: 2.6 * (1 - e), bank: 0.35 * (1 - e) };
}

// The rocket in flight. The world streams past it (SpeedStreaks, the star
// sphere), so the rocket itself only floats: a gentle bob at cruise, a tight
// engine vibration and a slight forward lean as speed builds, and a lurch
// down-and-back on a wrong answer, like hitting the brakes.
//
// It flies the level's course (flight.heading): the whole ship turns about
// its porthole, so it keeps its place on screen (and the porthole stays
// under a tapping finger), and its bob and surges follow its nose. Back
// from a bonus round or a game mode it flies home to its place (homeOffset).
export function FlyingRocket({ level }: Props) {
  const courseRef = useRef<THREE.Group>(null);
  const groupRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    const course = courseRef.current;
    const group = groupRef.current;
    if (!course || !group) return;
    const t = clock.elapsedTime;
    const s = Math.min(flight.effective, 1.3);
    const m = flight.motionScale;

    const bob = Math.sin(t * 1.3) * 0.06 * (1 - Math.min(s, 1) * 0.6);
    const vibration = s * s * 0.012 * m;
    // At speed the rocket surges a little higher on screen; braking drops it.
    const surge = s * 0.18 - flight.jolt * 0.25;

    const x = Math.sin(t * 0.7) * 0.05 + Math.sin(t * 61) * vibration;
    const y = bob + surge + Math.cos(t * 57) * vibration;
    course.rotation.z = flight.heading;
    const home = homeOffset(gameNow());
    group.position.set(x + home.x, y - PORTHOLE_Y + home.y, home.z);
    // the porthole in world space: the pivot, plus this frame's float turned onto the course
    const c = Math.cos(flight.heading);
    const sn = Math.sin(flight.heading);
    rocketWorld.x = x * c - y * sn;
    rocketWorld.y = x * sn + y * c;
    group.rotation.z = Math.sin(t * 0.9) * 0.03 - s * 0.04 + Math.sin(t * 19) * flight.jolt * 0.06 * m + home.bank;
  });

  return (
    <group ref={courseRef} position={[0, PORTHOLE_Y, 0]}>
      <group ref={groupRef} position={[0, -PORTHOLE_Y, 0]}>
        <EngineExhaust nozzleY={NOZZLE_Y} />
        <RocketSprite level={level} />
      </group>
    </group>
  );
}
