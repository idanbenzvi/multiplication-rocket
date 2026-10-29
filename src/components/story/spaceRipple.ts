import { Mesh, Program, Renderer, Texture, Triangle } from 'ogl';

// Space itself rippling as the Sun becomes the Black Sun (StoryOpening):
// two waves racing out from it, bending everything behind them like a lens,
// the colours splitting a little at their fronts, and fading as they go.
// It's a WebGL canvas laid over the story's, shown only while they run:
// each frame it takes the story's picture and draws it bent.

/** how long a wave runs (s), and the second after the first */
const LIFE = 2.2;
const ECHO = 0.3;
/** how far out a wave goes (the Sun's radii past its rim), and how wide it is at first and at the end */
const OUT = 8;
const WIDTH: [number, number] = [0.45, 1.2];
/** how far it bends what's behind it, at its strongest (the Sun's radii) */
const BEND = 0.32;

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
uniform sampler2D uScene;
uniform vec2 uSize;
uniform vec2 uCenter;
// each wave: its radius, its width and how hard it bends (px)
uniform vec3 uWave1;
uniform vec3 uWave2;

// how far a point at distance d is pushed along by a wave (px): out ahead of its front, in behind it, a lens's bend
float bend(float d, vec3 wave) {
  if (wave.z <= 0.0) return 0.0;
  float x = (d - wave.x) / wave.y;
  return -x * exp(-x * x * 2.0) * 2.33 * wave.z;
}

// how bright its front is
float crest(float d, vec3 wave) {
  if (wave.z <= 0.0) return 0.0;
  float x = (d - wave.x) / wave.y;
  return exp(-x * x * 3.0) * wave.z;
}

vec3 at(vec2 px) {
  return texture2D(uScene, clamp(px / uSize, vec2(0.0), vec2(1.0))).rgb;
}

void main() {
  vec2 px = vUv * uSize;
  vec2 d = px - uCenter;
  float dist = length(d);
  vec2 dir = dist > 0.0 ? d / dist : vec2(0.0);
  vec2 push = dir * (bend(dist, uWave1) + bend(dist, uWave2));
  // (the colours split a little where it bends most, as a lens's do)
  vec3 col = vec3(at(px - push * 1.25).r, at(px - push).g, at(px - push * 0.75).b);
  float light = crest(dist, uWave1) + crest(dist, uWave2);
  col += vec3(0.55, 0.4, 1.0) * light * 0.003;
  gl_FragColor = vec4(col, 1.0);
}
`;

const easeOut = (k: number) => 1 - (1 - k) ** 2;

export class SpaceRipple {
  private readonly renderer: Renderer;
  private readonly program: Program;
  private readonly mesh: Mesh;
  private readonly texture: Texture;
  private readonly canvas: HTMLCanvasElement;
  /** when the waves set off (the time that always runs; null: none running) */
  private from: number | null = null;

  private constructor(renderer: Renderer) {
    this.renderer = renderer;
    const gl = renderer.gl;
    this.canvas = gl.canvas as HTMLCanvasElement;
    this.texture = new Texture(gl, { generateMipmaps: false, minFilter: gl.LINEAR, magFilter: gl.LINEAR });
    this.program = new Program(gl, {
      vertex: VERTEX,
      fragment: FRAGMENT,
      uniforms: {
        uScene: { value: this.texture },
        uSize: { value: [1, 1] },
        uCenter: { value: [0, 0] },
        uWave1: { value: [0, 1, 0] },
        uWave2: { value: [0, 1, 0] },
      },
    });
    this.mesh = new Mesh(gl, { geometry: new Triangle(gl), program: this.program });
    this.canvas.style.visibility = 'hidden';
  }

  /** one drawing on `canvas` (laid over the story's), if WebGL's to be had */
  static make(canvas: HTMLCanvasElement): SpaceRipple | null {
    try {
      return new SpaceRipple(new Renderer({ canvas, dpr: 1, alpha: false, antialias: false, width: 2, height: 2 }));
    } catch {
      return null;
    }
  }

  /** the waves set off now (`time`: the time that always runs) */
  start(time: number) {
    this.from = time;
  }

  /** after the story's drawn `scene`: if the waves are running, drawn bent round the Sun at x, y, of radius r (px, on a screen w by h, `dpr` device px to the px) */
  frame(scene: HTMLCanvasElement, x: number, y: number, r: number, w: number, h: number, dpr: number, time: number) {
    const age = this.from === null ? Infinity : time - this.from;
    if (age > LIFE + ECHO || this.renderer.gl.isContextLost()) {
      if (this.from !== null) {
        this.from = null;
        this.canvas.style.visibility = 'hidden';
      }
      return;
    }
    if (scene.width !== this.canvas.width || scene.height !== this.canvas.height) {
      this.renderer.setSize(scene.width, scene.height);
      this.canvas.style.width = '';
      this.canvas.style.height = '';
    }
    const wave = (k: number): [number, number, number] => {
      if (k <= 0 || k >= 1) return [0, 1, 0];
      const e = easeOut(k);
      return [r * (1 + OUT * e) * dpr, r * (WIDTH[0] + (WIDTH[1] - WIDTH[0]) * k) * dpr, r * BEND * (1 - k) ** 1.5 * dpr];
    };
    const u = this.program.uniforms;
    this.texture.image = scene;
    this.texture.needsUpdate = true;
    u.uSize.value = [w * dpr, h * dpr];
    // (its y up, the screen's down)
    u.uCenter.value = [x * dpr, (h - y) * dpr];
    u.uWave1.value = wave(age / LIFE);
    u.uWave2.value = wave((age - ECHO) / LIFE);
    this.renderer.render({ scene: this.mesh });
    this.canvas.style.visibility = 'visible';
  }

  dispose() {
    this.renderer.gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
