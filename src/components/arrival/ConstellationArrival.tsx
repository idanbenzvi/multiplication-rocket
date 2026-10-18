import { useRef, useState } from 'react';
import { glow, rgba } from '../traffic/trafficArt';
import { calmMotion } from './dropOut';
import { useArrivalCanvas } from './useArrivalCanvas';
import './arrival.css';

// Constellation's arrival (after React Bits Pro's Astral Shell): a globe of
// stars joined to their nearest neighbours turns in a patch of night over the
// rocket, spinning up as it appears; then it flattens out. The stars of the round's
// own star chart fly to their places in it (its `.star`s, laid out hidden
// under the card while it opens) and the rest scatter and fade, so the chart
// is there, star for star, as the round begins (Constellation's INTRO_MS).
// With reduced motion there's none of it.

/** the globe starts to flatten, and the chart takes over (Constellation's INTRO_MS) */
const FLATTEN_MS = 1000;
const LANDED_MS = 1750;
const GONE_MS = 2150;
/** stars in the globe besides the chart's */
const DUST = 150;
const LINKS = 3;

const TAU = Math.PI * 2;
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

interface Node {
  /** on the unit sphere */
  x: number;
  y: number;
  z: number;
  /** where it lands in the chart (screen px), for the chart's own stars */
  to: { x: number; y: number } | null;
  twinkle: number;
}

export function ConstellationArrival({ gridRef }: { gridRef: React.RefObject<HTMLDivElement | null> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [calm] = useState(calmMotion);
  const [done, setDone] = useState(false);
  const nodes = useRef<Node[] | null>(null);
  const links = useRef<Array<[number, number]>>([]);

  useArrivalCanvas(
    canvasRef,
    (ctx, w, h, ms) => {
      if (ms > GONE_MS) {
        setDone(true);
        return;
      }
      const grid = gridRef.current?.getBoundingClientRect();
      if (!grid) return;
      if (!nodes.current) {
        // the chart's stars, where they'll be, and the dust round them, spread evenly over the globe
        const stars = [...(gridRef.current?.querySelectorAll('.star') ?? [])].map((el) => {
          const r = el.getBoundingClientRect();
          return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        });
        const n = stars.length + DUST;
        const order = shuffled(Array.from({ length: n }, (_, i) => i));
        nodes.current = order.map((k, i) => {
          const y = 1 - (2 * (k + 0.5)) / n;
          const r = Math.sqrt(1 - y * y);
          const a = k * 2.39996;
          return { x: Math.cos(a) * r, y, z: Math.sin(a) * r, to: stars[i] ?? null, twinkle: Math.random() * TAU };
        });
        links.current = nearest(nodes.current, LINKS);
      }
      const t = ms / 1000;
      const c = { x: grid.left + grid.width / 2, y: grid.top + grid.height / 2 };
      const R = Math.min(w, h) * 0.32;
      // spinning up as it appears, then turning steadily
      const turn = 2.4 * (1 - Math.exp(-t * 1.6)) + t * 0.5;
      const cos = Math.cos(turn);
      const sin = Math.sin(turn);
      const tilt = 0.38;
      const appear = clamp01(ms / 350);
      const flat = easeInOut(clamp01((ms - FLATTEN_MS) / (LANDED_MS - FLATTEN_MS)));
      const fade = 1 - clamp01((ms - LANDED_MS) / (GONE_MS - LANDED_MS));
      const pts = nodes.current.map((p) => {
        const x = p.x * cos + p.z * sin;
        const z0 = -p.x * sin + p.z * cos;
        const y = p.y * Math.cos(tilt) - z0 * Math.sin(tilt);
        const z = p.y * Math.sin(tilt) + z0 * Math.cos(tilt);
        const s = 1 / (1 + z * 0.35);
        const gx = c.x + x * R * s;
        const gy = c.y + y * R * s;
        // nearer stars brighter
        const depth = 0.35 + 0.65 * (1 - (z + 1) / 2);
        if (p.to) return { x: gx + (p.to.x - gx) * flat, y: gy + (p.to.y - gy) * flat, a: depth + (1 - depth) * flat, chart: true };
        // the dust is flung out and fades
        return { x: c.x + (gx - c.x) * (1 + flat * 1.6), y: c.y + (gy - c.y) * (1 + flat * 1.6), a: depth * (1 - flat), chart: false };
      });
      // a patch of night for it to turn in (the chart brings its own)
      const night = appear * (1 - flat) * fade;
      if (night > 0.01) {
        const n = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, R * 1.7);
        n.addColorStop(0, `rgba(12, 7, 30, ${0.6 * night})`);
        n.addColorStop(0.6, `rgba(12, 7, 30, ${0.4 * night})`);
        n.addColorStop(1, 'rgba(12, 7, 30, 0)');
        ctx.fillStyle = n;
        ctx.fillRect(c.x - R * 1.7, c.y - R * 1.7, R * 3.4, R * 3.4);
      }
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      // the links fade as it flattens
      const la = appear * (1 - flat) ** 2 * fade;
      if (la > 0.01) {
        ctx.lineWidth = 1.2;
        for (const [i, j] of links.current) {
          const a = pts[i];
          const b = pts[j];
          ctx.strokeStyle = rgba('#a99bff', 0.6 * la * Math.min(a.a, b.a));
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        const alpha = p.a * appear * fade;
        if (alpha <= 0.01) continue;
        const tw = 0.75 + 0.25 * Math.sin(t * 5 + nodes.current[i].twinkle);
        const size = (p.chart ? 15 + 5 * flat : 10) * tw;
        ctx.globalAlpha = alpha;
        ctx.drawImage(glow(p.chart ? '#cfc6ff' : '#6ad7ff'), p.x - size / 2, p.y - size / 2, size, size);
      }
      ctx.restore();
    },
    !calm && !done,
  );

  if (calm || done) return null;
  return <canvas ref={canvasRef} className="arrival-canvas" aria-hidden />;
}

/** each node's `k` nearest neighbours on the sphere, each pair once */
function nearest(nodes: Node[], k: number): Array<[number, number]> {
  const seen = new Set<string>();
  const out: Array<[number, number]> = [];
  nodes.forEach((p, i) => {
    const by = nodes
      .map((q, j) => ({ j, d: (p.x - q.x) ** 2 + (p.y - q.y) ** 2 + (p.z - q.z) ** 2 }))
      .filter((q) => q.j !== i)
      .sort((a, b) => a.d - b.d)
      .slice(0, k);
    for (const { j } of by) {
      const key = i < j ? `${i}-${j}` : `${j}-${i}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push([i, j]);
    }
  });
  return out;
}

function shuffled<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
