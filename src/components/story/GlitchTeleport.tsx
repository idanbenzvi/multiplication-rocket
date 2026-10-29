import { useEffect, useLayoutEffect, useRef } from 'react';
import { glitchArtNow, loadGlitchArt, type GlitchArt } from './glitchArt';
import { pixelRatio } from '../../settings/quality';

// The title leaving (StoryTitle.tsx): rather than shrinking and flying to the
// top bar, the logo glitches out where it is and glitches in at its place up
// there, as a broken transmission would. Torn into bands jumping sideways, its
// red pulled one way and its green and blue the other, flickering, blocks of
// colour flashing round it, it collapses to a bright line and a dot like an
// old screen switched off; the dot zips across to the top bar, opens into a
// line there, and the logo comes back torn and settles. Drawn on a 2D canvas
// over the whole screen, from the logo's art (base.webp) as drawn.

/** a box on the screen (px) */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** how long each part takes (ms): out, across, in */
const OUT = 440;
const ACROSS = 150;
const IN = 420;
/** the tearing's steps (ms): it jumps rather than slides */
const STEP = 42;

/** all of it (ms), there and back in again, or (with nowhere to go) just out */
const teleportMs = (there: boolean) => (there ? OUT + ACROSS + IN : OUT + 60);

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (a: number, b: number, t: number) => {
  const u = clamp01((t - a) / (b - a));
  return u * u * (3 - 2 * u);
};

/** a little seeded random, so a step tears the same way each frame it's on */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Torn {
  /** how torn, 0 (whole) … 1 */
  k: number;
  /** squashed to a line: 0 not at all … 1 a line */
  line: number;
  /** a seed for this step's tearing */
  seed: number;
}

/** the logo in `box`, torn `k` (both channels drawn with 'lighter') */
function drawTorn(ctx: CanvasRenderingContext2D, red: HTMLCanvasElement, cyan: HTMLCanvasElement, box: Box, { k, line, seed }: Torn) {
  const rand = seeded(seed);
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const sy = 1 - 0.985 * line;
  const sx = 1 + 0.45 * line;
  const split = (box.h / 300) * (1.5 + k * 16);
  const sw = red.width;
  const sh = red.height;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(sx, sy);
  ctx.translate(-cx, -cy);
  ctx.globalCompositeOperation = 'lighter';
  // the bands, each jumping sideways (most a little, a few a long way), some dropped
  let v = 0;
  while (v < 1) {
    const dv = Math.min(1 - v, 0.03 + rand() * (k > 0 ? 0.16 : 1));
    const far = rand() < 0.12 + 0.3 * k;
    const shift = (rand() - 0.5) * box.w * k * (far ? 0.7 : 0.05);
    const dropped = rand() < 0.12 * k;
    if (!dropped) {
      const y = box.y + v * box.h;
      const h = dv * box.h;
      ctx.drawImage(red, 0, v * sh, sw, dv * sh, box.x + shift - split, y, box.w, h);
      ctx.drawImage(cyan, 0, v * sh, sw, dv * sh, box.x + shift + split, y, box.w, h);
    }
    v += dv;
  }
  // blocks of colour flashing round it
  const blocks = Math.floor(k * 14);
  for (let i = 0; i < blocks; i++) {
    ctx.fillStyle = ['rgba(0, 240, 255, 0.55)', 'rgba(255, 0, 140, 0.5)', 'rgba(255, 255, 255, 0.6)'][Math.floor(rand() * 3)];
    const w = box.w * (0.03 + rand() * 0.22);
    const h = box.h * (0.008 + rand() * 0.04);
    ctx.fillRect(box.x - box.w * 0.15 + rand() * box.w * 1.3 - w / 2, box.y + rand() * box.h, w, h);
  }
  // the line it's squashed to, glowing white
  if (line > 0) {
    ctx.fillStyle = `rgba(255, 255, 255, ${0.9 * line})`;
    ctx.fillRect(box.x, cy - box.h * 0.04, box.w, box.h * 0.08);
  }
  ctx.restore();
  // scan lines across it
  if (k > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = `rgba(0, 0, 0, ${0.28 * k})`;
    const gap = Math.max(2, Math.round(box.h / 90));
    for (let y = box.y - box.h * 0.1; y < box.y + box.h * 1.1; y += gap * 2) ctx.fillRect(box.x - box.w * 0.4, y, box.w * 1.8, gap);
    ctx.restore();
  }
}

/** a bright dot (a screen switched off), `size` px, `a` bright */
function dot(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, a: number) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, size);
  g.addColorStop(0, `rgba(255, 255, 255, ${a})`);
  g.addColorStop(0.35, `rgba(150, 245, 255, ${0.6 * a})`);
  g.addColorStop(1, 'rgba(255, 0, 160, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(x - size, y - size, size * 2, size * 2);
}

