import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { CHARGE_MS, departure, departurePhase, flight, HOME_MS, homecoming, kick, porthole, PORTHOLE_Y, rocketScreen, rocketWorld } from '../../game/flight';
import { gameNow } from '../../game/gameClock';
import { RocketSprite } from './RocketSprite';
import { EngineExhaust } from './EngineExhaust';
import { EngineGlow } from './EngineGlow';
import { sfx } from '../../audio/sfx';
import { shipArt } from './ships';
import { useShip } from '../../profiles/useProfiles';
import { useCrewStore } from '../../game/useCrewStore';

interface Props {
  level: number;
}

// Where the engine bell's bottom edge lands in group space (RocketSprite is
// a 2.3-tall plane centered at y=1.1), for a nozzle this far down the
// ship's 400-tall frame: the plume starts a little inside it (the classic's,
// ~81% down the artwork, at 0.4).
const nozzleY = (frameY: number) => 2.25 - (frameY / 400) * 2.3 + 0.0245;

const easeOut = (t: number) => 1 - (1 - t) ** 3;
/** eases out past the end and back */
const easeOutBack = (t: number) => 1 + 2.4 * (t - 1) ** 3 + 1.4 * (t - 1) ** 2;
const HOME = { x: 0, y: 0, z: 0, bank: 0, stretch: 1 };

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
  return { x: 0, y: -3.4 * (1 - easeOutBack(k)), z: 2.6 * (1 - e), bank: 0.35 * (1 - e), stretch: 1 };
}

/**
 * Flying off (flyAway), `now` in game time. First the build-up: the rocket
 * crouches (sinking a little and back, squashed like a spring) and shakes
 * harder and harder as its engine swells. Then ignition, and it blasts away
 * up its course into the distance, faster and faster and stretched by its
 * speed, till it's gone off the top of the screen. It stays gone a while (a
 * round or a mode is over the screen by then), and is back in its place
 * after that. `stretch`: its length (its width the other way).
 */
function awayOffset(now: number, t: number) {
  const phase = departurePhase(now);
  if (!phase) return HOME;
  const { charge, blast } = phase;
  const crouch = easeOut(charge);
  // the shake grows through the build-up, and is shaken off as it gets away
  const shake = charge * charge * 0.04 * (1 - blast);
  const jx = (Math.sin(t * 71) + Math.sin(t * 43)) * shake * 0.5;
  const jy = (Math.cos(t * 83) + Math.cos(t * 37)) * shake * 0.5;
  if (blast <= 0) return { x: jx, y: -0.26 * crouch + jy, z: 0.12 * crouch, bank: 0, stretch: 1 - 0.07 * crouch };
  return {
    x: jx,
    y: -0.26 + 11 * blast ** 2.4 + jy,
    z: 0.12 - 8 * blast * blast,
    bank: -0.1 * Math.sin(Math.PI * blast),
    // released from its crouch, it springs long
    stretch: 1 + 0.32 * Math.min(1, blast * 4),
  };
}

// The rocket in flight. The world streams past it (SpeedStreaks, the star
// sphere), so the rocket itself only floats: a gentle bob at cruise, a tight
// engine vibration and a slight forward lean as speed builds, and a lurch
// down-and-back on a wrong answer, like hitting the brakes.
//
// It flies the level's course (flight.heading): the whole ship turns about
// its porthole (the ship's window, wherever it is), so it keeps its place on screen (and the porthole stays
// under a tapping finger), and its bob and surges follow its nose. Off to a
// bonus round or a game mode it flies away (awayOffset), and back from one it
// flies home to its place (homeOffset). Its blast-off builds up first: the
// engine swells and glows (EngineExhaust, EngineGlow) and the camera tenses
// (FlightController) before it fires.
export function FlyingRocket({ level }: Props) {
  const ship = useShip();
  const crew = useCrewStore((s) => !!s.members);
  // (the colour doesn't move the nozzle, nor the ship's outline)
  const { nozzle, bounds } = shipArt(ship, '#000', crew);
  const courseRef = useRef<THREE.Group>(null);
  const groupRef = useRef<THREE.Group>(null);
  // the blast-off this frame belongs to: its build-up and its ignition sound once each
  const charged = useRef(-Infinity);
  const ignited = useRef(-Infinity);

  const corner = useRef(new THREE.Vector3());

  useFrame(({ clock, camera, size }, rawDelta) => {
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
    // (the pivot is the ship's window, which can be off the centre line)
    course.position.x = porthole.x;
    const now = gameNow();
    const away = departure.at > homecoming.at;
    const home = away ? awayOffset(now, t) : homeOffset(now);
    group.position.set(x + home.x - porthole.x, y - PORTHOLE_Y + home.y, home.z);
    group.scale.set(1 / Math.sqrt(home.stretch), home.stretch, 1);

    // the blast-off's build-up and ignition, for the engine, its glow and the camera
    const phase = away ? departurePhase(now) : null;
    flight.charge = phase && phase.blast === 0 ? phase.charge : 0;
    flight.ignition *= Math.exp(-3.2 * Math.min(rawDelta, 0.1));
    if (phase && charged.current !== departure.at) {
      charged.current = departure.at;
      sfx.chargeUp(CHARGE_MS / 1000);
    }
    if (phase && phase.blast > 0 && ignited.current !== departure.at) {
      ignited.current = departure.at;
      flight.ignition = 1;
      kick(1.1);
      sfx.blastOff();
    }
    // the porthole in world space: the pivot, plus this frame's float turned onto the course
    const c = Math.cos(flight.heading);
    const sn = Math.sin(flight.heading);
    rocketWorld.x = porthole.x + x * c - y * sn;
    rocketWorld.y = x * sn + y * c;
    group.rotation.z = Math.sin(t * 0.9) * 0.03 - s * 0.04 + Math.sin(t * 19) * flight.jolt * 0.06 * m + home.bank;

    // the outline of the ship's art on screen (RocketSprite: a 1.1 × 2.3 plane centred 1.1 up, over a 200 × 400 frame)
    group.updateMatrixWorld();
    const [bx, by, bw, bh] = bounds;
    rocketScreen.quad = [
      [bx, by],
      [bx + bw, by],
      [bx + bw, by + bh],
      [bx, by + bh],
    ].map(([fx, fy]) => {
      const p = corner.current.set((fx / 200 - 0.5) * 1.1, 1.1 + (0.5 - fy / 400) * 2.3, 0);
      group.localToWorld(p).project(camera);
      return { x: size.left + ((p.x + 1) / 2) * size.width, y: size.top + ((1 - p.y) / 2) * size.height };
    });
  });

  return (
    <group ref={courseRef} position={[0, PORTHOLE_Y, 0]}>
      <group ref={groupRef} position={[0, -PORTHOLE_Y, 0]}>
        <EngineGlow nozzleY={nozzleY(nozzle)} />
        <EngineExhaust nozzleY={nozzleY(nozzle)} />
        <RocketSprite level={level} />
      </group>
    </group>
  );
}
