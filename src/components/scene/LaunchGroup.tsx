import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { RocketSprite } from './RocketSprite';
import { FlameFuel } from './FlameFuel';

interface Props {
  level: number;
  fuelPercent: number;
  flare: number;
  launched: boolean;
}

export function LaunchGroup({ level, fuelPercent, flare, launched }: Props) {
  const groupRef = useRef<THREE.Group>(null);
  const elapsed = useRef(0);

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) return;
    if (launched) {
      elapsed.current += delta;
      const t = elapsed.current;
      // Accelerating ascent (not constant velocity) plus a shrinking scale —
      // the camera is fixed and grounded, so this reads as the rocket racing
      // away into the distance rather than the game just moving a sprite up.
      group.position.y = 0.55 * t * t + t * 1.1;
      group.position.x = Math.sin(t * 0.6) * 0.15;
      group.scale.setScalar(THREE.MathUtils.clamp(1 - t / 3.2, 0.07, 1));
      group.rotation.z = Math.sin(t * 12) * 0.02;
    } else {
      elapsed.current = 0;
      group.position.y = THREE.MathUtils.lerp(group.position.y, 0, 0.2);
      group.position.x = THREE.MathUtils.lerp(group.position.x, 0, 0.2);
      group.scale.setScalar(THREE.MathUtils.lerp(group.scale.x, 1, 0.2));
      group.rotation.z = THREE.MathUtils.lerp(group.rotation.z, 0, 0.2);
    }
  });

  return (
    <group ref={groupRef}>
      <RocketSprite level={level} />
      <FlameFuel fuelPercent={launched ? 100 : fuelPercent} flare={flare} />
    </group>
  );
}
