import { useEffect, useRef } from 'react';
import { Mesh, Program, Renderer, Triangle } from 'ogl';
import { usePause } from '../../game/gameClock';
import { AURORA_FRAG, auroraPaletteFor } from '../scene/auroraShader';

// The game's aurora (same shader, same per-level palette) as a backdrop for
// Stardust Run, where the 3D scene that normally draws it is paused to give
// the fluid simulation the GPU. Drawn with ogl at half resolution (the
// curtains are soft) and screen-blended over the starfield; brighter and
// taller than the in-flight sky, since here it's part of the show. Same slow,
// constant drift.
// GLSL 3 (WebGL2), like three.js compiles AuroraSky: the shader's color ramp
// indexes an array with a variable, which GLSL 1 forbids.
const VERT = /* glsl */ `#version 300 es
in vec2 position;
in vec2 uv;
out vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

// three.js adds the version and precision lines for AuroraSky; ogl doesn't
const FRAG = `#version 300 es
precision highp float;
out vec4 fragColor;
${AURORA_FRAG.replace(/\bvarying\b/g, 'in').replace(/\bgl_FragColor\b/g, 'fragColor')}`;

function hexToVec(hex: string): number[] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function AuroraBackdrop({ level }: { level: number }) {
  const holder = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = holder.current;
    if (!el) return;
    let renderer: Renderer;
    try {
      renderer = new Renderer({ webgl: 2, dpr: Math.min(1, window.devicePixelRatio || 1) * 0.5, alpha: false, antialias: false });
    } catch {
      return; // no WebGL: the starfield alone is fine
    }
    const gl = renderer.gl;
    if (!renderer.isWebgl2) {
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return;
    }
    gl.clearColor(0, 0, 0, 1);
    const canvas = gl.canvas as HTMLCanvasElement;
    canvas.className = 'sd-aurora';
    el.appendChild(canvas);

    const program = new Program(gl, {
      vertex: VERT,
      fragment: FRAG,
      uniforms: {
        uTime: { value: 0 },
        uAmplitude: { value: 0.8 },
        uColorStops: { value: auroraPaletteFor(level).map(hexToVec) },
        uBlend: { value: 0.7 },
        uIntensity: { value: 0.85 },
      },
    });
    const mesh = new Mesh(gl, { geometry: new Triangle(gl), program });

    const resize = () => renderer.setSize(el.clientWidth || window.innerWidth, el.clientHeight || window.innerHeight);
    resize();
    window.addEventListener('resize', resize);

    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (usePause.getState().paused) return;
      program.uniforms.uTime.value += dt * 0.25;
      try {
        renderer.render({ scene: mesh });
      } catch {
        cancelAnimationFrame(raf); // shader failed on this device: just the starfield then
      }
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      canvas.remove();
    };
  }, [level]);

  return <div ref={holder} className="sd-aurora-holder" aria-hidden="true" />;
}
