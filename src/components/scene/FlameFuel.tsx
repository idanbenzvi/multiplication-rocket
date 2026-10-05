import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getFlameSpriteTexture } from './spriteShapes';

interface Props {
  fuelPercent: number; // 0-100, drives the baseline flame intensity/height
  flare: number; // 0-1 transient burst on each correct answer, scaled by answer speed
}

const PARTICLE_COUNT = 140;
const SPAWN_RADIUS = 0.16;
const CORE_COLOR = new THREE.Color('#fff3d6');
const MID_COLOR = new THREE.Color('#ffb15e');
const OUTER_COLOR = new THREE.Color('#f2734f');
const tmpColor = new THREE.Color();

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  vy: number;
  age: number;
  maxAge: number;
  seed: number;
  rotation: number;
}

function spawnParticle(p: Particle, intensity: number) {
  const angle = Math.random() * Math.PI * 2;
  const r = Math.random() * SPAWN_RADIUS;
  p.x = Math.cos(angle) * r;
  p.z = Math.sin(angle) * r;
  p.y = 0;
  p.vx = Math.cos(angle) * 0.04;
  p.vz = Math.sin(angle) * 0.04;
  p.vy = 0.8 + Math.random() * 0.5 + intensity * 1.3;
  p.age = 0;
  p.maxAge = 0.3 + Math.random() * 0.3;
  p.seed = Math.random() * Math.PI * 2;
  p.rotation = Math.random() * Math.PI * 2;
}

// A real (if lightweight) particle fire: each point has its own lifecycle,
// upward drift, turbulence, a core->mid->outer color gradient and a random
// rotation, rendered as a painted flame-lick sprite (not a flat glow disc)
// with additive blending so overlapping particles bloom into a soft plume.
export function FlameFuel({ fuelPercent, flare }: Props) {
  const intensityRef = useRef(0.35);
  const lightRef = useRef<THREE.PointLight>(null);
  const spriteMap = useMemo(() => getFlameSpriteTexture(), []);

  const particles = useMemo<Particle[]>(() => {
    const arr: Particle[] = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const p: Particle = {
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vz: 0,
        vy: 0,
        age: 0,
        maxAge: 1,
        seed: 0,
        rotation: 0,
      };
      spawnParticle(p, 0.35);
      p.age = Math.random() * p.maxAge;
      arr.push(p);
    }
    return arr;
  }, []);

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
        blending: THREE.AdditiveBlending,
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
            gl_PointSize = aSize * (260.0 / -mvPosition.z);
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
            gl_FragColor = vec4(vColor, tex.a * vAlpha);
          }
        `,
      }),
    [spriteMap],
  );

  useFrame((_, delta) => {
    const intensity = (intensityRef.current = THREE.MathUtils.lerp(
      intensityRef.current,
      0.3 + (fuelPercent / 100) * 0.85 + flare * 0.85,
      0.12,
    ));

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const p = particles[i];
      p.age += delta;
      if (p.age >= p.maxAge) spawnParticle(p, intensity);

      const t = p.age / p.maxAge;
      const drift = Math.sin(performance.now() * 0.004 + p.seed) * 0.12 * t;
      p.x += (p.vx + drift * 0.3) * delta;
      p.z += (p.vz + drift * 0.3) * delta;
      p.y += p.vy * delta * (0.6 + intensity * 0.9);

      positions[i * 3] = p.x;
      positions[i * 3 + 1] = p.y;
      positions[i * 3 + 2] = p.z;

      sizes[i] = (0.16 + intensity * 0.26) * (0.5 + 0.5 * Math.sin(Math.PI * t));
      rotations[i] = p.rotation;

      if (t < 0.5) tmpColor.copy(CORE_COLOR).lerp(MID_COLOR, t * 2);
      else tmpColor.copy(MID_COLOR).lerp(OUTER_COLOR, (t - 0.5) * 2);
      colors[i * 3] = tmpColor.r;
      colors[i * 3 + 1] = tmpColor.g;
      colors[i * 3 + 2] = tmpColor.b;

      const fade = t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85;
      alphas[i] = Math.max(0, fade) * Math.min(1, 0.35 + intensity);
    }

    geometry.attributes.position.needsUpdate = true;
    (geometry.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
    (geometry.attributes.aColor as THREE.BufferAttribute).needsUpdate = true;
    (geometry.attributes.aAlpha as THREE.BufferAttribute).needsUpdate = true;
    (geometry.attributes.aRotation as THREE.BufferAttribute).needsUpdate = true;

    if (lightRef.current) {
      lightRef.current.intensity = THREE.MathUtils.lerp(
        lightRef.current.intensity,
        1.1 + intensity * 5,
        0.15,
      );
    }
  });

  return (
    <group position={[0, -0.2, 0]}>
      <points geometry={geometry} material={material} />
      <pointLight ref={lightRef} color="#ff9d3f" position={[0, -0.3, 0]} distance={4.5} />
    </group>
  );
}
