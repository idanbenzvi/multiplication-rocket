import * as THREE from 'three';
import { SUN } from './field';
import { LANE, RULER } from './gates';
import type { CanyonPalette } from './palette';

// How the canyon looks: its sky, its rock and its gates of light.
//
// The sky is a late afternoon's on another world: deep violet overhead, a
// lilac haze at the horizon warming to gold towards its star, which sits low
// ahead (the next destination, canyon/World.tsx hangs it there), streaks of
// high cloud catching its light, and the first stars out. All of it leans a
// little towards the world's own colours, and its star's (palette.ts). The air between the ship and the rock
// is the same haze, thicker with distance and as a mist low in the canyon,
// so the canyon fades into the sky with no seam.
//
// The rock is sandstone in layers (the strata: maroon, rust, orange,
// peach, a thin band of cream), sand where it's flat, lit by the sun
// (where its shadow, baked into each point of the mesh, lets it), by the
// violet sky (less down in the hollows and the canyon's depths, its ambient
// occlusion, baked too), by the light bounced off the sunny rock, and round
// its edges against the sun, where the haze is lit. Near a gate, a number
// line is painted on the floor in light, a line along the canyon for every
// number, and the ship's own lane lit between; the gate's light falls on the
// rock round it.

const HAZE = /* glsl */ `
uniform vec3 uSun;
uniform vec3 uHazeLow;
uniform vec3 uHazeSun;
// the air's colour looking along d: lilac, warming towards the star
vec3 haze(vec3 d) {
  float s = max(dot(d, uSun), 0.0);
  vec3 c = mix(uHazeLow, uHazeSun, 0.12 + 0.88 * pow(s, 2.5));
  return c + uHazeSun * vec3(1.0, 1.44, 1.4) * pow(s, 20.0) * 0.55;
}
`;

