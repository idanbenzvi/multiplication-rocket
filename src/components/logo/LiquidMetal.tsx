import { useEffect, useRef } from 'react';
import { Mesh, Program, Renderer, Texture, Triangle } from 'ogl';
import { LOGO } from './layout';

// The title's letters poured in liquid metal (StoryTitle.tsx), before the
// rest of the logo comes. Molten chrome fills each letter from the middle of
// its strokes out to their edges, left to right, its edge wobbling and hot;
// its surface ripples and the bands of light and dark it reflects run across
// it, bent round its bevels, their colours a little apart at their edges as
// liquid metal's are (a touch of the letters' own cyan above and magenta
// below), then it settles, cools into the letters as they're drawn, and a
// gleam runs across.
// Drawn over the logo's whole art, at its size; the letters are
// letters.webp (scripts/space-times-logo.py), the art base.webp.

const DIR = './brand/space-times/';
/** when each part happens (s from the start): the pour, the surface setting, the cooling, and the gleam */
const POUR = 1.5;
const SET = [1.3, 2.3];
const COOL = [1.75, 2.45];
const GLEAM = [1.95, 2.75];
/** all poured, cooled and gleamed (s) */
export const LIQUID_METAL_S = 2.8;
/** round the letters (art px: left, top, right, bottom) */
const LETTERS = [122, 234, 756, 516];

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
uniform sampler2D uMask;   // the letters (in its alpha)
uniform sampler2D uSoft;   // the letters softened, at half the size: g a little; b more (high in the strokes' middles)
uniform sampler2D uArt;    // the logo as drawn
uniform vec2 uTexel;       // one of the mask's pixels, in uv
uniform float uTime;
uniform float uPour;       // 0 … 1: how far the metal's filled the letters
uniform float uMelt;       // 1 molten … 0 set: how much its surface ripples
uniform float uCool;       // 0 chrome … 1 the letters as drawn
uniform float uGleam;      // the last gleam's place across (0 … 1)
uniform vec4 uLetters;     // the letters' box in uv (left, bottom, right, top)

// the letters (r), softened a little (g) and more (b)
vec3 maskAt(vec2 uv) {
  return vec3(texture2D(uMask, uv).a, texture2D(uSoft, uv).gb);
}

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    s += a * noise(p);
    p = p * 2.03 + 1.7;
    a *= 0.5;
  }
  return s;
}

// where the metal is up to: its edge climbing from the strokes' middles (b high) out to the letters' edges,
// sooner on the left and in the top word
float edgeAt(vec2 uv, float t) {
  vec2 l = clamp((uv - uLetters.xy) / (uLetters.zw - uLetters.xy), 0.0, 1.0);
  float level = clamp(uPour * 1.9 - l.x * 0.6 - (1.0 - l.y) * 0.3, 0.0, 1.0);
  float wobble = (fbm(uv * 9.0 + vec2(t * 0.9, -t * 0.6)) - 0.5) * 0.35 * (1.0 - level);
  return mix(1.05, 0.38, level) + wobble;
}

// the metal's height at uv: a rounded bevel, the middles raised, rising as it fills
float heightAt(vec2 uv, float edge) {
  vec3 m = maskAt(uv);
  float filled = max(smoothstep(edge, edge + 0.1, m.b), smoothstep(0.85, 1.0, uPour));
  return (0.55 * m.g + 0.45 * m.b) * filled;
}

// what the chrome reflects: bands of light and dark (0 dark … 1 light)
float band(float y) {
  return smoothstep(0.15, 0.85, 0.5 + 0.5 * sin(y));
}

