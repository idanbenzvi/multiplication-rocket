import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { flight } from '../../game/flight';
import { useSvgTexture, type Porthole, type SpritePicture } from './spriteTexture';

interface Props {
  /** the ship's drawing as it flies, with the pilot at the window */
  texture: THREE.CanvasTexture;
  /** what it's drawn from (RocketSprite), to draw it again with the window empty */
  svg: string;
  picture?: SpritePicture;
  texSize: [number, number];
  /** the window the pilot looks out of */
  window: Omit<Porthole, 'emoji'>;
  /** the sprite's plane, in world units */
  width: number;
  height: number;
}

/** the most the pilot blurs (a share of the window's radius), reached half-way through their fading */
const MAX_BLUR = 0.35;

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// Over the window's glass only: the pilot, blurred (within the glass, never
// smearing the rim in) and faded to the window as it is with nobody in it.
// Everything is measured in shares of the sprite's width, the window turned
// back to upright.
const FRAG = /* glsl */ `
uniform sampler2D map;
uniform sampler2D empty;
uniform float shown;
uniform float blur;
uniform vec2 centre; // the window's centre, in the sprite's uv
uniform vec2 radii;
uniform float tilt;
uniform float span; // this plane's side, in shares of the sprite's width
uniform float aspect; // the sprite's height / width
varying vec2 vUv;

vec2 toUv(vec2 q) {
  return centre + vec2(q.x, q.y / aspect);
}
/** how far out on the window's oval q is (1: its edge) */
float oval(vec2 q) {
  float c = cos(tilt), s = sin(tilt);
  vec2 l = vec2(c * q.x - s * q.y, s * q.x + c * q.y);
  return length(l / radii);
}

void main() {
  vec2 q = (vUv - 0.5) * span;
  float e = oval(q);
  if (e > 1.0) discard;
  vec4 nobody = texture2D(empty, toUv(q));
  vec4 pilot = vec4(0.0);
  // taps on a spiral (turned a little at each pixel), pulled in to the glass where they'd land on the rim
  float turn = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) * 6.2832;
  const int TAPS = 16;
  for (int i = 0; i < TAPS; i++) {
    float k = (float(i) + 0.5) / float(TAPS);
    float a = float(i) * 2.39996 + turn;
    vec2 t = q + vec2(cos(a), sin(a)) * sqrt(k) * blur * radii.x;
    float et = oval(t);
    if (et > 0.94) t *= 0.94 / et;
    pilot += texture2D(map, toUv(t));
  }
  pilot /= float(TAPS);
  gl_FragColor = vec4(mix(nobody.rgb, pilot.rgb, shown), 1.0 - smoothstep(0.97, 1.0, e));
  #include <colorspace_fragment>
}
`;

// The pilot at the ship's window, as the camera goes in through it (to the
// cockpit, or diving to the Academy): they go out of focus, the eye passing
// them for what's beyond, and fade, leaving the window to the cockpit's view
// (flight.pilot). Coming back out, they come back into focus. Drawn over the
// glass only while it's happening; the rest of the time the ship's own
// drawing shows them.
export function PilotFade({ texture, svg, picture, texSize, window: w, width, height }: Props) {
  const glass = useMemo(() => ({ ...w, emoji: '' }), [w]);
  const empty = useSvgTexture(svg, texSize[0], texSize[1], glass, picture);
  const ry = w.ry ?? w.radius;
  const span = 2 * Math.max(w.radius, ry) * 1.04;
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        uniforms: {
          map: { value: null },
          empty: { value: null },
          shown: { value: 1 },
          blur: { value: 0 },
          centre: { value: new THREE.Vector2() },
          radii: { value: new THREE.Vector2() },
          tilt: { value: 0 },
          span: { value: 1 },
          aspect: { value: 2 },
        },
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      }),
    [],
  );
  useEffect(() => () => material.dispose(), [material]);
  const u = material.uniforms;
  u.map.value = texture;
  u.empty.value = empty;
  u.centre.value.set(w.x, 1 - w.y);
  u.radii.value.set(w.radius, ry);
  u.tilt.value = w.tilt ?? 0;
  u.span.value = span;
  u.aspect.value = height / width;

  const mesh = useRef<THREE.Mesh>(null);
  useFrame(() => {
    if (!mesh.current) return;
    const gone = 1 - flight.pilot;
    mesh.current.visible = gone > 0.001 && !!empty;
    u.shown.value = flight.pilot;
    u.blur.value = MAX_BLUR * Math.min(1, gone * 2);
  });

  return (
    <mesh ref={mesh} position={[(w.x - 0.5) * width, (0.5 - w.y) * height, 0.002]} material={material} visible={false}>
      <planeGeometry args={[span * width, span * width]} />
    </mesh>
  );
}
