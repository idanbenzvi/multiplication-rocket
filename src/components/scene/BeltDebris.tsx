import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { flight } from '../../game/flight';

const COUNT = 34;
const X_RANGE = 8;
const Y_TOP = 8;
const Y_BOTTOM = -7;
// Kept well behind the HUD asteroids so the background never competes with them.
const Z_NEAR = -3;
const Z_FAR = -16;

// Background rocks tumbling past during the Asteroid Belt run, so the whole
// scene reads as "inside the belt" (the answer asteroids themselves are the
// HUD layer on top). Low-poly and flat-shaded to match the storybook look.
export function BeltDebris() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const rocks = useMemo(
    () =>
      Array.from({ length: COUNT }, () => ({
        x: (Math.random() - 0.5) * 2 * X_RANGE,
        y: Y_BOTTOM + Math.random() * (Y_TOP - Y_BOTTOM),
        z: Z_FAR + Math.random() * (Z_NEAR - Z_FAR),
        size: 0.12 + Math.random() ** 2 * 0.6,
        spin: new THREE.Vector3(Math.random(), Math.random(), Math.random()).multiplyScalar(1.5),
        rot: new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6),
      })),
    [],
  );

  useFrame((_, rawDelta) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const dt = Math.min(rawDelta, 0.1);
    const velocity = 1 + flight.effective * 14;
    rocks.forEach((r, i) => {
      r.y -= velocity * dt * (0.6 + r.size * 0.5);
      if (r.y < Y_BOTTOM) {
        r.y = Y_TOP + Math.random() * 2;
        r.x = (Math.random() - 0.5) * 2 * X_RANGE;
        r.z = Z_FAR + Math.random() * (Z_NEAR - Z_FAR);
      }
      r.rot.x += r.spin.x * dt;
      r.rot.y += r.spin.y * dt;
      dummy.position.set(r.x, r.y, r.z);
      dummy.rotation.copy(r.rot);
      dummy.scale.setScalar(r.size);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });

  // The flight scene is otherwise unlit (everything else is emissive or
  // shader-colored), so the rocks bring their own light.
  return (
    <>
      <ambientLight intensity={0.7} color="#ffd9b3" />
      <directionalLight position={[3, 4, 5]} intensity={1.4} color="#ffe6c4" />
      <instancedMesh ref={meshRef} args={[undefined, undefined, COUNT]} frustumCulled={false}>
        <icosahedronGeometry args={[1, 0]} />
        <meshStandardMaterial color="#8a7a6c" roughness={1} flatShading />
      </instancedMesh>
    </>
  );
}