/** the logo at `from` glitching out, and (given `to`) in again there; `onDone` once it's in (or gone) */
export function GlitchTeleport({ from, to, onDone }: { from: Box; to: Box | null; onDone: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });

  // (in a layout effect, so its first frame is there as the logo's hidden)
  useLayoutEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext('2d');
    if (!el || !ctx) {
      done.current();
      return;
    }
    let raf = 0;
    let alive = true;
    const dpr = pixelRatio(2, 1);
    el.width = Math.round(window.innerWidth * dpr);
    el.height = Math.round(window.innerHeight * dpr);
    const run = ({ red, cyan }: GlitchArt) => {
      if (!alive) return;
      const start = performance.now();
      const total = teleportMs(!!to);
      const frame = () => {
        if (!alive) return;
        const t = performance.now() - start;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, el.width, el.height);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const seed = Math.floor(t / STEP);
        if (t < OUT) {
          // out: tearing more and more, then squashed to a line, and the line to a dot
          const k = 0.3 + 0.7 * smooth(0, OUT * 0.75, t);
          const line = smooth(OUT * 0.62, OUT * 0.9, t);
          const shrink = smooth(OUT * 0.88, OUT, t);
          // (flickering out now and then, once it's begun)
          if (t < STEP * 2 || seeded(seed * 31 + 7)() > 0.12 * k) {
            const box = {
              x: from.x + (from.w * shrink) / 2,
              y: from.y,
              w: from.w * (1 - shrink * 0.97),
              h: from.h,
            };
            drawTorn(ctx, red, cyan, box, { k, line, seed });
          }
          if (shrink > 0) dot(ctx, from.x + from.w / 2, from.y + from.h / 2, from.h * 0.12, shrink);
        } else if (to && t < OUT + ACROSS) {
          // across: the dot zipping to the top bar, a streak behind it, bits shed along the way
          const u = smooth(OUT, OUT + ACROSS, t);
          const ax = from.x + from.w / 2;
          const ay = from.y + from.h / 2;
          const bx = to.x + to.w / 2;
          const by = to.y + to.h / 2;
          const x = ax + (bx - ax) * u;
          const y = ay + (by - ay) * u;
          const tail = Math.max(0, u - 0.35);
          const tx = ax + (bx - ax) * tail;
          const ty = ay + (by - ay) * tail;
          const streak = ctx.createLinearGradient(tx, ty, x, y);
          streak.addColorStop(0, 'rgba(255, 0, 160, 0)');
          streak.addColorStop(0.6, 'rgba(0, 240, 255, 0.7)');
          streak.addColorStop(1, 'rgba(255, 255, 255, 1)');
          ctx.strokeStyle = streak;
          ctx.lineCap = 'round';
          ctx.lineWidth = Math.max(2, from.h * 0.02);
          ctx.beginPath();
          ctx.moveTo(tx, ty);
          ctx.lineTo(x, y);
          ctx.stroke();
          const rand = seeded(seed * 13 + 5);
          for (let i = 0; i < 10; i++) {
            const s = tail + (u - tail) * rand();
            const size = 2 + rand() * 5;
            ctx.fillStyle = rand() < 0.5 ? 'rgba(0, 240, 255, 0.8)' : 'rgba(255, 0, 160, 0.75)';
            ctx.fillRect(ax + (bx - ax) * s + (rand() - 0.5) * 30, ay + (by - ay) * s + (rand() - 0.5) * 30, size, size);
          }
          dot(ctx, x, y, Math.max(10, from.h * 0.08), 1);
        } else if (to && t < total) {
          // in: the dot opening into a line, the line into the logo, torn and settling
          const s = t - OUT - ACROSS;
          const open = smooth(0, IN * 0.15, s);
          const line = 1 - smooth(IN * 0.1, IN * 0.32, s);
          const k = 1 - smooth(IN * 0.15, IN * 0.85, s);
          const box = {
            x: to.x + (to.w * (1 - open)) / 2,
            y: to.y,
            w: to.w * Math.max(0.03, open),
            h: to.h,
          };
          if (s > IN * 0.85 || seeded(seed * 31 + 7)() > 0.15 * k) drawTorn(ctx, red, cyan, box, { k, line, seed });
          if (open < 1) dot(ctx, to.x + to.w / 2, to.y + to.h / 2, Math.max(10, to.h * 0.2), 1 - open);
        } else if (t >= total) {
          done.current();
          return;
        }
        raf = requestAnimationFrame(frame);
      };
      frame();
    };
    const art = glitchArtNow();
    if (art) run(art);
    else
      loadGlitchArt()
        .then(run)
        .catch(() => {
          if (alive) done.current();
        });
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
    // (where from and to are read once: it's one jump)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <canvas ref={canvas} className="story-glitch" aria-hidden />;
}
