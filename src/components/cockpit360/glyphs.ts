import { pickOp, type PilotMission } from '../../game/mission';

// The numbers floating past outside (the pilot's own times tables, or sums),
// as the settings cockpit's windscreen had them: cartoon-bubbly, outlined
// like stickers, the answers on glowing tiles with sparks round them, and
// now and then a fact on a starburst. Each is drawn once on a canvas of its
// own, for a sprite (Space.tsx).

export type GlyphLook = 'tile' | 'burst' | 'plain';

// the cockpit's neon: electric cyan, neon orange and magenta (and white)
const GLYPH_COLORS = ['#e9f4ff', '#46f2ff', '#ff9a3d', '#ff5cf0', '#b9a8ff'];
/** the answers' tiles: their neon rims */
const TILE_COLORS = ['#2ff3ff', '#ff8a1e', '#ff3df0'];
const SPARK = '#ffc46b';

const rand = (n: number) => Math.floor(Math.random() * n);

export function glyphText(mission: PilotMission): string {
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
function drawGlyph(ctx: CanvasRenderingContext2D, text: string, look: GlyphLook, color: string, size: number, seed: number) {
  ctx.font = `700 ${size.toFixed(1)}px Fredoka, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const tw = ctx.measureText(text).width;
  if (look === 'tile') {
    const w = tw + size * 0.75;
    const h = size * 1.3;
    // the sparks crackling round it
    ctx.strokeStyle = SPARK;
    ctx.lineWidth = Math.max(1, size * 0.07);
    ctx.lineCap = 'round';
    const r0 = Math.max(w, h) * 0.55;
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + seed;
      const flick = Math.abs(Math.sin(i * 1.7 + seed * 3));
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
    ctx.shadowColor = color;
    ctx.shadowBlur = size * 0.6;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1.5, size * 0.1);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.lineWidth = Math.max(0.75, size * 0.03);
    roundRect(ctx, w - size * 0.18, h - size * 0.18, size * 0.2);
    ctx.stroke();
  } else if (look === 'burst') {
    // a cartoon starburst behind the fact
    const R = tw * 0.62 + size * 0.45;
    const points = 12;
    ctx.save();
    ctx.rotate(seed);
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const rr = i % 2 ? R * 0.74 : R;
      const a = (i / (points * 2)) * Math.PI * 2;
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr * 0.8);
    }
    ctx.closePath();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = color;
    ctx.fill();
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, size * 0.07);
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.restore();
  }
  // the number itself, outlined like a sticker, glowing
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(2, size * 0.2);
  ctx.strokeStyle = 'rgba(18, 8, 44, 0.85)';
  ctx.strokeText(text, 0, size * 0.04);
  ctx.shadowColor = color;
  ctx.shadowBlur = size * 0.5;
  ctx.fillStyle = color;
  ctx.fillText(text, 0, size * 0.04);
  ctx.shadowBlur = 0;
  // and a shine across its top
  ctx.globalAlpha = 0.45;
  ctx.fillStyle = '#fff';
  ctx.save();
  ctx.beginPath();
  ctx.rect(-tw, -size * 0.6, tw * 2, size * 0.42);
  ctx.clip();
  ctx.fillText(text, 0, size * 0.04);
  ctx.restore();
  ctx.globalAlpha = 1;
}

/** a glyph on a canvas of its own: the canvas, and how wide it is for its height */
export function glyphCanvas(mission: PilotMission): { canvas: HTMLCanvasElement; aspect: number } {
  const text = glyphText(mission);
  const fact = /[×+]/.test(text);
  const tiled = !fact && Math.random() < 0.6;
  const look: GlyphLook = tiled ? 'tile' : fact && Math.random() < 0.4 ? 'burst' : 'plain';
  const color = tiled ? TILE_COLORS[rand(TILE_COLORS.length)] : GLYPH_COLORS[rand(GLYPH_COLORS.length)];
  const size = 64;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  ctx.font = `700 ${size}px Fredoka, sans-serif`;
  const tw = ctx.measureText(text).width;
  // room for the tile's sparks, or the starburst
  const w = Math.ceil(Math.max(tw * 1.5 + size * 1.6, size * 2.4));
  const h = Math.ceil(size * 2.4);
  canvas.width = w;
  canvas.height = h;
  ctx.translate(w / 2, h / 2);
  drawGlyph(ctx, text, look, color, size, Math.random() * 10);
  return { canvas, aspect: w / h };
}
