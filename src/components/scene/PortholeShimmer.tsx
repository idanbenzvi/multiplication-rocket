import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface Props {
  /** porthole centre and radius in the rocket sprite's local units */
  x: number;
  y: number;
  radius: number;
}

// A "there's something here" hint on the rocket's window, shown until the
// pilot discovers the Deep Space Academy (three taps on the window): a
// softly pulsing halo, a glint that sweeps across the glass every couple of
// seconds, and a tiny twinkle. Additive light, so the bloom makes it glow.
const SIZE = 2.8; // plane size in porthole radii

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAG = /* glsl */ `
uniform float uTime;
varying vec2 vUv;
void main() {
  vec2 p = (vUv - 0.5) * ${SIZE.toFixed(1)}; // in porthole radii, centre at 0
  float d = length(p);

  // halo hugging the rim, breathing slowly
  float pulse = 0.55 + 0.45 * sin(uTime * 2.2);
  float halo = exp(-pow((d - 1.08) / 0.32, 2.0)) * pulse;

  // a glint sweeping diagonally across the glass, then a pause
  float inside = 1.0 - smoothstep(0.9, 1.0, d);
  float sweep = mod(uTime * 0.95, 3.4) - 1.7;
  float s = (p.x + p.y) * 0.7071;
  float glint = exp(-pow((s - sweep) / 0.16, 2.0)) * inside * step(abs(sweep), 1.35);

  // a little twinkle up on the glass
  float tw = pow(max(0.0, sin(uTime * 3.7)), 6.0);
  vec2 q = p - vec2(0.42, 0.48);
  float star = (pow(max(0.0, 1.0 - length(q) * 5.0), 3.0) + max(0.0, 1.0 - abs(q.x) * 30.0) * max(0.0, 1.0 - abs(q.y) * 3.0) * 0.6 + max(0.0, 1.0 - abs(q.y) * 30.0) * max(0.0, 1.0 - abs(q.x) * 3.0) * 0.6) * tw;

  vec3 col = vec3(1.0, 0.84, 0.48) * halo * 0.9 + vec3(1.0) * glint * 0.85 + vec3(1.0, 0.95, 0.8) * star * inside;
  gl_FragColor = vec4(col, 1.0);
}
`;

export function PortholeShimmer({ x, y, radius }: Props) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        uniforms: { uTime: { value: 0 } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    [],
  );
  useFrame(({ clock }) => {
    material.uniforms.uTime.value = clock.elapsedTime;
  });
  return (
    // raycast disabled: it's just light — taps must reach the window underneath
    <mesh material={material} position={[x, y, 0.01]} renderOrder={2} raycast={() => null}>
      <planeGeometry args={[radius * SIZE, radius * SIZE]} />
    </mesh>
  );
}
