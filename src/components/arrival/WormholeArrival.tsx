import { useRef, useState } from 'react';
import { calmMotion } from './dropOut';
import { useArrivalCanvas } from './useArrivalCanvas';
import { portholeCentre } from './portholeCentre';
import './arrival.css';

// The Wormhole round's arrival (after React Bits Pro's Black Hole): a
// wormhole opens round the rocket, a ring of light swirling round it (hot
// cyan at its inner edge, violet, then pink further out) spinning up out of
// nothing round a bright photon ring; then it gulps (squeezes and springs
// back, with a flash), and that flings the drills out to where they float
// (WormholeChallenge: RELEASE_MS). It glows on faintly round the rocket while
// the drills are picked, and if the wormhole collapses it spins in to nothing.
// With reduced motion there's none of it.

/** the wormhole gulps and flings the drills out */
export const RELEASE_MS = 850;
const OPEN_MS = 700;
const GULP_MS = 650;
/** it dims to a faint glow after this */
const DIM_MS = 1900;
const COLLAPSE_MS = 700;
const PARTICLES = 420;

const TAU = Math.PI * 2;
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const easeOut = (t: number) => 1 - (1 - t) ** 3;
const easeOutBack = (t: number) => 1 + 2.4 * (t - 1) ** 3 + 1.4 * (t - 1) ** 2;
/** the swirl's colors, inside to outside */
const BANDS = ['rgba(200, 245, 255, 0.9)', 'rgba(106, 215, 255, 0.75)', 'rgba(177, 140, 255, 0.7)', 'rgba(255, 106, 213, 0.6)'];

interface Mote {
  a: number;
  /** how far out, in ring radii */
  r: number;
  band: number;
  wide: boolean;
}

export function WormholeArrival({ collapsed }: { collapsed: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [calm] = useState(calmMotion);
  const [motes] = useState<Mote[]>(() =>
    Array.from({ length: PARTICLES }, () => {
      // most of them in a band just outside the photon ring
      const r = 0.72 + Math.abs(gauss()) * 0.26;
      return { a: Math.random() * TAU, r, band: Math.min(3, Math.floor((r - 0.68) / 0.12)), wide: Math.random() < 0.3 };
    }),
  );
  const collapseAt = useRef(-1);

  useArrivalCanvas(
    canvasRef,
    (ctx, W, H, elapsed, dt) => {
      if (collapsed && collapseAt.current < 0) collapseAt.current = elapsed;
      const c = portholeCentre();
      // opening, the gulp, and collapsing
      const open = easeOutBack(clamp01(elapsed / OPEN_MS));
      const g = (elapsed - RELEASE_MS) / GULP_MS;
      const squeeze = g < 0 || g > 1 ? 0 : g < 0.2 ? 0.16 * Math.sin((g / 0.2) * (Math.PI / 2)) : 0.16 * Math.exp(-6 * (g - 0.2)) * Math.cos(9 * (g - 0.2));
      const fall = collapseAt.current < 0 ? 0 : easeOut(clamp01((elapsed - collapseAt.current) / COLLAPSE_MS));
      const R = Math.min(W, H) * 0.4 * open * (1 - squeeze) * (1 - fall);
      if (R < 1) return;
      const glow = clamp01(elapsed / 300) * (1 - 0.65 * easeOut(clamp01((elapsed - DIM_MS) / 800))) * (1 - fall);
      // spinning up as it opens (and as it collapses), then a steady swirl
      const spin = 1 + 3 * (1 - clamp01(elapsed / 900)) + 6 * fall;
      for (const m of motes) m.a += dt * spin * 1.4 * m.r ** -1.5;

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      // the glow of the swirl
      const halo = ctx.createRadialGradient(c.x, c.y, R * 0.55, c.x, c.y, R * 1.5);
      halo.addColorStop(0, 'rgba(106, 215, 255, 0)');
      halo.addColorStop(0.15, `rgba(106, 215, 255, ${0.3 * glow})`);
      halo.addColorStop(0.45, `rgba(177, 140, 255, ${0.16 * glow})`);
      halo.addColorStop(1, 'rgba(255, 106, 213, 0)');
      ctx.fillStyle = halo;
      ctx.fillRect(c.x - R * 1.5, c.y - R * 1.5, R * 3, R * 3);
      // the motes, each a streak along its orbit, one path a color and width
      ctx.lineCap = 'round';
      for (let band = 0; band < BANDS.length; band++) {
        for (const wide of [false, true]) {
          ctx.beginPath();
          for (const m of motes) {
            if (m.band !== band || m.wide !== wide) continue;
            const r = R * m.r;
            const trail = Math.min(0.9, 0.16 * spin * m.r ** -1.5);
            ctx.moveTo(c.x + Math.cos(m.a - trail) * r, c.y + Math.sin(m.a - trail) * r);
            ctx.arc(c.x, c.y, r, m.a - trail, m.a);
          }
          ctx.strokeStyle = BANDS[band];
          ctx.globalAlpha = glow * (wide ? 0.35 : 0.9);
          ctx.lineWidth = wide ? 4 : 1.4;
          ctx.stroke();
        }
      }
      // the photon ring
      ctx.globalAlpha = glow;
      ctx.strokeStyle = 'rgba(106, 215, 255, 0.35)';
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.arc(c.x, c.y, R * 0.68, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(235, 252, 255, 0.95)';
      ctx.lineWidth = 2;
      ctx.stroke();
      // the gulp's flash, racing out
      if (g > 0 && g < 1) {
        ctx.globalAlpha = (1 - g) ** 1.5;
        ctx.strokeStyle = 'rgba(200, 240, 255, 0.8)';
        ctx.lineWidth = 3 + 10 * (1 - g);
        ctx.beginPath();
        ctx.arc(c.x, c.y, R * (0.7 + 1.6 * easeOut(g)), 0, TAU);
        ctx.stroke();
      }
      ctx.restore();
    },
    !calm,
  );

  if (calm) return null;
  return <canvas ref={canvasRef} className="arrival-canvas" aria-hidden />;
}

/** roughly normal, mean 0 */
function gauss(): number {
  return (Math.random() + Math.random() + Math.random() - 1.5) / 0.75;
}
