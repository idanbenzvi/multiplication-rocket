// The building blocks of Monster Sun's monsters (roster.ts) and the friends
// they turn into: shapes on the monster's grid, the cells a monster is made
// of, the letters of a friend, and a kit of faces, hats and props to draw on
// a friend once it's cured. Everything is in grid units: x right and y down,
// from -1 to 1 across the monster's square.

/** cells across the grid */
export const N = 29;
/** the glitchy characters a monster is made of, unless it has its own */
export const GLYPHS = '#@%&*+=?!$<>{}[]/\\~^0XЖΨΩ§∑∆≈¥¤'.split('');
/** the classic sun's eye sockets */
export const EYE_R = 0.1;

export const pickOf = (set: string[]) => set[Math.floor(Math.random() * set.length)];
export const easeOut = (p: number) => 1 - (1 - p) ** 3;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

// ---------- shapes ----------

/** a region of the grid */
export type Shape = (x: number, y: number) => boolean;

/** inside an ellipse centred at (cx, cy), turned by `turn` */
export function inEllipse(x: number, y: number, cx: number, cy: number, rx: number, ry: number, turn: number): boolean {
  const dx = x - cx;
  const dy = y - cy;
  const u = dx * Math.cos(turn) + dy * Math.sin(turn);
  const v = -dx * Math.sin(turn) + dy * Math.cos(turn);
  return (u / rx) ** 2 + (v / ry) ** 2 <= 1;
}

