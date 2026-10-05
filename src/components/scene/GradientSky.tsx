import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface Props {
  topColor: string;
  bottomColor: string;
}

// A big inverted sphere with a two-color vertical gradient standing in for a
// painted dusk sky — a soft illustrated backdrop instead of a flat black
// void. Colors smoothly drift toward whatever theme the current level picked
// (see palette.ts's skyForLevel), so each launch-to-launch passage settles
// into a visibly different sky instead of replaying the same backdrop.
export function GradientSky({ topColor, bottomColor }: Props) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {
          topColor: { value: new THREE.Color(topColor) },
          bottomColor: { value: new THREE.Color(bottomColor) },
        },
        vertexShader: `
          varying vec3 vWorldPosition;
          void main() {
            vec4 worldPosition = modelMatrix * vec4(position, 1.0);
            vWorldPosition = worldPosition.xyz;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          varying vec3 vWorldPosition;
          uniform vec3 topColor;
          uniform vec3 bottomColor;
          void main() {
            float h = clamp(normalize(vWorldPosition).y * 0.5 + 0.55, 0.0, 1.0);
            gl_FragColor = vec4(mix(bottomColor, topColor, h), 1.0);
          }
        `,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const targetTop = useMemo(() => new THREE.Color(), []);
  const targetBottom = useMemo(() => new THREE.Color(), []);

  useFrame(() => {
    targetTop.set(topColor);
    targetBottom.set(bottomColor);
    (material.uniforms.topColor.value as THREE.Color).lerp(targetTop, 0.02);
    (material.uniforms.bottomColor.value as THREE.Color).lerp(targetBottom, 0.02);
  });

  return (
    <mesh material={material}>
      <sphereGeometry args={[80, 32, 32]} />
    </mesh>
  );
}
