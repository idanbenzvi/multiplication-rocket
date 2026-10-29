import { Mesh, Program, Renderer, Triangle } from 'ogl';
import { qualityTier } from '../../settings/quality';

// The story's Sun as a living ball of light (StorySun): smoke churning
// over a sphere, lit bright round its rim, glowing out into space; warm and
// golden as it was. As it turns, the dark eats its light from the rim in, a
// ragged front of dark violet smoke closing over it, glowing hot where it
// meets the gold, its smoke surging, until it's the Black Sun's own dark,
// smoky face (after ThreeUI's Energy Orb, MIT; ours). Drawn by WebGL on a
// canvas of its own, then stamped onto the story's.

/** what the turn changes, moment to moment */
export interface OrbLook {
  /** how far the dark has eaten in (0: the Sun as it was, 1: the Black Sun) */
  corrupt: number;
  /** how fast its smoke churns (1: as it was) */
  speed: number;
  /** how bright its rim and its glow are, how much of its brightest smoke shows, and its colour (1: as it is, 0: grey) */
  glow: number;
  strength: number;
  saturation: number;
}

/** the Black Sun, still */
export const EVIL: OrbLook = { corrupt: 1, speed: 1.6, glow: 1, strength: 1, saturation: 1 };

/** `k` of the way through the turn: the front sweeping in, faster as it goes, the smoke surging */
export function turning(k: number): OrbLook {
  return { corrupt: k * k * (2 - k), speed: 1 + 0.6 * k + 3 * Math.sin(Math.PI * k), glow: 1, strength: 1 + 0.6 * Math.sin(Math.PI * k), saturation: 1 };
}

/** the sphere's radius, of the canvas's half-width: the rest is its glow */
export const ORB_REACH = 1.6;

const VERTEX = /* glsl */ `
attribute vec2 position;
attribute vec2 uv;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform float uSmoke;
uniform float uSpin;
uniform float uEdge;
uniform float uCorrupt;
uniform float uGlow;
uniform float uStrength;
uniform float uSaturation;

const float R = ${(1 / ORB_REACH).toFixed(4)};
// the Sun as it was: its darkest smoke, its middle, its brightest wisps, its rim
const vec3 W_DEEP = vec3(0.76, 0.22, 0.04);
const vec3 W_MID = vec3(1.0, 0.59, 0.13);
const vec3 W_HOT = vec3(1.0, 0.96, 0.76);
const vec3 W_RIM = vec3(1.0, 0.78, 0.42);
// the Black Sun
const vec3 E_DEEP = vec3(0.012, 0.004, 0.024);
const vec3 E_MID = vec3(0.086, 0.024, 0.165);
const vec3 E_HOT = vec3(0.29, 0.09, 0.52);
const vec3 E_RIM = vec3(0.54, 0.3, 1.0);
// where the dark meets the light
const vec3 FRONT = vec3(1.0, 0.36, 0.62);

float hash(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1137, 0.0973));
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

float noise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = mix(hash(i), hash(i + vec3(1.0, 0.0, 0.0)), f.x);
  float b = mix(hash(i + vec3(0.0, 1.0, 0.0)), hash(i + vec3(1.0, 1.0, 0.0)), f.x);
  float c = mix(hash(i + vec3(0.0, 0.0, 1.0)), hash(i + vec3(1.0, 0.0, 1.0)), f.x);
  float d = mix(hash(i + vec3(0.0, 1.0, 1.0)), hash(i + vec3(1.0, 1.0, 1.0)), f.x);
  return mix(mix(a, b, f.y), mix(c, d, f.y), f.z);
}

// (three octaves, each turned a little off the last so no grid shows)
float fbm(vec3 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 3; i++) {
    v += a * noise(p);
    p = vec3(p.y * 1.6 + p.z * 1.2, p.z * 1.6 - p.x * 1.2, p.x * 1.6 + p.y * 1.2) + vec3(1.7, 9.2, 4.1);
    a *= 0.5;
  }
  return v / 0.875;
}

void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  vec3 inner = vec3(0.0);
  vec3 rim = mix(W_RIM, E_RIM, uCorrupt);
  if (r < R) {
    float z = sqrt(R * R - r * r);
    vec3 n = vec3(p, z) / R;
    // (the smoke turning round with it)
    float c = cos(uSpin);
    float s = sin(uSpin);
    vec3 q = vec3(c * n.x + s * n.z, n.y, c * n.z - s * n.x);
    float f1 = fbm(q * 2.4 + vec3(0.0, uSmoke * 0.12, 0.0));
    float f2 = fbm(q * 4.2 - vec3(uSmoke * 0.08, 0.0, uSmoke * 0.05) + f1 * 1.9);
    float wisps = clamp(smoothstep(0.36, 0.78, f2) * 0.7 * uStrength, 0.0, 1.0);
    float body = clamp(f1 * 1.3, 0.0, 1.0);
    vec3 warm = mix(mix(W_DEEP, W_MID, body), W_HOT, wisps);
    vec3 dark = mix(mix(E_DEEP, E_MID, body), E_HOT, wisps);
    // the dark eating in from the rim, its front ragged with the smoke
    float depth = n.z + (f2 - 0.5) * 0.55 + (f1 - 0.5) * 0.3;
    float reach = uCorrupt * 1.75 - 0.35;
    float eaten = uCorrupt >= 1.0 ? 1.0 : 1.0 - smoothstep(reach - 0.12, reach + 0.04, depth);
    float front = uCorrupt > 0.0 && uCorrupt < 1.0 ? exp(-abs(depth - reach) * 16.0) : 0.0;
    inner = mix(warm, dark, eaten);
    inner += FRONT * front * 1.3;
    // the light round its rim, and a soft shine up top
    float toRim = 1.0 - z / R;
    vec3 shine = mix(W_HOT, E_HOT, eaten);
    inner += mix(W_RIM, E_RIM, eaten) * pow(toRim, 2.2) * mix(1.1, 0.6, eaten) * uGlow;
    inner += shine * pow(max(dot(n, normalize(vec3(-0.25, 0.6, 0.75))), 0.0), 3.0) * 0.3 * uGlow;
    inner += rim * smoothstep(R - 0.04, R, r) * 0.5 * uGlow;
  }
  // its glow, out into space
  float glow = uGlow * mix(1.1, 0.55, uCorrupt);
  float g = exp(-(r - R) * 9.0) * (1.0 - smoothstep(0.85, 1.0, r));
  vec3 outer = rim * g * 0.75 * glow;
  float outA = clamp(g * 0.8 * min(glow, 1.0), 0.0, 1.0);
  float on = 1.0 - smoothstep(R - uEdge, R, r);
  vec3 col = mix(outer, inner, on);
  float alpha = mix(outA, 1.0, on);
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = max(mix(vec3(lum), col, uSaturation), 0.0);
  gl_FragColor = vec4(col, alpha);
}
`;