export const circle = (cx: number, cy: number, r: number): Shape => (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
export const ellipse = (cx: number, cy: number, rx: number, ry: number, turn = 0): Shape => (x, y) => inEllipse(x, y, cx, cy, rx, ry, turn);

/** a box (half its width and height), its corners rounded by `round` */
export const box =
  (cx: number, cy: number, hw: number, hh: number, round = 0): Shape =>
  (x, y) => {
    const qx = Math.abs(x - cx) - (hw - round);
    const qy = Math.abs(y - cy) - (hh - round);
    if (qx > round || qy > round) return false;
    return qx <= 0 || qy <= 0 || qx * qx + qy * qy <= round * round;
  };

/** a thick line with round ends, `r0` thick at the start and `r1` at the end */
export const stroke =
  (x0: number, y0: number, x1: number, y1: number, r0: number, r1 = r0): Shape =>
  (x, y) => {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const k = clamp01(((x - x0) * dx + (y - y0) * dy) / (dx * dx + dy * dy || 1e-9));
    return Math.hypot(x - (x0 + dx * k), y - (y0 + dy * k)) <= r0 + (r1 - r0) * k;
  };

/** a thick line through several points, tapering from `r0` to `r1` */
export function curve(points: [number, number][], r0: number, r1 = r0): Shape {
  const lengths = points.slice(1).map((p, i) => Math.hypot(p[0] - points[i][0], p[1] - points[i][1]));
  const total = lengths.reduce((a, b) => a + b, 0) || 1;
  const parts: Shape[] = [];
  let run = 0;
  lengths.forEach((len, i) => {
    const a = r0 + ((r1 - r0) * run) / total;
    run += len;
    const b = r0 + ((r1 - r0) * run) / total;
    parts.push(stroke(points[i][0], points[i][1], points[i + 1][0], points[i + 1][1], a, b));
  });
  return union(...parts);
}

export function polygon(points: [number, number][]): Shape {
  return (x, y) => {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const [xi, yi] = points[i];
      const [xj, yj] = points[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
}

/** the corners of a star: `points` points out at `outer`, the dips in between at `inner` */
export function starPoints(cx: number, cy: number, points: number, outer: number, inner: number, turn = -Math.PI / 2): [number, number][] {
  return Array.from({ length: points * 2 }, (_, i) => {
    const r = i % 2 ? inner : outer;
    const a = turn + (i * Math.PI) / points;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  });
}
export const star = (cx: number, cy: number, points: number, outer: number, inner: number, turn?: number): Shape => polygon(starPoints(cx, cy, points, outer, inner, turn));

export const union =
  (...shapes: Shape[]): Shape =>
  (x, y) =>
    shapes.some((s) => s(x, y));
export const minus =
  (a: Shape, b: Shape): Shape =>
  (x, y) =>
    a(x, y) && !b(x, y);
export const mirror =
  (s: Shape): Shape =>
  (x, y) =>
    s(x, y) || s(-x, y);

/** a sun's rays round a disc of radius R, every other one shorter when `alternate` */
export const sunRays =
  (R: number, count: number, alternate: boolean): Shape =>
  (x, y) => {
    const d = Math.hypot(x, y);
    if (d <= R) return false;
    const step = (Math.PI * 2) / count;
    const a = Math.atan2(y, x);
    const k = Math.round(a / step);
    const da = Math.abs(a - k * step);
    const reach = R + (0.95 - R) * (alternate && k % 2 ? 0.62 : 1);
    const taper = 1 - (d - R) / (reach - R);
    return d <= reach && da < step * 0.42 * taper;
  };

// ---------- a monster ----------

export interface Palette {
  /** its brightest middle, the rest of its body, its limbs */
  core: string;
  mid: string;
  ray: string;
  /** "r, g, b" of the light round it */
  glow: string;
  eye: string;
}

/** its grin: a band of teeth along y = y + curve·(x − x)², `w` either side of the middle */
export interface Mouth {
  x?: number;
  y: number;
  w: number;
  curve?: number;
  band?: number;
}

export type Kind = 'body' | 'ray' | 'eye' | 'mouth';

export interface Cell {
  x: number;
  y: number;
  d: number;
  kind: Kind;
  /** in the bright middle of it */
  core: boolean;
  ch: string;
  /** where it flies in from, and when, as the monster assembles */
  sx: number;
  sy: number;
  delay: number;
}

export interface Design {
  /** its body, knocked off after its limbs, and its limbs (rays, ears, tentacles, wings…), knocked off first */
  body: Shape;
  limbs?: Shape;
  /** limbs point a random way each time (a sun's rays) */
  turnLimbs?: boolean;
  eyes: [number, number][];
  /** eye size, grid units */
  eyeR?: number;
  pupil?: 'round' | 'slit' | 'square';
  mouth: Mouth;
  palette: Palette;
  /** where its brightest middle is: x, y, radius */
  heart?: [number, number, number];
  /** what it's made of, unless the glitchy characters */
  glyphs?: string[];
  /** its limbs moving: tentacles writhe, wings flap (how far off its place a limb cell is at time t) */
  sway?: (x: number, y: number, t: number) => [number, number];
  friend: Friend;
}

const MOUTH_DEFAULTS = { x: 0, curve: 0.9, band: 0.05 };

export function inMouth(m: Mouth, x: number, y: number): boolean {
  const { x: mx, curve, band } = { ...MOUTH_DEFAULTS, ...m };
  return Math.abs(x - mx) < m.w && Math.abs(y - (m.y + curve * (x - mx) ** 2)) < band;
}

/** where a number goes in when it's eaten */
export function mouthSpot(d: Design): [number, number] {
  return [d.mouth.x ?? 0, d.mouth.y + 0.03];
}

/** the cells, in the order they're knocked off (limbs first, eyes last) */
export function buildMonster(design: Design): Cell[] {
  const glyphs = design.glyphs ?? GLYPHS;
  const eyeR = design.eyeR ?? EYE_R;
  const [hx, hy, hr] = design.heart ?? [0, 0, 0.22];
  const tilt = design.turnLimbs ? Math.random() * Math.PI : 0;
  const tc = Math.cos(tilt);
  const ts = Math.sin(tilt);
  const h = (N - 1) / 2;
  const cells: (Cell & { order: number })[] = [];
  const add = (x: number, y: number, kind: Kind) => {
    const d = Math.hypot(x, y);
    const rank = kind === 'eye' ? 3 : kind === 'mouth' ? 2 : kind === 'body' ? 1 : 0;
    const a = Math.random() * Math.PI * 2;
    const far = 1.6 + Math.random() * 0.9;
    cells.push({
      x,
      y,
      d,
      kind,
      core: Math.hypot(x - hx, y - hy) < hr,
      ch: pickOf(glyphs),
      sx: Math.cos(a) * far,
      sy: Math.sin(a) * far,
      delay: kind === 'eye' ? 1.15 : 0.1 + Math.random() * 0.8 + d * 0.15,
      order: rank * 10 - d * 4 + Math.random() * 0.8,
    });
  };
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const x = (c - h) / h;
      const y = (r - h) / h;
      // eye sockets stay dark: the eyes are drawn whole
      if (design.eyes.some(([ex, ey]) => Math.hypot(x - ex, y - ey) < eyeR)) continue;
      if (design.body(x, y)) add(x, y, inMouth(design.mouth, x, y) ? 'mouth' : 'body');
      else if (design.limbs?.(x * tc + y * ts, -x * ts + y * tc)) add(x, y, 'ray');
    }
  }
  for (const [ex, ey] of design.eyes) add(ex, ey, 'eye');
  return cells.sort((a, b) => a.order - b.order);
}

// ---------- the friend it turns into ----------

export type FriendPart = 'face' | 'ray' | 'limb' | 'petal' | 'stem' | 'leaf';

export interface FriendCell {
  x: number;
  y: number;
  d: number;
  part: FriendPart;
  ch: string;
  /** the glyphs it twinkles between */
  set: string[];
  color: string;
  /** where it swirls in from, and when */
  sx: number;
  sy: number;
  delay: number;
}

/** what a grid point of a friend is: its part, colour and glyphs (null: not part of it) */
export type FriendPaint = (x: number, y: number) => { part: FriendPart; color: string; set: string[] } | null;

export interface Friend {
  /** its letters (built fresh for each monster) */
  build: () => FriendCell[];
  /** "r, g, b" of its warm glow */
  glow: string;
  /** the ring at its cheer */
  cheer: string;
  /** what floats up off it once it has cheered (hearts unless it says) */
  floats?: { chars: string[]; colors: string[]; at?: [number, number] };
  /** each letter backed by a soft blob of its colour, so it reads as one solid thing */
  soft?: boolean;
  /** soft shapes behind the letters, in grid units (the canvas is already moved, turned and scaled) */
  back?: (ctx: CanvasRenderingContext2D, ft: number, t: number) => void;
  /** its face, and how it shows off at the cheer, in grid units */
  face: (ctx: CanvasRenderingContext2D, ft: number, t: number) => void;
  /** where a letter is at a moment (petals opening, tentacles waving); still unless it says */
  move?: (c: FriendCell, ft: number, t: number) => [number, number];
  /** a letter's colour at a moment, if it changes (a jellyfish glowing in rainbows) */
  tint?: (c: FriendCell, ft: number, t: number) => string | null;
}

/** seconds a letter takes to swirl into place */
export const FLY_S = 0.8;
/** seconds from the cure until the friend shows off (sunglasses land, petals open, a hat drops on) */
export const CHEER_AT = 2.1;
/** seconds a hat (or sunglasses) takes to drop on */
export const DROP_S = 0.7;
export const ROUND = ['*', '+', 'o', '•'];
export const RAINBOW = ['#ff5c8a', '#ff9d4a', '#ffd77a', '#7dff9a', '#6ad7ff', '#c49bff'];
export const HEARTS = ['#ff5c8a', '#ff8fd0', '#ffd77a'];

/** a friend's letters, from what each grid point of it is */
export function friendCells(paint: FriendPaint): FriendCell[] {
  const h = (N - 1) / 2;
  const cells: FriendCell[] = [];
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const x = (c - h) / h;
      const y = (r - h) / h;
      const bit = paint(x, y);
      if (!bit) continue;
      const d = Math.hypot(x, y);
      const a = Math.random() * Math.PI * 2;
      const far = 1.3 + Math.random() * 0.5;
      const late = bit.part === 'face' ? 0 : bit.part === 'stem' || bit.part === 'leaf' ? 0.45 : 0.3;
      cells.push({
        x,
        y,
        d,
        part: bit.part,
        ch: pickOf(bit.set),
        set: bit.set,
        color: bit.color,
        sx: Math.cos(a) * far,
        sy: Math.sin(a) * far,
        delay: 0.2 + late + d * 0.35 + Math.random() * 0.3,
      });
    }
  }
  // the face goes on top
  return cells.sort((a, b) => Number(a.part === 'face') - Number(b.part === 'face'));
}

