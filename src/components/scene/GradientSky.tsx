import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { flight } from '../../game/flight';

interface Props {
  topColor: string;
  bottomColor: string;
}

// A big inverted sphere with a two-color vertical gradient standing in for a
// painted dusk sky — a soft illustrated backdrop instead of a flat black
// void. Colors smoothly drift toward whatever theme the current level picked
// (see palette.ts's skyForLevel), so each launch-to-launch passage settles
// into a visibly different sky instead of replaying the same backdrop.
// The faster the rocket flies, the more the sky deepens toward dark space —
// leaving the bright haze behind — which also lets the star streaks read as
// stars instead of rain. "Up" is wherever the level's course points.
export function GradientSky({ topColor, bottomColor }: Props) {
  const meshRef = useRef<THREE.Mesh>(null);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {
          topColor: { value: new THREE.Color(topColor) },
          bottomColor: { value: new THREE.Color(bottomColor) },
          depth: { value: 0.3 },
        },
        // the gradient runs along the sphere's own "up", so turning the sphere turns the sky
        vertexShader: `
          varying vec3 vLocalPosition;
          void main() {
            vLocalPosition = position;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          varying vec3 vLocalPosition;
          uniform vec3 topColor;
          uniform vec3 bottomColor;
          uniform float depth;
          void main() {
            float h = clamp(normalize(vLocalPosition).y * 0.5 + 0.55, 0.0, 1.0);
            vec3 sky = mix(bottomColor, topColor, h);
            gl_FragColor = vec4(mix(sky, vec3(0.05, 0.035, 0.11), depth), 1.0);
          }
        `,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const targetTop = useMemo(() => new THREE.Color(), []);
  const targetBottom = useMemo(() => new THREE.Color(), []);

  useFrame(() => {
    if (meshRef.current) meshRef.current.rotation.z = flight.heading;
    targetTop.set(topColor);
    targetBottom.set(bottomColor);
    (material.uniforms.topColor.value as THREE.Color).lerp(targetTop, 0.02);
    (material.uniforms.bottomColor.value as THREE.Color).lerp(targetBottom, 0.02);
    material.uniforms.depth.value = 0.3 + Math.min(flight.effective, 1.2) * 0.42;
  });

  return (
    <mesh ref={meshRef} material={material}>
      <sphereGeometry args={[80, 32, 32]} />
    </mesh>
  );
}