/** (its canvas's side grows in steps of this, so it isn't made again every frame as the camera moves in) */
const STEP = 64;
/** no bigger than this (px), at each step of the graphics (settings/quality.ts): the smoke's soft, and it's stretched to fit */
const MAX_SIDE = [768, 512, 384];

export class SunOrb {
  private readonly renderer: Renderer;
  private readonly program: Program;
  private readonly mesh: Mesh;
  private side = 0;

  private constructor(renderer: Renderer) {
    this.renderer = renderer;
    const gl = renderer.gl;
    gl.clearColor(0, 0, 0, 0);
    this.program = new Program(gl, {
      vertex: VERTEX,
      fragment: FRAGMENT,
      transparent: true,
      uniforms: {
        uSmoke: { value: 0 },
        uSpin: { value: 0 },
        uEdge: { value: 0.01 },
        uCorrupt: { value: 0 },
        uGlow: { value: 1 },
        uStrength: { value: 1 },
        uSaturation: { value: 1 },
      },
    });
    this.mesh = new Mesh(gl, { geometry: new Triangle(gl), program: this.program });
  }

  /** one, if WebGL's to be had (else null: the Sun's drawn as before) */
  static make(): SunOrb | null {
    try {
      const renderer = new Renderer({ dpr: 1, alpha: true, premultipliedAlpha: true, antialias: false, width: STEP, height: STEP });
      const orb = new SunOrb(renderer);
      // (drawn once now, so its shader's built before it's needed)
      orb.render(STEP, EVIL, 0, 0);
      return orb;
    } catch {
      return null;
    }
  }

  /** drawn `px` across (device px), looking like `look`, its smoke at `smoke` (its own clock) and turned `spin`: its canvas, to stamp at once */
  render(px: number, look: OrbLook, smoke: number, spin: number): HTMLCanvasElement | null {
    const gl = this.renderer.gl;
    if (gl.isContextLost()) return null;
    const want = Math.min(MAX_SIDE[qualityTier()], Math.max(STEP, Math.ceil(px / STEP) * STEP));
    if (want !== this.side) {
      this.side = want;
      this.renderer.setSize(want, want);
    }
    const u = this.program.uniforms;
    u.uSmoke.value = smoke;
    u.uSpin.value = spin;
    // (the rim's edge, a pixel and a half wide)
    u.uEdge.value = 3 / Math.max(1, Math.min(px, this.side));
    u.uCorrupt.value = look.corrupt;
    u.uGlow.value = look.glow;
    u.uStrength.value = look.strength;
    u.uSaturation.value = look.saturation;
    this.renderer.render({ scene: this.mesh });
    return gl.canvas as HTMLCanvasElement;
  }

  dispose() {
    this.renderer.gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
