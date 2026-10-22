import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type * as THREE from 'three';
import { flight } from '../../game/flight';
import { BEAM_TOP_FRACTION, BEHIND_ROCKET, PLUME_HEADROOM, plumeMaterial, plumeSize, stepPlume } from './plume';
import { useAdmiral } from '../../game/useAchievements';
import { useCrewStore } from '../../game/useCrewStore';

interface Props {
  /** world-space y of the nozzle, where the plume starts */
  nozzleY: number;
}

// The rocket's engine: the LaserFlow plume (see plume.ts) pointed down out of
// the nozzle. Speed makes it longer, wider, brighter, faster-flowing and
// hotter-colored; a wrong answer makes it sputter, and a blast-off's build-up
// swells it before it fires. A Space Admiral's burns gold (flying solo: a
// crew's rocket is everyone's).
export function EngineExhaust({ nozzleY }: Props) {
  const meshRef = useRef<THREE.Mesh>(null);
  const material = useMemo(() => plumeMaterial(false, PLUME_HEADROOM), []);
  const admiral = useAdmiral();
  const crew = useCrewStore((s) => s.active);
  const gold = admiral && !crew;

  useFrame(({ clock }, rawDelta) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    // a blast-off's build-up swells the plume and heats it, flickering; its ignition flares it long
    const build = flight.charge * (0.62 + 0.08 * Math.sin(clock.elapsedTime * 34));
    const s = Math.min(flight.effective + build + flight.ignition * 0.6, 1.9);
    // Sputter: after a wrong answer the flame flickers and dips.
    const sputter = flight.jolt * (0.4 + 0.6 * Math.abs(Math.sin(clock.elapsedTime * 38)));
    stepPlume(material, Math.min(rawDelta, 0.1), s, sputter, gold);

    // the plume, and the room above its nozzle for the glow to fade away in
    const { width, height } = plumeSize(s);
    const full = height * (1 + PLUME_HEADROOM);
    mesh.scale.set(width, full, 1);
    mesh.position.y = nozzleY + (BEAM_TOP_FRACTION + PLUME_HEADROOM) * height - full / 2;
  });

  return (
    // drawn before the rocket, which covers it: the rocket's billboard turns to face the camera, and
    // left to the depth test, the half of it turned behind the plume's plane would be lit over
    <mesh ref={meshRef} material={material} position={[0, nozzleY, -0.02]} frustumCulled={false} renderOrder={BEHIND_ROCKET}>
      <planeGeometry args={[1, 1]} />
    </mesh>
  );
}