type At = (x: number, y: number) => [number, number];

/** the friend's letters: scrambled while they swirl in, unscrambled once they land; `cell` is a cell's size on screen */
export function drawFriendCells(ctx: CanvasRenderingContext2D, cells: FriendCell[], friend: Friend, ft: number, t: number, at: At, scrambled: string, cell: number) {
  const spots = cells.map((c) => (friend.move ? friend.move(c, ft, t) : ([c.x, c.y] as [number, number])));
  if (friend.soft) {
    // the landed letters' soft blobs, one fill per colour
    const byColor = new Map<string, [number, number][]>();
    cells.forEach((c, i) => {
      if (ft < c.delay + FLY_S) return;
      const color = friend.tint?.(c, ft, t) ?? c.color;
      const list = byColor.get(color) ?? [];
      list.push(at(spots[i][0], spots[i][1]));
      byColor.set(color, list);
    });
    ctx.globalAlpha = 0.42;
    for (const [color, list] of byColor) {
      ctx.fillStyle = color;
      ctx.beginPath();
      for (const [px, py] of list) {
        ctx.moveTo(px + cell * 0.8, py);
        ctx.arc(px, py, cell * 0.8, 0, Math.PI * 2);
      }
      ctx.fill();
    }
  }
  cells.forEach((c, i) => {
    const p = clamp01((ft - c.delay) / FLY_S);
    if (p <= 0) return;
    const [x, y] = spots[i];
    if (p < 1) {
      const k = easeOut(p);
      const lx = c.sx + (x - c.sx) * k;
      const ly = c.sy + (y - c.sy) * k;
      const swirl = (1 - k) * 2.4;
      const [px, py] = at(lx * Math.cos(swirl) - ly * Math.sin(swirl), lx * Math.sin(swirl) + ly * Math.cos(swirl));
      ctx.globalAlpha = Math.min(1, p * 2);
      ctx.fillStyle = scrambled;
      ctx.fillText(pickOf(GLYPHS), px, py);
      return;
    }
    if (c.set.length > 1 && Math.random() < 0.004) c.ch = pickOf(c.set);
    const [px, py] = at(x, y);
    // the rays shine, a glow running outwards along them
    ctx.globalAlpha = c.part === 'ray' ? 0.6 + 0.4 * (0.5 + 0.5 * Math.sin(t * 5 - c.d * 10)) : 1;
    // each letter flashes white as it lands
    ctx.fillStyle = ft - c.delay - FLY_S < 0.2 ? '#ffffff' : (friend.tint?.(c, ft, t) ?? c.color);
    ctx.fillText(c.ch, px, py);
  });
  ctx.globalAlpha = 1;
}

