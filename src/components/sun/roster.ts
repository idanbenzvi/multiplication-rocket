import { CLASSICS } from './classics';
import {
  box,
  bow,
  catMouth,
  cheered,
  cheeks,
  circle,
  curve,
  dotEye,
  dropping,
  ellipse,
  eyes,
  fillStar,
  friendCells,
  gradCap,
  heart,
  inEllipse,
  laugh,
  minus,
  mirror,
  nightcap,
  nose,
  placed,
  polygon,
  popping,
  rainbow,
  RAINBOW,
  ROUND,
  roundGlasses,
  smile,
  sparkle,
  star,
  stroke,
  topHat,
  union,
  wand,
  whiskers,
  type Design,
  type Friend,
  type FriendPart,
  type Shape,
} from './monsterArt';

// Every monster in Monster Sun, in the same order as their names
// (Strings.sun.names) and what they say once they're cured (Strings.sun.cured):
// the three classic suns, then a gang of 22 more. Each is a shape of glitchy
// letters with glowing eyes and a grin of teeth (its limbs are knocked off
// first, its eyes last), and a friend it turns into once it's cured, who shows
// off a moment later: a hat drops on, its eyes turn to hearts, a wand comes out.

/** a friend painted region by region: the first region a point is in says what it is */
function regions(...list: [Shape, FriendPart, string, string[]?][]) {
  return (x: number, y: number) => {
    for (const [shape, part, color, set] of list) if (shape(x, y)) return { part, color, set: set ?? ROUND };
    return null;
  };
}

/** a friend whose letters are backed by soft blobs of their colour */
function friend(paint: ReturnType<typeof regions>, rest: Omit<Friend, 'build' | 'soft'>): Friend {
  return { build: () => friendCells(paint), soft: true, ...rest };
}

const side = (x: number) => (x < 0 ? -1 : 1);

/** a marshmallow toasting on a stick, the stick's end at the spot */
function marshmallow(ctx: CanvasRenderingContext2D) {
  ctx.strokeStyle = '#a0703a';
  ctx.lineWidth = 0.06;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, -0.75);
  ctx.stroke();
  ctx.fillStyle = '#fff6ea';
  ctx.beginPath();
  ctx.roundRect(-0.13, -1.02, 0.26, 0.3, 0.08);
  ctx.fill();
  ctx.fillStyle = '#d9954a';
  ctx.beginPath();
  ctx.roundRect(-0.13, -1.02, 0.26, 0.1, 0.06);
  ctx.fill();
}

// ---------- the magical rabbit ----------

const rabbitEars = union(ellipse(-0.2, -0.42, 0.11, 0.34, -0.18), ellipse(0.2, -0.42, 0.11, 0.34, 0.18));
const rabbitHead = ellipse(0, 0.22, 0.44, 0.38);
const rabbit: Design = {
  body: union(rabbitHead, rabbitEars),
  // the magic sparkles round it go first
  limbs: union(star(0.68, -0.52, 4, 0.15, 0.045, 0), star(-0.72, -0.08, 4, 0.13, 0.04, 0), star(0.72, 0.5, 4, 0.11, 0.035, 0)),
  eyes: [
    [-0.16, 0.13],
    [0.16, 0.13],
  ],
  eyeR: 0.095,
  mouth: { y: 0.35, w: 0.17 },
  palette: { core: '#f6eeff', mid: '#c9a7ff', ray: '#ffd77a', glow: '170, 110, 255', eye: '#ff3dd2' },
  heart: [0, 0.24, 0.24],
  glyphs: ['*', '+', '✦', '✧', '☆', '~', '#', '@', '%', '&', '?', '!', '§', '∆', 'Ψ', '¤'],
  sway: (x, y, t) => [0.03 * Math.sin(t * 2.2 + y * 3), 0.03 * Math.cos(t * 2.2 + x * 3)],
  friend: friend(
    regions(
      [union(ellipse(-0.2, -0.43, 0.05, 0.25, -0.18), ellipse(0.2, -0.43, 0.05, 0.25, 0.18)), 'limb', '#ffb6d9'],
      [rabbitEars, 'limb', '#f3eaff'],
      [ellipse(0, 0.27, 0.26, 0.2), 'face', '#ffffff'],
      [rabbitHead, 'face', '#e7d9ff'],
    ),
    {
      glow: '210, 160, 255',
      cheer: '#c49bff',
      floats: { chars: ['★', '✦', '♥'], colors: ['#ffd77a', '#c49bff', '#ff8fd0'], at: [0.62, 0.18] },
      face: (ctx, ft, t) => {
        cheeks(ctx, 0, 0.29, 0.29, 0.07);
        eyes(ctx, 0, 0.16, 0.14, 0.058, ft, t);
        nose(ctx, 0, 0.26, 0.035);
        catMouth(ctx, 0, 0.3, 0.032);
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#5a1a2a';
        ctx.lineWidth = 0.008;
        for (const x of [-0.034, 0.002]) {
          ctx.beginPath();
          ctx.roundRect(x, 0.315, 0.032, 0.055, 0.008);
          ctx.fill();
          ctx.stroke();
        }
        whiskers(ctx, 0, 0.29, 0.12, 0.22, t);
        // a top hat drops on between its ears, and out comes a wand
        const dy = dropping(ft);
        if (dy !== null) placed(ctx, 0.02, -0.13 + dy, 0.34, -0.12, () => topHat(ctx, '#c49bff'));
        placed(ctx, 0.44, 0.58, 0.44 * popping(ft, 0.25), 0.55 + 0.25 * Math.sin(t * 3), () => wand(ctx, t));
      },
    },
  ),
};

// ---------- the ghost ----------

/** a round top, and a wavy hem that flares out a little */
const ghostShape: Shape = (x, y) => {
  if (y < -0.2) return x * x + (y + 0.2) ** 2 <= 0.42 * 0.42;
  return Math.abs(x) <= 0.42 + (y + 0.2) * 0.07 && y <= 0.48 + 0.13 * Math.cos((x / 0.46) * 3 * Math.PI);
};
const ghostArms = mirror(stroke(0.4, 0.0, 0.68, -0.2, 0.08, 0.06));
const ghost: Design = {
  body: (x, y) => ghostShape(x, y) && y <= 0.3,
  // its tattered hem and its arms go first
  limbs: union((x, y) => ghostShape(x, y) && y > 0.3, ghostArms),
  eyes: [
    [-0.16, -0.2],
    [0.16, -0.2],
  ],
  eyeR: 0.11,
  mouth: { y: 0.04, w: 0.12, curve: 2 },
  palette: { core: '#f4fdff', mid: '#c8ecff', ray: '#8fd8ff', glow: '140, 220, 255', eye: '#7dff6a' },
  heart: [0, -0.15, 0.24],
  glyphs: ['~', '°', 'o', 'O', '*', '#', '@', '%', '&', '?', '!', '§', '¤', '∆', '≈'],
  sway: (x, y, t) => [0.03 * Math.sin(t * 3 + y * 7), 0.02 * Math.sin(t * 2.4 + x * 6)],
  friend: friend(
    regions([mirror(stroke(0.4, 0.05, 0.62, -0.05, 0.075, 0.06)), 'limb', '#e8f6ff'], [circle(0, -0.16, 0.26), 'face', '#ffffff'], [ghostShape, 'face', '#e2f2ff']),
    {
      glow: '200, 235, 255',
      cheer: '#ff8fd0',
      face: (ctx, ft, t) => {
        cheeks(ctx, 0, 0.18, -0.06, 0.06);
        eyes(ctx, 0, 0.15, -0.18, 0.062, ft, t, 'happy');
        laugh(ctx, 0, -0.05, 0.08, 0.055);
        placed(ctx, 0.28, -0.56, 0.3 * popping(ft), 0.45, () => bow(ctx, '#ff5c8a'));
      },
      // waving hello once it's happy
      move: (c, ft, t) => (c.part === 'limb' && cheered(ft) ? [c.x, c.y + Math.sin(t * 8 + (c.x > 0 ? Math.PI : 0)) * 0.08 * Math.abs(c.x)] : [c.x, c.y]),
    },
  ),
};