const SKY_VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const SKY_FRAGMENT = /* glsl */ `
${HAZE}
uniform float uTime;
uniform vec3 uSkyHigh;
uniform vec3 uSkyTop;
uniform vec3 uCloud;
varying vec3 vDir;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}

void main() {
  vec3 d = normalize(vDir);
  float up = d.y;
  vec3 high = mix(uSkyHigh, uSkyTop, smoothstep(0.1, 0.8, up));
  vec3 col = mix(haze(d), high, smoothstep(-0.01, 0.38, up));
  float s = max(dot(d, uSun), 0.0);
  // streaks of high cloud, lit from below by the sun
  float around = atan(d.x, -d.z);
  vec2 q = vec2(around * 4.0 + uTime * 0.004, up * 26.0);
  float n = noise(q * vec2(1.0, 2.0)) * 0.6 + noise(q * vec2(2.3, 4.6) + 7.0) * 0.3 + noise(q * 6.0) * 0.1;
  float cloud = smoothstep(0.55, 0.85, n) * smoothstep(0.03, 0.1, up) * (1.0 - smoothstep(0.18, 0.42, up));
  col = mix(col, uCloud * (0.35 + 1.4 * pow(s, 3.0)), cloud * 0.55);
  // the star's glow round it (the star itself is the next destination, hung there)
  col += uHazeSun * vec3(1.0, 1.1, 1.0) * pow(s, 9.0) * 0.3;
  col += uHazeSun * 1.6 * pow(s, 400.0);
  // the first stars, high up
  vec2 g = vec2(around * 60.0, asin(clamp(up, -1.0, 1.0)) * 60.0);
  vec2 cell = floor(g);
  float h = hash(cell);
  vec2 spot = cell + vec2(hash(cell + 3.1), hash(cell + 5.7));
  float star = step(0.93, h) * smoothstep(0.12, 0.0, length(g - spot)) * smoothstep(0.3, 0.75, up);
  col += vec3(0.9, 0.85, 1.0) * star * (0.5 + 0.5 * sin(uTime * (1.0 + h * 3.0) + h * 40.0));
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

const vec = (c: [number, number, number]) => new THREE.Vector3(...c);

export function skyMaterial(palette: CanyonPalette): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: SKY_VERTEX,
    fragmentShader: SKY_FRAGMENT,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    uniforms: {
      uSun: { value: new THREE.Vector3(...SUN) },
      uTime: { value: 0 },
      uHazeLow: { value: vec(palette.hazeLow) },
      uHazeSun: { value: vec(palette.hazeSun) },
      uSkyHigh: { value: vec(palette.skyHigh) },
      uSkyTop: { value: vec(palette.skyTop) },
      uCloud: { value: vec(palette.cloud) },
    },
  });
}

const TERRAIN_VERTEX = /* glsl */ `
attribute vec4 shade;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec4 vShade;
void main() {
  vWorld = position;
  vNormal = normal;
  vShade = shade;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const TERRAIN_FRAGMENT = /* glsl */ `
${HAZE}
uniform sampler2D uStrata;
uniform vec3 uEye;
uniform float uFogEnd;
uniform float uFloorY;
uniform float uTime;
// the next gate: where along, its ruler's first number, how bright its number line on the floor, the ship's place across
uniform vec4 uRuler;
// the next gate's light: the middle of its bridge, how strong, and its colour
uniform vec4 uBand;
uniform vec3 uBandColor;
// a flash of light over the canyon (a bullseye's)
uniform vec3 uFlash;
// the world's colours (palette.ts): its sand, and the light
uniform vec3 uSandA;
uniform vec3 uSandB;
uniform vec3 uSunLight;
uniform vec3 uSkyLight;
uniform vec3 uBounce;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec4 vShade;

const float RULER = ${RULER.toFixed(1)};
const float LANE = ${LANE.toFixed(4)};
const float BAND_HALF = ${(RULER + 3).toFixed(1)};

void main() {
  vec3 n = normalize(vNormal);
  vec3 toEye = uEye - vWorld;
  float dist = length(toEye);
  vec3 V = -toEye / max(dist, 0.001);
  float sun = vShade.x;
  float sky = vShade.y;
  float u = vShade.w;
  float d = -vWorld.z;

  // sandstone in layers, and sand where it's flat, rippled across the way
  vec3 rock = texture2D(uStrata, vec2(vShade.z / 64.0, 0.5)).rgb;
  float flatness = smoothstep(0.8, 0.96, n.y);
  float ripple = 0.5 + 0.5 * sin(d * 0.9 + sin(u * 0.15) * 3.0);
  vec3 sand = mix(uSandA, uSandB, 0.5 + ripple * 0.3);
  vec3 albedo = mix(rock, sand, flatness);

  // the sun (wrapped a little round, as light scattered in rock is), the violet sky, light bounced off sunny rock
  float direct = clamp((dot(n, uSun) + 0.2) / 1.2, 0.0, 1.0) * sun;
  vec3 light = uSunLight * direct
    + uSkyLight * sky * (0.75 + 0.25 * n.y)
    + uBounce * sky * (0.5 - 0.5 * n.y);
  vec3 col = albedo * light;
  // edges against the sun, lit through the haze
  float rim = pow(1.0 - abs(dot(n, V)), 3.0) * pow(max(dot(V, uSun), 0.0), 2.0) * sun;
  col += uSunLight * vec3(0.42, 0.34, 0.29) * rim * 0.9;

  // the next gate's number line, painted on the floor in light as it nears
  float before = uRuler.x - d;
  if (uRuler.z > 0.0 && before > -1.0 && before < 330.0 && abs(u) < RULER + 2.0) {
    float k = (u + RULER) / LANE;
    float f = abs(fract(k + 0.5) - 0.5);
    float w = fwidth(k);
    float num = floor(k + 0.5) + uRuler.y;
    float five = 1.0 - step(0.5, mod(num + 0.25, 5.0));
    float line = (1.0 - smoothstep(0.02, 0.02 + w * 1.2, f)) * step(abs(k - 10.0), 10.5);
    float dash = smoothstep(0.15, 0.3, fract(d / 7.0)) * (1.0 - smoothstep(0.75, 0.9, fract(d / 7.0)));
    float bar = 1.0 - smoothstep(0.0, 0.7, abs(mod(before + 25.0, 50.0) - 25.0));
    float fade = smoothstep(330.0, 240.0, before) * smoothstep(-1.0, 4.0, before) * uRuler.z * flatness;
    float mine = 1.0 - smoothstep(LANE * 0.5 - 0.3, LANE * 0.5 + 0.3, abs(u - uRuler.w));
    col += vec3(0.3, 1.0, 1.2) * (line * (0.15 + 0.85 * dash) * (0.5 + 0.7 * five) + bar * 0.22 * step(abs(u), RULER)) * fade * 0.8;
    col += vec3(1.2, 0.75, 0.3) * mine * fade * 0.28;
  }

  // the gate's light on the rock round it
  vec3 q = vWorld - uBand.xyz;
  vec3 toBand = vec3(clamp(q.x, -BAND_HALF, BAND_HALF), 0.0, 0.0) - q;
  float bd = length(toBand);
  float glow = uBand.w / (1.0 + bd * bd / 320.0);
  col += albedo * uBandColor * glow * (0.35 + 0.65 * max(dot(n, toBand / max(bd, 0.001)), 0.0));
  col += albedo * uFlash;

  // the air: haze with distance, and a mist low in the canyon
  float fog = max(1.0 - exp(-dist * 0.0016), smoothstep(uFogEnd * 0.62, uFogEnd, dist));
  float mist = exp(-max(vWorld.y - uFloorY, 0.0) * 0.07) * (1.0 - exp(-dist * 0.005)) * 0.45;
  col = mix(col, haze(V), clamp(fog + mist * (1.0 - fog), 0.0, 1.0));
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

function strataTexture(strata: CanyonPalette['strata']): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 1;
  const ctx = canvas.getContext('2d')!;
  const total = strata.reduce((s, [, h]) => s + h, 0);
  let x = 0;
  for (const [color, h] of strata) {
    const w = (h / total) * 512;
    ctx.fillStyle = color;
    ctx.fillRect(x, 0, w + 1, 1);
    x += w;
  }
  // fine lines within the layers
  for (let i = 0; i < 512; i += 3 + Math.floor(Math.random() * 6)) {
    ctx.fillStyle = Math.random() < 0.5 ? 'rgba(0, 0, 0, 0.12)' : 'rgba(255, 230, 200, 0.1)';
    ctx.fillRect(i, 0, 1, 1);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

export function terrainMaterial(fogEnd: number, palette: CanyonPalette): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: TERRAIN_VERTEX,
    fragmentShader: TERRAIN_FRAGMENT,
    uniforms: {
      uSun: { value: new THREE.Vector3(...SUN) },
      uStrata: { value: strataTexture(palette.strata) },
      uEye: { value: new THREE.Vector3() },
      uFogEnd: { value: fogEnd },
      uFloorY: { value: 0 },
      uTime: { value: 0 },
      uRuler: { value: new THREE.Vector4(0, 0, 0, 0) },
      uBand: { value: new THREE.Vector4(0, 0, 0, 0) },
      uBandColor: { value: new THREE.Color(0.25, 0.9, 1.1) },
      uFlash: { value: new THREE.Color(0, 0, 0) },
      uHazeLow: { value: vec(palette.hazeLow) },
      uHazeSun: { value: vec(palette.hazeSun) },
      uSandA: { value: vec(palette.sand[0]) },
      uSandB: { value: vec(palette.sand[1]) },
      uSunLight: { value: vec(palette.sunLight) },
      uSkyLight: { value: vec(palette.skyLight) },
      uBounce: { value: vec(palette.bounce) },
    },
  });
}

// ---- the gates ----

const BRIDGE_VERTEX = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  vUv = uv;
  vWorld = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// A sheet of light across the canyon, a pane of dark glass for what's
// written on it to read against the bright haze: its ruler (drawn on a
// canvas, labels.ts), a faint shimmer drifting up it, and, where the ship
// will go through, its mark: a bar of amber light.
const BRIDGE_FRAGMENT = /* glsl */ `
uniform sampler2D map;
uniform vec3 uColor;
uniform float uFade;
uniform float uTime;
uniform float uMark;
uniform float uWidth;
varying vec2 vUv;
void main() {
  vec4 t = texture2D(map, vUv);
  // (the canvas's glow is in its alpha: its colour is the same all over it)
  float ink = t.a;
  float edge = smoothstep(0.0, 0.16, vUv.y) * smoothstep(1.0, 0.84, vUv.y) * smoothstep(0.0, 0.02, vUv.x) * smoothstep(1.0, 0.98, vUv.x);
  float shimmer = 0.5 + 0.5 * sin(vUv.y * 150.0 - uTime * 5.0);
  vec3 col = mix(vec3(0.05, 0.03, 0.12) + uColor * 0.08 * shimmer, uColor * t.rgb * 1.15, ink);
  float alpha = max(0.5 * edge, ink);
  float dx = (vUv.x - uMark) * uWidth;
  float mark = exp(-dx * dx * 1.6) * smoothstep(0.12, 0.42, vUv.y) * smoothstep(0.92, 0.62, vUv.y) * step(0.0, uMark);
  col += vec3(2.3, 1.35, 0.45) * mark;
  gl_FragColor = vec4(col, min(1.0, alpha + mark) * uFade);
}
`;

export function bridgeMaterial(map: THREE.Texture, width: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: BRIDGE_VERTEX,
    fragmentShader: BRIDGE_FRAGMENT,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
    uniforms: {
      map: { value: map },
      uColor: { value: new THREE.Color(0.35, 1.0, 1.15) },
      uFade: { value: 0 },
      uTime: { value: 0 },
      uMark: { value: -1 },
      uWidth: { value: width },
    },
  });
}