// ---------- the kit: timing ----------

/** 0 → 1 with a springy overshoot */
export const spring = (p: number) => (p <= 0 ? 0 : 1 - Math.exp(-5 * p) * Math.cos(9 * p));

export function bounce(p: number): number {
  const n = 7.5625;
  const d = 2.75;
  if (p < 1 / d) return n * p * p;
  if (p < 2 / d) return n * (p - 1.5 / d) ** 2 + 0.75;
  if (p < 2.5 / d) return n * (p - 2.25 / d) ** 2 + 0.9375;
  return n * (p - 2.625 / d) ** 2 + 0.984375;
}

/**
 * Something dropping on at the cheer, bouncing as it lands: how far above
 * its place it is (it first touches down at the cheer, `late` seconds
 * after), or null before it starts falling.
 */
export function dropping(ft: number, late = 0): number | null {
  const fall = (ft - CHEER_AT - late) / DROP_S + 1 / 2.75;
  return fall > 0 ? -1.6 * (1 - bounce(Math.min(1, fall))) : null;
}

/** something popping up at the cheer (`late` seconds after): its size, 0 → 1 with a springy overshoot */
export const popping = (ft: number, late = 0) => spring((ft - CHEER_AT - late) / 0.5);

/** has it cheered yet */
export const cheered = (ft: number, late = 0) => ft >= CHEER_AT + late;

// ---------- the kit: faces ----------

