import {
  bounce,
  CHEER_AT,
  circle,
  DROP_S,
  friendCells,
  happyEye,
  heart,
  HEARTS,
  inEllipse,
  RAINBOW,
  ROUND,
  sparkle,
  spring,
  sunRays,
  cheek,
  type Design,
  type FriendCell,
  type FriendPaint,
  type Mouth,
} from './monsterArt';

// The three monster suns Monster Sun started with: suns of glitchy letters,
// each with more rays than the last, that turn into a sun in sunglasses, a
// flower and a heart-eyed smiley with rainbow rays.

const EYES: [number, number][] = [
  [-0.17, -0.12],
  [0.17, -0.12],
];
const MOUTH: Mouth = { y: 0.14, w: 0.25 };
/** the flower's middle (its face) */
const BLOOM: [number, number] = [0, -0.14];
const PETAL = ['o', '*', '✿'];

/** a straight ray drawn with the character that points its way */
function rayGlyph(a: number): string {
  const k = Math.round((((a % Math.PI) + Math.PI) % Math.PI) / (Math.PI / 4)) % 4;
  return ['-', '\\', '|', '/'][k];
}

/** the sun in sunglasses (form 0) and the smiley (form 2): a round face with 12 rays */
function sunFriend(form: 0 | 2): FriendPaint {
  return (x, y) => {
    const d = Math.hypot(x, y);
    if (d <= 0.42) {
      const core = form === 0 ? '#fff6c8' : '#fffbe0';
      const mid = form === 0 ? '#ffd77a' : '#ffe9a0';
      return { part: 'face', color: d < 0.22 ? core : mid, set: ROUND };
    }
    if (d <= 0.48) return null;
    const step = (Math.PI * 2) / 12;
    const a = Math.atan2(y, x);
    const k = Math.round(a / step);
    const da = a - k * step;
    const reach = k % 2 ? 0.78 : 0.94;
    if (d <= reach && Math.abs(Math.sin(da)) * d < 0.048 && Math.abs(da) < step / 2) {
      return { part: 'ray', color: form === 0 ? '#ffb347' : RAINBOW[((k % 12) + 12) % 6], set: [rayGlyph(k * step)] };
    }
    return null;
  };
}

const flowerFriend: FriendPaint = (x, y) => {
  const dx = x - BLOOM[0];
  const dy = y - BLOOM[1];
  const dc = Math.hypot(dx, dy);
  const step = Math.PI / 4;
  const a = Math.atan2(dy, dx);
  const da = a - Math.round(a / step) * step;
  if (dc <= 0.2) return { part: 'face', color: dc < 0.11 ? '#fff6c8' : '#ffd77a', set: ROUND };
  if (inEllipse(dc * Math.cos(da), dc * Math.sin(da), 0.37, 0, 0.17, 0.125, 0)) return { part: 'petal', color: dc > 0.41 ? '#ff8fd0' : '#ffc2ea', set: PETAL };
  if (inEllipse(x, y, -0.17, 0.7, 0.15, 0.065, 0.38) || inEllipse(x, y, 0.17, 0.58, 0.15, 0.065, -0.38)) return { part: 'leaf', color: '#7dff9a', set: ROUND };
  if (Math.abs(x) < 0.03 && y > 0.4 && y < 0.97) return { part: 'stem', color: '#4fd36a', set: ['|'] };
  return null;
};

/** the flower's petals: a closed bud until the cheer, then they spring open and breathe */
function petalsOpen(ft: number, t: number): number {
  if (ft < CHEER_AT) return 0.75;
  return (0.75 + 0.25 * spring((ft - CHEER_AT) / 0.8)) * (1 + 0.025 * Math.sin(t * 2.5));
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

function flowerBack(ctx: CanvasRenderingContext2D, ft: number, t: number) {
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

function sunFace(ctx: CanvasRenderingContext2D, ft: number, t: number) {
  ctx.lineCap = 'round';
  cheek(ctx, -0.26, 0.07, 0.085);
  cheek(ctx, 0.26, 0.07, 0.085);
  ctx.strokeStyle = '#8a3b12';
  ctx.lineWidth = 0.04;
  ctx.beginPath();
  ctx.arc(0, 0, 0.2, Math.PI * 0.18, Math.PI * 0.82);
  ctx.stroke();
  // happy eyes, until the sunglasses drop onto them (first touch at the cheer)
  const fall = (ft - CHEER_AT) / DROP_S + 1 / 2.75;
  if (fall < 1 / 2.75) {
    happyEye(ctx, -0.15, -0.1, 0.055);
    happyEye(ctx, 0.15, -0.1, 0.055);
  }
  if (fall > 0) shades(ctx, -1.6 * (1 - bounce(Math.min(1, fall))), t);
}

function flowerFace(ctx: CanvasRenderingContext2D) {
  ctx.lineCap = 'round';
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
}

function smileyFace(ctx: CanvasRenderingContext2D, ft: number, t: number) {
  ctx.lineCap = 'round';
  cheek(ctx, -0.26, 0.07, 0.085);
  cheek(ctx, 0.26, 0.07, 0.085);
  ctx.strokeStyle = '#8a3b12';
  ctx.lineWidth = 0.04;
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

const openPetals = (c: FriendCell, ft: number, t: number): [number, number] => {
  if (c.part !== 'petal') return [c.x, c.y];
  const open = petalsOpen(ft, t);
  return [BLOOM[0] + (c.x - BLOOM[0]) * open, BLOOM[1] + (c.y - BLOOM[1]) * open];
};

/** a sun of glitchy letters: tougher ones are bigger, with more rays, every other one short */
function sun(rays: number, R: number): Pick<Design, 'body' | 'limbs' | 'turnLimbs' | 'eyes' | 'mouth'> {
  return { body: circle(0, 0, R), limbs: sunRays(R, rays, rays > 8), turnLimbs: true, eyes: EYES, mouth: MOUTH };
}

export const CLASSICS: Design[] = [
  {
    ...sun(8, 0.4),
    palette: { core: '#fff6c8', mid: '#ffd77a', ray: '#ff9d4a', glow: '255, 160, 60', eye: '#ff2d2d' },
    friend: {
      build: () => friendCells(sunFriend(0)),
      glow: '255, 190, 80',
      cheer: HEARTS[0],
      back: (ctx) => disc(ctx, 0, 0, 0.47, '255, 240, 180', '255, 196, 90'),
      face: sunFace,
    },
  },
  {
    ...sun(12, 0.43),
    palette: { core: '#ffe3f6', mid: '#ff8fd0', ray: '#c45bff', glow: '220, 80, 255', eye: '#7dff6a' },
    friend: {
      build: () => friendCells(flowerFriend),
      glow: '255, 120, 200',
      cheer: HEARTS[1],
      back: flowerBack,
      face: flowerFace,
      move: openPetals,
    },
  },
  {
    ...sun(16, 0.46),
    palette: { core: '#e2fbff', mid: '#6ad7ff', ray: '#5a6bff', glow: '90, 160, 255', eye: '#ff2d2d' },
    friend: {
      build: () => friendCells(sunFriend(2)),
      glow: '255, 215, 140',
      cheer: HEARTS[2],
      back: (ctx) => disc(ctx, 0, 0, 0.47, '255, 248, 215', '255, 222, 140'),
      face: smileyFace,
    },
  },
];
