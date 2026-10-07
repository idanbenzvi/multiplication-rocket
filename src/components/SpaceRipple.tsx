import { useEffect, useRef } from 'react';

interface Props {
  /** the canvas whose picture gets rippled (the warp starfield) */
  source: React.RefObject<HTMLCanvasElement | null>;
  /** performance.now() when the pulse left the ship; 0 = no ripple */
  startedAt: number;
  /** where it starts, in this element's CSS pixels (top-left origin) */
  origin: { x: number; y: number };
  /** ring speed, CSS pixels per second */
  speed: number;
}

// An energy pulse rippling through space: three expanding rings that act as
// lenses on the starfield behind them (it really bends — the shader samples
// the warp canvas as a texture), with chromatic fringes, a cyan-white core,
// pink energy filaments crackling around each ring, and a fading wake.
const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

const FRAG = `
precision highp float;
uniform sampler2D uTex;
uniform vec2 uRes;      // element size, CSS px
uniform vec2 uOrigin;   // pulse origin, CSS px, GL orientation (y up)
uniform float uTime;    // seconds since the pulse
uniform float uSpeed;   // px / s
varying vec2 vUv;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

void main() {
  vec2 px = vUv * uRes;
  vec2 d = px - uOrigin;
  float dist = length(d);
  vec2 dir = d / max(dist, 1.0);
  float ang = atan(d.y, d.x);
  float maxR = length(uRes) * 1.1;

  float disp = 0.0;
  vec3 glow = vec3(0.0);
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float r = uTime * uSpeed - fi * 140.0;
    if (r <= 0.0) continue;
    float width = 22.0 + r * 0.05;
    float x = (dist - r) / width;
    float band = exp(-x * x);
    float amp = (1.0 - fi * 0.28) * clamp(1.0 - r / maxR, 0.0, 1.0);
    // derivative-of-gaussian: pushes outward ahead of the ring, pulls in behind — a lens
    disp += -x * band * amp * 46.0;
    // crackling energy filaments riding the ring
    float fil = noise(vec2(ang * 9.0 + fi * 3.1, uTime * 4.0 - fi));
    fil = pow(fil, 3.0) + pow(noise(vec2(ang * 23.0, uTime * 7.0 + fi * 5.0)), 6.0) * 0.8;
    glow += band * amp * (vec3(0.35, 0.8, 1.0) * 0.85 + vec3(1.0, 0.42, 0.85) * fil * 1.6 + vec3(1.0) * pow(band, 8.0) * 0.9);
  }
  // soft wake inside the leading ring, fading out
  float lead = uTime * uSpeed;
  float wake = smoothstep(lead, lead * 0.2, dist) * exp(-uTime * 1.4) * 0.35;

  vec2 off = dir * disp / uRes;
  float ca = abs(disp) / uRes.x * 0.9; // colour split grows with the bending
  vec3 col;
  col.r = texture2D(uTex, vUv - off - dir * ca).r;
  col.g = texture2D(uTex, vUv - off).g;
  col.b = texture2D(uTex, vUv - off + dir * ca).b;
  col += glow + vec3(0.3, 0.65, 1.0) * wake;
  gl_FragColor = vec4(col, 1.0);
}
`;

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) ?? 'shader error');
  return sh;
}

export function SpaceRipple({ source, startedAt, origin, speed }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // latest props for the render loop, without restarting it
  const live = useRef({ startedAt, origin, speed });
  live.current = { startedAt, origin, speed };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl', { premultipliedAlpha: false, antialias: false });
    if (!gl) return; // no WebGL: the round still works, just without the ripple

    let program: WebGLProgram;
    try {
      program = gl.createProgram()!;
      gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERT));
      gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? 'link error');
    } catch (e) {
      console.warn('SpaceRipple disabled:', e);
      return;
    }
    gl.useProgram(program);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(program, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const u = {
      res: gl.getUniformLocation(program, 'uRes'),
      origin: gl.getUniformLocation(program, 'uOrigin'),
      time: gl.getUniformLocation(program, 'uTime'),
      speed: gl.getUniformLocation(program, 'uSpeed'),
    };

    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const src = source.current;
      const { startedAt: t0, origin: o, speed: sp } = live.current;
      if (!t0 || !src) {
        canvas.style.visibility = 'hidden';
        return;
      }
      const cssW = canvas.clientWidth;
      const cssH = canvas.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
        canvas.width = Math.round(cssW * dpr);
        canvas.height = Math.round(cssH * dpr);
      }
      const t = (performance.now() - t0) / 1000;
      // done once every ring has left the screen
      if (t * sp - 280 > Math.hypot(cssW, cssH) * 1.1) {
        canvas.style.visibility = 'hidden';
        return;
      }
      canvas.style.visibility = 'visible';
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
      gl.uniform2f(u.res, cssW, cssH);
      gl.uniform2f(u.origin, o.x, cssH - o.y); // GL's y points up
      gl.uniform1f(u.time, t);
      gl.uniform1f(u.speed, sp);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, [source]);

  return <canvas ref={canvasRef} className="space-ripple" />;
}