export function cheek(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, 'rgba(255, 105, 150, 0.6)');
  g.addColorStop(1, 'rgba(255, 105, 150, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

/** rosy cheeks either side of the middle */
export function cheeks(ctx: CanvasRenderingContext2D, cx: number, dx: number, y: number, r: number) {
  cheek(ctx, cx - dx, y, r);
  cheek(ctx, cx + dx, y, r);
}

/** a closed, smiling eye: ∩ (stroked in the current colour) */
export function happyEye(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.arc(x, y + r * 0.4, r, Math.PI * 1.1, Math.PI * 1.9);
  ctx.stroke();
}

/** a round, shiny eye that blinks now and then */
export function dotEye(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, t: number, color = '#2a1430') {
  if ((t + x * 3) % 4.3 < 0.12) {
    ctx.strokeStyle = color;
    ctx.lineWidth = r * 0.45;
    ctx.beginPath();
    ctx.moveTo(x - r * 0.8, y);
    ctx.lineTo(x + r * 0.8, y);
    ctx.stroke();
    return;
  }
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y, r * 0.82, r, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(x - r * 0.28, y - r * 0.36, r * 0.33, 0, Math.PI * 2);
  ctx.arc(x + r * 0.3, y + r * 0.34, r * 0.14, 0, Math.PI * 2);
  ctx.fill();
}

/** a pair of eyes: shiny dots, then, at the cheer, `then` (hearts, stars, a wink…) */
export function eyes(
  ctx: CanvasRenderingContext2D,
  cx: number,
  dx: number,
  y: number,
  r: number,
  ft: number,
  t: number,
  then: 'dots' | 'hearts' | 'stars' | 'wink' | 'happy' = 'dots',
  color = '#2a1430',
) {
  const at = [cx - dx, cx + dx];
  if (then === 'dots' || !cheered(ft)) {
    for (const x of at) dotEye(ctx, x, y, r, t, color);
    return;
  }
  if (then === 'happy' || then === 'wink') {
    ctx.strokeStyle = color;
    ctx.lineWidth = r * 0.5;
    ctx.lineCap = 'round';
    happyEye(ctx, at[0], y, r * 0.9);
    if (then === 'wink') dotEye(ctx, at[1], y, r, t, color);
    else happyEye(ctx, at[1], y, r * 0.9);
    return;
  }
  const s = r * 1.9 * popping(ft) * (1 + 0.08 * Math.max(0, Math.sin(t * 8)));
  ctx.fillStyle = then === 'hearts' ? '#ff3d7f' : '#ffc93d';
  for (const x of at) {
    if (then === 'hearts') heart(ctx, x, y, s);
    else fillStar(ctx, x, y, s * 0.9, 5);
  }
}

/** a smile: an arc below (cx, cy) */
export function smile(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color = '#5a1a2a', width = 0.028) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI * 0.18, Math.PI * 0.82);
  ctx.stroke();
}

/** a big open, laughing mouth with a tongue, its top edge at `cy` */
export function laugh(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, depth: number) {
  ctx.beginPath();
  ctx.moveTo(cx - w, cy);
  ctx.quadraticCurveTo(cx, cy + depth * 2, cx + w, cy);
  ctx.closePath();
  ctx.fillStyle = '#5a1030';
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = '#ff6f9a';
  ctx.beginPath();
  ctx.ellipse(cx, cy + depth * 0.86, w * 0.47, depth * 0.34, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** a cat's mouth: ω */
export function catMouth(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color = '#5a1a2a') {
  ctx.strokeStyle = color;
  ctx.lineWidth = r * 0.45;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx - r, cy, r, 0, Math.PI);
  ctx.moveTo(cx + 2 * r, cy);
  ctx.arc(cx + r, cy, r, 0, Math.PI);
  ctx.stroke();
}

/** a little nose: a rounded triangle pointing down */
export function nose(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, color = '#ff7fa8') {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx - s, cy - s * 0.6);
  ctx.quadraticCurveTo(cx, cy - s * 0.9, cx + s, cy - s * 0.6);
  ctx.quadraticCurveTo(cx + s * 0.5, cy + s * 0.5, cx, cy + s * 0.6);
  ctx.quadraticCurveTo(cx - s * 0.5, cy + s * 0.5, cx - s, cy - s * 0.6);
  ctx.fill();
}