// ---------- the octopus ----------

const tentacle = (x0: number, s: number) =>
  curve(
    [
      [x0, 0.0],
      [x0 * 1.3 + 0.06 * s, 0.3],
      [x0 * 1.6 - 0.07 * s, 0.58],
      [x0 * 1.9 + 0.05 * s, 0.86],
    ],
    0.085,
    0.03,
  );
const tentacles = union(...[-0.33, -0.2, -0.07, 0.07, 0.2, 0.33].map((x0, i) => tentacle(x0, i % 2 ? 1 : -1)));
const mantle = ellipse(0, -0.28, 0.44, 0.42);
const octopus: Design = {
  body: mantle,
  limbs: tentacles,
  eyes: [
    [-0.17, -0.3],
    [0.17, -0.3],
  ],
  mouth: { y: -0.08, w: 0.14 },
  palette: { core: '#ffe0ef', mid: '#ff6fae', ray: '#d63384', glow: '255, 90, 170', eye: '#ffe14d' },
  heart: [0, -0.3, 0.24],
  sway: (x, y, t) => [0.05 * Math.sin(t * 2.6 + y * 6 + x * 3) * Math.max(0, y), 0],
  friend: friend(
    regions(
      [(x, y) => tentacles(x, y) && Math.round(y * 14) % 2 === 0 && y > 0.15, 'limb', '#ffd1ec', ['o']],
      [tentacles, 'limb', '#c49bff'],
      [ellipse(0, -0.3, 0.26, 0.24), 'face', '#f0e1ff'],
      [mantle, 'face', '#d9b3ff'],
    ),
    {
      glow: '210, 160, 255',
      cheer: '#c49bff',
      floats: { chars: ['o', '°', '♥'], colors: ['#bfe9ff', '#ffffff', '#ff8fd0'] },
      face: (ctx, ft, t) => {
        cheeks(ctx, 0, 0.27, -0.18, 0.07);
        eyes(ctx, 0, 0.16, -0.3, 0.068, ft, t);
        smile(ctx, 0, -0.2, 0.1);
      },
      // its tentacles sway, and wave once it's happy
      move: (c, ft, t) => (c.part === 'limb' ? [c.x + Math.sin(t * (cheered(ft) ? 5 : 2) + c.y * 7) * (cheered(ft) ? 0.06 : 0.025) * c.y, c.y] : [c.x, c.y]),
    },
  ),
};

// ---------- the star ----------

const starShape = star(0, 0.1, 5, 0.97, 0.45);
const starMiddle = circle(0, 0.1, 0.45);
const fiveStar: Design = {
  body: (x, y) => starShape(x, y) && starMiddle(x, y),
  limbs: starShape,
  eyes: [
    [-0.15, 0.0],
    [0.15, 0.0],
  ],
  eyeR: 0.095,
  mouth: { y: 0.2, w: 0.16 },
  palette: { core: '#fffbe0', mid: '#ffd23d', ray: '#ff8a1f', glow: '255, 200, 60', eye: '#ff2d6f' },
  heart: [0, 0.1, 0.2],
  friend: friend(regions([circle(0, 0.1, 0.24), 'face', '#fffbe8'], [starMiddle, 'face', '#fff0a8'], [star(0, 0.1, 5, 0.9, 0.46), 'ray', '#ffd84a']), {
    glow: '255, 220, 120',
    cheer: '#ffd77a',
    floats: { chars: ['★', '✦'], colors: ['#ffd77a', '#ffffff', '#ff9d4a'] },
    face: (ctx, ft, t) => {
      cheeks(ctx, 0, 0.26, 0.17, 0.075);
      eyes(ctx, 0, 0.15, 0.0, 0.068, ft, t, 'wink');
      smile(ctx, 0, 0.11, 0.11);
      if (cheered(ft)) {
        ctx.fillStyle = '#ffffff';
        sparkle(ctx, 0.31, -0.12, 0.09 * (0.6 + 0.4 * Math.sin(t * 6)));
      }
    },
  }),
};

// ---------- the robot ----------

const robotHead = box(0, 0.08, 0.5, 0.42, 0.1);
const antenna = union(stroke(0, -0.34, 0, -0.62, 0.035), circle(0, -0.68, 0.085));
const bolts = union(box(-0.57, 0.08, 0.07, 0.15, 0.03), box(0.57, 0.08, 0.07, 0.15, 0.03));
const robot: Design = {
  body: robotHead,
  limbs: union(antenna, bolts),
  eyes: [
    [-0.2, -0.06],
    [0.2, -0.06],
  ],
  eyeR: 0.11,
  pupil: 'square',
  mouth: { y: 0.25, w: 0.22, curve: 0 },
  palette: { core: '#e6f7ff', mid: '#93b4cc', ray: '#ff5c5c', glow: '120, 200, 255', eye: '#39ff88' },
  heart: [0, 0.08, 0.2],
  glyphs: '01#[]=+-<>{}|/\\'.split(''),
  friend: friend(
    regions(
      [circle(0, -0.68, 0.085), 'limb', '#ff8fd0'],
      [antenna, 'limb', '#a9bdd1'],
      [bolts, 'limb', '#ffd77a'],
      [box(0, 0.08, 0.38, 0.3, 0.08), 'face', '#eef8ff'],
      [robotHead, 'face', '#b9dcf5'],
    ),
    {
      glow: '160, 220, 255',
      cheer: '#ff8fd0',
      floats: { chars: ['♥', '♪'], colors: ['#ff8fd0', '#6ad7ff', '#ffd77a'], at: [0, -0.72] },
      face: (ctx, ft, t) => {
        cheeks(ctx, 0, 0.3, 0.16, 0.07);
        eyes(ctx, 0, 0.18, -0.02, 0.078, ft, t, 'dots', '#1d3557');
        smile(ctx, 0, 0.11, 0.12, '#1d3557', 0.032);
        // its antenna lights up as a heart
        const s = 0.16 * popping(ft) * (1 + 0.1 * Math.max(0, Math.sin(t * 8)));
        if (s > 0) {
          ctx.fillStyle = '#ff3d7f';
          heart(ctx, 0, -0.69, s);
        }
      },
    },
  ),
};

