import { Mesh, Program, Renderer, Triangle } from 'ogl';
import { qualityTier } from '../../settings/quality';

// The story's Sun as a living ball of light (StorySun): smoke churning
// over a sphere, lit bright round its rim, glowing out into space; warm and
// golden as it was, and as it turns, its smoke churning faster and thicker,
// its colour draining, dark veins creeping in from its rim, until it's the
// Black Sun's own dark, smoky face (after ThreeUI's Energy Orb, MIT; ours).
// Drawn by WebGL on a canvas of its own, then stamped onto the story's.

/** a colour, 0 to 1 */
export type Rgb = [number, number, number];

/** how the orb looks: everything the turn changes */
export interface OrbLook {
  /** the sphere's darkest smoke, its middle tones, its brightest wisps */
  deep: Rgb;
  mid: Rgb;
  hot: Rgb;
  /** the light round its rim and the glow off it */
  rim: Rgb;
  /** its veins, and the light along their edges */
  vein: Rgb;
  veinGlow: Rgb;
  /** how fine the smoke is (1: as it was), how much of it shows, how fast it churns */
  scale: number;
  strength: number;
  speed: number;
  /** how bright its rim and its glow are */
  glow: number;
  /** colour (1 as it is, 0 grey) and brightness */
  saturation: number;
  brightness: number;
  /** how far in from the rim the veins have crept (0: none, 1: all over) */
  veins: number;
}

const rgb = (hex: string): Rgb => [parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255];

/** the Sun as it was */
export const WARM: OrbLook = {
  deep: rgb('#c2370a'),
  mid: rgb('#ff9620'),
  hot: rgb('#fff4c2'),
  rim: rgb('#ffc76a'),
  vein: rgb('#14031f'),
  veinGlow: rgb('#b25cff'),
  scale: 1,
  strength: 1,
  speed: 1,
  glow: 1.1,
  saturation: 1.05,
  brightness: 1,
  veins: 0,
};

/** the Black Sun */
export const EVIL: OrbLook = {
  deep: rgb('#030106'),
  mid: rgb('#16062a'),
  hot: rgb('#4a1784'),
  rim: rgb('#8a4dff'),
  vein: rgb('#020004'),
  veinGlow: rgb('#ff3d8b'),
  scale: 1.15,
  strength: 1,
  speed: 1.6,
  glow: 0.55,
  saturation: 1,
  brightness: 0.75,
  veins: 1,
};

