import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { flight } from '../../game/flight';
import { LOOKS } from './planetLooks';

interface Props {
  /** index into the destination list (levels.ts / strings.ts order) */
  destinationIndex: number;
}

const VERT = /* glsl */ `
varying vec3 vNormal;
varying vec3 vObjPos;
varying vec3 vViewDir;
void main() {
  vNormal = normalize(normalMatrix * normal);
  vObjPos = position;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vViewDir = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = /* glsl */ `
uniform vec3 baseColor;
uniform vec3 bandColor;
uniform vec3 glowColor;
uniform float bands;
uniform float sun;
uniform float time;
varying vec3 vNormal;
varying vec3 vObjPos;
varying vec3 vViewDir;
void main() {
  vec3 n = normalize(vNormal);
  float stripe = bands > 0.0 ? 0.5 + 0.5 * sin(vObjPos.y * bands * 3.0 + sin(vObjPos.x * 4.0 + time * 0.3) * 0.6) : 0.0;
  float speckle = bands > 0.0 ? 0.0 : smoothstep(0.55, 0.75, fract(sin(dot(floor(vObjPos * 6.0), vec3(12.9, 78.2, 37.7))) * 43758.5));
  vec3 col = mix(baseColor, bandColor, max(stripe * 0.7, speckle * 0.6));
  // Two-tone toon light from the upper right, to match the storybook rocket.
  float light = dot(n, normalize(vec3(0.6, 0.5, 0.6)));
  // (the Sun has no night side)
  col *= sun > 0.5 ? 1.1 : light > 0.05 ? 1.0 : 0.62;
  // Atmosphere rim.
  float rim = pow(1.0 - max(dot(n, vViewDir), 0.0), 2.5);
  col += glowColor * rim * 0.9;
  gl_FragColor = vec4(col, 1.0);
}
`;

// Where the planet sits when far away / when we've arrived (world space).
// The camera is offset to the right and looks slightly left, so these are
// pushed well left to land in the upper-left of the frame, clear of the
// rocket, rather than directly behind it.
const FAR = new THREE.Vector3(-9, 5.5, -16);
const NEAR = new THREE.Vector3(-6.5, 4.2, -9);

// The level's destination, hanging in the sky ahead. It starts as a small
// dot and swells and drifts closer as the fuel tank (= distance covered)
// fills, so the child can literally watch the goal get nearer.
export function DestinationPlanet({ destinationIndex }: Props) {
  const groupRef = useRef<THREE.Group>(null);
  const look = LOOKS[destinationIndex % LOOKS.length];
  const shown = useRef(0);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        fog: false,
        uniforms: {
          baseColor: { value: new THREE.Color(look.base) },
          bandColor: { value: new THREE.Color(look.band) },
          glowColor: { value: new THREE.Color(look.glow) },
          bands: { value: look.bands },
          sun: { value: look.sun ? 1 : 0 },
          time: { value: 0 },
        },
      }),
    [look],
  );

  // the Sun's corona: a soft glow fading out from its edge (the Sun itself hides the middle)
  const corona = useMemo(() => {
    if (!look.sun) return null;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const g = canvas.getContext('2d');
    if (!g) return null;
    const c = new THREE.Color(look.glow);
    const rgb = `${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}`;
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0.5, `rgba(${rgb}, 0.9)`);
    grad.addColorStop(0.62, `rgba(${rgb}, 0.35)`);
    grad.addColorStop(1, `rgba(${rgb}, 0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(canvas);
  }, [look]);

  useFrame(({ clock }, rawDelta) => {
    const group = groupRef.current;
    if (!group) return;
    const dt = Math.min(rawDelta, 0.1);
    // Ease the displayed approach so a fuel reset (wrong answer) visibly
    // pulls the planet back rather than snapping it.
    shown.current += (flight.approach - shown.current) * (1 - Math.exp(-2 * dt));
    const a = shown.current;
    const eased = a * a * (3 - 2 * a);
    group.position.lerpVectors(FAR, NEAR, eased);
    group.scale.setScalar(0.35 + eased * 2.4);
    group.rotation.y = clock.elapsedTime * 0.08;
    material.uniforms.time.value = clock.elapsedTime;
  });

  return (
    <group ref={groupRef} position={FAR}>
      <mesh material={material}>
        <sphereGeometry args={[1, 48, 48]} />
      </mesh>
      {corona && (
        <sprite scale={3.6}>
          <spriteMaterial map={corona} transparent depthWrite={false} blending={THREE.AdditiveBlending} fog={false} />
        </sprite>
      )}
      {look.ring && (
        <mesh rotation={[Math.PI / 2.4, 0.2, 0]}>
          <ringGeometry args={[1.35, 1.9, 64]} />
          <meshBasicMaterial color={look.ring} transparent opacity={0.65} side={THREE.DoubleSide} fog={false} />
        </mesh>
      )}
    </group>
  );
}
