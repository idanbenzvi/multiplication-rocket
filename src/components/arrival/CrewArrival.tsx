import { useRef, useState } from 'react';
import { glow, rgba } from '../traffic/trafficArt';
import { calmMotion } from './dropOut';
import { portholeCentre } from './portholeCentre';
import { useArrivalCanvas } from './useArrivalCanvas';
import './arrival.css';

// Crew Flight's arrival (after React Bits Pro's Star Burst): as the warp
// clears, stars stream out of the rocket's porthole (a quick inner layer and
// a slower, bigger outer one) round a blooming flower of light, and the two
// pilots' animals fly in from either side of the screen, each in its seat's
// colour, and board through the porthole, the second just after the first.
// `onBoard` fires as each one gets there (for a sparkle). With reduced motion
// there's none of it.

/** the warp has mostly cleared (CrewFlight opens behind it) */
const FROM_MS = 350;
/** the stars stream out till then, and it's all gone by the end */
const STREAM_MS = 1300;
const END_MS = 2300;
/** when each animal sets off, and how long it takes to board */
const BOARD_MS = [450, 620];
const FLY_MS = 850;

const TAU = Math.PI * 2;
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

interface Star {
  a: number;
  /** how far out (px), how fast (px a second), how big */
  r: number;
  v: number;
  size: number;
  outer: boolean;
}

interface Props {
  avatars: [string | undefined, string | undefined];
  colors: readonly [string, string];
  onBoard: (seat: 0 | 1, x: number, y: number) => void;
}

export function CrewArrival({ avatars, colors, onBoard }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [calm] = useState(calmMotion);
  const [done, setDone] = useState(false);
  const stars = useRef<Star[]>([]);
  const boarded = useRef([false, false]);

  useArrivalCanvas(
    canvasRef,
    (ctx, w, h, ms, dt) => {
      if (ms > END_MS) {
        setDone(true);
        return;
      }
      const c = portholeCentre();
      const u = Math.min(w, h);
      const t = ms - FROM_MS;
      if (t < 0) return;
      // streaming out of the porthole, two layers
      if (ms < STREAM_MS) {
        for (let n = 0; n < 6; n++) {
          const outer = n === 0;
          stars.current.push({ a: Math.random() * TAU, r: u * 0.02, v: u * (outer ? 0.35 + Math.random() * 0.3 : 0.7 + Math.random() * 0.7), size: outer ? 18 + Math.random() * 12 : 7 + Math.random() * 6, outer });
        }
      }
      const fade = 1 - clamp01((ms - STREAM_MS) / (END_MS - STREAM_MS));
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      // the flower blooming round the porthole, turning
      const bloom = Math.sin(Math.PI * clamp01(t / 1300)) * fade;
      if (bloom > 0.01) {
        for (let i = 0; i < 8; i++) {
          ctx.save();
          ctx.translate(c.x, c.y);
          ctx.rotate((i / 8) * TAU + t / 900);
          ctx.scale(1, 0.32);
          const len = u * (0.12 + 0.16 * bloom);
          ctx.globalAlpha = 0.5 * bloom;
          ctx.drawImage(glow(i % 2 ? colors[0] : '#ff6ad5'), 0, -len / 2, len * 1.4, len);
          ctx.restore();
        }
        const core = u * 0.3 * bloom;
        ctx.globalAlpha = bloom;
        ctx.drawImage(glow('#ffffff'), c.x - core / 2, c.y - core / 2, core, core);
      }
      stars.current = stars.current.filter((s) => s.r < Math.hypot(w, h));
      for (const s of stars.current) {
        s.r += s.v * dt;
        const x = c.x + Math.cos(s.a) * s.r;
        const y = c.y + Math.sin(s.a) * s.r;
        const near = clamp01(s.r / (u * 0.08));
        ctx.globalAlpha = near * fade * (s.outer ? 0.7 : 1);
        if (!s.outer) {
          // the quick ones streak
          const back = s.r - s.v * 0.05;
          ctx.strokeStyle = rgba(colors[1], 0.6 * near * fade);
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(c.x + Math.cos(s.a) * back, c.y + Math.sin(s.a) * back);
          ctx.lineTo(x, y);
          ctx.stroke();
        }
        ctx.drawImage(glow(s.outer ? '#e3b3ea' : '#ffffff'), x - s.size / 2, y - s.size / 2, s.size, s.size);
      }
      ctx.restore();
      // the pilots flying in from either side and boarding
      ([0, 1] as const).forEach((seat) => {
        const k = (ms - BOARD_MS[seat]) / FLY_MS;
        if (k <= 0 || k >= 1) {
          if (k >= 1 && !boarded.current[seat]) {
            boarded.current[seat] = true;
            onBoard(seat, c.x, c.y);
          }
          return;
        }
        const e = easeInOut(k);
        const side = seat === 0 ? -1 : 1;
        const from = { x: c.x + side * (w * 0.5 + u * 0.15), y: c.y + u * 0.45 };
        const via = { x: c.x + side * u * 0.35, y: c.y - u * 0.25 };
        const x = (1 - e) ** 2 * from.x + 2 * (1 - e) * e * via.x + e * e * c.x;
        const y = (1 - e) ** 2 * from.y + 2 * (1 - e) * e * via.y + e * e * c.y;
        const size = u * 0.13 * (1 - 0.7 * e);
        ctx.save();
        ctx.globalAlpha = Math.min(1, k / 0.1);
        ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(glow(colors[seat]), x - size, y - size, size * 2, size * 2);
        ctx.globalCompositeOperation = 'source-over';
        ctx.font = `${size}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(avatars[seat] ?? '🙂', x, y);
        ctx.restore();
      });
    },
    !calm && !done,
  );

  if (calm || done) return null;
  return <canvas ref={canvasRef} className="crew-arrival" aria-hidden />;
}
