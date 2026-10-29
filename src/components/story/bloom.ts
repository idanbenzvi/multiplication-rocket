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
const atlases: Atlas[] = [];
if (typeof document !== 'undefined') void document.fonts?.ready.then(() => {
  sprites.clear();
  for (const a of atlases) a.clear();
});

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

/** a sprite on an atlas: the atlas's canvas, and its square on it (device px) */
export interface Sprite {
  img: HTMLCanvasElement;
  x: number;
  y: number;
  size: number;
}

/** (a pixel's gap between an atlas's squares, so none bleeds into the next as it's scaled) */
const GAP = 2;

/**
 * Sprites of one size side by side on one canvas, each painted once. Drawn
 * from the one image, hundreds of them a frame cost the browser little;
 * from a canvas each, as many draws as there are sprites (the Black Sun's
 * liquid and splash, the story's monsters). Full, it starts again.
 */
export class Atlas {
  /** by colour (or the like), then character */
  private readonly at = new Map<string, Map<string, Sprite>>();
  private canvas: HTMLCanvasElement | null = null;
  private used = 0;
  /** each square's side, and how many squares across (and down) */
  private readonly size: number;
  private readonly across: number;

  constructor(size: number, across: number) {
    this.size = size;
    this.across = across;
    atlases.push(this);
  }

  get(group: string, key: string, paint: (ctx: CanvasRenderingContext2D, size: number) => void): Sprite {
    let inGroup = this.at.get(group);
    const have = inGroup?.get(key);
    if (have) return have;
    const step = this.size + GAP;
    if (!this.canvas) {
      this.canvas = document.createElement('canvas');
      this.canvas.width = this.canvas.height = step * this.across;
    }
    const ctx = this.canvas.getContext('2d');
    if (this.used >= this.across * this.across) this.clear();
    if (!inGroup || !this.at.has(group)) this.at.set(group, (inGroup = new Map()));
    const i = this.used++;
    const sprite = { img: this.canvas, x: (i % this.across) * step, y: Math.floor(i / this.across) * step, size: this.size };
    if (ctx) {
      ctx.save();
      ctx.translate(sprite.x, sprite.y);
      ctx.beginPath();
      ctx.rect(0, 0, this.size, this.size);
      ctx.clip();
      paint(ctx, this.size);
      ctx.restore();
    }
    inGroup.set(key, sprite);
    return sprite;
  }

  clear() {
    this.at.clear();
    this.used = 0;
    this.canvas?.getContext('2d')?.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
}

/** `s` drawn into the square at x, y, `size` across */
export function drawSprite(ctx: CanvasRenderingContext2D, s: Sprite, x: number, y: number, size: number) {
  ctx.drawImage(s.img, s.x, s.y, s.size, s.size, x, y, size, size);
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

const glyphs = new Atlas(Math.ceil(GLYPH_PX * 1.4), 18);
/** the little monsters' (littleMonsters.ts): Monster Sun's bold characters, smaller, with a little glow */
const MONSTER_PX = 24;
const MONSTER_FONT = 'ui-monospace, Menlo, Consolas, monospace';
const monsterGlyphs = new Atlas(Math.ceil(MONSTER_PX * 1.4), 32);
const tiles = new Atlas(32, 16);

/** one of the Black Sun's glyphs: a terminal's character in `color`, glowing (a cell's worth, square; drawn additively) */
export function glyphSprite(ch: string, color: string): Sprite {
  return glyphs.get(color, ch, (ctx, size) => {
    ctx.font = `${GLYPH_PX}px ${GLYPH_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = GLYPH_PX * 0.28;
    ctx.fillText(ch, size / 2, size / 2);
    ctx.shadowBlur = 0;
    ctx.fillStyle = hot(color, 0.22);
    ctx.fillText(ch, size / 2, size / 2);
  });
}

/** one of a little monster's characters in `color`, glowing a little (square, the character a little over half of it) */
export function monsterGlyph(ch: string, color: string): Sprite {
  return monsterGlyphs.get(color, ch, (ctx, size) => {
    ctx.font = `700 ${MONSTER_PX}px ${MONSTER_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = MONSTER_PX * 0.22;
    ctx.fillText(ch, size / 2, size / 2);
  });
}

/** a tile of the glyph stream: a character on a little rounded square of `color`, a sheen along its top */
export function tileSprite(ch: string, color: string): Sprite {
  return tiles.get(color, ch, (ctx, size) => {
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
