import { useEffect, useRef } from 'react';
import { LAMP, PAD } from './layout';

/** a ship leaving the pad: its picture as drawn there, and where (stage px) */
export interface Departure {
  id: number;
  /** the ship as it stood (device px: its CSS size × dpr) */
  image: HTMLCanvasElement;
  dpr: number;
  left: number;
  top: number;
  width: number;
  height: number;
}

interface Props {
  ship: Departure;
  /** screen px for one of the picture's */
  u: number;
  onDone: () => void;
}

/** (s) the ship blazes up this long (then eases back a little, its colours showing as it comes apart), its blocks leave between these, each rising this long */
const GLOW_S = 0.22;
const GLOW_DOWN_S = 0.3;
const GLOW_REST = 0.35;
const LEAVE_FROM = 0.14;
const LEAVE_SPREAD = 0.55;
const LIFE = [0.4, 0.6];
/** a block heats white this long before it leaves */
const HEAT_S = 0.12;
/** how the blocks' turns are spread: the dither, and the rows from the top (it goes from the top down) */
const DITHER = 0.5;

// an 8 × 8 ordered-dither (Bayer) matrix, 0..63
const BAYER = [
  [0, 32, 8, 40, 2, 34, 10, 42],
  [48, 16, 56, 24, 50, 18, 58, 26],
  [12, 44, 4, 36, 14, 46, 6, 38],
  [60, 28, 52, 20, 62, 30, 54, 22],
  [3, 35, 11, 43, 1, 33, 9, 41],
  [51, 19, 59, 27, 49, 17, 57, 25],
  [15, 47, 7, 39, 13, 45, 5, 37],
  [63, 31, 55, 23, 61, 29, 53, 21],
];
/** what the blocks turn to as they rise: the beam's light */
const LIGHT = [200, 244, 255];

interface Block {
  /** its spot in the ship (device px) */
  x: number;
  y: number;
  r: number;
  g: number;
  b: number;
  a: number;
  /** when it leaves, and how long it rises (s) */
  leave: number;
  life: number;
  /** how far it swings across as it goes (device px) */
  sway: number;
}

// A ship leaving the pad. It blazes up white, then comes apart a block at a
// time in an ordered-dither pattern, from the top down: each block heats
// white and is gone from the ship, a glowing pixel rising and speeding up
// into the lamp in the ceiling, as if beamed up, turning to the beam's light
// as it goes. Drawn on a canvas from the lamp down to the pad.
export function ShipDissolve({ ship, u, onDone }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });

  // the canvas: from the lamp down to the pad, the ship and some room round it
  const room = 26 * u;
  const left = Math.min(ship.left, LAMP.x * u) - room;
  const right = Math.max(ship.left + ship.width, LAMP.x * u) + room;
  const top = LAMP.y * u - 6 * u;
  const bottom = PAD.y * u + 4 * u;

  useEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) {
      done.current();
      return;
    }
    const { image, dpr } = ship;
    c.width = Math.round((right - left) * dpr);
    c.height = Math.round((bottom - top) * dpr);
    // the ship's corner, and the lamp, on the canvas
    const ox = Math.round((ship.left - left) * dpr);
    const oy = Math.round((ship.top - top) * dpr);
    const lampX = (LAMP.x * u - left) * dpr;
    const lampY = (LAMP.y * u - top) * dpr;

    // the ship in blocks of two of the picture's pixels (as chunky as the bay's own)
    const size = Math.max(3, Math.round(1.5 * u)) * dpr;
    const B = Math.round(size);
    const data = image.getContext('2d')?.getImageData(0, 0, image.width, image.height).data;
    const blocks: Block[] = [];
    const rows = Math.ceil(image.height / B);
    const cols = Math.ceil(image.width / B);
    for (let by = 0; by < rows; by++) {
      for (let bx = 0; bx < cols; bx++) {
        let r = 0;
        let g = 0;
        let b = 0;
        let a = 0;
        let n = 0;
        if (data) {
          for (let y = by * B; y < Math.min(image.height, (by + 1) * B); y += 2) {
            for (let x = bx * B; x < Math.min(image.width, (bx + 1) * B); x += 2) {
              const i = (y * image.width + x) * 4;
              const al = data[i + 3];
              r += data[i] * al;
              g += data[i + 1] * al;
              b += data[i + 2] * al;
              a += al;
              n++;
            }
          }
        }
        if (!n || a / n < 90) continue;
        const turn = DITHER * (BAYER[by % 8][bx % 8] / 63) + (1 - DITHER) * (by / Math.max(1, rows - 1));
        blocks.push({
          x: bx * B,
          y: by * B,
          r: r / a,
          g: g / a,
          b: b / a,
          a: a / n / 255,
          leave: LEAVE_FROM + LEAVE_SPREAD * turn,
          life: LIFE[0] + (LIFE[1] - LIFE[0]) * Math.random(),
          sway: (Math.random() - 0.5) * 14 * dpr,
        });
      }
    }
    const end = Math.max(...blocks.map((k) => k.leave + k.life), GLOW_S) + 0.05;

    ctx.imageSmoothingEnabled = false;
    const start = performance.now();
    let raf = 0;
    const frame = (now: number) => {
      const t = Math.max(0, (now - start) / 1000);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.clearRect(0, 0, c.width, c.height);
      // the ship, blazing up
      ctx.drawImage(image, ox, oy);
      const glow = t < GLOW_S ? t / GLOW_S : Math.max(GLOW_REST, 1 - ((1 - GLOW_REST) * (t - GLOW_S)) / GLOW_DOWN_S);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = glow;
      ctx.drawImage(image, ox, oy);
      ctx.globalCompositeOperation = 'source-atop';
      ctx.globalAlpha = 0.35 * glow;
      ctx.fillStyle = 'rgb(170, 230, 255)';
      ctx.fillRect(ox, oy, image.width, image.height);
      // the blocks gone from it, and those heating up to go
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'destination-out';
      for (const k of blocks) if (t >= k.leave) ctx.fillRect(ox + k.x, oy + k.y, B, B);
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = '#fff';
      for (const k of blocks) {
        const heat = (t - (k.leave - HEAT_S)) / HEAT_S;
        if (heat <= 0 || heat >= 1) continue;
        ctx.globalAlpha = heat * 0.85 * k.a;
        ctx.fillRect(ox + k.x, oy + k.y, B, B);
      }
      // and rising into the lamp
      ctx.globalCompositeOperation = 'source-over';
      for (const k of blocks) {
        const p = (t - k.leave) / k.life;
        if (p < 0 || p >= 1) continue;
        const ease = p * p;
        const x0 = ox + k.x;
        const y0 = oy + k.y;
        const x = x0 + (lampX - x0) * ease * 0.75 + k.sway * Math.sin(p * Math.PI);
        const y = y0 + (lampY - y0) * ease;
        const s = B * (1 - 0.45 * p);
        const w = Math.min(1, p * 1.6);
        ctx.globalAlpha = k.a * (1 - p * p);
        ctx.fillStyle = `rgb(${Math.round(k.r + (LIGHT[0] - k.r) * w)}, ${Math.round(k.g + (LIGHT[1] - k.g) * w)}, ${Math.round(k.b + (LIGHT[2] - k.b) * w)})`;
        ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(s)), Math.max(1, Math.round(s)));
      }
      if (t >= end) {
        done.current();
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // (one ship, one departure: what it was when it left)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <canvas ref={canvas} className="pad-dissolve" style={{ left, top, width: right - left, height: bottom - top }} aria-hidden="true" />;
}
