import { useEffect, useMemo, useRef } from 'react';

// The monster: a sun made of characters that never sit still. Its body and
// rays are cells on a grid, each showing a random glyph that keeps changing,
// with two glaring eyes and a grin of teeth. It assembles itself out of
// flying letters, and it reacts:
//   - a teammate's right answer is a beam in their colour; where it lands
//     the monster winces (> <), shivers and sheds characters (rays first,
//     eyes last), each flying off as a spark;
//   - a wrong answer feeds it: it chomps, swells and gloats in red;
//   - weak, it trembles and sweats.
// At zero it's cured: its scrambled letters fly out, swirl back and
// unscramble into a friend that shines (a sun in sunglasses, a flower, a
// heart-eyed smiley), one per monster.

const GLYPHS = '#@%&*+=?!$<>{}[]/\\~^0XЖΨΩ§∑∆≈¥¤'.split('');
const N = 29;
const EYE_R = 0.1;
const EYES: [number, number][] = [
  [-0.17, -0.12],
  [0.17, -0.12],
];

type Kind = 'body' | 'ray' | 'eye' | 'mouth';

interface Cell {
  x: number;
  y: number;
  d: number;
  kind: Kind;
  ch: string;
  /** where it flies in from, and when, as the monster assembles */
  sx: number;
  sy: number;
  delay: number;
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ch: string;
  color: string;
  life: number;
  fade: number;
  /** slows down and floats up instead of falling (hearts) */
  float?: boolean;
}

interface Beam {
  /** where it starts along the bottom edge, 0..1 */
  from: number;
  /** the arc's bend, sideways */
  bend: number;
  color: string;
  t: number;
  trail: [number, number][];
}

interface Ring {
  color: string;
  life: number;
  width: number;
}

interface Floater {
  text: string;
  x: number;
  y: number;
  life: number;
}

/** a sparkle around the cured friend, in grid units */
interface Twinkle {
  x: number;
  y: number;
  size: number;
  color: string;
  life: number;
}

interface Palette {
  core: string;
  mid: string;
  ray: string;
  glow: string;
  eye: string;
}

const PALETTES: Palette[] = [
  { core: '#fff6c8', mid: '#ffd77a', ray: '#ff9d4a', glow: '255, 160, 60', eye: '#ff2d2d' },
  { core: '#ffe3f6', mid: '#ff8fd0', ray: '#c45bff', glow: '220, 80, 255', eye: '#7dff6a' },
  { core: '#e2fbff', mid: '#6ad7ff', ray: '#5a6bff', glow: '90, 160, 255', eye: '#ff2d2d' },
];

/** seconds a beam takes to reach the monster */
const BEAM_S = 0.36;
const MONO = 'ui-monospace, Menlo, Consolas, monospace';

const glyph = () => GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
const easeOut = (p: number) => 1 - (1 - p) ** 3;

/** the cells, in the order they're knocked off (eyes last) */
function buildMonster(monster: number): Cell[] {
  const tier = Math.min(2, monster);
  const rays = 8 + tier * 4;
  const R = 0.4 + tier * 0.03;
  const tilt = Math.random() * Math.PI;
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
      ch: glyph(),
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
      const d = Math.hypot(x, y);
      // eye sockets stay dark: the eyes are drawn whole
      if (EYES.some(([ex, ey]) => Math.hypot(x - ex, y - ey) < EYE_R)) continue;
      if (y > 0.1 && y < 0.26 && Math.abs(x) < 0.25 && Math.abs(y - (0.14 + 0.9 * x * x)) < 0.05) add(x, y, 'mouth');
      else if (d <= R) add(x, y, 'body');
      else {
        // rays: alternating long and short on the tougher monsters
        const step = (Math.PI * 2) / rays;
        const a = Math.atan2(y, x) - tilt;
        const k = Math.round(a / step);
        const da = Math.abs(a - k * step);
        const reach = R + (0.95 - R) * (tier > 0 && k % 2 ? 0.62 : 1);
        const taper = 1 - (d - R) / (reach - R);
        if (d <= reach && da < step * 0.42 * taper) add(x, y, 'ray');
      }
    }
  }
  for (const [ex, ey] of EYES) add(ex, ey, 'eye');
  return cells.sort((a, b) => a.order - b.order);
}

// ---------- the friend it turns into ----------

type FriendPart = 'face' | 'ray' | 'petal' | 'stem' | 'leaf';

