import { useEffect, useRef } from 'react';
import { usePause } from '../../game/gameClock';

/** what an arrival draws each frame: `ms` since it began (frozen while paused), `dt` seconds since the last frame */
export type ArrivalDraw = (ctx: CanvasRenderingContext2D, w: number, h: number, ms: number, dt: number) => void;

/**
 * Runs `draw` every frame on a full-screen 2D canvas, sized to the screen at
 * the device's pixel ratio and cleared each frame. Its clock stops while the
 * game is paused (`pausedBy: 'game'`, for the bonus rounds), or only while the
 * player is away (`'away'`, for the game modes, which pause the game clock
 * the whole time they're open). Nothing runs while `on` is false.
 */
export function useArrivalCanvas(canvasRef: React.RefObject<HTMLCanvasElement | null>, draw: ArrivalDraw, on: boolean, pausedBy: 'game' | 'away' = 'game') {
  const drawRef = useRef(draw);
  drawRef.current = draw;
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!on || !canvas || !ctx) return;
    let ms = 0;
    let last = performance.now();
    let raf = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const pause = usePause.getState();
      if (pausedBy === 'game' ? pause.paused : pause.away) return;
      ms += dt * 1000;
      const W = window.innerWidth;
      const H = window.innerHeight;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      drawRef.current(ctx, W, H, ms, dt);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [canvasRef, on, pausedBy]);
}
