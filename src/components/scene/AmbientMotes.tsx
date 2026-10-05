import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const COUNT = 60;
const COLORS = [
  new THREE.Color('#ffe1a8'),
  new THREE.Color('#c9a4de'),
  new THREE.Color('#7ec4b0'),
  new THREE.Color('#f2a6c0'),
];

interface Mote {
  baseX: number;
  baseY: number;
  baseZ: number;
  phase: number;
  speed: number;
  colorIndex: number;
}

// Slow-drifting, gently twinkling pastel dust that's always present —
// unrelated to game state — so the scene reads as a living diorama rather
// than an empty backdrop, echoing Wayfinder's small ambient "world is alive"
// touches (fireflies, drifting light) rather than a static void.
export function AmbientMotes() {
  const motes = useMemo<Mote[]>(
    () =>
      Array.from({ length: COUNT }, () => ({
        baseX: (Math.random() - 0.5) * 9,
        baseY: Math.random() * 4 - 0.5,
        baseZ: (Math.random() - 0.5) * 9,
        phase: Math.random() * Math.PI * 2,
        speed: 0.15 + Math.random() * 0.25,
        colorIndex: Math.floor(Math.random() * COLORS.length),
      })),
    [],
  );

  const { geometry, positions, sizes, alphas } = useMemo(() => {
    const positions = new Float32Array(COUNT * 3);
    const sizes = new Float32Array(COUNT);
    const colors = new Float32Array(COUNT * 3);
    const alphas = new Float32Array(COUNT);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));
    motes.forEach((m, i) => {
      const c = COLORS[m.colorIndex];
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    });
    return { geometry, positions, sizes, colors, alphas };
  }, [motes]);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexShader: `
          attribute float aSize;
          attribute float aAlpha;
          attribute vec3 aColor;
          varying float vAlpha;
          varying vec3 vColor;
          void main() {
            vAlpha = aAlpha;
            vColor = aColor;
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = aSize * (260.0 / -mvPosition.z);
            gl_Position = projectionMatrix * mvPosition;
          }
        `,
        fragmentShader: `
          varying float vAlpha;
          varying vec3 vColor;
          void main() {
            vec2 uv = gl_PointCoord - 0.5;
            float d = length(uv) * 2.0;
            float glow = smoothstep(1.0, 0.0, d);
            gl_FragColor = vec4(vColor, glow * vAlpha);
          }
        `,
      }),
    [],
  );

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    for (let i = 0; i < COUNT; i++) {
      const m = motes[i];
      positions[i * 3] = m.baseX + Math.sin(t * m.speed + m.phase) * 0.4;
      positions[i * 3 + 1] = m.baseY + Math.sin(t * m.speed * 0.7 + m.phase * 1.3) * 0.3;
      positions[i * 3 + 2] = m.baseZ + Math.cos(t * m.speed + m.phase) * 0.4;

      const twinkle = 0.5 + 0.5 * Math.sin(t * 1.5 + m.phase * 3);
      sizes[i] = 0.05 + twinkle * 0.06;
      alphas[i] = 0.2 + twinkle * 0.35;
    }
    geometry.attributes.position.needsUpdate = true;
    (geometry.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
    (geometry.attributes.aAlpha as THREE.BufferAttribute).needsUpdate = true;
  });

  return <points geometry={geometry} material={material} />;
}
