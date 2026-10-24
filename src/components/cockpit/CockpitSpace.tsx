import { useEffect, useRef } from 'react';
import { activeMission } from '../../profiles/useProfiles';
import { pickOp, type PilotMission } from '../../game/mission';
import { LOOKS } from '../scene/planetLooks';
import { drawPlanet } from './drawPlanet';
import { passer } from './passingLight';

// Through the cockpit's windscreen: space drifting gently by, and numbers
// floating past among the stars (the pilot's own times tables, or sums),
// cartoon-bubbly: outlined like stickers, the answers on glowing tiles with
// sparks crackling round them, and now and then a fact on a starburst.
// Things come from far ahead, grow as they near, and slip past the edges.
// Dead ahead, the level's destination: as big as the fuel says it's near,
// and growing a little as you watch, as if flying towards it. The canvas can
// reach above the glass (`over`), for the cockpit to shift it as you look
// down (the view outside moving less than the frame). Now and then a comet
// streaks by across the top of the glass, lighting the dashboard as it goes
// (passingLight.ts). It's drawn at half the screen's resolution and shown
// with crisp pixels, 16-bit, like the rest of the cockpit.

export interface Destination {
  /** which destination (planetLooks.ts order) */
  index: number;
  /** its name, under it */
  name: string;
  /** how near it is: the fuel tank, 0 to 1 */
  approach: number;
}

interface Star {
  x: number;
  y: number;
  z: number;
  color: string;
}

interface Glyph {
  x: number;
  y: number;
  z: number;
  text: string;
  color: string;
  tilt: number;
  spin: number;
  /** a number on a glowing tile with sparks, a fact on a starburst, or just itself */
  look: 'tile' | 'burst' | 'plain';
  seed: number;
}

const STAR_COLORS = ['#ffffff', '#bff8ff', '#ffc2f6', '#ffd9b3'];
// the cockpit's neon: electric cyan, neon orange and magenta (and white)
const GLYPH_COLORS = ['#e9f4ff', '#46f2ff', '#ff9a3d', '#ff5cf0', '#b9a8ff'];
/** the answers' tiles: their neon rims */
const TILE_COLORS = ['#2ff3ff', '#ff8a1e', '#ff3df0'];
const SPARK = '#ffc46b';
/** screen px a drawn pixel */
const PIXEL = 2;
const STARS = 220;
const GLYPHS = 16;
/** depth travelled per second (everything starts at 1): a gentle cruise */
const SPEED = 0.06;
/** how close things come before they're gone */
const NEAR = 0.12;

const rand = (n: number) => Math.floor(Math.random() * n);

function glyphText(mission: PilotMission): string {
  const r = Math.random();
  if (pickOp(mission) === 'add') {
    const a = 1 + rand(19);
    const b = 1 + rand(19);
    return r < 0.45 ? `${a}+${b}` : r < 0.8 ? String(a + b) : String(rand(10));
  }
  const a = 1 + rand(10);
  const b = 1 + rand(10);
  return r < 0.45 ? `${a}×${b}` : r < 0.8 ? String(a * b) : String(rand(10));
}

function newGlyph(mission: PilotMission, z: number): Glyph {
  // out from the middle, so they part around the way ahead rather than fly at your nose
  const angle = Math.random() * Math.PI * 2;
  const dist = 0.3 + Math.random() * 0.9;
  const text = glyphText(mission);
  const fact = /[×+]/.test(text);
  const tiled = !fact && Math.random() < 0.6;
  return {
    x: Math.cos(angle) * dist,
    y: Math.sin(angle) * dist * 0.75,
    z,
    text,
    color: tiled ? TILE_COLORS[rand(TILE_COLORS.length)] : GLYPH_COLORS[rand(GLYPH_COLORS.length)],
    tilt: (Math.random() - 0.5) * 0.5,
    spin: (Math.random() - 0.5) * 0.3,
    look: tiled ? 'tile' : fact && Math.random() < 0.35 ? 'burst' : 'plain',
    seed: Math.random() * 10,
  };
}

