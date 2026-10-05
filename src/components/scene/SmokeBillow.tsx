import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getSmokeSpriteTexture } from './spriteShapes';

interface Props {
  launched: boolean;
}

const PARTICLE_COUNT = 200;
const SMOKE_NEAR = new THREE.Color('#f2ede4');
const SMOKE_FAR = new THREE.Color('#a89e94');
const tmpColor = new THREE.Color();

interface SmokeParticle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  maxAge: number;
  active: boolean;
  rotation: number;
}

function igniteParticle(p: SmokeParticle) {
  const angle = Math.random() * Math.PI * 2;
  const r = 0.15 + Math.random() * 0.25;
  p.x = Math.cos(angle) * r;
  p.z = Math.sin(angle) * r;
  p.y = Math.random() * 0.08;
  const outward = 0.35 + Math.random() * 0.55;
  p.vx = Math.cos(angle) * outward;
  p.vz = Math.sin(angle) * outward;
  p.vy = 0.25 + Math.random() * 0.35;
  // Negative age = staggered ignition delay, so the whole cloud doesn't pop
  // in on a single frame; particles "wait" until age crosses zero.
  p.age = -Math.random() * 0.5;
  p.maxAge = 1.8 + Math.random() * 1.6;
  p.active = true;
  p.rotation = Math.random() * Math.PI * 2;
}

// Sits at the fixed launchpad position (not inside LaunchGroup, which flies
// away) and bursts into a billowing cloud of painted puff sprites on the
// rising edge of `launched`.
export function SmokeBillow({ launched }: Props) {
  const wasLaunched = useRef(false);
  const spriteMap = useMemo(() => getSmokeSpriteTexture(), []);

  const particles = useMemo<SmokeParticle[]>(
    () =>
      Array.from({ length: PARTICLE_COUNT }, () => ({
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        age: 0,
        maxAge: 1,
        active: false,
        rotation: 0,
      })),
    [],
  );

  const { geometry, positions, sizes, colors, alphas, rotations } = useMemo(() => {
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const sizes = new Float32Array(PARTICLE_COUNT);
    const colors = new Float32Array(PARTICLE_COUNT * 3);
    const alphas = new Float32Array(PARTICLE_COUNT);
    const rotations = new Float32Array(PARTICLE_COUNT);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));
    geometry.setAttribute('aRotation', new THREE.BufferAttribute(rotations, 1));
    return { geometry, positions, sizes, colors, alphas, rotations };
  }, []);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.NormalBlending,
        uniforms: {
          uMap: { value: spriteMap },
        },
        vertexShader: `
          attribute float aSize;
          attribute float aAlpha;
          attribute vec3 aColor;
          attribute float aRotation;
          varying float vAlpha;
          varying vec3 vColor;
          varying float vRotation;
          void main() {
            vAlpha = aAlpha;
            vColor = aColor;
            vRotation = aRotation;
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = aSize * (300.0 / -mvPosition.z);
            gl_Position = projectionMatrix * mvPosition;
          }
        `,
        fragmentShader: `
          uniform sampler2D uMap;
          varying float vAlpha;
          varying vec3 vColor;
          varying float vRotation;
          void main() {
            vec2 uv = gl_PointCoord - 0.5;
            float s = sin(vRotation);
            float c = cos(vRotation);
            vec2 ruv = vec2(c * uv.x - s * uv.y, s * uv.x + c * uv.y) + 0.5;
            vec4 tex = texture2D(uMap, ruv);
            gl_FragColor = vec4(vColor, tex.a * vAlpha * 0.55);
          }
        `,
      }),
    [spriteMap],
  );

  useFrame((_, delta) => {
    if (launched && !wasLaunched.current) {
      particles.forEach(igniteParticle);
    }
    wasLaunched.current = launched;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const p = particles[i];
      if (!p.active) continue;

      p.age += delta;
      if (p.age >= p.maxAge) {
        p.active = false;
        alphas[i] = 0;
        continue;
      }
      if (p.age < 0) {
        alphas[i] = 0;
        continue;
      }

      const t = p.age / p.maxAge;
      const drag = 1 - t * 0.6;
      p.x += p.vx * delta * drag;
      p.z += p.vz * delta * drag;
      p.y += p.vy * delta * (0.7 + t * 0.5);

      positions[i * 3] = p.x;
      positions[i * 3 + 1] = p.y;
      positions[i * 3 + 2] = p.z;

      sizes[i] = 0.25 + t * 0.95;
      rotations[i] = p.rotation;

      tmpColor.copy(SMOKE_NEAR).lerp(SMOKE_FAR, t);
      colors[i * 3] = tmpColor.r;
      colors[i * 3 + 1] = tmpColor.g;
      colors[i * 3 + 2] = tmpColor.b;

      const fade = t < 0.2 ? t / 0.2 : 1 - (t - 0.2) / 0.8;
      alphas[i] = Math.max(0, fade);
    }

    geometry.attributes.position.needsUpdate = true;
    (geometry.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
    (geometry.attributes.aColor as THREE.BufferAttribute).needsUpdate = true;
    (geometry.attributes.aAlpha as THREE.BufferAttribute).needsUpdate = true;
    (geometry.attributes.aRotation as THREE.BufferAttribute).needsUpdate = true;
  });

  return (
    <group position={[0, -0.9, 0]}>
      <points geometry={geometry} material={material} />
    </group>
  );
}
