import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { AURORA_FRAG, auroraPaletteFor } from './auroraShader';

// Northern-lights curtains across the top of the sky. The shader is React
// Bits' Aurora (https://reactbits.dev/backgrounds/aurora), ported into the
// r3f scene as a full-screen layer that sits just in front of the sky
// gradient — behind the planet, stars and rocket — instead of as a separate
// canvas over the game. Each level gets its own palette. Kept deliberately
// slow, low and faint: it's ambience, and anything livelier competes with
// the game for attention.

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  // Full-screen quad pinned to the far plane: covers the view, and anything
  // in the scene (planet, rocket) is in front of it.
  gl_Position = vec4(position.xy, 0.9999, 1.0);
}
`;

interface Props {
  level: number;
}

export function AuroraSky({ level }: Props) {
  const target = useMemo(() => auroraPaletteFor(level).map((c) => new THREE.Color(c)), [level]);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: AURORA_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
        fog: false,
        uniforms: {
          uTime: { value: 0 },
          uAmplitude: { value: 0.55 }, // upstream default 1.0: lower, gentler waves
          uColorStops: { value: auroraPaletteFor(level).map((c) => new THREE.Color(c)) },
          uBlend: { value: 0.75 }, // softer, more diffuse curtain edges
          uIntensity: { value: 0.4 },
        },
      }),
    // created once; colors are eased toward the level's palette each frame
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 0.1);
    const u = material.uniforms;
    // A slow, constant drift — a quarter of upstream's default pace, and not
    // tied to flight speed (that made it surge and jitter with every answer).
    u.uTime.value += dt * 0.25;
    // Melt into the new level's palette over a few seconds.
    const k = 1 - Math.exp(-0.6 * dt);
    (u.uColorStops.value as THREE.Color[]).forEach((c, i) => c.lerp(target[i], k));
  });

  return (
    <mesh material={material} frustumCulled={false} renderOrder={-10}>
      <planeGeometry args={[2, 2]} />
    </mesh>
  );
}
