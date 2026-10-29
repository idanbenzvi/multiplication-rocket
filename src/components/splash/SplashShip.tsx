import { useEffect, useRef } from 'react';
import { ROCKET_PORTHOLE, rocketSvg } from '../scene/illustrations';
import { colorForLevel } from '../scene/palette';
import { rasterizeSprite } from '../scene/spriteTexture';
import { pixelRatio } from '../../settings/quality';

// The splash's last flourish: the game's rocket (a deer at the porthole, of
// course) swoops in from the bottom-left, up through the deer constellation,
// loops the loop around its wings and antlers with a happy wobble, and zooms
// off the top-right, leaving a glowing ribbon and a spray of sparkly energy
// that drifts and fades behind it. Drawn on one canvas over the whole splash.

interface Box {
  /** the deer's middle and size, in screen px */
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Point {
  x: number;
  y: number;
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
  color: string;
  star: boolean;
  spin: number;
}

/** start to gone off the top-right */
const FLIGHT_MS = 2700;
const SPARKS_PER_SECOND = 260;
/** how long the glowing ribbon behind the nozzle lingers, seconds */
const RIBBON_S = 0.38;
const SPARK_COLORS = ['#7fe0ff', '#cadcff', '#ff9de2', '#ffd77a', '#b18cff', '#ffffff'];

function cubic(out: Point[], a: Point, b: Point, c: Point, d: Point, steps: number) {
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    out.push({
      x: u * u * u * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t * t * t * d.x,
      y: u * u * u * a.y + 3 * u * u * t * b.y + 3 * u * t * t * c.y + t * t * t * d.y,
    });
  }
}