interface FriendCell {
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

/** seconds a letter takes to swirl into place */
const FLY_S = 0.8;
/** seconds from the cure until the friend shows off (sunglasses land, petals open, heart eyes pop) */
const CHEER_AT = 2.1;
const GLASSES_FALL = 0.7;
/** the flower's middle (its face) */
const BLOOM: [number, number] = [0, -0.14];
const ROUND = ['*', '+', 'o', '•'];
const PETAL = ['o', '*', '✿'];
const RAINBOW = ['#ff5c8a', '#ff9d4a', '#ffd77a', '#7dff9a', '#6ad7ff', '#c49bff'];
const HEARTS = ['#ff5c8a', '#ff8fd0', '#ffd77a'];
const FRIEND_GLOW = ['255, 190, 80', '255, 120, 200', '255, 215, 140'];

/** a straight ray drawn with the character that points its way */
function rayGlyph(a: number): string {
  const k = Math.round((((a % Math.PI) + Math.PI) % Math.PI) / (Math.PI / 4)) % 4;
  return ['-', '\\', '|', '/'][k];
}

/** inside an ellipse centred at (cx, cy), turned by `turn` */
function inEllipse(x: number, y: number, cx: number, cy: number, rx: number, ry: number, turn: number): boolean {
  const dx = x - cx;
  const dy = y - cy;
  const u = dx * Math.cos(turn) + dy * Math.sin(turn);
  const v = -dx * Math.sin(turn) + dy * Math.cos(turn);
  return (u / rx) ** 2 + (v / ry) ** 2 <= 1;
}

/** 0 → 1 with a springy overshoot */
const spring = (p: number) => (p <= 0 ? 0 : 1 - Math.exp(-5 * p) * Math.cos(9 * p));

function bounce(p: number): number {
  const n = 7.5625;
  const d = 2.75;
  if (p < 1 / d) return n * p * p;
  if (p < 2 / d) return n * (p - 1.5 / d) ** 2 + 0.75;
  if (p < 2.5 / d) return n * (p - 2.25 / d) ** 2 + 0.9375;
  return n * (p - 2.625 / d) ** 2 + 0.984375;
}

/** monster 1 becomes a sun in sunglasses, 2 a flower, 3 a heart-eyed smiley with rainbow rays */
function buildFriend(form: number): FriendCell[] {
  const h = (N - 1) / 2;
  const cells: FriendCell[] = [];
  const add = (x: number, y: number, part: FriendPart, color: string, set: string[]) => {
    const d = Math.hypot(x, y);
    const a = Math.random() * Math.PI * 2;
    const far = 1.3 + Math.random() * 0.5;
    const late = part === 'face' ? 0 : part === 'stem' || part === 'leaf' ? 0.45 : 0.3;
    cells.push({
      x,
      y,
      d,
      part,
      ch: set[Math.floor(Math.random() * set.length)],
      set,
      color,
      sx: Math.cos(a) * far,
      sy: Math.sin(a) * far,
      delay: 0.2 + late + d * 0.35 + Math.random() * 0.3,
    });
  };
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const x = (c - h) / h;
      const y = (r - h) / h;
      const d = Math.hypot(x, y);
      if (form === 1) {
        const dx = x - BLOOM[0];
        const dy = y - BLOOM[1];
        const dc = Math.hypot(dx, dy);
        const step = Math.PI / 4;
        const a = Math.atan2(dy, dx);
        const da = a - Math.round(a / step) * step;
        if (dc <= 0.2) add(x, y, 'face', dc < 0.11 ? '#fff6c8' : '#ffd77a', ROUND);
        else if (inEllipse(dc * Math.cos(da), dc * Math.sin(da), 0.37, 0, 0.17, 0.125, 0)) add(x, y, 'petal', dc > 0.41 ? '#ff8fd0' : '#ffc2ea', PETAL);
        else if (inEllipse(x, y, -0.17, 0.7, 0.15, 0.065, 0.38) || inEllipse(x, y, 0.17, 0.58, 0.15, 0.065, -0.38)) add(x, y, 'leaf', '#7dff9a', ROUND);
        else if (Math.abs(x) < 0.03 && y > 0.4 && y < 0.97) add(x, y, 'stem', '#4fd36a', ['|']);
        continue;
      }
      if (d <= 0.42) {
        const core = form === 0 ? '#fff6c8' : '#fffbe0';
        const mid = form === 0 ? '#ffd77a' : '#ffe9a0';
        add(x, y, 'face', d < 0.22 ? core : mid, ROUND);
      } else if (d > 0.48) {
        const step = (Math.PI * 2) / 12;
        const a = Math.atan2(y, x);
        const k = Math.round(a / step);
        const da = a - k * step;
        const reach = k % 2 ? 0.78 : 0.94;
        if (d <= reach && Math.abs(Math.sin(da)) * d < 0.048 && Math.abs(da) < step / 2) {
          add(x, y, 'ray', form === 0 ? '#ffb347' : RAINBOW[((k % 12) + 12) % 6], [rayGlyph(k * step)]);
        }
      }
    }
  }
  // the face goes on top of the petals
  return cells.sort((a, b) => Number(a.part === 'face') - Number(b.part === 'face'));
}