// ---------- the cat ----------

const catHead = ellipse(0, 0.14, 0.5, 0.42);
const catEars = mirror(polygon([[0.46, -0.05], [0.42, -0.72], [0.1, -0.24]]));
const catWhiskers = mirror(union(stroke(0.3, 0.27, 0.84, 0.13, 0.04), stroke(0.3, 0.33, 0.86, 0.33, 0.04), stroke(0.3, 0.39, 0.84, 0.53, 0.04)));
const cat: Design = {
  body: catHead,
  limbs: union(catEars, catWhiskers),
  eyes: [
    [-0.2, 0.04],
    [0.2, 0.04],
  ],
  pupil: 'slit',
  mouth: { y: 0.3, w: 0.14 },
  palette: { core: '#f1e8ff', mid: '#9a6cf0', ray: '#6a44c0', glow: '150, 90, 255', eye: '#ffe14d' },
  heart: [0, 0.16, 0.22],
  friend: friend(
    regions(
      [mirror(polygon([[0.38, -0.12], [0.37, -0.56], [0.17, -0.27]])), 'limb', '#ffb6d9'],
      [catEars, 'limb', '#ffb066'],
      [union(stroke(0, -0.22, 0, -0.08, 0.035), mirror(stroke(0.12, -0.2, 0.1, -0.08, 0.03))), 'face', '#ff9440'],
      [ellipse(0, 0.3, 0.22, 0.14), 'face', '#fff1e0'],
      [catHead, 'face', '#ffc58a'],
    ),
    {
      glow: '255, 200, 140',
      cheer: '#ff9d4a',
      face: (ctx, ft, t) => {
        cheeks(ctx, 0, 0.29, 0.3, 0.065);
        eyes(ctx, 0, 0.19, 0.07, 0.072, ft, t, 'happy', '#2e5a2e');
        nose(ctx, 0, 0.23, 0.035);
        catMouth(ctx, 0, 0.28, 0.035);
        whiskers(ctx, 0, 0.27, 0.18, 0.3, t);
        placed(ctx, 0, 0.56, 0.24 * popping(ft), 0, () => bow(ctx, '#ff3d7f'));
      },
      // its ears twitch
      move: (c, _ft, t) => (c.part === 'limb' ? [c.x + Math.max(0, Math.sin(t * 3)) ** 8 * 0.04 * side(c.x) * -c.y, c.y] : [c.x, c.y]),
    },
  ),
};

// ---------- the storm cloud ----------

const cloud = union(circle(-0.4, 0.05, 0.28), circle(-0.12, -0.15, 0.36), circle(0.25, -0.08, 0.33), circle(0.48, 0.1, 0.24), ellipse(0.02, 0.15, 0.62, 0.2));
const bolt = (x0: number, y0: number) =>
  curve(
    [
      [x0, y0],
      [x0 - 0.12, y0 + 0.24],
      [x0 + 0.05, y0 + 0.26],
      [x0 - 0.08, y0 + 0.55],
    ],
    0.055,
    0.03,
  );
const stormCloud: Design = {
  body: cloud,
  limbs: union(bolt(-0.22, 0.3), bolt(0.3, 0.3)),
  eyes: [
    [-0.17, -0.04],
    [0.17, -0.04],
  ],
  mouth: { y: 0.13, w: 0.16 },
  palette: { core: '#e6e2ff', mid: '#8e86b8', ray: '#ffe14d', glow: '150, 140, 230', eye: '#ffe14d' },
  heart: [0, -0.05, 0.25],
  sway: (_x, y, t) => [0.02 * Math.sin(t * 20 + y * 10), 0],
  friend: friend(regions([union(circle(-0.12, -0.12, 0.26), circle(0.2, -0.05, 0.22)), 'face', '#ffffff'], [cloud, 'face', '#dfe9ff']), {
    glow: '230, 240, 255',
    cheer: '#6ad7ff',
    // a rainbow arches out behind it
    back: (ctx, ft) => rainbow(ctx, 0, 0.3, 0.92, 0.06, (ft - 2.1) / 0.8),
    face: (ctx, ft, t) => {
      cheeks(ctx, 0, 0.3, 0.07, 0.08);
      eyes(ctx, 0, 0.16, -0.04, 0.064, ft, t, 'happy');
      laugh(ctx, 0, 0.06, 0.09, 0.065);
    },
  }),
};

// ---------- the comet ----------

const cometHead = circle(0.3, -0.3, 0.36);
const cometTail = union(
  curve(
    [
      [0.3, -0.3],
      [-0.05, 0.08],
      [-0.42, 0.45],
      [-0.82, 0.82],
    ],
    0.34,
    0.04,
  ),
  curve(
    [
      [0.2, -0.05],
      [-0.2, 0.35],
      [-0.55, 0.82],
    ],
    0.12,
    0.02,
  ),
  curve(
    [
      [0.05, -0.25],
      [-0.4, 0.05],
      [-0.86, 0.35],
    ],
    0.12,
    0.02,
  ),
);
const comet: Design = {
  body: cometHead,
  limbs: cometTail,
  eyes: [
    [0.18, -0.34],
    [0.42, -0.34],
  ],
  eyeR: 0.085,
  mouth: { x: 0.3, y: -0.16, w: 0.13 },
  palette: { core: '#fff6dc', mid: '#ffb347', ray: '#ff5a36', glow: '255, 140, 60', eye: '#3df2ff' },
  heart: [0.3, -0.3, 0.2],
  sway: (x, y, t) => [0.02 * Math.sin(t * 7 + (x + y) * 6), 0.02 * Math.cos(t * 6 + (x - y) * 5)],
  friend: friend(
    regions([circle(0.3, -0.3, 0.2), 'face', '#fffbe8'], [cometHead, 'face', '#fff0b8'], [cometTail, 'ray', '#ffffff']),
    {
      glow: '255, 210, 140',
      cheer: '#ffd77a',
      floats: { chars: ['★', '✦'], colors: ['#ffd77a', '#ffffff', '#ff8fd0'], at: [-0.45, 0.45] },
      // a rainbow tail, its colours running along it
      tint: (c, _ft, t) => (c.part === 'ray' ? RAINBOW[Math.floor(Math.hypot(c.x - 0.3, c.y + 0.3) * 6 - t * 3 + 600) % 6] : null),
      face: (ctx, ft, t) => {
        cheeks(ctx, 0.3, 0.2, -0.2, 0.06);
        eyes(ctx, 0.3, 0.12, -0.34, 0.058, ft, t, 'stars');
        laugh(ctx, 0.3, -0.21, 0.09, 0.06);
      },
    },
  ),
};

// ---------- the ringed planet ----------