/** whiskers fanning out either side of (cx, cy) */
export function whiskers(ctx: CanvasRenderingContext2D, cx: number, cy: number, inner: number, len: number, t: number, color = 'rgba(90, 40, 60, 0.75)') {
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.014;
  ctx.lineCap = 'round';
  const twitch = Math.sin(t * 3) * 0.02;
  for (const side of [-1, 1]) {
    for (const lift of [-0.06, 0, 0.06]) {
      ctx.beginPath();
      ctx.moveTo(cx + side * inner, cy + lift * 0.4);
      ctx.lineTo(cx + side * (inner + len), cy + lift * 1.6 + twitch);
      ctx.stroke();
    }
  }
}

export function heart(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.beginPath();
  ctx.moveTo(0, -0.25);
  ctx.bezierCurveTo(-0.25, -0.7, -1, -0.55, -0.9, 0);
  ctx.bezierCurveTo(-0.82, 0.32, -0.3, 0.55, 0, 0.85);
  ctx.bezierCurveTo(0.3, 0.55, 0.82, 0.32, 0.9, 0);
  ctx.bezierCurveTo(1, -0.55, 0.25, -0.7, 0, -0.25);
  ctx.fill();
  ctx.restore();
}

/** a four-pointed twinkle */
export function sparkle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const rr = i % 2 ? r * 0.28 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

/** a filled star (in the current colour) */
export function fillStar(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, points = 5, turn = -Math.PI / 2) {
  ctx.beginPath();
  for (const [px, py] of starPoints(x, y, points, r, r * 0.45, turn)) ctx.lineTo(px, py);
  ctx.closePath();
  ctx.fill();
}

// ---------- the kit: hats and props (each drawn round its own spot, `s` its size) ----------

/** draws `paint` moved to (x, y), turned by `turn` and grown by `s` */
export function placed(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, turn: number, paint: () => void) {
  if (s <= 0) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(turn);
  ctx.scale(s, s);
  paint();
  ctx.restore();
}