type At = (x: number, y: number) => [number, number];

/** the flower's petals: a closed bud until the cheer, then they spring open and breathe */
function petalsOpen(ft: number, t: number): number {
  if (ft < CHEER_AT) return 0.75;
  return (0.75 + 0.25 * spring((ft - CHEER_AT) / 0.8)) * (1 + 0.025 * Math.sin(t * 2.5));
}

/** the friend's letters: scrambled while they swirl in, unscrambled once they land */
function drawFriendCells(ctx: CanvasRenderingContext2D, friend: FriendCell[], form: number, ft: number, t: number, at: At, scrambled: string) {
  const open = form === 1 ? petalsOpen(ft, t) : 1;
  for (const c of friend) {
    const p = Math.min(1, Math.max(0, (ft - c.delay) / FLY_S));
    if (p <= 0) continue;
    let { x, y } = c;
    if (c.part === 'petal') {
      x = BLOOM[0] + (x - BLOOM[0]) * open;
      y = BLOOM[1] + (y - BLOOM[1]) * open;
    }
    if (p < 1) {
      const k = easeOut(p);
      const lx = c.sx + (x - c.sx) * k;
      const ly = c.sy + (y - c.sy) * k;
      const swirl = (1 - k) * 2.4;
      const [px, py] = at(lx * Math.cos(swirl) - ly * Math.sin(swirl), lx * Math.sin(swirl) + ly * Math.cos(swirl));
      ctx.globalAlpha = Math.min(1, p * 2);
      ctx.fillStyle = scrambled;
      ctx.fillText(glyph(), px, py);
      continue;
    }
    if (c.set.length > 1 && Math.random() < 0.004) c.ch = c.set[Math.floor(Math.random() * c.set.length)];
    const [px, py] = at(x, y);
    // the rays shine, a glow running outwards along them
    ctx.globalAlpha = c.part === 'ray' ? 0.6 + 0.4 * (0.5 + 0.5 * Math.sin(t * 5 - c.d * 10)) : 1;
    // each letter flashes white as it lands
    ctx.fillStyle = ft - c.delay - FLY_S < 0.2 ? '#ffffff' : c.color;
    ctx.fillText(c.ch, px, py);
  }
  ctx.globalAlpha = 1;
}

