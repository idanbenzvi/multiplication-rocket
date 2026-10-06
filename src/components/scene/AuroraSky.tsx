import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { flight } from '../../game/flight';

// Northern-lights curtains across the top of the sky. The shader is React
// Bits' Aurora (https://reactbits.dev/backgrounds/aurora), ported into the
// r3f scene as a full-screen layer that sits just in front of the sky
// gradient — behind the planet, stars and rocket — instead of as a separate
// canvas over the game. Each level gets its own palette, and the curtains
// ripple faster as the rocket picks up speed.

const PALETTES: Array<[string, string, string]> = [
  ['#3fffb2', '#5227ff', '#ff6ad5'], // green · violet · pink
  ['#ff9d76', '#ffd77a', '#ff4f8b'], // sunset
  ['#6ad7ff', '#7cff67', '#6ad7ff'], // classic polar green
  ['#c9a4de', '#ff6ad5', '#6ad7ff'], // candy
  ['#7ee08f', '#ffd77a', '#ff9d76'], // spring
  ['#5227ff', '#6ad7ff', '#3fffb2'], // deep ocean
  ['#ff6ad5', '#b18cff', '#ffd77a'], // berry
  ['#ffd77a', '#3fffb2', '#6ad7ff'], // lemon-lime
];

function auroraPaletteFor(level: number): [string, string, string] {
  return PALETTES[(level - 1) % PALETTES.length];
}

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  // Full-screen quad pinned to the far plane: covers the view, and anything
  // in the scene (planet, rocket) is in front of it.
  gl_Position = vec4(position.xy, 0.9999, 1.0);
}
`;

const FRAG = /* glsl */ `
uniform float uTime;
uniform float uAmplitude;
uniform vec3 uColorStops[3];
uniform float uBlend;
uniform float uIntensity;
varying vec2 vUv;

vec3 permute(vec3 x) {
  return mod(((x * 34.0) + 1.0) * x, 289.0);
}

float snoise(vec2 v){
  const vec4 C = vec4(
      0.211324865405187, 0.366025403784439,
      -0.577350269189626, 0.024390243902439
  );
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);

  vec3 p = permute(
      permute(i.y + vec3(0.0, i1.y, 1.0))
    + i.x + vec3(0.0, i1.x, 1.0)
  );

  vec3 m = max(
      0.5 - vec3(
          dot(x0, x0),
          dot(x12.xy, x12.xy),
          dot(x12.zw, x12.zw)
      ), 
      0.0
  );
  m = m * m;
  m = m * m;

  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);

  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

struct ColorStop {
  vec3 color;
  float position;
};

#define COLOR_RAMP(colors, factor, finalColor) {              \
  int index = 0;                                            \
  for (int i = 0; i < 2; i++) {                               \
     ColorStop currentColor = colors[i];                    \
     bool isInBetween = currentColor.position <= factor;    \
     index = int(mix(float(index), float(i), float(isInBetween))); \
  }                                                         \
  ColorStop currentColor = colors[index];                   \
  ColorStop nextColor = colors[index + 1];                  \
  float range = nextColor.position - currentColor.position; \
  float lerpFactor = (factor - currentColor.position) / range; \
  finalColor = mix(currentColor.color, nextColor.color, lerpFactor); \
}

void main() {
  vec2 uv = vUv;

  ColorStop colors[3];
  colors[0] = ColorStop(uColorStops[0], 0.0);
  colors[1] = ColorStop(uColorStops[1], 0.5);
  colors[2] = ColorStop(uColorStops[2], 1.0);

  vec3 rampColor;
  COLOR_RAMP(colors, uv.x, rampColor);

  float height = snoise(vec2(uv.x * 2.0 + uTime * 0.1, uTime * 0.25)) * 0.5 * uAmplitude;
  height = exp(height);
  height = (uv.y * 2.0 - height + 0.2);
  float intensity = 0.6 * height;

  float midPoint = 0.20;
  float auroraAlpha = smoothstep(midPoint - uBlend * 0.5, midPoint + uBlend * 0.5, intensity);
  vec3 auroraColor = intensity * rampColor;

  // Additive light over the sky (upstream composited premultiplied color
  // onto a transparent canvas; here it's emitted light on top of the sky).
  gl_FragColor = vec4(auroraColor * auroraAlpha * uIntensity, 1.0);
}
`;

interface Props {
  level: number;
}

export function AuroraSky({ level }: Props) {
  const target = useMemo(() => auroraPaletteFor(level).map((c) => new THREE.Color(c)), [level]);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
        fog: false,
        uniforms: {
          uTime: { value: 0 },
          uAmplitude: { value: 1.0 },
          uColorStops: { value: auroraPaletteFor(level).map((c) => new THREE.Color(c)) },
          uBlend: { value: 0.5 },
          uIntensity: { value: 0.55 },
        },
      }),
    // created once; colors are eased toward the level's palette each frame
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 0.1);
    const u = material.uniforms;
    // Time advanced by speed (not multiplied), so speeding up never makes
    // the curtains jump — they just flow faster.
    u.uTime.value += dt * (0.6 + Math.min(flight.effective, 1.3) * 1.6) * 6;
    // Melt into the new level's palette over a couple of seconds.
    const k = 1 - Math.exp(-1.2 * dt);
    (u.uColorStops.value as THREE.Color[]).forEach((c, i) => c.lerp(target[i], k));
    // A touch brighter at speed.
    u.uIntensity.value = 0.65 + Math.min(flight.effective, 1.2) * 0.25;
  });

  return (
    <mesh material={material} frustumCulled={false} renderOrder={-10}>
      <planeGeometry args={[2, 2]} />
    </mesh>
  );
}
