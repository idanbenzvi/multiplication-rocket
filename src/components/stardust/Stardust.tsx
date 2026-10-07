import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { usePause } from '../../game/gameClock';
import StardustFluid, { type FluidApi } from './StardustFluid';

// The stardust layer: the WebGL fluid when the device can run it, otherwise a
// light 2D particle trail with the same splat() API, so the round doesn't
// care which one it gets. ?fluid=1 forces the fluid (no speed check),
// ?fluid=0 forces the fallback.
function override(): 'on' | 'off' | null {
  try {
    const v = new URLSearchParams(window.location.search).get('fluid');
    return v === '1' ? 'on' : v === '0' ? 'off' : null;
  } catch {
    return null;
  }
}

// memo: the round re-renders every frame; the simulation must not
export const Stardust = memo(function Stardust({ apiRef }: { apiRef: React.MutableRefObject<FluidApi | null> }) {
  const [forced] = useState(override);
  const [mode, setMode] = useState<'fluid' | '2d'>(forced === 'off' ? '2d' : 'fluid');
  const fallBack = useCallback(() => setMode('2d'), []);
  return mode === 'fluid' ? (
    <StardustFluid
      apiRef={apiRef}
      onFail={fallBack}
      noSpeedCheck={forced === 'on'}
      SIM_RESOLUTION={96}
      DYE_RESOLUTION={640}
      PRESSURE_ITERATIONS={14}
      DENSITY_DISSIPATION={1.3}
      VELOCITY_DISSIPATION={1.1}
      CURL={4}
      SPLAT_RADIUS={0.16}
      SPLAT_FORCE={5000}
      RAINBOW_MODE={false}
      TRANSPARENT
    />
  ) : (
    <StardustTrail2D apiRef={apiRef} />
  );
});

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
  color: string;
}

function StardustTrail2D({ apiRef }: { apiRef: React.MutableRefObject<FluidApi | null> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const parts: Particle[] = [];
    apiRef.current = {
      splat(x, y, vx, vy, [r, g, b]) {
        const k = Math.max(r, g, b) || 1;
        const color = `${Math.round((r / k) * 255)}, ${Math.round((g / k) * 255)}, ${Math.round((b / k) * 255)}`;
        const n = Math.min(6, 2 + Math.round(Math.hypot(vx, vy) / 6));
        for (let i = 0; i < n && parts.length < 900; i++) {
          parts.push({
            x: x + (Math.random() - 0.5) * 10,
            y: y + (Math.random() - 0.5) * 10,
            vx: vx * 0.08 + (Math.random() - 0.5) * 1.6,
            vy: vy * 0.08 + (Math.random() - 0.5) * 1.6,
            r: 1.2 + Math.random() * 3.2,
            life: 1,
            color,
          });
        }
      },
    };
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (usePause.getState().paused) return;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.life -= dt * 0.7;
        if (p.life <= 0) {
          parts.splice(i, 1);
          continue;
        }
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.96;
        p.vy *= 0.96;
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 3);
        g.addColorStop(0, `rgba(${p.color}, ${0.55 * p.life})`);
        g.addColorStop(1, `rgba(${p.color}, 0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 3, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      apiRef.current = null;
    };
  }, [apiRef]);
  return <canvas ref={canvasRef} className="stardust-canvas" />;
}