/** a rounded rectangle's path, centred */
function roundRect(ctx: CanvasRenderingContext2D, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(-w / 2 + r, -h / 2);
  ctx.arcTo(w / 2, -h / 2, w / 2, h / 2, r);
  ctx.arcTo(w / 2, h / 2, -w / 2, h / 2, r);
  ctx.arcTo(-w / 2, h / 2, -w / 2, -h / 2, r);
  ctx.arcTo(-w / 2, -h / 2, w / 2, -h / 2, r);
  ctx.closePath();
}

/** a glyph drawn at the origin, `size` px: cartoon-bubbly, with its tile and sparks or its starburst */
function drawGlyph(ctx: CanvasRenderingContext2D, g: Glyph, size: number, t: number) {
  ctx.font = `700 ${size.toFixed(1)}px Fredoka, sans-serif`;
  const tw = ctx.measureText(g.text).width;
  if (g.look === 'tile') {
    const w = tw + size * 0.75;
    const h = size * 1.3;
    // the sparks crackling round it
    ctx.strokeStyle = SPARK;
    ctx.lineWidth = Math.max(1, size * 0.07);
    ctx.lineCap = 'round';
    const r0 = Math.max(w, h) * 0.55;
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + g.seed;
      const flick = Math.abs(Math.sin(t * 7 + i * 1.7 + g.seed));
      if (flick < 0.25) continue;
      const len = size * (0.2 + 0.45 * flick);
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0 * 0.85);
      ctx.lineTo(Math.cos(a) * (r0 + len), Math.sin(a) * (r0 + len) * 0.85);
      ctx.stroke();
    }
    // the tile: dark glass, its neon rim glowing
    roundRect(ctx, w, h, size * 0.28);
    ctx.fillStyle = 'rgba(12, 14, 42, 0.78)';
    ctx.fill();
    ctx.shadowColor = g.color;
    ctx.shadowBlur = size * 0.6;
    ctx.strokeStyle = g.color;
    ctx.lineWidth = Math.max(1.5, size * 0.1);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.lineWidth = Math.max(0.75, size * 0.03);
    roundRect(ctx, w - size * 0.18, h - size * 0.18, size * 0.2);
    ctx.stroke();
  } else if (g.look === 'burst') {
    // a cartoon starburst behind the fact, turning slowly
    const R = tw * 0.62 + size * 0.45;
    const points = 12;
    ctx.save();
    ctx.rotate(t * 0.4 + g.seed);
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const rr = i % 2 ? R * 0.74 : R;
      const a = (i / (points * 2)) * Math.PI * 2;
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr * 0.8);
    }
    ctx.closePath();
    const alpha = ctx.globalAlpha;
    ctx.globalAlpha = alpha * 0.22;
    ctx.fillStyle = g.color;
    ctx.fill();
    ctx.globalAlpha = alpha * 0.85;
    ctx.strokeStyle = g.color;
    ctx.lineWidth = Math.max(1, size * 0.07);
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.globalAlpha = alpha;
    ctx.restore();
  }
  // the number itself, outlined like a sticker, glowing
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(2, size * 0.2);
  ctx.strokeStyle = 'rgba(18, 8, 44, 0.85)';
  ctx.strokeText(g.text, 0, size * 0.04);
  ctx.shadowColor = g.color;
  ctx.shadowBlur = size * 0.5;
  ctx.fillStyle = g.color;
  ctx.fillText(g.text, 0, size * 0.04);
  ctx.shadowBlur = 0;
  // and a shine across its top
  ctx.globalAlpha *= 0.45;
  ctx.fillStyle = '#fff';
  ctx.save();
  ctx.beginPath();
  ctx.rect(-tw, -size * 0.6, tw * 2, size * 0.42);
  ctx.clip();
  ctx.fillText(g.text, 0, size * 0.04);
  ctx.restore();
}