void main() {
  float t = uTime;
  // the molten surface swimming (still once it's set)
  vec2 swim = vec2(fbm(vUv * 4.0 + vec2(t * 0.35, -t * 0.2)), fbm(vUv * 4.0 + vec2(-t * 0.25, t * 0.3) + 5.2)) - 0.5;
  vec2 uv = vUv + swim * 0.012 * uMelt;
  vec3 m = maskAt(uv);
  float edge = edgeAt(vUv, t);
  // (all of it at the end, thin strokes too)
  float filled = max(smoothstep(edge, edge + 0.1, m.b), smoothstep(0.85, 1.0, uPour));
  float a = m.r * filled;
  // (the molten front, hot)
  float front = smoothstep(edge + 0.06, edge + 0.12, m.b) - smoothstep(edge + 0.14, edge + 0.3, m.b);
  if (a < 0.002) {
    gl_FragColor = vec4(0.0);
    return;
  }

  // its slope, and the ripples on it while it's molten
  vec2 dx = vec2(uTexel.x * 1.5, 0.0);
  vec2 dy = vec2(0.0, uTexel.y * 1.5);
  float hx = heightAt(uv + dx, edge) - heightAt(uv - dx, edge);
  float hy = heightAt(uv + dy, edge) - heightAt(uv - dy, edge);
  vec2 ripple = vec2(cos(swim.x * 18.0 + t * 3.1), sin(swim.y * 18.0 - t * 2.7)) * 0.05 * uMelt;
  vec3 n = normalize(vec3(-hx * 5.0 + ripple.x, -hy * 5.0 + ripple.y, 1.0));

  // chrome: the bands it reflects, bent by its slope, wandering and (molten) running; each colour a little apart
  vec2 l = clamp((vUv - uLetters.xy) / (uLetters.zw - uLetters.xy), 0.0, 1.0);
  float y = l.y * 7.0 + n.y * 7.0 - n.x * 2.5 + (fbm(vUv * 3.0 + vec2(t * 0.22, -t * 0.15)) - 0.5) * (2.5 + 4.0 * uMelt) + t * 1.4 * uMelt;
  vec3 chrome = vec3(band(y + 0.32), band(y), band(y - 0.32));
  vec3 col = mix(vec3(0.05, 0.05, 0.11), vec3(0.98, 0.99, 1.0), chrome);
  // (cyan above, magenta below)
  col *= mix(vec3(1.0, 0.72, 1.0), vec3(0.78, 1.0, 1.05), l.y);
  // (a highlight, and its rim catching the light)
  vec3 light = normalize(vec3(-0.45, 0.65, 0.62));
  col += vec3(1.0) * pow(max(dot(reflect(-light, n), vec3(0.0, 0.0, 1.0)), 0.0), 36.0) * 0.9;
  col += vec3(0.75, 0.85, 1.0) * pow(1.0 - n.z, 2.0) * 0.6;
  col += vec3(1.0, 0.86, 0.98) * front * 0.7 * uMelt;

  // cooled: the letters as drawn, and a gleam across them
  vec4 art = texture2D(uArt, vUv);
  col = mix(col, art.rgb / max(art.a, 0.001), uCool);
  float g = vUv.x + (1.0 - vUv.y) * 0.45 - (uGleam * 1.9 - 0.45);
  col += vec3(1.0) * exp(-g * g * 160.0) * step(0.001, uGleam) * step(uGleam, 0.999) * 0.85;

  gl_FragColor = vec4(col * a, a);
}
`;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (a: number, b: number, t: number) => {
  const u = clamp01((t - a) / (b - a));
  return u * u * (3 - 2 * u);
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** a box blur, three times over (about a Gaussian), of a w × h field, `r` pixels each way */
function soften(src: Float32Array, w: number, h: number, r: number): Float32Array {
  let a = src.slice();
  let b = new Float32Array(a.length);
  const pass = (from: Float32Array, to: Float32Array, step: number, n: number, lines: number, lineStep: number) => {
    const k = 1 / (2 * r + 1);
    for (let line = 0; line < lines; line++) {
      const o = line * lineStep;
      let sum = 0;
      for (let i = -r; i <= r; i++) sum += from[o + Math.min(n - 1, Math.max(0, i)) * step];
      for (let i = 0; i < n; i++) {
        to[o + i * step] = sum * k;
        sum += from[o + Math.min(n - 1, i + r + 1) * step] - from[o + Math.max(0, i - r) * step];
      }
    }
  };
  for (let i = 0; i < 3; i++) {
    pass(a, b, 1, w, h, w);
    [a, b] = [b, a];
    pass(a, b, w, h, w, 1);
    [a, b] = [b, a];
  }
  return a;
}

/** two softer copies of the letters as one picture (g, b), at half the size (they're soft) */
function softCanvas(letters: HTMLImageElement): HTMLCanvasElement {
  const w = Math.round(LOGO.width / 2);
  const h = Math.round(LOGO.height / 2);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(letters, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h);
  const field = new Float32Array(w * h);
  for (let i = 0; i < field.length; i++) field[i] = data.data[i * 4 + 3] / 255;
  const little = soften(field, w, h, 1);
  const more = soften(field, w, h, 2);
  for (let i = 0; i < field.length; i++) {
    data.data[i * 4] = 0;
    data.data[i * 4 + 1] = Math.min(1, little[i]) * 255;
    // (the strokes' middles near 1, their edges near a half)
    data.data[i * 4 + 2] = Math.min(1, more[i] * 1.15) * 255;
    data.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(data, 0, 0);
  return canvas;
}

interface Props {
  /** the logo's height (px) */
  height: number;
  /** how long it waits before pouring (s) */
  delay?: number;
  /** the pour beginning */
  onPour?: () => void;
  /** the letters cooled (the gleam still to come) */
  onCooled: () => void;
  /** all done (LIQUID_METAL_S after the pour began) */
  onDone: () => void;
}

/** the letters poured in liquid metal, over a logo `height` px tall */
export function LiquidMetal({ height, delay = 0, ...props }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const on = useRef(props);
  useEffect(() => {
    on.current = props;
  });

  useEffect(() => {
    const host = box.current;
    if (!host) return;
    let alive = true;
    let raf = 0;
    // (with no metal to pour, on with the logo)
    const skip = () => {
      on.current.onCooled();
      on.current.onDone();
    };
    // (a canvas of its own each time: a WebGL context given back can't be had again)
    let renderer: Renderer;
    try {
      renderer = new Renderer({ dpr: Math.min(window.devicePixelRatio || 1, 2), alpha: true, premultipliedAlpha: true, antialias: false });
    } catch {
      skip();
      return;
    }
    const gl = renderer.gl;
    gl.clearColor(0, 0, 0, 0);
    const canvas = gl.canvas as HTMLCanvasElement;
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    host.appendChild(canvas);
    renderer.setSize(host.clientWidth, host.clientHeight);

    Promise.all([loadImage(`${DIR}letters.webp`), loadImage(`${DIR}base.webp`)])
      .then(([letters, art]) => {
        if (!alive) return;
        const program = new Program(gl, {
          vertex: VERTEX,
          fragment: FRAGMENT,
          transparent: true,
          uniforms: {
            uMask: { value: new Texture(gl, { image: letters, generateMipmaps: false }) },
            uSoft: { value: new Texture(gl, { image: softCanvas(letters), generateMipmaps: false }) },
            uArt: { value: new Texture(gl, { image: art, generateMipmaps: false, premultiplyAlpha: false }) },
            uTexel: { value: [1 / LOGO.width, 1 / LOGO.height] },
            uTime: { value: 0 },
            uPour: { value: 0 },
            uMelt: { value: 1 },
            uCool: { value: 0 },
            uGleam: { value: 0 },
            uLetters: { value: [LETTERS[0] / LOGO.width, 1 - LETTERS[3] / LOGO.height, LETTERS[2] / LOGO.width, 1 - LETTERS[1] / LOGO.height] },
          },
        });
        const mesh = new Mesh(gl, { geometry: new Triangle(gl), program });
        // (drawn once now, nothing poured yet, so its shader's built while it waits rather than as it starts)
        renderer.render({ scene: mesh });
        const start = performance.now() + delay * 1000;
        let poured = false;
        let cooled = false;
        const frame = () => {
          if (!alive) return;
          const t = (performance.now() - start) / 1000;
          if (t < 0) {
            raf = requestAnimationFrame(frame);
            return;
          }
          if (!poured) {
            poured = true;
            on.current.onPour?.();
          }
          if (!cooled && t >= COOL[1]) {
            cooled = true;
            on.current.onCooled();
          }
          const u = program.uniforms;
          u.uTime.value = t;
          u.uPour.value = smooth(0, POUR, t);
          u.uMelt.value = 1 - smooth(SET[0], SET[1], t);
          u.uCool.value = smooth(COOL[0], COOL[1], t);
          u.uGleam.value = clamp01((t - GLEAM[0]) / (GLEAM[1] - GLEAM[0]));
          renderer.render({ scene: mesh });
          if (t >= LIQUID_METAL_S) {
            // (still now: the last frame stays)
            on.current.onDone();
            return;
          }
          raf = requestAnimationFrame(frame);
        };
        raf = requestAnimationFrame(frame);
      })
      .catch(() => {
        if (alive) skip();
      });

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      canvas.remove();
    };
    // (`delay` is read once: the pour has its own clock)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={box} className="st-liquid" style={{ width: (height * LOGO.width) / LOGO.height, height }} aria-hidden />;
}
