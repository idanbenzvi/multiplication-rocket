import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { flight } from '../../game/flight';
import { LASER_FLOW_FRAG, LASER_FLOW_VERT } from './laserFlowShader';

interface Props {
  /** world-space y of the nozzle, where the plume starts */
  nozzleY: number;
}

// The plume's beam origin sits this far down from the top of its plane (the
// rest of the plane is room for the plume to flow into). Must match
// uBeamYFrac below: frac = BEAM_TOP_FRACTION - 0.5.
const BEAM_TOP_FRACTION = 0.1;

// Plume color by speed: cool ion-blue at cruise → violet → hot pink at
// full burn/overdrive.
const COLD = new THREE.Color('#6ad7ff');
const WARM = new THREE.Color('#b18cff');
const HOT = new THREE.Color('#ff6ad5');

// The rocket's engine: React Bits' LaserFlow beam (see laserFlowShader.ts)
// pointed down out of the nozzle. Speed makes it longer, wider, brighter,
// faster-flowing and hotter-colored; a wrong answer makes it sputter.
export function EngineExhaust({ nozzleY }: Props) {
  const meshRef = useRef<THREE.Mesh>(null);
  const color = useMemo(() => new THREE.Color(), []);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: LASER_FLOW_VERT,
        fragmentShader: LASER_FLOW_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
        uniforms: {
          iTime: { value: 0 },
          iResolution: { value: new THREE.Vector3(400, 900, 1) },
          iMouse: { value: new THREE.Vector4(0, 0, 0, 0) },
          uWispDensity: { value: 1 },
          uTiltScale: { value: 0 },
          uFlowTime: { value: 0 },
          uFogTime: { value: 0 },
          uBeamXFrac: { value: 0 },
          uBeamYFrac: { value: BEAM_TOP_FRACTION - 0.5 },
          uFlowSpeed: { value: 0.35 },
          uVLenFactor: { value: 2.0 },
          uHLenFactor: { value: 0.35 },
          uFogIntensity: { value: 0.45 },
          uFogScale: { value: 0.3 },
          uWSpeed: { value: 15 },
          uWIntensity: { value: 5 },
          uFlowStrength: { value: 0.3 },
          uDecay: { value: 1.1 },
          uFalloffStart: { value: 1.2 },
          uFogFallSpeed: { value: 0.6 },
          uColor: { value: new THREE.Vector3(1, 1, 1) },
          uFade: { value: 1 },
        },
      }),
    [],
  );

  useFrame(({ clock }, rawDelta) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const dt = Math.min(rawDelta, 0.1);
    const s = Math.min(flight.effective, 1.3);
    const u = material.uniforms;

    // Time runs faster at speed, so the wisps and fog visibly rush.
    const timeScale = 0.6 + s * 1.8;
    u.iTime.value += dt * timeScale;
    u.uFlowTime.value += dt * timeScale;
    u.uFogTime.value += dt * timeScale;

    u.uFlowSpeed.value = 0.35 + s * 1.1;
    u.uWSpeed.value = 10 + s * 40;
    u.uWIntensity.value = 3 + s * 6;
    u.uWispDensity.value = 0.7 + s * 0.9;
    u.uFogIntensity.value = 0.3 + s * 0.45;
    // A wider falloff thickens the beam's glow into a plume rather than a needle.
    u.uFalloffStart.value = 1.6 + s * 0.7;

    const k = Math.min(s / 0.9, 1);
    if (k < 0.5) color.copy(COLD).lerp(WARM, k * 2);
    else color.copy(WARM).lerp(HOT, (k - 0.5) * 2);
    (u.uColor.value as THREE.Vector3).set(color.r, color.g, color.b);

    // Sputter: after a wrong answer the flame flickers and dips.
    const sputter = flight.jolt * (0.4 + 0.6 * Math.abs(Math.sin(clock.elapsedTime * 38)));
    u.uFade.value = (0.75 + s * 0.55) * (1 - sputter * 0.85);

    // Size: the plume grows longer and a little wider as speed builds.
    const height = 2.4 + s * 3.6;
    // The shader's horizontal extent is fixed in its own units, so a narrower
    // plane makes the beam thicker in the world.
    const width = 0.95 + s * 0.5;
    mesh.scale.set(width, height, 1);
    mesh.position.y = nozzleY + BEAM_TOP_FRACTION * height - height / 2;
  });

  return (
    <mesh ref={meshRef} material={material} position={[0, nozzleY, -0.02]} frustumCulled={false}>
      <planeGeometry args={[1, 1]} />
    </mesh>
  );
}