// In from off the bottom-left, arriving under the middle of the deer heading
// right; once round a loop-de-loop (up the right, over the top, down the left);
// then away to off the top-right.
function flightPath(W: number, H: number, deer: Box): { points: Point[]; lengths: number[] } {
  const r = Math.min(deer.w, deer.h) * 0.3;
  const centre = { x: deer.x + deer.w * 0.02, y: deer.y - deer.h * 0.1 };
  const bottom = { x: centre.x, y: centre.y + r };
  const start = { x: -0.12 * W, y: 1.08 * H };
  const end = { x: 1.12 * W, y: -0.14 * H };
  const points: Point[] = [start];
  const inDist = Math.hypot(bottom.x - start.x, bottom.y - start.y);
  cubic(points, start, { x: start.x + inDist * 0.2, y: start.y - inDist * 0.4 }, { x: bottom.x - inDist * 0.45, y: bottom.y }, bottom, 60);
  for (let i = 1; i <= 90; i++) {
    const a = (i / 90) * Math.PI * 2;
    points.push({ x: centre.x + r * Math.sin(a), y: centre.y + r * Math.cos(a) });
  }
  const outDist = Math.hypot(end.x - bottom.x, end.y - bottom.y);
  cubic(points, bottom, { x: bottom.x + outDist * 0.4, y: bottom.y }, { x: end.x - outDist * 0.25, y: end.y + outDist * 0.3 }, end, 60);
  const lengths = [0];
  for (let i = 1; i < points.length; i++) {
    lengths.push(lengths[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
  }
  return { points, lengths };
}

/** where along the path (and which way it points) at a given distance */
function along(path: { points: Point[]; lengths: number[] }, s: number): { x: number; y: number; angle: number } {
  const { points, lengths } = path;
  let i = 1;
  while (i < lengths.length - 1 && lengths[i] < s) i++;
  const a = points[i - 1];
  const b = points[i];
  const k = Math.min(1, Math.max(0, (s - lengths[i - 1]) / Math.max(1e-6, lengths[i] - lengths[i - 1])));
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, angle: Math.atan2(b.y - a.y, b.x - a.x) };
}

function drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, spin: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(spin);
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const rr = i % 2 === 0 ? r : r * 0.28;
    const a = (i / 8) * Math.PI * 2;
    ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function SplashShip({ deer }: { deer: Box }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    let alive = true;
    let ship: HTMLCanvasElement | null = null;
    rasterizeSprite(rocketSvg(colorForLevel(1)), 160, 320, { ...ROCKET_PORTHOLE, emoji: '🦌' })
      .then((c) => {
        if (alive) ship = c;
      })
      .catch(() => undefined);

    const dpr = pixelRatio(2, 1);
    const W = window.innerWidth;
    const H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    const path = flightPath(W, H, deer);
    const total = path.lengths[path.lengths.length - 1];
    const shipH = Math.max(66, Math.min(132, Math.min(W, H) * 0.15));
    const sparks: Spark[] = [];
    const ribbon: (Point & { t: number })[] = [];
    let begun = 0;
    let last = 0;
    let owed = 0;
    let raf = 0;

    const frame = () => {
      if (!alive) return;
      const now = performance.now();
      raf = requestAnimationFrame(frame);
      if (!ship) return; // the art is still being drawn
      if (!begun) {
        begun = now;
        last = now;
      }
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = (now - begun) / 1000;
      const u = (now - begun) / FLIGHT_MS;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';

      let nozzle: Point | null = null;
      let pose: { x: number; y: number; angle: number } | null = null;
      if (u < 1) {
        // a little slower into the loop, zooming off at the end
        const s = total * (u * 0.72 + u * u * u * 0.28);
        pose = along(path, s);
        const back = { x: -Math.cos(pose.angle), y: -Math.sin(pose.angle) };
        nozzle = { x: pose.x + back.x * shipH * 0.3, y: pose.y + back.y * shipH * 0.3 };
        ribbon.push({ ...nozzle, t });
        // energy sprayed out behind
        owed += SPARKS_PER_SECOND * dt;
        for (; owed >= 1; owed--) {
          const push = 60 + Math.random() * 160;
          const side = (Math.random() - 0.5) * 120;
          sparks.push({
            x: nozzle.x + (Math.random() - 0.5) * 6,
            y: nozzle.y + (Math.random() - 0.5) * 6,
            vx: back.x * push - back.y * side,
            vy: back.y * push + back.x * side,
            age: 0,
            life: 0.6 + Math.random() * 0.8,
            size: 1.4 + Math.random() * 2.6,
            color: SPARK_COLORS[Math.floor(Math.random() * SPARK_COLORS.length)],
            star: Math.random() < 0.14,
            spin: Math.random() * Math.PI,
          });
        }
      }

      // the ribbon: the nozzle's last moments, a glowing line that thins and fades
      while (ribbon.length && t - ribbon[0].t > RIBBON_S) ribbon.shift();
      ctx.lineCap = 'round';
      for (let i = 1; i < ribbon.length; i++) {
        const k = 1 - (t - ribbon[i].t) / RIBBON_S;
        ctx.strokeStyle = `rgba(127, 224, 255, ${0.55 * k})`;
        ctx.lineWidth = shipH * 0.13 * k;
        ctx.beginPath();
        ctx.moveTo(ribbon[i - 1].x, ribbon[i - 1].y);
        ctx.lineTo(ribbon[i].x, ribbon[i].y);
        ctx.stroke();
      }

      // the sparks drift, slow down and fade; a few are twinkling stars
      for (let i = sparks.length - 1; i >= 0; i--) {
        const p = sparks[i];
        p.age += dt;
        if (p.age >= p.life) {
          sparks.splice(i, 1);
          continue;
        }
        const drag = Math.exp(-2.4 * dt);
        p.vx *= drag;
        p.vy *= drag;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.spin += dt * 4;
        const a = 1 - p.age / p.life;
        ctx.fillStyle = p.color;
        if (p.star) {
          ctx.globalAlpha = a;
          drawStar(ctx, p.x, p.y, p.size * 2.6 * (0.7 + 0.3 * Math.sin(p.age * 18)), p.spin);
        } else {
          ctx.globalAlpha = a * 0.22;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * 2.6, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = a;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * 0.8, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;

      if (pose && nozzle) {
        const heading = pose.angle + Math.PI / 2; // the art points up
        // the flame: a flickering cartoon jet out of the nozzle
        const flame = shipH * (0.32 + Math.random() * 0.12);
        ctx.save();
        ctx.translate(nozzle.x, nozzle.y);
        ctx.rotate(heading);
        const jet = ctx.createRadialGradient(0, 0, 0, 0, flame * 0.4, flame);
        jet.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
        jet.addColorStop(0.3, 'rgba(255, 215, 122, 0.85)');
        jet.addColorStop(0.65, 'rgba(255, 106, 213, 0.45)');
        jet.addColorStop(1, 'rgba(255, 106, 213, 0)');
        ctx.fillStyle = jet;
        ctx.beginPath();
        ctx.ellipse(0, flame * 0.45, shipH * 0.11, flame * 0.6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // the rocket, with a jolly wobble and a stretch as it speeds up
        ctx.globalCompositeOperation = 'source-over';
        const wobble = Math.sin(t * 17) * 0.09 + Math.sin(t * 5.3) * 0.05;
        const stretch = 1 + Math.min(0.12, u * u * 0.14);
        ctx.save();
        ctx.translate(pose.x, pose.y);
        ctx.rotate(heading + wobble);
        ctx.scale(1 / Math.sqrt(stretch), stretch);
        ctx.shadowColor = 'rgba(127, 224, 255, 0.8)';
        ctx.shadowBlur = 14;
        ctx.drawImage(ship, -shipH / 4, -shipH / 2, shipH / 2, shipH);
        ctx.restore();
      } else if (!sparks.length) {
        alive = false; // gone, and its trail with it
        cancelAnimationFrame(raf);
      }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, [deer]);

  return <canvas ref={canvasRef} className="splash-ship" aria-hidden />;
}
