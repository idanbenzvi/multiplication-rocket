import { useEffect } from 'react';
import { usePause } from '../game/gameClock';

// ---------- forward-warp starfield (2D canvas) ----------

interface Star {
  x: number;
  y: number;
  z: number;
  color: string;
}
const STAR_COLORS = ['#ffffff', '#cfe9ff', '#ffd6f4', '#fff2c4'];

export function useWarpCanvas(canvasRef: React.RefObject<HTMLCanvasElement | null>, horizonY: number, speedRef: React.RefObject<number>) {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const stars: Star[] = Array.from({ length: 260 }, () => ({
      x: (Math.random() - 0.5) * 2,
      y: (Math.random() - 0.5) * 2,
      z: Math.random(),
      color: STAR_COLORS[Math.floor(Math.random() * STAR_COLORS.length)],
    }));
    let raf = 0;
    let last = performance.now();
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);
    const draw = (now: number) => {
      if (usePause.getState().paused) {
        // frozen while the game is paused (and nothing to draw)
        last = now;
        raf = requestAnimationFrame(draw);
        return;
      }
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const w = canvas.width;
      const h = canvas.height;
      const cx = w / 2;
      const cy = h * horizonY;
      // deep-space backdrop: dark at the edges, a faint glow at the vanishing point
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.8);
      g.addColorStop(0, '#2a1d55');
      g.addColorStop(0.5, '#140e2c');
      g.addColorStop(1, '#07050f');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      const speed = speedRef.current ?? 0.35;
      const scale = Math.max(w, h) * 0.5;
      for (const s of stars) {
        const z0 = s.z;
        s.z -= dt * speed;
        if (s.z <= 0.02) {
          s.x = (Math.random() - 0.5) * 2;
          s.y = (Math.random() - 0.5) * 2;
          s.z = 1;
          continue;
        }
        const x1 = cx + (s.x / z0) * scale * 0.25;
        const y1 = cy + (s.y / z0) * scale * 0.25;
        const x2 = cx + (s.x / s.z) * scale * 0.25;
        const y2 = cy + (s.y / s.z) * scale * 0.25;
        const near = 1 - s.z;
        ctx.strokeStyle = s.color;
        ctx.globalAlpha = 0.25 + near * 0.75;
        ctx.lineWidth = 0.6 + near * 2.4;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [canvasRef, horizonY, speedRef]);
}