function disc(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, inner: string, outer: string) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${inner}, 0.6)`);
  g.addColorStop(0.82, `rgba(${outer}, 0.5)`);
  g.addColorStop(1, `rgba(${outer}, 0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

/** soft shapes behind the letters, so the friend reads as one solid thing (grid units) */
function drawFriendBack(ctx: CanvasRenderingContext2D, form: number, ft: number, t: number) {
  if (form !== 1) {
    disc(ctx, 0, 0, 0.47, form === 0 ? '255, 240, 180' : '255, 248, 215', form === 0 ? '255, 196, 90' : '255, 222, 140');
    return;
  }
  const open = petalsOpen(ft, t);
  const [cx, cy] = BLOOM;
  ctx.strokeStyle = 'rgba(79, 211, 106, 0.6)';
  ctx.lineWidth = 0.04;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, 0.36);
  ctx.lineTo(0, 0.97);
  ctx.stroke();
  ctx.fillStyle = 'rgba(125, 255, 154, 0.35)';
  for (const [x, y, turn] of [
    [-0.17, 0.7, 0.38],
    [0.17, 0.58, -0.38],
  ]) {
    ctx.beginPath();
    ctx.ellipse(x, y, 0.17, 0.075, turn, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    ctx.fillStyle = i % 2 ? 'rgba(255, 143, 208, 0.45)' : 'rgba(255, 170, 222, 0.45)';
    ctx.beginPath();
    ctx.ellipse(cx + Math.cos(a) * 0.37 * open, cy + Math.sin(a) * 0.37 * open, 0.19 * open, 0.135 * open, a, 0, Math.PI * 2);
    ctx.fill();
  }
  disc(ctx, cx, cy, 0.23, '255, 240, 180', '255, 196, 90');
}

function cheek(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, 'rgba(255, 105, 150, 0.6)');
  g.addColorStop(1, 'rgba(255, 105, 150, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

/** a closed, smiling eye: ∩ */
function happyEye(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.arc(x, y + r * 0.4, r, Math.PI * 1.1, Math.PI * 1.9);
  ctx.stroke();
}

function heart(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
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
function sparkle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const rr = i % 2 ? r * 0.28 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

/** cool sunglasses, `dy` above where they sit, with a glint sweeping across */
function shades(ctx: CanvasRenderingContext2D, dy: number, t: number) {
  const top = -0.165 + dy;
  const cy = -0.1 + dy;
  const lenses = () => {
    ctx.beginPath();
    for (const cx of [-0.165, 0.165]) {
      const w = 0.14;
      const bot = cy + 0.09;
      ctx.moveTo(cx - w, top);
      ctx.lineTo(cx + w, top);
      ctx.bezierCurveTo(cx + w + 0.01, cy + 0.03, cx + w * 0.55, bot, cx, bot);
      ctx.bezierCurveTo(cx - w * 0.55, bot, cx - w - 0.01, cy + 0.03, cx - w, top);
      ctx.closePath();
    }
  };
  lenses();
  const g = ctx.createLinearGradient(0, top, 0, cy + 0.09);
  g.addColorStop(0, '#3d3266');
  g.addColorStop(1, '#0c0818');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = '#120c20';
  ctx.lineWidth = 0.025;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-0.38, top);
  ctx.lineTo(0.38, top);
  ctx.lineWidth = 0.04;
  ctx.stroke();
  ctx.save();
  lenses();
  ctx.clip();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
  for (const cx of [-0.165, 0.165]) {
    ctx.beginPath();
    ctx.ellipse(cx - 0.06, top + 0.045, 0.035, 0.016, -0.5, 0, Math.PI * 2);
    ctx.fill();
  }
  const sweep = (t % 2.8) / 0.6;
  if (sweep < 1) {
    const x = -0.5 + sweep;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x + 0.07, top);
    ctx.lineTo(x - 0.03, cy + 0.1);
    ctx.lineTo(x - 0.1, cy + 0.1);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  // ...and a twinkle once it has gone by
  const ting = ((t % 2.8) - 0.55) / 0.45;
  if (ting > 0 && ting < 1) {
    ctx.fillStyle = '#ffffff';
    sparkle(ctx, 0.29, top + 0.01, 0.09 * Math.sin(Math.PI * ting));
  }
}

/** the friend's face, in grid units (the canvas is already moved, turned and scaled) */
function drawFriendFace(ctx: CanvasRenderingContext2D, form: number, ft: number, t: number) {
  ctx.lineCap = 'round';
  if (form === 1) {
    const [cx, cy] = BLOOM;
    cheek(ctx, cx - 0.12, cy + 0.05, 0.05);
    cheek(ctx, cx + 0.12, cy + 0.05, 0.05);
    ctx.strokeStyle = '#7a3a12';
    ctx.lineWidth = 0.026;
    happyEye(ctx, cx - 0.07, cy - 0.04, 0.035);
    happyEye(ctx, cx + 0.07, cy - 0.04, 0.035);
    ctx.beginPath();
    ctx.arc(cx, cy, 0.08, Math.PI * 0.2, Math.PI * 0.8);
    ctx.stroke();
    return;
  }
  cheek(ctx, -0.26, 0.07, 0.085);
  cheek(ctx, 0.26, 0.07, 0.085);
  ctx.strokeStyle = '#8a3b12';
  ctx.lineWidth = 0.04;
  if (form === 0) {
    ctx.beginPath();
    ctx.arc(0, 0, 0.2, Math.PI * 0.18, Math.PI * 0.82);
    ctx.stroke();
    // happy eyes, until the sunglasses drop onto them (first touch at the cheer)
    const fall = (ft - CHEER_AT) / GLASSES_FALL + 1 / 2.75;
    if (fall < 1 / 2.75) {
      happyEye(ctx, -0.15, -0.1, 0.055);
      happyEye(ctx, 0.15, -0.1, 0.055);
    }
    if (fall > 0) shades(ctx, -1.6 * (1 - bounce(Math.min(1, fall))), t);
    return;
  }
  // heart eyes pop at the cheer, then beat
  if (ft < CHEER_AT) {
    happyEye(ctx, -0.15, -0.1, 0.055);
    happyEye(ctx, 0.15, -0.1, 0.055);
  } else {
    const s = 0.11 * spring((ft - CHEER_AT) / 0.5) * (1 + 0.08 * Math.max(0, Math.sin(t * 8)));
    ctx.fillStyle = '#ff3d7f';
    heart(ctx, -0.155, -0.1, s);
    heart(ctx, 0.155, -0.1, s);
  }
  // a big open grin
  ctx.beginPath();
  ctx.moveTo(-0.18, 0.05);
  ctx.quadraticCurveTo(0, 0.4, 0.18, 0.05);
  ctx.closePath();
  ctx.fillStyle = '#5a1030';
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = '#ff6f9a';
  ctx.beginPath();
  ctx.ellipse(0, 0.2, 0.085, 0.06, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** what the page can make the monster do */
export interface MonsterFx {
  /** a pilot's right answer: a beam in their colour, from along the bottom edge (0 = left, 1 = right) */
  beam: (color: string, from: number) => void;
  /** a wrong answer: it chomps, swells and says this */
  gloat: (text: string) => void;
  /** a team combo: a shockwave ring */
  ring: (color: string) => void;
}

interface Props {
  monster: number;
  hp: number;
  maxHp: number;
  fx?: React.RefObject<MonsterFx | null>;
  /** lobby: just lurking and looking around */
  lurk?: boolean;
  /** already cured (the summary): seconds before its friend swirls in */
  wait?: number;
  /** the moment it's cured, and the moment its friend shows off (for the sounds) */
  onCured?: () => void;
  onCheer?: () => void;
}

export function MonsterCanvas({ monster, hp, maxHp, fx, lurk = false, wait = 0, onCured, onCheer }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cells = useMemo(() => buildMonster(monster), [monster]);
  const friend = useMemo(() => buildFriend(monster % 3), [monster]);
  const live = useRef({ hp, maxHp, onCured, onCheer });
  useEffect(() => {
    live.current = { hp, maxHp, onCured, onCheer };
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const tier = Math.min(2, monster);
    const pal = PALETTES[tier];
    const mutate = 0.03 + tier * 0.025;
    const total = cells.length;
    const goneFor = (h: number, m: number) => (m > 0 ? Math.round(total * (1 - Math.max(0, h) / m)) : 0);
    // already worn down (a phone that joins or reloads mid-fight): no sparks for those
    const shown = cells.map((_, i) => i >= goneFor(live.current.hp, live.current.maxHp));
    // already cured: the friend swirls in quietly
    const quiet = shown.every((s) => !s);
    let curedAt: number | null = quiet ? wait : null;
    let cheered = false;
    let twinkles: Twinkle[] = [];
    let sparks: Spark[] = [];
    let beams: Beam[] = [];
    let rings: Ring[] = [];
    let floaters: Floater[] = [];
    let shake = 0;
    let redFlash = 0;
    let whiteFlash = 0;
    let hurt = 0;
    let gloat = 0;
    let look: [number, number] = [0, 1];
    let lookFor = 0;
    let raf = 0;
    let last = performance.now();
    const t0 = last;

    const colorOf = (c: Cell) => (c.kind === 'mouth' ? '#c0163f' : c.kind === 'ray' ? pal.ray : c.d < 0.22 ? pal.core : pal.mid);
    const burstAt = (x: number, y: number, n: number, colors: string[], speed: number) => {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = speed * (0.4 + Math.random());
        sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, ch: glyph(), color: colors[i % colors.length], life: 1, fade: 0.7 + Math.random() * 0.8 });
      }
    };
    const heartsAt = (x: number, y: number, n: number, speed: number) => {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = speed * (0.3 + Math.random() * 0.7);
        sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, ch: '♥', color: HEARTS[i % HEARTS.length], life: 1, fade: 0.45 + Math.random() * 0.25, float: true });
      }
    };

    if (fx) {
      fx.current = {
        beam: (color, from) => {
          beams.push({ from, bend: (Math.random() - 0.5) * 0.5, color, t: 0, trail: [] });
          look = [from * 2 - 1, 1];
          lookFor = 1.2;
        },
        gloat: (text) => {
          gloat = 1.3;
          hurt = 0; // the latest feeling wins
          redFlash = 1;
          floaters.push({ text, x: (Math.random() - 0.5) * 0.3, y: 0.3, life: 1 });
        },
        ring: (color) => {
          rings.push({ color, life: 1, width: 8 }, { color: '#ffffff', life: 0.75, width: 3 });
          shake = Math.max(shake, 0.8);
        },
      };
    }

    const draw = (now: number) => {
      // the first frame can be stamped before the effect ran
      const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
      last = now;
      const t = (now - t0) / 1000;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const size = canvas.clientWidth;
      if (canvas.width !== Math.round(size * dpr)) {
        canvas.width = Math.round(size * dpr);
        canvas.height = Math.round(size * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);

      const { hp: nowHp, maxHp: nowMax } = live.current;
      const strength = nowMax > 0 ? Math.max(0, nowHp) / nowMax : 1;
      const low = strength > 0 && strength < 0.25 && !lurk;
      // a cell goes when the beam that knocks it off lands, not before
      const gone = Math.max(0, Math.min(total, goneFor(nowHp, nowMax) - beams.length));
      // cured: the last beam has landed
      const curing = curedAt === null && gone >= total && beams.length === 0;
      if (curing) {
        curedAt = t;
        whiteFlash = 1;
        live.current.onCured?.();
      }
      const ft = curedAt === null ? -1 : t - curedAt;

      shake = Math.max(low ? 0.12 : 0, shake - dt * 2.2);
      redFlash = Math.max(0, redFlash - dt * 1.6);
      whiteFlash = Math.max(0, whiteFlash - dt * 1.4);
      hurt = Math.max(0, hurt - dt);
      gloat = Math.max(0, gloat - dt);
      lookFor = Math.max(0, lookFor - dt);

      const half = size / 2;
      const swell = 1 + 0.07 * Math.sin(Math.min(1, gloat) * Math.PI);
      const scale = half * 0.92 * (1 + 0.025 * Math.sin(t * 2.4)) * swell;
      const jx = (Math.random() - 0.5) * 14 * shake;
      // the friend bobs, happily
      const jy = (Math.random() - 0.5) * 14 * shake + (curedAt === null ? 0 : Math.sin(t * 2.2) * half * 0.025);
      const rot = Math.sin(t * 0.5) * 0.07 + shake * (Math.random() - 0.5) * 0.15;
      const cos = Math.cos(rot);
      const sin = Math.sin(rot);
      const at = (x: number, y: number): [number, number] => [half + jx + (x * cos - y * sin) * scale, half + jy + (x * sin + y * cos) * scale];
      const cell = (scale * 2) / N;

      // corona: fades as the monster weakens, flickers when it's nearly done
      if (gone < total) {
        const pulse = (0.75 + 0.25 * Math.sin(t * 3.1)) * (low ? 0.6 + Math.random() * 0.4 : 1);
        const g = ctx.createRadialGradient(half + jx, half + jy, 0, half + jx, half + jy, scale * 0.95);
        g.addColorStop(0, `rgba(${pal.glow}, ${0.55 * pulse * (0.35 + 0.65 * strength)})`);
        g.addColorStop(0.5, `rgba(${pal.glow}, ${0.18 * pulse * strength})`);
        g.addColorStop(1, `rgba(${pal.glow}, 0)`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, size, size);
      }
      // the friend's warm glow
      if (ft > 0) {
        const glow = FRIEND_GLOW[monster % 3];
        const k = Math.min(1, ft / 1.5) * (0.85 + 0.15 * Math.sin(t * 2));
        const g = ctx.createRadialGradient(half + jx, half + jy, 0, half + jx, half + jy, scale * 1.05);
        g.addColorStop(0, `rgba(${glow}, ${0.55 * k})`);
        g.addColorStop(0.45, `rgba(${glow}, ${0.2 * k})`);
        g.addColorStop(1, `rgba(${glow}, 0)`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, size, size);
      }
      if (curing) {
        // its scrambled letters fly out
        rings.push({ color: pal.mid, life: 1, width: 10 }, { color: '#ffffff', life: 0.8, width: 5 });
        burstAt(half, half, 45, [pal.core, pal.mid, pal.ray], 300);
      }
      if (redFlash > 0) {
        const g = ctx.createRadialGradient(half, half, 0, half, half, scale);
        g.addColorStop(0, `rgba(255, 40, 60, ${0.5 * redFlash})`);
        g.addColorStop(1, 'rgba(255, 40, 60, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, size, size);
      }

      // shockwaves
      rings = rings.filter((r) => (r.life -= dt * 1.1) > 0);
      for (const r of rings) {
        ctx.globalAlpha = r.life;
        ctx.strokeStyle = r.color;
        ctx.lineWidth = r.width * r.life;
        ctx.beginPath();
        ctx.arc(half, half, scale * (0.35 + (1 - r.life) * 0.9), 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // the body and rays, flying into place as it assembles
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `700 ${cell * 1.08}px ${MONO}`;
      const mouthCh = gloat > 0 ? (Math.floor(t * 12) % 2 ? '▲' : '▼') : hurt > 0 || low ? '~' : '▼';
      const eyes: [Cell, number, number, number][] = [];
      for (let i = 0; i < total; i++) {
        const c = cells[i];
        const visible = i >= gone;
        const p = Math.min(1, Math.max(0, (t - c.delay) / 0.9));
        const k = easeOut(p);
        const [tx, ty] = at(c.x, c.y);
        const px = p < 1 ? half + c.sx * scale * (1 - k) + (tx - half) * k : tx;
        const py = p < 1 ? half + c.sy * scale * (1 - k) + (ty - half) * k : ty;
        if (shown[i] && !visible) {
          // knocked off: it flies away as a spark
          const away = Math.atan2(c.y, c.x) + (Math.random() - 0.5) * 0.9;
          const speed = 120 + Math.random() * 220;
          sparks.push({ x: px, y: py, vx: Math.cos(away) * speed, vy: Math.sin(away) * speed, ch: c.kind === 'eye' ? '◉' : c.ch, color: c.kind === 'eye' ? pal.eye : colorOf(c), life: 1, fade: 0.9 });
        }
        shown[i] = visible;
        if (!visible || p <= 0) continue;
        if (c.kind === 'eye') {
          eyes.push([c, px, py, k]);
          continue;
        }
        if (c.kind !== 'mouth' && Math.random() < mutate * (low ? 2 : 1)) c.ch = glyph();
        ctx.globalAlpha = Math.min(1, p * 1.5);
        ctx.fillStyle = redFlash > 0.3 ? '#ff6b7a' : colorOf(c);
        ctx.fillText(c.kind === 'mouth' ? mouthCh : c.ch, px, py);
      }
      ctx.globalAlpha = 1;

      // the eyes: glaring, wincing (> <) when hit, gleeful (^ ^) when fed
      const blink = t % 4.2 < 0.12;
      const gaze: [number, number] = low
        ? [Math.random() * 2 - 1, Math.random() * 2 - 1] // panic
        : lookFor > 0
          ? look
          : [Math.sin(t * 0.7) * 0.8, Math.cos(t * 0.53) * 0.5];
      for (const [c, px, py, k] of eyes) {
        const r = cell * 1.55 * k;
        ctx.fillStyle = pal.eye;
        ctx.shadowColor = pal.eye;
        ctx.shadowBlur = 14;
        if (hurt > 0 || gloat > 0) {
          ctx.font = `900 ${cell * 3}px ${MONO}`;
          if (hurt > 0) ctx.fillText(c.x < 0 ? '>' : '<', px, py);
          else ctx.fillText('^', px, py + cell * 0.5);
        } else if (blink) {
          ctx.fillRect(px - r, py - cell * 0.15, r * 2, cell * 0.3);
        } else {
          ctx.beginPath();
          ctx.arc(px, py, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
          // the pupil follows the beams
          const len = Math.hypot(gaze[0], gaze[1]) || 1;
          const reach = r * 0.42 * Math.min(1, len);
          ctx.fillStyle = '#12051a';
          ctx.beginPath();
          ctx.arc(px + (gaze[0] / len) * reach, py + (gaze[1] / len) * reach, r * (low ? 0.3 : 0.48), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.shadowBlur = 0;
      }

      // cured: the friend swirls in, unscrambles and shows off
      if (ft > 0) {
        const form = monster % 3;
        // drawn in grid units, moving and turning with the letters
        const inGrid = (alpha: number, paint: () => void) => {
          if (alpha <= 0) return;
          ctx.save();
          ctx.translate(half + jx, half + jy);
          ctx.rotate(rot);
          ctx.scale(scale, scale);
          ctx.globalAlpha = Math.min(1, alpha);
          paint();
          ctx.restore();
        };
        inGrid((ft - 0.9) / 0.7, () => drawFriendBack(ctx, form, ft, t));
        ctx.font = `800 ${cell * 1.15}px ${MONO}`;
        drawFriendCells(ctx, friend, form, ft, t, at, pal.mid);
        inGrid((ft - 1.1) / 0.5, () => drawFriendFace(ctx, form, ft, t));
        if (!cheered && ft >= CHEER_AT) {
          cheered = true;
          rings.push({ color: HEARTS[form], life: 1, width: 6 }, { color: '#ffffff', life: 0.7, width: 3 });
          heartsAt(half, half, 14, 170);
          if (!quiet) live.current.onCheer?.();
        }
        // sparkles all around, and hearts floating up
        if (ft > 1.6 && Math.random() < dt * 5) {
          const a = Math.random() * Math.PI * 2;
          const r = 0.5 + Math.random() * 0.5;
          twinkles.push({ x: Math.cos(a) * r, y: Math.sin(a) * r, size: 0.5 + Math.random() * 0.6, color: Math.random() < 0.5 ? '#ffffff' : '#fff3b0', life: 1 });
        }
        if (cheered && Math.random() < dt * 1.3) {
          const [hx, hy] = at((Math.random() - 0.5) * 0.9, 0.2 + Math.random() * 0.3);
          heartsAt(hx, hy, 1, 25);
        }
      }
      twinkles = twinkles.filter((w) => (w.life -= dt * 1.3) > 0);
      for (const w of twinkles) {
        const [px, py] = at(w.x, w.y);
        ctx.fillStyle = w.color;
        sparkle(ctx, px, py, cell * 0.9 * w.size * Math.sin(Math.PI * w.life));
      }

      // weak: it sweats
      if (low && Math.random() < dt * 4) {
        const [sx, sy] = at((Math.random() - 0.5) * 0.6, -0.38);
        sparks.push({ x: sx, y: sy, vx: (Math.random() - 0.5) * 30, vy: 40, ch: '💧', color: '#9be6ff', life: 1, fade: 1.2 });
      }

      // the gloat, rising out of its mouth
      floaters = floaters.filter((f) => (f.life -= dt * 0.7) > 0);
      ctx.font = `900 ${cell * 2.3}px ${MONO}`;
      ctx.lineJoin = 'round';
      for (const f of floaters) {
        const [fx0, fy0] = at(f.x, f.y);
        const y = fy0 - (1 - f.life) * scale * 0.9;
        ctx.globalAlpha = Math.min(1, f.life * 2);
        ctx.lineWidth = 5;
        ctx.strokeStyle = '#2a0610';
        ctx.strokeText(f.text, fx0, y);
        ctx.fillStyle = '#ff4d6a';
        ctx.fillText(f.text, fx0, y);
      }
      ctx.globalAlpha = 1;

      // beams: from the bottom edge, arcing into the monster
      ctx.font = `700 ${cell * 1.3}px ${MONO}`;
      beams = beams.filter((b) => {
        b.t += dt / BEAM_S;
        const sx = b.from * size;
        const sy = size;
        const ang = Math.atan2(sy - half, sx - half);
        const ex = half + Math.cos(ang) * scale * 0.4;
        const ey = half + Math.sin(ang) * scale * 0.4;
        const cx = (sx + ex) / 2 + b.bend * size;
        const cy = (sy + ey) / 2;
        const p = Math.min(1, b.t);
        const q = 1 - p;
        const x = q * q * sx + 2 * q * p * cx + p * p * ex;
        const y = q * q * sy + 2 * q * p * cy + p * p * ey;
        b.trail.push([x, y]);
        if (b.trail.length > 9) b.trail.shift();
        b.trail.forEach(([tx, ty], i) => {
          ctx.globalAlpha = ((i + 1) / b.trail.length) * 0.8;
          ctx.fillStyle = b.color;
          ctx.fillText(i % 2 ? '*' : '+', tx, ty);
        });
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = b.color;
        ctx.shadowBlur = 18;
        ctx.beginPath();
        ctx.arc(x, y, cell * 0.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        if (b.t < 1) return true;
        // impact
        shake = 1;
        hurt = 0.55;
        gloat = Math.min(gloat, 0.2);
        burstAt(x, y, 10, [b.color, '#ffffff'], 160);
        rings.push({ color: b.color, life: 0.45, width: 4 });
        return false;
      });

      // sparks and knocked-off characters fall; hearts float up
      sparks = sparks.filter((s) => (s.life -= dt * 0.9 * s.fade) > 0);
      for (const float of [false, true]) {
        ctx.font = `700 ${cell * (float ? 1.5 : 1.2)}px ${MONO}`;
        for (const s of sparks) {
          if (!!s.float !== float) continue;
          s.x += s.vx * dt;
          s.y += s.vy * dt;
          if (float) {
            const slow = Math.exp(-dt * 1.4);
            s.vx *= slow;
            s.vy = s.vy * slow - 40 * dt;
          } else {
            s.vy += 60 * dt;
          }
          ctx.globalAlpha = Math.min(1, s.life * 1.5);
          ctx.fillStyle = s.color;
          ctx.fillText(s.ch, s.x, s.y);
        }
      }
      ctx.globalAlpha = 1;

      // the moment it's cured: a warm flash
      if (whiteFlash > 0) {
        const g = ctx.createRadialGradient(half, half, 0, half, half, half);
        g.addColorStop(0, `rgba(255, 244, 214, ${0.9 * whiteFlash})`);
        g.addColorStop(1, 'rgba(255, 244, 214, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, size, size);
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      if (fx) fx.current = null;
    };
  }, [cells, friend, monster, fx, lurk, wait]);

  return <canvas ref={canvasRef} className={`sun-monster ${lurk ? 'is-lurking' : ''}`} aria-hidden />;
}
