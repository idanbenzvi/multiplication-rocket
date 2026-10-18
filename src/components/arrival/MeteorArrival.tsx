import { useRef, useState } from 'react';
import { glow, rgba } from '../traffic/trafficArt';
import { calmMotion } from './dropOut';
import { useArrivalCanvas } from './useArrivalCanvas';
import './arrival.css';

// Meteor Shower's arrival (after React Bits Pro's Falling Rays): the sky above
// the rocket darkens and reddens, and rays of light fan down from a point high
// above the screen, where the shower comes from; shooting stars streak down
// them, more and faster, with two big fireballs among them, until the real
// meteors come (MeteorShower's intro). Through the round the rays glow on
// faintly, and now and then a shooting star runs down one. With reduced
// motion there's none of it.

const RAYS = 22;
/** how wide the fan of rays is either side of straight down (radians) */
const FAN = 0.68;
/** the shooting stars come thick and fast till then (MeteorShower's INTRO_MS), and now and then after */
const SHOWER_MS = 1800;
const COLORS = ['#ff9d76', '#ff6ad5', '#ffd77a'];

const clamp01 = (t: number) => Math.max(0, Math.min(1, t));

/** the fireballs, as the shower opens (ms) */
const FIREBALLS_MS = [520, 1150];

interface Streak {
  ray: number;
  /** how far down the ray its head is, in screen heights, and how fast it goes */
  d: number;
  v: number;
  len: number;
  /** a big fireball, not a shooting star */
  big: boolean;
}

export function MeteorArrival() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [calm] = useState(calmMotion);
  const [rays] = useState(() => Array.from({ length: RAYS }, (_, i) => ({ a: Math.PI / 2 + FAN * ((i / (RAYS - 1)) * 2 - 1) + (Math.random() - 0.5) * 0.03, phase: Math.random() * 7, color: COLORS[i % COLORS.length] })));
  const streaks = useRef<Streak[]>([]);
  const due = useRef(120);
  const fireballs = useRef(0);

  useArrivalCanvas(
    canvasRef,
    (ctx, w, h, ms, dt) => {
      const t = ms / 1000;
      const o = { x: w / 2, y: -h * 0.28 };
      const reach = Math.hypot(w, h) * 1.6;
      // bright as the shower opens, then a faint glow through the round
      const shine = clamp01(ms / 400) * (1 - 0.6 * clamp01((ms - SHOWER_MS) / 900));
      // the sky darkening above, so the shower shows
      const dusk = ctx.createLinearGradient(0, 0, 0, h * 0.75);
      dusk.addColorStop(0, `rgba(22, 6, 28, ${0.55 * shine})`);
      dusk.addColorStop(1, 'rgba(22, 6, 28, 0)');
      ctx.fillStyle = dusk;
      ctx.fillRect(0, 0, w, h);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      // and reddening
      const sky = ctx.createRadialGradient(w / 2, 0, 0, w / 2, 0, Math.max(w, h) * 0.75);
      sky.addColorStop(0, rgba('#ff7a59', 0.42 * shine));
      sky.addColorStop(0.5, rgba('#ff6ad5', 0.14 * shine));
      sky.addColorStop(1, rgba('#ff6ad5', 0));
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);
      // the rays, each breathing at its own pace
      const half = 0.011;
      for (const r of rays) {
        const a = r.a;
        const g = ctx.createLinearGradient(o.x, o.y, o.x + Math.cos(a) * reach * 0.6, o.y + Math.sin(a) * reach * 0.6);
        const k = shine * (0.6 + 0.4 * Math.sin(t * 1.3 + r.phase));
        g.addColorStop(0, rgba(r.color, 0));
        g.addColorStop(0.35, rgba(r.color, 0.3 * k));
        g.addColorStop(0.7, rgba(r.color, 0.12 * k));
        g.addColorStop(1, rgba(r.color, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(o.x, o.y);
        ctx.lineTo(o.x + Math.cos(a - half) * reach, o.y + Math.sin(a - half) * reach);
        ctx.lineTo(o.x + Math.cos(a + half) * reach, o.y + Math.sin(a + half) * reach);
        ctx.closePath();
        ctx.fill();
      }
      // shooting stars down the rays: more and faster as the shower opens, then one now and then
      while (ms >= due.current) {
        const k = clamp01(due.current / SHOWER_MS);
        // (they start out under the top bar)
        streaks.current.push({ ray: Math.floor(Math.random() * RAYS), d: 0.05 + 0.12 * Math.random(), v: 1.3 + k * 1.5 + Math.random() * 0.5, len: 0.16 + Math.random() * 0.16, big: false });
        due.current += due.current < SHOWER_MS ? 55 - 41 * k : 700 + Math.random() * 900;
      }
      if (fireballs.current < FIREBALLS_MS.length && ms >= FIREBALLS_MS[fireballs.current]) {
        // one down each side of the rocket
        const ray = fireballs.current === 0 ? Math.round(RAYS * 0.22) : Math.round(RAYS * 0.74);
        streaks.current.push({ ray, d: 0.1, v: 1.5, len: 0.34, big: true });
        fireballs.current += 1;
      }
      ctx.lineCap = 'round';
      streaks.current = streaks.current.filter((s) => s.d - s.len < 1.6);
      for (const s of streaks.current) {
        s.d += s.v * dt;
        const a = rays[s.ray].a;
        // down the ray from where it crosses the top of the screen
        const top = -o.y / Math.sin(a);
        const at = (d: number) => ({ x: o.x + Math.cos(a) * (top + d * h), y: o.y + Math.sin(a) * (top + d * h) });
        const head = at(s.d);
        const tail = at(s.d - s.len);
        const sg = ctx.createLinearGradient(tail.x, tail.y, head.x, head.y);
        const color = s.big ? '#ff9d4a' : rays[s.ray].color;
        sg.addColorStop(0, rgba(color, 0));
        sg.addColorStop(0.7, rgba(color, s.big ? 0.8 : 0.6));
        sg.addColorStop(1, 'rgba(255, 255, 255, 0.95)');
        ctx.strokeStyle = sg;
        ctx.lineWidth = s.big ? 9 : 3;
        ctx.beginPath();
        ctx.moveTo(tail.x, tail.y);
        ctx.lineTo(head.x, head.y);
        ctx.stroke();
        const r = s.big ? 70 : 24;
        ctx.drawImage(glow(color), head.x - r / 2, head.y - r / 2, r, r);
      }
      ctx.restore();
    },
    !calm,
  );

  if (calm) return null;
  return <canvas ref={canvasRef} className="arrival-canvas" aria-hidden />;
}