const planet = circle(0, -0.08, 0.42);
const RING_TURN = -0.22;
const ringBand: Shape = (x, y) => inEllipse(x, y, 0, -0.08, 0.92, 0.25, RING_TURN) && !inEllipse(x, y, 0, -0.08, 0.62, 0.15, RING_TURN);
/** the near half of the ring, which passes in front of the planet */
const ringFront: Shape = (x, y) => -x * Math.sin(RING_TURN) + (y + 0.08) * Math.cos(RING_TURN) > 0;
const ring: Shape = (x, y) => ringBand(x, y) && (ringFront(x, y) || !planet(x, y));
const ringedPlanet: Design = {
  body: (x, y) => planet(x, y) && !ring(x, y),
  limbs: ring,
  eyes: [
    [-0.15, -0.24],
    [0.15, -0.24],
  ],
  eyeR: 0.09,
  mouth: { y: -0.07, w: 0.13 },
  palette: { core: '#e8fff9', mid: '#4fd1c5', ray: '#ffd77a', glow: '80, 210, 200', eye: '#ff4d6a' },
  heart: [0, -0.12, 0.22],
  friend: friend(
    regions(
      [ring, 'ray', '#ffe9a0', ['*', '✦', '+']],
      [circle(0, -0.12, 0.22), 'face', '#f3e8ff'],
      [(x, y) => planet(x, y) && Math.floor((y + 1) * 7) % 2 === 0, 'face', '#cdb0ff'],
      [planet, 'face', '#dcc6ff'],
    ),
    {
      glow: '220, 190, 255',
      cheer: '#ffd77a',
      floats: { chars: ['✦', '★'], colors: ['#ffe9a0', '#ffffff', '#c49bff'] },
      face: (ctx, ft, t) => {
        cheeks(ctx, 0, 0.25, -0.1, 0.07);
        eyes(ctx, 0, 0.14, -0.24, 0.062, ft, t, 'hearts');
        smile(ctx, 0, -0.13, 0.08);
        // a little moon goes round it (behind it, half the time)
        if (cheered(ft)) {
          const a = (ft - 2.1) * 1.6;
          if (Math.sin(a) > -0.2) {
            const x = Math.cos(a) * 0.82;
            const y = -0.08 + Math.sin(a) * 0.3 + x * 0.2;
            ctx.fillStyle = '#fff3c4';
            ctx.beginPath();
            ctx.arc(x, y, 0.07, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      },
    },
  ),
};

// ---------- the three-eyed alien ----------

const alienHead = union(ellipse(0, -0.12, 0.52, 0.42), ellipse(0, 0.22, 0.32, 0.32));
const alienAntennae = mirror(
  union(
    curve(
      [
        [0.22, -0.48],
        [0.32, -0.7],
        [0.45, -0.82],
      ],
      0.035,
    ),
    circle(0.47, -0.85, 0.08),
  ),
);
const alien: Design = {
  body: alienHead,
  limbs: alienAntennae,
  eyes: [
    [-0.25, -0.1],
    [0, -0.22],
    [0.25, -0.1],
  ],
  eyeR: 0.09,
  mouth: { y: 0.22, w: 0.14 },
  palette: { core: '#efffe0', mid: '#8dff6a', ray: '#2fd17c', glow: '110, 255, 120', eye: '#ff3dd2' },
  heart: [0, -0.1, 0.25],
  sway: (x, y, t) => [0.03 * Math.sin(t * 4 + x * 2) * -y, 0],
  friend: friend(regions([mirror(circle(0.47, -0.85, 0.08)), 'limb', '#ffd77a'], [alienAntennae, 'limb', '#9ff59a'], [ellipse(0, -0.05, 0.3, 0.3), 'face', '#e6ffe0'], [alienHead, 'face', '#b9ffb0']), {
    glow: '170, 255, 170',
    cheer: '#7dff9a',
    floats: { chars: ['✦', '♥'], colors: ['#ffd77a', '#7dff9a', '#ffffff'] },
    face: (ctx, ft, t) => {
      cheeks(ctx, 0, 0.3, 0.1, 0.07);
      dotEye(ctx, -0.24, -0.08, 0.062, t);
      dotEye(ctx, 0, -0.2, 0.068, t + 1.3);
      dotEye(ctx, 0.24, -0.08, 0.062, t + 2.1);
      laugh(ctx, 0, 0.12, 0.1, 0.07);
      // its antennae light up as stars
      const s = 0.13 * popping(ft);
      if (s > 0) {
        ctx.fillStyle = '#ffd23d';
        fillStar(ctx, -0.47, -0.85, s, 5, t);
        fillStar(ctx, 0.47, -0.85, s, 5, -t);
      }
    },
    move: (c, _ft, t) => (c.part === 'limb' ? [c.x + 0.03 * Math.sin(t * 4 + c.x * 2) * -c.y, c.y] : [c.x, c.y]),
  }),
};

// ---------- the jellyfish ----------

const bell: Shape = (x, y) => inEllipse(x, y, 0, -0.05, 0.52, 0.48, 0) && y <= 0.12 + 0.04 * Math.cos((x / 0.52) * 4 * Math.PI);
const STRANDS = [-0.32, -0.16, 0, 0.16, 0.32];
const zigzag = (x0: number) =>
  curve(
    [
      [x0, 0.1],
      [x0 + 0.07, 0.3],
      [x0 - 0.05, 0.5],
      [x0 + 0.06, 0.7],
      [x0 - 0.03, 0.92],
    ],
    0.045,
    0.025,
  );
const wavy = (x0: number) =>
  curve(
    [
      [x0, 0.1],
      [x0 + 0.05, 0.32],
      [x0 - 0.05, 0.54],
      [x0 + 0.05, 0.76],
      [x0, 0.94],
    ],
    0.045,
    0.03,
  );
const jellyfish: Design = {
  body: bell,
  limbs: union(...STRANDS.map(zigzag)),
  eyes: [
    [-0.17, -0.15],
    [0.17, -0.15],
  ],
  mouth: { y: 0.0, w: 0.15 },
  palette: { core: '#f0fff8', mid: '#7ff5d4', ray: '#ffe14d', glow: '110, 255, 210', eye: '#ff3dd2' },
  heart: [0, -0.15, 0.24],
  glyphs: ['z', 'Z', '~', '/', '\\', '*', '+', '#', '%', '?', '!', '<', '>', '^', '≈', '¤'],
  sway: (_x, y, t) => [0.035 * Math.sin(t * 5 + y * 8) * y, 0],
  friend: friend(regions(...STRANDS.map((x0, i): [Shape, FriendPart, string] => [wavy(x0), 'limb', RAINBOW[i]]), [ellipse(0, -0.15, 0.28, 0.22), 'face', '#fff0fa'], [bell, 'face', '#ffc9ea']), {
    glow: '255, 170, 230',
    cheer: '#7ff5d4',
    floats: { chars: ['°', 'o', '✦'], colors: ['#bfffea', '#ffffff', '#ffd6f0'] },
    // once it's happy, it glows in rainbows that run down its strands
    tint: (c, ft, t) => (c.part === 'limb' && cheered(ft) ? RAINBOW[Math.floor(c.y * 8 - t * 6 + 600) % 6] : null),
    face: (ctx, ft, t) => {
      cheeks(ctx, 0, 0.27, -0.06, 0.07);
      eyes(ctx, 0, 0.16, -0.17, 0.062, ft, t, 'happy');
      smile(ctx, 0, -0.09, 0.09);
    },
    move: (c, _ft, t) => (c.part === 'limb' ? [c.x + 0.03 * Math.sin(t * 3 + c.y * 6) * c.y, c.y] : [c.x, c.y]),
  }),
};

// ---------- the owl ----------

const owlBody = ellipse(0, 0.1, 0.5, 0.58);
const owlTufts = mirror(polygon([[0.42, -0.25], [0.5, -0.72], [0.18, -0.42]]));
const owlWings = union(ellipse(-0.5, 0.25, 0.13, 0.38, 0.25), ellipse(0.5, 0.25, 0.13, 0.38, -0.25));
const owl: Design = {
  body: owlBody,
  limbs: union(owlTufts, owlWings),
  eyes: [
    [-0.2, -0.08],
    [0.2, -0.08],
  ],
  eyeR: 0.15,
  mouth: { y: 0.15, w: 0.08, curve: 3 },
  palette: { core: '#fff0d6', mid: '#c98b4a', ray: '#7a4a24', glow: '255, 170, 80', eye: '#ffb300' },
  heart: [0, 0.3, 0.25],
  friend: friend(
    regions(
      [union(owlTufts, owlWings), 'limb', '#b07a44'],
      [mirror(circle(0.19, -0.08, 0.17)), 'face', '#fff7ea'],
      [ellipse(0, 0.32, 0.3, 0.3), 'face', '#ffe9c4', ['v', 'w']],
      [owlBody, 'face', '#d9a066'],
    ),
    {
      glow: '255, 210, 150',
      cheer: '#ffd77a',
      floats: { chars: ['★', '✦', '♪'], colors: ['#ffd77a', '#ffffff'] },
      face: (ctx, ft, t) => {
        cheeks(ctx, 0, 0.32, 0.07, 0.07);
        eyes(ctx, 0, 0.19, -0.08, 0.075, ft, t);
        roundGlasses(ctx, 0, 0.19, -0.08, 0.13);
        nose(ctx, 0, 0.07, 0.05, '#ffb347');
        // a graduation cap drops on
        const dy = dropping(ft);
        if (dy !== null) placed(ctx, 0, -0.4 + dy, 0.44, 0, () => gradCap(ctx, t));
      },
      // flapping for joy
      move: (c, ft, t) => (c.part === 'limb' && cheered(ft) && c.y > -0.2 ? [c.x + Math.sin(t * 9) * 0.035 * side(c.x), c.y] : [c.x, c.y]),
    },
  ),
};

// ---------- the dragon ----------

const dragonHead = union(ellipse(0, 0.0, 0.46, 0.4), ellipse(0, 0.32, 0.32, 0.22));
const dragonHorns = mirror(
  curve(
    [
      [0.2, -0.3],
      [0.4, -0.45],
      [0.52, -0.68],
    ],
    0.085,
    0.025,
  ),
);
const dragonFrills = union(mirror(polygon([[0.42, -0.05], [0.74, -0.22], [0.48, 0.14]])), polygon([[-0.08, -0.38], [0, -0.62], [0.08, -0.38]]));
const dragon: Design = {
  body: dragonHead,
  limbs: union(dragonHorns, dragonFrills),
  eyes: [
    [-0.19, -0.06],
    [0.19, -0.06],
  ],
  eyeR: 0.09,
  pupil: 'slit',
  mouth: { y: 0.36, w: 0.22, curve: 0.5 },
  palette: { core: '#e9ffd9', mid: '#3fbf5a', ray: '#ff8a3d', glow: '90, 220, 110', eye: '#ffd23d' },
  heart: [0, 0.05, 0.22],
  friend: friend(
    regions([dragonHorns, 'limb', '#fff0b8'], [dragonFrills, 'limb', '#ffb6d9'], [ellipse(0, 0.32, 0.24, 0.15), 'face', '#d8fff0'], [dragonHead, 'face', '#8ff0c0']),
    {
      glow: '170, 255, 210',
      cheer: '#ff8fd0',
      // it puffs out hearts
      floats: { chars: ['♥'], colors: ['#ff8fd0', '#ffb6d9', '#ffffff'], at: [0, 0.18] },
      face: (ctx, ft, t) => {
        cheeks(ctx, 0, 0.3, 0.14, 0.07);
        eyes(ctx, 0, 0.19, -0.04, 0.072, ft, t);
        ctx.fillStyle = '#2f7a55';
        for (const x of [-0.07, 0.07]) {
          ctx.beginPath();
          ctx.ellipse(x, 0.25, 0.022, 0.016, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        smile(ctx, 0, 0.31, 0.12, '#2f5a45');
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(0.05, 0.41);
        ctx.lineTo(0.09, 0.41);
        ctx.lineTo(0.07, 0.46);
        ctx.fill();
      },
    },
  ),
};

// ---------- the piranha ----------

const fishBody = ellipse(-0.08, 0.0, 0.6, 0.42);
const fishFins = union(
  polygon([[0.45, 0], [0.95, -0.42], [0.86, 0], [0.95, 0.42]]),
  polygon([[-0.2, -0.38], [0.15, -0.68], [0.25, -0.32]]),
  polygon([[-0.05, 0.38], [0.15, 0.62], [0.22, 0.35]]),
);
const fish: Design = {
  body: fishBody,
  limbs: fishFins,
  eyes: [[-0.36, -0.12]],
  eyeR: 0.11,
  mouth: { x: -0.42, y: 0.18, w: 0.2, curve: -1.2 },
  palette: { core: '#e6efff', mid: '#5b7fd6', ray: '#34509e', glow: '90, 130, 255', eye: '#ff3d3d' },
  heart: [-0.2, 0, 0.22],
  friend: friend(regions([fishFins, 'limb', '#ff7b54', ['~', '≈']], [ellipse(-0.1, 0.18, 0.4, 0.17), 'face', '#ffe0a8'], [fishBody, 'face', '#ffae42']), {
    glow: '255, 200, 120',
    cheer: '#6ad7ff',
    // bubbles!
    floats: { chars: ['o', '°', 'O'], colors: ['#bfe9ff', '#ffffff'], at: [-0.72, 0.02] },
    face: (ctx, ft, t) => {
      cheeks(ctx, -0.3, 0, 0.13, 0.06);
      dotEye(ctx, -0.36, -0.1, 0.075, t);
      if (cheered(ft)) {
        // blowing bubbles: a little round mouth
        ctx.strokeStyle = '#7a2a12';
        ctx.lineWidth = 0.022;
        ctx.beginPath();
        ctx.arc(-0.58, 0.06, 0.035 * (1 + 0.2 * Math.sin(t * 6)), 0, Math.PI * 2);
        ctx.stroke();
      } else smile(ctx, -0.5, 0.02, 0.08, '#7a2a12');
    },
    // its tail swishes
    move: (c, _ft, t) => [c.x, c.y + Math.sin(t * 6) * 0.07 * Math.max(0, c.x - 0.45)],
  }),
};

// ---------- the moon ----------

const crescent = minus(circle(0, 0, 0.8), circle(0.35, -0.08, 0.7));
const moonFace = circle(-0.56, -0.02, 0.36);
const moon: Design = {
  body: (x, y) => crescent(x, y) && moonFace(x, y),
  // its horns go first
  limbs: crescent,
  eyes: [[-0.56, -0.17]],
  eyeR: 0.11,
  mouth: { x: -0.56, y: 0.12, w: 0.14, curve: 1.2 },
  palette: { core: '#fffbe6', mid: '#ffe9a3', ray: '#d7dcff', glow: '210, 210, 255', eye: '#ff4d6a' },
  heart: [-0.56, 0, 0.2],
  friend: friend(regions([(x, y) => crescent(x, y) && circle(-0.56, 0, 0.2)(x, y), 'face', '#fffbe6'], [crescent, 'face', '#ffe9a3']), {
    glow: '255, 240, 170',
    cheer: '#cfe0ff',
    // fast asleep
    floats: { chars: ['z', 'Z'], colors: ['#cfe0ff', '#ffffff'], at: [-0.2, -0.55] },
    face: (ctx, ft, t) => {
      cheeks(ctx, -0.46, 0, 0.05, 0.065);
      ctx.strokeStyle = '#7a5a12';
      ctx.lineWidth = 0.03;
      ctx.lineCap = 'round';
      if (cheered(ft)) {
        // asleep: a closed eye, upside down
        ctx.beginPath();
        ctx.arc(-0.57, -0.17, 0.06, Math.PI * 0.1, Math.PI * 0.9);
        ctx.stroke();
      } else dotEye(ctx, -0.57, -0.15, 0.065, t);
      smile(ctx, -0.6, 0.02, 0.08, '#7a5a12');
      const dy = dropping(ft);
      if (dy !== null) placed(ctx, -0.42, -0.5 + dy, 0.38, -0.45, () => nightcap(ctx, t));
    },
  }),
};

// ---------- the crab ----------

const claw = (s: number) =>
  union(
    minus(
      circle(0.68 * s, -0.38, 0.19),
      polygon([
        [0.68 * s, -0.38],
        [0.95 * s, -0.62],
        [0.62 * s, -0.72],
      ]),
    ),
    curve(
      [
        [0.4 * s, 0.1],
        [0.6 * s, -0.08],
        [0.66 * s, -0.25],
      ],
      0.06,
    ),
  );
const crabClaws = union(claw(-1), claw(1));
const crabLegs = mirror(union(stroke(0.42, 0.3, 0.76, 0.45, 0.035), stroke(0.4, 0.38, 0.72, 0.62, 0.035), stroke(0.34, 0.45, 0.6, 0.78, 0.035)));
const crabStalks = mirror(stroke(0.14, 0.0, 0.2, -0.3, 0.035));
const crabBody = ellipse(0, 0.22, 0.5, 0.3);
const crab: Design = {
  body: crabBody,
  limbs: union(crabClaws, crabLegs, crabStalks),
  eyes: [
    [-0.2, -0.34],
    [0.2, -0.34],
  ],
  eyeR: 0.085,
  mouth: { y: 0.24, w: 0.16 },
  palette: { core: '#ffe6dc', mid: '#ff5a4a', ray: '#c4232c', glow: '255, 90, 70', eye: '#fff36b' },
  heart: [0, 0.22, 0.22],
  friend: friend(regions([crabClaws, 'limb', '#ff6f5a'], [union(crabLegs, crabStalks), 'limb', '#ff9f8a'], [ellipse(0, 0.22, 0.28, 0.16), 'face', '#ffd6cc'], [crabBody, 'face', '#ff8a75']), {
    glow: '255, 170, 150',
    cheer: '#ffd77a',
    floats: { chars: ['♪', '♫'], colors: ['#ffd77a', '#ffffff', '#ff8fd0'] },
    face: (ctx, ft, t) => {
      cheeks(ctx, 0, 0.28, 0.28, 0.07);
      dotEye(ctx, -0.2, -0.34, 0.07, t);
      dotEye(ctx, 0.2, -0.34, 0.07, t + 0.4);
      if (cheered(ft)) laugh(ctx, 0, 0.18, 0.1, 0.065);
      else smile(ctx, 0, 0.16, 0.11);
    },
    // clapping its claws in time
    move: (c, ft, t) => (cheered(ft) && Math.abs(c.x) > 0.45 && c.y < 0 ? [c.x - side(c.x) * 0.07 * (0.5 + 0.5 * Math.sin(t * 10)), c.y] : [c.x, c.y]),
  }),
};

// ---------- the bat ----------

const batBody = union(ellipse(0, 0.12, 0.28, 0.34), mirror(polygon([[0.22, -0.12], [0.26, -0.48], [0.06, -0.2]])));
const batWings = mirror(
  polygon([
    [0.24, -0.08],
    [0.48, -0.42],
    [0.92, -0.36],
    [0.84, 0.02],
    [0.7, -0.04],
    [0.64, 0.2],
    [0.48, 0.1],
    [0.34, 0.3],
    [0.26, 0.18],
  ]),
);
const bat: Design = {
  body: batBody,
  limbs: batWings,
  eyes: [
    [-0.11, 0.04],
    [0.11, 0.04],
  ],
  eyeR: 0.075,
  mouth: { y: 0.2, w: 0.11 },
  palette: { core: '#f3e2ff', mid: '#a06ae6', ray: '#6a3fb8', glow: '170, 80, 255', eye: '#ff2d55' },
  heart: [0, 0.12, 0.2],
  sway: (x, _y, t) => [0, Math.sin(t * 5) * 0.06 * Math.max(0, Math.abs(x) - 0.25)],
  friend: friend(
    regions(
      [mirror(polygon([[0.19, -0.13], [0.22, -0.36], [0.1, -0.18]])), 'face', '#ffb6d9'],
      [batWings, 'limb', '#a98aff', ['~', '^', '*']],
      [ellipse(0, 0.24, 0.16, 0.17), 'face', '#f3eaff'],
      [batBody, 'face', '#cdb3ff'],
    ),
    {
      glow: '220, 190, 255',
      cheer: '#c49bff',
      floats: { chars: ['♥'], colors: ['#c49bff', '#ff8fd0', '#ffffff'] },
      face: (ctx, ft, t) => {
        cheeks(ctx, 0, 0.17, 0.12, 0.05);
        eyes(ctx, 0, 0.11, 0.04, 0.055, ft, t, 'hearts');
        smile(ctx, 0, 0.1, 0.07);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(0.02, 0.165);
        ctx.lineTo(0.06, 0.165);
        ctx.lineTo(0.04, 0.21);
        ctx.fill();
      },
      // flapping, faster once it's happy
      move: (c, ft, t) => (c.part === 'limb' ? [c.x, c.y + Math.sin(t * (cheered(ft) ? 12 : 4)) * 0.07 * Math.max(0, Math.abs(c.x) - 0.25)] : [c.x, c.y]),
    },
  ),
};

// ---------- the snowflake, who turns into a snowman ----------

const flake = union(
  ...Array.from({ length: 6 }, (_, k) => {
    const a = (k * Math.PI) / 3 - Math.PI / 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const barb = (turn: number) => stroke(c * 0.58, s * 0.58, c * 0.58 + Math.cos(a + turn) * 0.24, s * 0.58 + Math.sin(a + turn) * 0.24, 0.045);
    return union(stroke(0, 0, c * 0.93, s * 0.93, 0.065, 0.04), barb(Math.PI / 4), barb(-Math.PI / 4));
  }),
);
const snowHead = circle(0, -0.36, 0.28);
const snowBody = circle(0, 0.3, 0.4);
const twigs = mirror(
  union(
    curve(
      [
        [0.36, 0.16],
        [0.62, 0.0],
        [0.82, -0.16],
      ],
      0.035,
    ),
    stroke(0.66, -0.02, 0.72, -0.2, 0.03),
  ),
);
const snowflake: Design = {
  body: circle(0, 0, 0.36),
  limbs: flake,
  turnLimbs: true,
  eyes: [
    [-0.13, -0.07],
    [0.13, -0.07],
  ],
  eyeR: 0.075,
  mouth: { y: 0.09, w: 0.13 },
  palette: { core: '#f4fcff', mid: '#a6e4ff', ray: '#62b0ff', glow: '140, 210, 255', eye: '#3d6bff' },
  glyphs: ['*', '+', 'x', '#', '/', '\\', '|', '-', '^', '°', '<', '>', '=', '%'],
  friend: friend(
    regions(
      [mirror(circle(0, 0.14, 0.045)), 'face', '#3a3a4a', ['•']],
      [union(circle(0, 0.32, 0.045), circle(0, 0.5, 0.045)), 'face', '#3a3a4a', ['•']],
      [twigs, 'limb', '#a0703a', ['-', '~']],
      [snowHead, 'face', '#ffffff'],
      [snowBody, 'face', '#eef7ff'],
    ),
    {
      glow: '200, 235, 255',
      cheer: '#a6e4ff',
      floats: { chars: ['*', '✦'], colors: ['#ffffff', '#cfefff'] },
      face: (ctx, ft, t) => {
        cheeks(ctx, 0, 0.15, -0.3, 0.05);
        ctx.fillStyle = '#2a2a35';
        for (const x of [-0.09, 0.09]) {
          ctx.beginPath();
          ctx.arc(x, -0.43, 0.035, 0, Math.PI * 2);
          ctx.fill();
        }
        for (let i = 0; i < 5; i++) {
          const a = Math.PI * (0.25 + i * 0.125);
          ctx.beginPath();
          ctx.arc(Math.cos(a) * 0.12, -0.37 + Math.sin(a) * 0.12, 0.016, 0, Math.PI * 2);
          ctx.fill();
        }
        // a carrot nose
        ctx.fillStyle = '#ff8a3d';
        ctx.beginPath();
        ctx.moveTo(0, -0.38);
        ctx.lineTo(0.17, -0.35);
        ctx.lineTo(0, -0.32);
        ctx.fill();
        // a red scarf
        ctx.fillStyle = '#ff4d6a';
        ctx.beginPath();
        ctx.roundRect(-0.24, -0.12, 0.48, 0.08, 0.04);
        ctx.fill();
        ctx.beginPath();
        ctx.roundRect(0.08, -0.1, 0.08, 0.2 + 0.02 * Math.sin(t * 3), 0.03);
        ctx.fill();
        // and a top hat
        const dy = dropping(ft);
        if (dy !== null) placed(ctx, 0, -0.6 + dy, 0.36, 0.1, () => topHat(ctx, '#62b0ff'));
      },
    },
  ),
};

// ---------- the flame ----------

const flames = union(
  curve(
    [
      [0, 0.1],
      [0.08, -0.4],
      [0, -0.92],
    ],
    0.34,
    0.02,
  ),
  curve(
    [
      [-0.22, 0.12],
      [-0.4, -0.2],
      [-0.45, -0.58],
    ],
    0.2,
    0.02,
  ),
  curve(
    [
      [0.24, 0.12],
      [0.42, -0.22],
      [0.5, -0.55],
    ],
    0.2,
    0.02,
  ),
);
const flameBody = circle(0, 0.28, 0.48);
const flame: Design = {
  body: flameBody,
  limbs: flames,
  eyes: [
    [-0.17, 0.18],
    [0.17, 0.18],
  ],
  eyeR: 0.095,
  mouth: { y: 0.4, w: 0.18 },
  palette: { core: '#fffbe0', mid: '#ffb21f', ray: '#ff4a1f', glow: '255, 120, 40', eye: '#3df2ff' },
  heart: [0, 0.3, 0.24],
  glyphs: ['^', '*', '~', '#', '%', '&', '!', '?', '§', '∆', 'Ψ', '¤', '≈', '$'],
  sway: (_x, y, t) => [0.03 * Math.sin(t * 9 + y * 7) * Math.max(0, 0.2 - y), 0],
  friend: friend(regions([circle(0, 0.3, 0.24), 'face', '#fff5c2'], [flameBody, 'face', '#ffc94d'], [flames, 'limb', '#ff8a3d', ['^', '*']]), {
    glow: '255, 190, 110',
    cheer: '#ffb347',
    floats: { chars: ['♥', '✦'], colors: ['#ffb347', '#ffd77a', '#ff5c8a'], at: [0, -0.5] },
    face: (ctx, ft, t) => {
      cheeks(ctx, 0, 0.27, 0.32, 0.07);
      eyes(ctx, 0, 0.16, 0.2, 0.062, ft, t, 'happy');
      laugh(ctx, 0, 0.32, 0.09, 0.06);
      placed(ctx, 0.62, 0.86, 0.5 * popping(ft, 0.2), -0.75, () => marshmallow(ctx));
    },
    move: (c, _ft, t) => (c.part === 'limb' ? [c.x + 0.025 * Math.sin(t * 8 + c.y * 6) * (0.3 - c.y), c.y] : [c.x, c.y]),
  }),
};

// ---------- the swirling black hole, who gives back the stars ----------

/** which of its three arms a point is on, or -1 */
function armOf(x: number, y: number): number {
  const d = Math.hypot(x, y);
  if (d < 0.3 || d > 0.95) return -1;
  const a = Math.atan2(y, x) - 3.2 * d;
  if (Math.cos(3 * a) <= 0.4) return -1;
  return ((Math.round((a * 3) / (Math.PI * 2)) % 3) + 3) % 3;
}
const vortex: Design = {
  body: circle(0, 0, 0.34),
  limbs: (x, y) => armOf(x, y) >= 0,
  eyes: [
    [-0.13, -0.06],
    [0.13, -0.06],
  ],
  eyeR: 0.08,
  mouth: { y: 0.1, w: 0.13 },
  palette: { core: '#43207c', mid: '#7a4fd0', ray: '#d0a8ff', glow: '150, 80, 255', eye: '#ff3dd2' },
  heart: [0, 0, 0.2],
  // its arms go round
  sway: (x, y, t) => {
    const a = t * 0.5;
    return [x * Math.cos(a) - y * Math.sin(a) - x, x * Math.sin(a) + y * Math.cos(a) - y];
  },
  friend: friend(
    (x, y) => {
      const arm = armOf(x, y);
      if (arm >= 0) return { part: 'ray', color: ['#ff8fd0', '#6ad7ff', '#ffd77a'][arm], set: ['*', '+', '✦', '·'] };
      if (Math.hypot(x, y) <= 0.34) return { part: 'face', color: Math.hypot(x, y) < 0.18 ? '#fffbe8' : '#fff0b0', set: ROUND };
      return null;
    },
    {
      glow: '200, 170, 255',
      cheer: '#ffd77a',
      // all the stars it swallowed, given back
      floats: { chars: ['★', '✦', '·'], colors: ['#ffd77a', '#ffffff', '#6ad7ff', '#ff8fd0'] },
      face: (ctx, ft, t) => {
        cheeks(ctx, 0, 0.2, 0.06, 0.05);
        eyes(ctx, 0, 0.12, -0.05, 0.05, ft, t, 'stars');
        smile(ctx, 0, 0.0, 0.09);
      },
      move: (c, ft) => {
        if (c.part !== 'ray') return [c.x, c.y];
        const a = cheered(ft) ? 1.6 * (ft - 2.1) + 0.6 * 2.1 : 0.6 * ft;
        return [c.x * Math.cos(a) - c.y * Math.sin(a), c.x * Math.sin(a) + c.y * Math.cos(a)];
      },
    },
  ),
};

// ---------- the calculator ----------

const calcBody = box(0, 0.06, 0.46, 0.62, 0.08);
const calcScreen = box(0, -0.3, 0.36, 0.17, 0.03);
const calcLimbs = union(
  mirror(
    curve(
      [
        [0.46, 0.0],
        [0.66, -0.12],
        [0.78, -0.32],
      ],
      0.05,
    ),
  ),
  mirror(box(0.22, 0.78, 0.07, 0.11, 0.03)),
);
const KEYS = '789456123+0='.split('');
const calculator: Design = {
  body: calcBody,
  limbs: calcLimbs,
  eyes: [
    [-0.15, -0.32],
    [0.15, -0.32],
  ],
  eyeR: 0.08,
  pupil: 'square',
  mouth: { y: -0.12, w: 0.2, curve: 0 },
  palette: { core: '#d8ffe2', mid: '#6c7896', ray: '#ff9d4a', glow: '120, 255, 160', eye: '#ff2d2d' },
  heart: [0, -0.3, 0.3],
  glyphs: '0123456789+-×÷=%'.split(''),
  friend: friend(
    (x, y) => {
      if (calcScreen(x, y)) return { part: 'face', color: '#eafff0', set: ['·'] };
      if (calcBody(x, y)) {
        if (y > 0.0) {
          // its keys, each column its own colour
          const col = Math.round((x + 0.42) / 0.14);
          const row = Math.round((y - 0.07) / 0.14);
          return { part: 'face', color: ['#ff8fd0', '#ffd77a', '#7dff9a', '#6ad7ff', '#c49bff', '#ff9d4a', '#ff8fd0'][((col % 7) + 7) % 7], set: [KEYS[(((row * 3 + col) % 12) + 12) % 12]] };
        }
        return { part: 'face', color: '#8fd3ff', set: ROUND };
      }
      if (calcLimbs(x, y)) return { part: 'limb', color: '#8fd3ff', set: ROUND };
      return null;
    },
    {
      glow: '170, 230, 255',
      cheer: '#7dff9a',
      // math confetti
      floats: { chars: ['+', '×', '=', '✓', '%'], colors: RAINBOW },
      face: (ctx, ft, t) => {
        cheeks(ctx, 0, 0.22, -0.26, 0.04);
        eyes(ctx, 0, 0.12, -0.34, 0.045, ft, t, 'hearts', '#1d3557');
        smile(ctx, 0, -0.32, 0.07, '#1d3557', 0.022);
      },
    },
  ),
};

// ---------- the slime ----------

const slimeBody: Shape = (x, y) => (inEllipse(x, y, 0, 0.2, 0.62, 0.55, 0) && y < 0.58) || inEllipse(x, y, 0, 0.58, 0.78, 0.16, 0);
const slimeDrips = union(
  curve(
    [
      [-0.32, 0.62],
      [-0.34, 0.86],
    ],
    0.06,
    0.045,
  ),
  circle(-0.34, 0.88, 0.06),
  curve(
    [
      [0.2, 0.64],
      [0.21, 0.8],
    ],
    0.05,
    0.04,
  ),
  circle(0.21, 0.82, 0.055),
  circle(-0.6, -0.28, 0.08),
  circle(0.56, -0.34, 0.07),
  circle(0.1, -0.5, 0.06),
);
const slime: Design = {
  body: slimeBody,
  limbs: slimeDrips,
  eyes: [
    [-0.3, 0.05],
    [-0.08, -0.12],
    [0.16, -0.08],
    [0.36, 0.08],
  ],
  eyeR: 0.075,
  mouth: { y: 0.28, w: 0.2 },
  palette: { core: '#e9ffe0', mid: '#5ee05e', ray: '#2fa83a', glow: '110, 255, 90', eye: '#ff3dd2' },
  heart: [0, 0.2, 0.25],
  glyphs: ['~', 'o', '°', '@', '%', '&', '*', '#', 's', 'S', '≈', '?', '!', '¤'],
  sway: (x, _y, t) => [0, 0.03 * Math.sin(t * 3 + x * 5)],
  friend: friend(regions([ellipse(0, 0.12, 0.34, 0.3), 'face', '#ffd6ec'], [slimeBody, 'face', '#ff9ed2']), {
    glow: '255, 190, 230',
    cheer: '#ff8fd0',
    face: (ctx, ft, t) => {
      // a shine on the jelly
      ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
      ctx.beginPath();
      ctx.ellipse(-0.36, -0.12, 0.07, 0.13, 0.5, 0, Math.PI * 2);
      ctx.fill();
      cheeks(ctx, 0, 0.3, 0.22, 0.07);
      eyes(ctx, 0, 0.15, 0.08, 0.064, ft, t);
      laugh(ctx, 0, 0.2, 0.1, 0.07);
      // a cherry on top
      const s = popping(ft);
      if (s > 0) {
        placed(ctx, 0.04, -0.4, s, 0, () => {
          ctx.strokeStyle = '#4fd36a';
          ctx.lineWidth = 0.025;
          ctx.beginPath();
          ctx.moveTo(0, -0.04);
          ctx.quadraticCurveTo(0.02, -0.16, 0.1, -0.2);
          ctx.stroke();
          ctx.fillStyle = '#ff2d55';
          ctx.beginPath();
          ctx.arc(0, 0, 0.08, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
          ctx.beginPath();
          ctx.arc(-0.025, -0.025, 0.022, 0, Math.PI * 2);
          ctx.fill();
        });
      }
    },
    // a happy wobble
    move: (c, ft, t) => (cheered(ft) ? [c.x * (1 + 0.03 * Math.sin(t * 7)), c.y + (c.y - 0.6) * 0.03 * Math.sin(t * 7 + 1)] : [c.x, c.y]),
  }),
};

export const MONSTERS: Design[] = [
  ...CLASSICS,
  rabbit,
  ghost,
  octopus,
  fiveStar,
  robot,
  cat,
  stormCloud,
  comet,
  ringedPlanet,
  alien,
  jellyfish,
  owl,
  dragon,
  fish,
  moon,
  crab,
  bat,
  snowflake,
  flame,
  vortex,
  calculator,
  slime,
];
