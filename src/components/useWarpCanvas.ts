import { useEffect, useRef } from 'react';
import { usePause } from '../game/gameClock';
import { calmMotion, drawDropFlash, drawHyperGlow, DROP_END_MS, HYPER_TINTS, hyperspace, hyperStreak } from './arrival/dropOut';

// ---------- forward-warp starfield (2D canvas) ----------

interface Star {
  x: number;
  y: number;
  z: number;
  color: string;
  tint: string;
}
const STAR_COLORS = ['#ffffff', '#cfe9ff', '#ffd6f4', '#fff2c4'];
/** how fast the stars rush past in hyperspace, and how far back their streaks reach */
const HYPER_SPEED = 3.4;
const HYPER_TRAIL = 0.65;

/** `arrive`: the round opens with the ship dropping out of hyperspace (see arrival/dropOut.ts) */
export function useWarpCanvas(canvasRef: React.RefObject<HTMLCanvasElement | null>, horizonY: number, speedRef: React.RefObject<number>, arrive = false) {
  // time since the round opened, frozen while the player is away (kept when the horizon moves and the sky restarts)
  const elapsedRef = useRef(0);
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
      tint: HYPER_TINTS[Math.floor(Math.random() * HYPER_TINTS.length)],
    }));
    const arriving = arrive && !calmMotion();
    let raf = 0;
    let last = performance.now();
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);
    const draw = (now: number) => {
      if (usePause.getState().away) {
        // frozen while the player is away from the game
        last = now;
        raf = requestAnimationFrame(draw);
        return;
      }
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const elapsed = (elapsedRef.current += dt * 1000);
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
      const hyper = arriving ? hyperspace(elapsed) : 0;
      drawHyperGlow(ctx, w, h, cx, cy, hyper);
      const speed = Math.max(speedRef.current ?? 0.35, hyper * HYPER_SPEED);
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
        // in hyperspace the streaks reach far back towards the vanishing point
        const tail = Math.min(1.6, z0 + hyper * HYPER_TRAIL);
        const x1 = cx + (s.x / tail) * scale * 0.25;
        const y1 = cy + (s.y / tail) * scale * 0.25;
        const x2 = cx + (s.x / s.z) * scale * 0.25;
        const y2 = cy + (s.y / s.z) * scale * 0.25;
        const near = 1 - s.z;
        if (hyper > 0.05) {
          ctx.globalAlpha = 1;
          hyperStreak(ctx, x1, y1, x2, y2, (0.6 + near * 2.4) * (1 + hyper * 0.5), s.tint, (0.35 + near * 0.65) * (0.5 + 0.5 * hyper));
          continue;
        }
        ctx.strokeStyle = s.color;
        ctx.globalAlpha = 0.25 + near * 0.75;
        ctx.lineWidth = 0.6 + near * 2.4;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      if (arriving && elapsed < DROP_END_MS) drawDropFlash(ctx, w, h, cx, cy, elapsed);
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      // its pixels back at once (some phones only free a canvas's memory when it's collected, and blank canvases past a limit)
      canvas.width = canvas.height = 0;
    };
    // (the arrival plays once, as the round opens: `arrive` never changes)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasRef, horizonY, speedRef]);
}

