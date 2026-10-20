import { useEffect, useRef, useState } from 'react';

// The About page's canyon, colour cycling the way Mark Ferrari's scenes moved
// (docs/plans/2026-10-21-canyon-cycle.md, made by scripts/canyon-cycle.py).
// The picture is one palette index per pixel, an R8 texture, and its 256
// colours are a 256 × 1 texture. The fragment shader reads a pixel's index
// and, if it's in one of the palette's cycling ranges (the lake's ripples,
// the shallows lapping at the shore, the sparkles, the stars, the porthole,
// the engine), turns it by the time × the range's rate, blending between
// neighbouring colours so it moves smoothly. Nothing is copied on the CPU
// from frame to frame: each frame is one quad drawn at the picture's own
// 640 × 357, which CSS scales up with crisp pixels. Without WebGL 2 (or with
// reduced motion) it's drawn once, still, on a 2D canvas.

interface Range {
  start: number;
  length: number;
  /** palette steps a second */
  rate: number;
  blend: boolean;
}

interface Scene {
  width: number;
  height: number;
  /** 256 × RGB */
  palette: Uint8Array;
  /** width × height palette indices, row by row from the top */
  index: Uint8Array;
  ranges: Range[];
}

const MAX_RANGES = 24;

const bytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

let loading: Promise<Scene> | null = null;
function loadScene(): Promise<Scene> {
  loading ??= fetch('./about/canyon.json')
    .then((r) => {
      if (!r.ok) throw new Error(`canyon: ${r.status}`);
      return r.json() as Promise<{ width: number; height: number; palette: string; index: string; ranges: Range[] }>;
    })
    .then((d) => ({ ...d, palette: bytes(d.palette), index: bytes(d.index), ranges: d.ranges.slice(0, MAX_RANGES) }));
  loading.catch(() => {
    loading = null;
  });
  return loading;
}

const VERT = /* glsl */ `#version 300 es
in vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }`;

const FRAG = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D u_index;   // R8: the palette index, as red / 255
uniform sampler2D u_palette; // 256 × 1
uniform vec4 u_ranges[${MAX_RANGES}]; // start, length, rate, blend
uniform int u_count;
uniform float u_time;
uniform float u_height;
out vec4 outColor;

vec3 pal(int i) { return texelFetch(u_palette, ivec2(i, 0), 0).rgb; }

void main() {
  // (the picture's rows run from the top)
  ivec2 p = ivec2(int(gl_FragCoord.x), int(u_height) - 1 - int(gl_FragCoord.y));
  int idx = int(texelFetch(u_index, p, 0).r * 255.0 + 0.5);
  vec3 c = pal(idx);
  for (int r = 0; r < ${MAX_RANGES}; r++) {
    if (r >= u_count) break;
    vec4 R = u_ranges[r];
    int s = int(R.x);
    int n = int(R.y);
    if (idx >= s && idx < s + n) {
      // the range turned by the time: a colour moves on to the next index along
      float q = mod(float(idx - s) - u_time * R.z, R.y);
      int i0 = int(floor(q));
      vec3 a = pal(s + i0);
      c = R.w > 0.5 ? mix(a, pal(s + (i0 + 1) % n), fract(q)) : a;
      break;
    }
  }
  outColor = vec4(c, 1.0);
}`;

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('no shader');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? 'shader');
  return shader;
}

/** the scene on WebGL 2: draws a frame for a time in seconds; null if it can't */
function glScene(canvas: HTMLCanvasElement, scene: Scene): ((t: number) => void) | null {
  const gl = canvas.getContext('webgl2', { antialias: false, depth: false, stencil: false, alpha: false, preserveDrawingBuffer: false });
  if (!gl || gl.isContextLost()) return null;
  try {
    const program = gl.createProgram();
    if (!program) return null;
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? 'link');
    gl.useProgram(program);

    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const pos = gl.getAttribLocation(program, 'a_pos');
    gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);

    const texture = (unit: number, w: number, h: number, internal: number, format: number, data: Uint8Array) => {
      const tex = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, gl.UNSIGNED_BYTE, data);
      // indices are never filtered: a pixel is its index
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    };
    texture(0, scene.width, scene.height, gl.R8, gl.RED, scene.index);
    texture(1, 256, 1, gl.RGB8, gl.RGB, scene.palette);
    gl.uniform1i(gl.getUniformLocation(program, 'u_index'), 0);
    gl.uniform1i(gl.getUniformLocation(program, 'u_palette'), 1);
    const ranges = new Float32Array(MAX_RANGES * 4);
    scene.ranges.forEach((r, i) => ranges.set([r.start, r.length, r.rate, r.blend ? 1 : 0], i * 4));
    gl.uniform4fv(gl.getUniformLocation(program, 'u_ranges'), ranges);
    gl.uniform1i(gl.getUniformLocation(program, 'u_count'), scene.ranges.length);
    gl.uniform1f(gl.getUniformLocation(program, 'u_height'), scene.height);
    const time = gl.getUniformLocation(program, 'u_time');
    gl.viewport(0, 0, scene.width, scene.height);

    return (t) => {
      if (gl.isContextLost()) return;
      gl.uniform1f(time, t);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };
  } catch {
    return null;
  }
}

/** the scene's first frame on a 2D canvas */
function drawStill(canvas: HTMLCanvasElement, scene: Scene) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const image = ctx.createImageData(scene.width, scene.height);
  const { palette, index } = scene;
  for (let i = 0; i < index.length; i++) {
    const c = index[i] * 3;
    image.data.set([palette[c], palette[c + 1], palette[c + 2], 255], i * 4);
  }
  ctx.putImageData(image, 0, 0);
}

export function CycleScene({ className = '' }: { className?: string }) {
  const holder = useRef<HTMLDivElement>(null);
  const [scene, setScene] = useState<Scene | null>(null);

  useEffect(() => {
    let alive = true;
    loadScene()
      .then((s) => alive && setScene(s))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // a canvas of its own each time (a context given back can't be had again)
  useEffect(() => {
    const box = holder.current;
    if (!box || !scene) return;
    const canvas = document.createElement('canvas');
    canvas.className = 'cycle-scene';
    canvas.width = scene.width;
    canvas.height = scene.height;
    box.append(canvas);
    const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const draw = calm ? null : glScene(canvas, scene);
    let raf = 0;
    if (draw) {
      const t0 = performance.now();
      const frame = (now: number) => {
        draw((now - t0) / 1000);
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
      canvas.addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
        cancelAnimationFrame(raf);
      });
    } else {
      drawStill(canvas, scene);
    }
    requestAnimationFrame(() => canvas.classList.add('is-shown'));
    return () => {
      cancelAnimationFrame(raf);
      if (draw) canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext();
      canvas.remove();
    };
  }, [scene]);

  return <div ref={holder} className={`cycle-holder ${className}`} aria-hidden="true" />;
}
