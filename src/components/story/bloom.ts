import { css, hex, mix } from '../arrival/eclipse';

// Letters of light for the story, each drawn once and then just stamped:
// the numbers in the sky (and those swallowed, and those puffed out of the
// ships' engines), each with a little bloom close round it rather than a
// glow round the lot, and the glyphs the Black Sun spits out.

/** the numbers' font size in their sprites: the same as the Black Sun's own, so its `stamp` sizes these as it does those */
const PX = 64;
const FONT = "'Fredoka', 'Trebuchet MS', sans-serif";
/** the glyphs': a terminal's */
export const GLYPH_FONT = "'VT323', 'Courier New', monospace";
const GLYPH_PX = 40;

const sprites = new Map<string, HTMLCanvasElement>();
if (typeof document !== 'undefined') void document.fonts?.ready.then(() => sprites.clear());

function cached(key: string, width: number, height: number, paint: (ctx: CanvasRenderingContext2D, w: number, h: number) => void): HTMLCanvasElement {
  const have = sprites.get(key);
  if (have) return have;
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const ctx = c.getContext('2d');
  if (ctx) paint(ctx, width, height);
  sprites.set(key, c);
  return c;
}

/** white-hot towards the middle of a letter of `color` */
const hot = (color: string, k: number) => css(mix(hex(color), [255, 255, 255], k), 1);

/**
 * A number in `color` with a little bloom: its colour haze close round it,
 * a tighter glow on its strokes, and their middles nearly white.
 */
export function bloomNumber(text: string, color: string): HTMLCanvasElement {
  return cached(`n|${text}|${color}`, Math.ceil(PX * 0.62 * text.length + PX * 1.1), Math.ceil(PX * 1.9), (ctx, w, h) => {
    ctx.font = `700 ${PX}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    // the haze, the glow, the letter
    ctx.globalAlpha = 0.5;
    ctx.shadowBlur = PX * 0.26;
    ctx.fillText(text, w / 2, h / 2);
    ctx.globalAlpha = 1;
    ctx.shadowBlur = PX * 0.08;
    ctx.fillText(text, w / 2, h / 2);
    ctx.shadowBlur = 0;
    ctx.fillStyle = hot(color, 0.62);
    ctx.fillText(text, w / 2, h / 2);
  });
}

/** one of the Black Sun's glyphs: a terminal's character in `color`, glowing (a cell's worth, square; drawn additively) */
export function glyphSprite(ch: string, color: string): HTMLCanvasElement {
  const size = Math.ceil(GLYPH_PX * 1.4);
  return cached(`g|${ch}|${color}`, size, size, (ctx, w, h) => {
    ctx.font = `${GLYPH_PX}px ${GLYPH_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = GLYPH_PX * 0.28;
    ctx.fillText(ch, w / 2, h / 2);
    ctx.shadowBlur = 0;
    ctx.fillStyle = hot(color, 0.22);
    ctx.fillText(ch, w / 2, h / 2);
  });
}

/** a tile of the glyph stream: a character on a little rounded square of `color`, a sheen along its top */
export function tileSprite(ch: string, color: string): HTMLCanvasElement {
  const size = 32;
  return cached(`t|${ch}|${color}`, size, size, (ctx) => {
    const inset = 2;
    const side = size - inset * 2;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(inset, inset, side, side, 5);
    else ctx.rect(inset, inset, side, side);
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.92;
    ctx.fill();
    const sheen = ctx.createLinearGradient(0, inset, 0, size * 0.5);
    sheen.addColorStop(0, 'rgba(255, 255, 255, 0.45)');
    sheen.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = sheen;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.font = `${Math.round(side * 0.62)}px ${GLYPH_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.fillText(ch, size / 2, size / 2 + 1);
  });
}
