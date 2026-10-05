import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { flight } from '../../game/flight';

const COUNT = 280;
const X_RANGE = 7;
const Y_TOP = 7;
const Y_BOTTOM = -6;
const Z_NEAR = 3.2;
const Z_FAR = -10;
const PALETTE = ['#ffe1a8', '#c9a4de', '#7ec4b0', '#f2a6c0', '#bfe6f5', '#ffffff'].map(
  (c) => new THREE.Color(c),
);

// Space dust the rocket flies through. The rocket stays put on screen and the
// world streams downward past it: at cruise these are slow drifting specks,
// and the faster the rocket goes the longer each one stretches into a streak
// — the "stars turn into lines" motion-blur look of a jump to light speed.
export function SpeedStreaks() {
  const { geometry, positions, colors, particles } = useMemo(() => {
    const positions = new Float32Array(COUNT * 2 * 3); // 2 verts per streak: head + tail
    const colors = new Float32Array(COUNT * 2 * 3);
    const particles = Array.from({ length: COUNT }, () => ({
      x: (Math.random() - 0.5) * 2 * X_RANGE,
      y: Y_BOTTOM + Math.random() * (Y_TOP - Y_BOTTOM),
      z: Z_FAR + Math.random() * (Z_NEAR - Z_FAR),
      color: PALETTE[Math.floor(Math.random() * PALETTE.length)],
      brightness: 0.35 + Math.random() * 0.65,
    }));
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return { geometry, positions, colors, particles };
  }, []);

  const material = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    [],
  );

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 0.1);
    const s = flight.effective;
    const velocity = 0.5 + s * 26; // world units / second
    const length = 0.03 + s * s * 2.4;
    // Faster = brighter streaks (they're the main thing selling the speed).
    const glow = 0.55 + Math.min(s, 1.3) * 0.9;

    for (let i = 0; i < COUNT; i++) {
      const p = particles[i];
      p.y -= velocity * dt;
      if (p.y < Y_BOTTOM) {
        p.y = Y_TOP + Math.random() * 2;
        p.x = (Math.random() - 0.5) * 2 * X_RANGE;
        p.z = Z_FAR + Math.random() * (Z_NEAR - Z_FAR);
      }
      const o = i * 6;
      positions[o] = p.x;
      positions[o + 1] = p.y;
      positions[o + 2] = p.z;
      positions[o + 3] = p.x;
      positions[o + 4] = p.y + length; // tail trails above: we're moving up
      positions[o + 5] = p.z;

      // Head bright, tail black — with additive blending the tail fades out.
      const b = p.brightness * glow;
      colors[o] = p.color.r * b;
      colors[o + 1] = p.color.g * b;
      colors[o + 2] = p.color.b * b;
      colors[o + 3] = 0;
      colors[o + 4] = 0;
      colors[o + 5] = 0;
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
  });

  return <lineSegments geometry={geometry} material={material} frustumCulled={false} />;
}