const snap = (v: number) => Math.round(v / PIXEL) * PIXEL;
/** the comet's tail: how many chunky pixels long */
const TAIL = 38;

/** a pixel disc, centred */
function disc(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.arc(snap(x), snap(y), Math.max(PIXEL, snap(r)), 0, Math.PI * 2);
  ctx.fill();
}

/** the comet passing by (passingLight.ts): its tail of chunky pixels streaming behind, its glow in hard bands with a dithered rim, a white-hot head */
function drawPasser(ctx: CanvasRenderingContext2D, w: number, top: number, vh: number, now: number) {
  const x = passer.x * w;
  const y = top + passer.y * vh;
  const r = Math.max(5, vh * 0.032);
  const back = -passer.dir;
  for (let i = TAIL - 1; i >= 0; i--) {
    const d = (i + 1) * r * 0.62;
    const wobble = Math.sin(now / 80 + i * 1.7) * r * 0.35 * (i / TAIL);
    const size = Math.max(PIXEL, snap(r * 1.15 * (1 - i / (TAIL + 6))));
    ctx.globalAlpha = 0.85 * (1 - i / TAIL);
    ctx.fillStyle = i % 4 === 0 ? '#ffffff' : passer.color;
    // (rising a little behind it, as it dips)
    ctx.fillRect(snap(x + back * d - size / 2), snap(y - d * 0.14 + wobble - size / 2), size, size);
    // and sparks flicking off it
    if (i % 5 === 2 && Math.sin(now / 60 + i * 3.1) > 0.3) {
      ctx.fillRect(snap(x + back * d), snap(y - d * 0.14 + (i % 2 ? 1 : -1) * r * (0.9 + (i % 3) * 0.4)), PIXEL, PIXEL);
    }
  }
  // its glow: the dithered rim, then the bands
  ctx.fillStyle = passer.color;
  ctx.globalAlpha = 0.35;
  const rim0 = r * 4.2;
  const rim1 = r * 5.4;
  for (let gy = snap(y - rim1); gy <= y + rim1; gy += PIXEL) {
    for (let gx = snap(x - rim1); gx <= x + rim1; gx += PIXEL) {
      if (((gx + gy) / PIXEL) % 2) continue;
      const dd = Math.hypot(gx - x, gy - y);
      if (dd >= rim0 && dd < rim1) ctx.fillRect(gx, gy, PIXEL, PIXEL);
    }
  }
  for (const [k, a] of [
    [4.2, 0.12],
    [3, 0.2],
    [2, 0.34],
    [1.4, 0.6],
  ]) {
    ctx.globalAlpha = a;
    disc(ctx, x, y, r * k);
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#ffffff';
  disc(ctx, x, y, r * 0.9);
}

/** `active`: drawn (not while the head is turned away from the windscreen) */
export function CockpitSpace({ calm, destination, over = 0, active = true }: { calm: boolean; destination?: Destination; over?: number; active?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // (read by the drawing loop, which doesn't restart for it)
  const ahead = useRef(destination);
  const shown = useRef(active);
  useEffect(() => {
    ahead.current = destination;
    shown.current = active;
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const mission = activeMission();
    const stars: Star[] = Array.from({ length: STARS }, () => ({
      x: (Math.random() - 0.5) * 2.4,
      y: (Math.random() - 0.5) * 2.4,
      z: Math.random(),
      color: STAR_COLORS[rand(STAR_COLORS.length)],
    }));
    // already on their way when the cockpit opens
    const glyphs = Array.from({ length: GLYPHS }, (_, i) => newGlyph(mission, NEAR + ((i + Math.random()) / GLYPHS) * (1 - NEAR)));
    const speed = SPEED * (calm ? 0.2 : 1);

    // (chunky pixels, whatever the screen's own)
    const dpr = 1 / PIXEL;
    let w = 0;
    let h = 0;
    const resize = () => {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      ctx.imageSmoothingEnabled = false;
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    let raf = 0;
    let last = performance.now();
    const opened = last;
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (!w || !h || !shown.current) return;
      // (the glass is the canvas but for the room above it)
      const vh = h / (1 + over);
      const top = h - vh;
      // the way ahead (where everything comes from, and the destination is): mid-glass
      const cx = w / 2;
      const cy = top + vh * 0.52;
      const f = Math.max(w, vh * 1.6) * 0.42;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // deep space, a faint glow far ahead
      const sky = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.85);
      sky.addColorStop(0, '#24154d');
      sky.addColorStop(0.5, '#110b28');
      sky.addColorStop(1, '#05040d');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);

      for (const s of stars) {
        s.z -= dt * speed * 1.6;
        if (s.z <= NEAR) {
          s.x = (Math.random() - 0.5) * 2.4;
          s.y = (Math.random() - 0.5) * 2.4;
          s.z = 1;
        }
        const near = 1 - s.z;
        const x = cx + (s.x / s.z) * f * 0.5;
        const y = cy + (s.y / s.z) * f * 0.5;
        ctx.globalAlpha = Math.min(1, near * 1.4) * 0.9;
        ctx.fillStyle = s.color;
        // (square, a pixel or two, as pixel-art stars are)
        const px = near > 0.7 ? 2 * PIXEL : PIXEL;
        ctx.fillRect(Math.round(x / PIXEL) * PIXEL, Math.round(y / PIXEL) * PIXEL, px, px);
      }

      // the destination, dead ahead: as near as the fuel says, and nearing as you watch
      const dest = ahead.current;
      if (dest) {
        const a = Math.max(0, Math.min(1, dest.approach));
        const eased = a * a * (3 - 2 * a);
        const nearing = 1 + Math.min(1, (now - opened) / 40000) * 0.14 * (calm ? 0.3 : 1);
        // (never so big its rings reach the glass's title above, or its name the dashboard below)
        const look = LOOKS[dest.index % LOOKS.length];
        const r = Math.min(Math.min(w, vh) * (0.06 + 0.12 * eased) * nearing, vh * (look.ring ? 0.16 : 0.19));
        ctx.globalAlpha = 1;
        drawPlanet(ctx, cx, cy, r, look, dest.index, (now - opened) / 1000);
        ctx.globalAlpha = 0.75;
        // (in the cockpit's pixel font, big enough to read in chunky pixels)
        ctx.font = `700 ${Math.max(16, Math.min(22, vh * 0.06)).toFixed(0)}px Silkscreen, 'Rubik Pixels', monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = '#e9dff7';
        ctx.fillText(dest.name, cx, cy + r * (look.ring ? 1.25 : 1.12) + 6);
      }

      // the numbers, farthest first
      glyphs.sort((a, b) => b.z - a.z);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.direction = 'ltr';
      for (let i = 0; i < glyphs.length; i++) {
        const g = glyphs[i];
        g.z -= dt * speed;
        g.tilt += dt * g.spin;
        const x = cx + (g.x / g.z) * f;
        const y = cy + (g.y / g.z) * f;
        const size = 15 / g.z;
        if (g.z <= NEAR || x < -size * 3 || x > w + size * 3 || y < -size * 2 || y > h + size * 2) {
          glyphs[i] = newGlyph(mission, 1);
          continue;
        }
        const fadeIn = Math.min(1, (1 - g.z) / 0.2);
        const fadeOut = Math.min(1, (g.z - NEAR) / 0.18);
        ctx.globalAlpha = 0.85 * fadeIn * fadeOut;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(g.tilt);
        drawGlyph(ctx, g, size, now / 1000);
        ctx.restore();
      }
      // something glowing passing by, in front of it all
      if (passer.on) drawPasser(ctx, w, top, vh, now);
      ctx.globalAlpha = 1;
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [calm, over]);

  return <canvas ref={canvasRef} className="ck-space" aria-hidden />;
}