/** a magician's top hat, its brim at the spot */
export function topHat(ctx: CanvasRenderingContext2D, band = '#ff3d7f') {
  ctx.fillStyle = '#1d1430';
  ctx.beginPath();
  ctx.ellipse(0, 0, 0.5, 0.11, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(-0.3, -0.62, 0.6, 0.62);
  ctx.beginPath();
  ctx.ellipse(0, -0.62, 0.3, 0.07, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#2e2348';
  ctx.fill();
  ctx.fillStyle = band;
  ctx.fillRect(-0.3, -0.2, 0.6, 0.11);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
  ctx.fillRect(-0.22, -0.58, 0.07, 0.36);
}

/** a wizard's pointy hat with stars on it */
export function wizardHat(ctx: CanvasRenderingContext2D, color = '#6b4bff') {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-0.38, 0);
  ctx.quadraticCurveTo(-0.1, -0.5, 0.12, -0.95);
  ctx.quadraticCurveTo(0.05, -0.45, 0.38, 0);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0, 0, 0.55, 0.12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffd77a';
  fillStar(ctx, -0.06, -0.3, 0.09);
  fillStar(ctx, 0.12, -0.55, 0.06);
  fillStar(ctx, -0.18, -0.1, 0.05);
}

/** a floppy night cap with a pompom */
export function nightcap(ctx: CanvasRenderingContext2D, t: number) {
  const flop = Math.sin(t * 1.5) * 0.05;
  ctx.fillStyle = '#6a8dff';
  ctx.beginPath();
  ctx.moveTo(-0.42, 0);
  ctx.quadraticCurveTo(-0.3, -0.62, 0.25, -0.7);
  ctx.quadraticCurveTo(0.62 + flop, -0.66, 0.66 + flop, -0.3);
  ctx.quadraticCurveTo(0.35, -0.45, 0.42, 0);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(0, 0, 0.46, 0.1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0.66 + flop, -0.3, 0.11, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffe9a0';
  fillStar(ctx, -0.1, -0.35, 0.06);
  fillStar(ctx, 0.2, -0.52, 0.045);
}

/** a graduation cap with a swinging tassel */
export function gradCap(ctx: CanvasRenderingContext2D, t: number) {
  ctx.fillStyle = '#1d1430';
  ctx.fillRect(-0.28, -0.16, 0.56, 0.18);
  ctx.beginPath();
  ctx.moveTo(-0.62, -0.2);
  ctx.lineTo(0, -0.42);
  ctx.lineTo(0.62, -0.2);
  ctx.lineTo(0, 0.02);
  ctx.closePath();
  ctx.fill();
  const swing = Math.sin(t * 2.4) * 0.1;
  ctx.strokeStyle = '#ffcf3d';
  ctx.lineWidth = 0.035;
  ctx.beginPath();
  ctx.moveTo(0, -0.2);
  ctx.lineTo(0.45, -0.2);
  ctx.lineTo(0.48 + swing, 0.18);
  ctx.stroke();
  ctx.fillStyle = '#ffcf3d';
  ctx.fillRect(0.43 + swing, 0.16, 0.1, 0.12);
}

/** a bow tied in the middle */
export function bow(ctx: CanvasRenderingContext2D, color = '#ff5c8a') {
  ctx.fillStyle = color;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(side * 0.35, -0.42, side * 0.5, -0.12);
    ctx.quadraticCurveTo(side * 0.56, 0.2, side * 0.48, 0.26);
    ctx.quadraticCurveTo(side * 0.3, 0.3, 0, 0);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(0, 0, 0.11, 0, Math.PI * 2);
  ctx.fillStyle = '#ffd3e2';
  ctx.fill();
}

/** a party hat, striped, with a pompom */
export function partyHat(ctx: CanvasRenderingContext2D) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(-0.3, 0);
  ctx.lineTo(0, -0.8);
  ctx.lineTo(0.3, 0);
  ctx.closePath();
  ctx.fillStyle = '#6ad7ff';
  ctx.fill();
  ctx.clip();
  ctx.fillStyle = '#ff5c8a';
  for (let i = 0; i < 4; i++) ctx.fillRect(-0.4, -0.75 + i * 0.2, 0.8, 0.08);
  ctx.restore();
  ctx.fillStyle = '#ffd77a';
  ctx.beginPath();
  ctx.arc(0, -0.8, 0.09, 0, Math.PI * 2);
  ctx.fill();
}

/** round glasses: lenses `r` round, `dx` either side of the middle */
export function roundGlasses(ctx: CanvasRenderingContext2D, cx: number, dx: number, y: number, r: number, color = '#3d2a1a') {
  ctx.strokeStyle = color;
  ctx.lineWidth = r * 0.22;
  ctx.fillStyle = 'rgba(200, 235, 255, 0.25)';
  for (const x of [cx - dx, cx + dx]) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(cx, y + r * 0.25, dx - r, Math.PI * 1.15, Math.PI * 1.85);
  ctx.stroke();
}

/** a magic wand, its handle at the spot, pointing up; its star tip twinkles */
export function wand(ctx: CanvasRenderingContext2D, t: number) {
  ctx.strokeStyle = '#2a1430';
  ctx.lineWidth = 0.09;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, -0.7);
  ctx.stroke();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 0.09;
  ctx.beginPath();
  ctx.moveTo(0, -0.58);
  ctx.lineTo(0, -0.7);
  ctx.stroke();
  ctx.fillStyle = '#ffd77a';
  fillStar(ctx, 0, -0.84, 0.2 * (1 + 0.15 * Math.sin(t * 9)), 5, -Math.PI / 2 + t);
  ctx.fillStyle = '#ffffff';
  sparkle(ctx, 0.18, -1.02, 0.1 * (0.5 + 0.5 * Math.sin(t * 7)));
}

/** a rainbow arching over (cx, cy), drawn as far as `sweep` (0 → 1) */
export function rainbow(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, width: number, sweep: number) {
  if (sweep <= 0) return;
  ctx.lineCap = 'butt';
  RAINBOW.forEach((color, i) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.arc(cx, cy, r - i * width * 0.95, Math.PI, Math.PI + Math.PI * Math.min(1, sweep));
    ctx.stroke();
  });
}
