import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { flight } from '../../game/flight';

interface Props {
  /** index into the destination list (levels.ts / strings.ts order) */
  destinationIndex: number;
}

interface Look {
  base: string;
  band: string;
  glow: string;
  bands: number; // 0 = smooth, otherwise stripe frequency (gas giants)
  ring?: string;
}

// Same order as the destinations in levels.ts. Stylized, not literal — the
// space station and galaxy get planet-like stand-ins in their colors.
const LOOKS: Look[] = [
  { base: '#e8e2d0', band: '#b9b2a0', glow: '#fff6e0', bands: 0 }, // Moon
  { base: '#e0603a', band: '#a8402a', glow: '#ff9d76', bands: 0 }, // Mars
  { base: '#a08c7a', band: '#6e5f52', glow: '#d8c4b0', bands: 0 }, // Asteroid belt
  { base: '#e3a05f', band: '#b86d3c', glow: '#ffd29a', bands: 9 }, // Jupiter
  { base: '#e8cf8a', band: '#c4a65e', glow: '#fff0c0', bands: 6, ring: '#f2dfa8' }, // Saturn
  { base: '#9fe0e6', band: '#78c4cc', glow: '#d8fbff', bands: 3 }, // Uranus
  { base: '#4a78e0', band: '#3156a8', glow: '#8fb8ff', bands: 4 }, // Neptune
  { base: '#bfe8ff', band: '#8fc8ec', glow: '#ffffff', bands: 0 }, // Comet
  { base: '#c0c4d0', band: '#8a90a0', glow: '#e8f0ff', bands: 12, ring: '#9aa4b8' }, // Space station
  { base: '#8fe07a', band: '#5ab04a', glow: '#d0ffb0', bands: 5 }, // Alien planet
  { base: '#c9a4de', band: '#8f6ab8', glow: '#ffd0ff', bands: 2, ring: '#f2a6c0' }, // Galaxy
];

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
  col *= light > 0.05 ? 1.0 : 0.62;
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
          time: { value: 0 },
        },
      }),
    [look],
  );

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
      {look.ring && (
        <mesh rotation={[Math.PI / 2.4, 0.2, 0]}>
          <ringGeometry args={[1.35, 1.9, 64]} />
          <meshBasicMaterial color={look.ring} transparent opacity={0.65} side={THREE.DoubleSide} fog={false} />
        </mesh>
      )}
    </group>
  );
}