const mixRgb = (a: Rgb, b: Rgb, k: number): Rgb => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/** `k` of the way from the Sun to the Black Sun: halfway, its colour drains and its smoke churns its hardest */
export function turning(k: number): OrbLook {
  const mid = Math.sin(Math.PI * k);
  return {
    deep: mixRgb(WARM.deep, EVIL.deep, k),
    mid: mixRgb(WARM.mid, EVIL.mid, k),
    hot: mixRgb(WARM.hot, EVIL.hot, k),
    rim: mixRgb(WARM.rim, EVIL.rim, k),
    vein: EVIL.vein,
    veinGlow: mixRgb(WARM.veinGlow, EVIL.veinGlow, k),
    scale: lerp(WARM.scale, EVIL.scale, k),
    strength: lerp(WARM.strength, EVIL.strength, k) + 0.5 * mid,
    speed: lerp(WARM.speed, EVIL.speed, k) + 1.6 * mid,
    glow: lerp(WARM.glow, EVIL.glow, k),
    saturation: lerp(WARM.saturation, EVIL.saturation, k) - 0.55 * mid,
    brightness: lerp(WARM.brightness, EVIL.brightness, k),
    veins: k,
  };
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
uniform vec3 uDeep;
uniform vec3 uMid;
uniform vec3 uHot;
uniform vec3 uRim;
uniform vec3 uVein;
uniform vec3 uVeinGlow;
uniform float uScale;
uniform float uStrength;
uniform float uGlow;
uniform float uSaturation;
uniform float uBrightness;
uniform float uVeins;

const float R = ${(1 / ORB_REACH).toFixed(4)};

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

// (four octaves, each turned a little off the last so no grid shows)
float fbm(vec3 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = vec3(p.y * 1.6 + p.z * 1.2, p.z * 1.6 - p.x * 1.2, p.x * 1.6 + p.y * 1.2) + vec3(1.7, 9.2, 4.1);
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  vec3 inner = vec3(0.0);
  if (r < R) {
    float z = sqrt(R * R - r * r);
    vec3 n = vec3(p, z) / R;
    // (the smoke turning round with it)
    float c = cos(uSpin);
    float s = sin(uSpin);
    vec3 q = vec3(c * n.x + s * n.z, n.y, c * n.z - s * n.x);
    float f1 = fbm(q * 2.4 * uScale + vec3(0.0, uSmoke * 0.12, 0.0));
    float f2 = fbm(q * 4.2 * uScale - vec3(uSmoke * 0.08, 0.0, uSmoke * 0.05) + f1 * 1.9);
    float wisps = smoothstep(0.36, 0.78, f2);
    inner = mix(uDeep, uMid, clamp(f1 * 1.3, 0.0, 1.0));
    inner = mix(inner, uHot, clamp(wisps * 0.7 * uStrength, 0.0, 1.0));
    // its veins, creeping in from the rim: the ridges of a slower smoke
    float toRim = 1.0 - z / R;
    float reach = smoothstep(1.0 - uVeins * 1.2, 1.0 - uVeins * 1.2 + 0.3, toRim + 0.15 * f1);
    float ridge = 1.0 - abs(fbm(q * 3.3 + vec3(5.2, uSmoke * 0.025, 1.3)) * 2.0 - 1.0);
    float line = smoothstep(0.84, 0.95, ridge) * reach;
    float edge = (smoothstep(0.7, 0.84, ridge) - smoothstep(0.84, 0.95, ridge)) * reach;
    inner = mix(inner, uVein, line);
    inner += uVeinGlow * edge * 0.55;
    // the light round its rim, and a soft shine up top
    inner += uRim * pow(toRim, 2.2) * 1.1 * uGlow;
    inner += uHot * pow(max(dot(n, normalize(vec3(-0.25, 0.6, 0.75))), 0.0), 3.0) * 0.3 * uGlow;
    inner += uRim * smoothstep(R - 0.04, R, r) * 0.5 * uGlow;
  }
  // its glow, out into space
  float g = exp(-(r - R) * 9.0) * (1.0 - smoothstep(0.85, 1.0, r));
  vec3 outer = uRim * g * 0.75 * uGlow;
  float outA = clamp(g * 0.8 * min(uGlow, 1.0), 0.0, 1.0);
  float on = 1.0 - smoothstep(R - uEdge, R, r);
  vec3 col = mix(outer, inner, on);
  float alpha = mix(outA, 1.0, on);
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = max(mix(vec3(lum), col, uSaturation), 0.0) * uBrightness;
  gl_FragColor = vec4(col, alpha);
}
`;

/** (its canvas's side grows in steps of this, so it isn't made again every frame as the camera moves in) */
const STEP = 64;
/** no bigger than this (px), at each step of the graphics (settings/quality.ts): the smoke's soft, and it's stretched to fit */
const MAX_SIDE = [1024, 640, 448];

export class SunOrb {
  private readonly renderer: Renderer;
  private readonly program: Program;
  private readonly mesh: Mesh;
  private side = 0;

  private constructor(renderer: Renderer) {
    this.renderer = renderer;
    const gl = renderer.gl;
    gl.clearColor(0, 0, 0, 0);
    const v3 = (): { value: Rgb } => ({ value: [0, 0, 0] });
    this.program = new Program(gl, {
      vertex: VERTEX,
      fragment: FRAGMENT,
      transparent: true,
      uniforms: {
        uSmoke: { value: 0 },
        uSpin: { value: 0 },
        uEdge: { value: 0.01 },
        uDeep: v3(),
        uMid: v3(),
        uHot: v3(),
        uRim: v3(),
        uVein: v3(),
        uVeinGlow: v3(),
        uScale: { value: 1 },
        uStrength: { value: 1 },
        uGlow: { value: 1 },
        uSaturation: { value: 1 },
        uBrightness: { value: 1 },
        uVeins: { value: 0 },
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
      orb.render(STEP, WARM, 0, 0);
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
    u.uDeep.value = look.deep;
    u.uMid.value = look.mid;
    u.uHot.value = look.hot;
    u.uRim.value = look.rim;
    u.uVein.value = look.vein;
    u.uVeinGlow.value = look.veinGlow;
    u.uScale.value = look.scale;
    u.uStrength.value = look.strength;
    u.uGlow.value = look.glow;
    u.uSaturation.value = look.saturation;
    u.uBrightness.value = look.brightness;
    u.uVeins.value = look.veins;
    this.renderer.render({ scene: this.mesh });
    return gl.canvas as HTMLCanvasElement;
  }

  dispose() {
    this.renderer.gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
