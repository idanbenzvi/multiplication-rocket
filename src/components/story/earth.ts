import type { Point } from '../arrival/eclipse';
import { glow, rgba } from '../traffic/trafficArt';
import { TAU, clamp01, seeded } from './storyMath';

// Earth, in the story, as Kurzgesagt draws it: flat bright colours, a blue
// sea, rounded green lands with their deserts and ice, flat white clouds, a
// light blue haze round its edge, its night side shaded in a few soft bands,
// and its cities' lights there. It's a ball: the lands are kept in longitude
// and latitude and turned and seen as from far off (an orthographic view),
// so they come round its edge as it turns. The opening sees all of it; the
// launch sees its night side, close up (`nightSide`).
//
// Turned "into view": x is right, y up and z out of the screen at you.

export type V3 = [number, number, number];
/** a turn, row by row */
export type M3 = [number, number, number, number, number, number, number, number, number];

const DEG = Math.PI / 180;

/** a place on Earth (degrees) as a point on a ball of radius one */
function onBall(lon: number, lat: number): V3 {
  const c = Math.cos(lat * DEG);
  return [c * Math.sin(lon * DEG), Math.sin(lat * DEG), c * Math.cos(lon * DEG)];
}

function times(a: M3, b: M3): M3 {
  const m = new Array(9).fill(0) as M3;
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) m[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
  return m;
}

function apply(m: M3, v: V3): V3 {
  return [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
}

export function unit(v: V3): V3 {
  const d = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / d, v[1] / d, v[2] / d];
}

/** turned `spin` round its poles, its north pole nodded `nod` towards you, then leant `lean` (radians) */
export function turned(spin: number, nod: number, lean: number): M3 {
  const [cy, sy] = [Math.cos(spin), Math.sin(spin)];
  const [cx, sx] = [Math.cos(nod), Math.sin(nod)];
  const [cz, sz] = [Math.cos(lean), Math.sin(lean)];
  const y: M3 = [cy, 0, sy, 0, 1, 0, -sy, 0, cy];
  const x: M3 = [1, 0, 0, 0, cx, -sx, 0, sx, cx];
  const z: M3 = [cz, -sz, 0, sz, cz, 0, 0, 0, 1];
  return times(z, times(x, y));
}

/** turned so the place at `lon`, `lat` is at `to` (a point on the ball, into view) */
export function bringing(lon: number, lat: number, to: V3): M3 {
  const p = onBall(lon, lat);
  const q = unit(to);
  const k = unit([p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]]);
  const c = p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
  const s = Math.sqrt(Math.max(0, 1 - c * c));
  const [x, y, z] = k;
  const v = 1 - c;
  return [c + x * x * v, x * y * v - z * s, x * z * v + y * s, y * x * v + z * s, c + y * y * v, y * z * v - x * s, z * x * v - y * s, z * y * v + x * s, c + z * z * v];
}

// ---------- its lands ----------

type LonLat = Array<[number, number]>;

/** rounded off, as Kurzgesagt's are (each corner cut, twice) */
function rounded(pts: LonLat): LonLat {
  let out = pts;
  for (let pass = 0; pass < 2; pass++) {
    const next: LonLat = [];
    out.forEach((p, i) => {
      const q = out[(i + 1) % out.length];
      next.push([p[0] * 0.75 + q[0] * 0.25, p[1] * 0.75 + q[1] * 0.25], [p[0] * 0.25 + q[0] * 0.75, p[1] * 0.25 + q[1] * 0.75]);
    });
    out = next;
  }
  return out;
}

// (roughly; simpler than the real ones)
const LANDS: LonLat[] = [
  // the Americas
  [[-168, 66], [-156, 71], [-125, 70], [-95, 72], [-80, 68], [-64, 60], [-56, 52], [-66, 45], [-71, 41], [-76, 35], [-81, 31], [-80, 26], [-84, 30], [-90, 29], [-97, 26], [-97, 20], [-91, 16], [-84, 10], [-80, 8], [-86, 14], [-95, 16], [-105, 20], [-110, 24], [-117, 32], [-123, 39], [-124, 46], [-131, 54], [-140, 60], [-152, 59], [-165, 61]],
  [[-80, 9], [-72, 12], [-62, 10], [-52, 4], [-45, -1], [-35, -6], [-39, -14], [-41, -22], [-48, -26], [-53, -34], [-58, -38], [-65, -42], [-68, -50], [-71, -54], [-74, -50], [-74, -40], [-71, -30], [-71, -18], [-76, -13], [-81, -5], [-80, 1]],
  // Africa, and Madagascar
  [[-17, 21], [-16, 28], [-9, 33], [-5, 36], [10, 37], [11, 33], [20, 31], [32, 31], [35, 28], [39, 20], [43, 12], [51, 11], [48, 4], [41, -2], [40, -11], [40, -16], [35, -24], [32, -29], [27, -34], [19, -35], [17, -28], [12, -18], [13, -8], [9, -1], [9, 4], [4, 6], [-5, 5], [-10, 6], [-14, 10], [-17, 15]],
  [[44, -13], [50, -15], [49, -24], [44, -25], [43, -18]],
  // Europe and Asia
  [[-10, 37], [-9, 44], [-1, 47], [2, 51], [8, 55], [5, 59], [12, 66], [25, 71], [45, 68], [70, 73], [100, 77], [130, 72], [160, 70], [178, 65], [160, 58], [155, 50], [141, 47], [130, 42], [122, 31], [120, 23], [108, 20], [106, 10], [100, 4], [98, 15], [90, 22], [80, 10], [73, 20], [62, 25], [57, 24], [52, 17], [44, 12], [36, 30], [28, 36], [22, 37], [15, 40], [8, 44], [0, 40]],
  [[-5, 50], [1, 51], [-1, 55], [-3, 58], [-6, 57], [-4, 53]],
  [[130, 31], [136, 34], [141, 38], [142, 43], [140, 41], [136, 36]],
  // the islands down to Australia, and New Zealand
  [[95, 5], [105, -6], [115, -8], [120, -9], [110, -3], [104, -1]],
  [[109, 1], [117, 7], [119, 1], [116, -4], [110, -3]],
  [[131, -1], [141, -3], [150, -10], [141, -9], [134, -4]],
  [[114, -22], [122, -18], [130, -12], [137, -12], [142, -11], [146, -19], [153, -25], [151, -33], [146, -39], [140, -38], [135, -34], [129, -32], [118, -35], [115, -33]],
  [[172, -35], [178, -38], [174, -41], [171, -45], [167, -46], [173, -41]],
].map((l) => rounded(l as LonLat));

const DESERTS: LonLat[] = [
  [[-14, 18], [-8, 27], [5, 30], [20, 29], [32, 27], [34, 20], [25, 16], [12, 15], [0, 15]],
  [[38, 26], [47, 28], [56, 22], [52, 17], [44, 15]],
  [[120, -22], [133, -20], [141, -25], [136, -30], [124, -29]],
  [[90, 42], [105, 45], [115, 42], [105, 38], [94, 39]],
].map((l) => rounded(l as LonLat));

/** the ice: round each pole, and Greenland */
const ICE: LonLat[] = [
  rounded(Array.from({ length: 24 }, (_, i) => [i * 15 - 180, 73 + 3 * Math.sin(i * 1.7)] as [number, number])),
  rounded(Array.from({ length: 24 }, (_, i) => [180 - i * 15, -68 - 3 * Math.sin(i * 2.3)] as [number, number])),
  rounded([[-55, 60], [-43, 60], [-22, 70], [-18, 77], [-30, 83], [-55, 82], [-70, 77], [-60, 70]]),
];

/** the shapes as points on the ball (worked out once) */
const ball = (shapes: LonLat[]) => shapes.map((s) => s.map(([lon, lat]) => onBall(lon, lat)));
let shapes: { lands: V3[][]; deserts: V3[][]; ice: V3[][] } | null = null;
const SHAPES = () => (shapes ??= { lands: ball(LANDS), deserts: ball(DESERTS), ice: ball(ICE) });

function inside(lon: number, lat: number, poly: LonLat): boolean {
  let yes = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) yes = !yes;
  }
  return yes;
}

// ---------- its clouds and its cities ----------

/** the clouds: puffs in a row, along the stormy latitudes (each a place, and its radius in degrees) */
let clouds: Array<Array<{ at: V3; r: number }>> | null = null;
function CLOUDS() {
  if (clouds) return clouds;
  const rnd = seeded(31);
  clouds = Array.from({ length: 30 }, (_, i) => {
    const band = [48, -46, 8, 30, -28, 62, -60][i % 7];
    const lat = band + (rnd() - 0.5) * 14;
    const lon = rnd() * 360 - 180;
    const puffs = 3 + Math.floor(rnd() * 4);
    return Array.from({ length: puffs }, (_, k) => ({ at: onBall(lon + k * (5 + rnd() * 3), lat + (rnd() - 0.5) * 4), r: (3 + rnd() * 4) * (k === 0 || k === puffs - 1 ? 0.7 : 1) }));
  });
  return clouds;
}

/** the cities' lights: crowded round the great cities, and sprinkled over the rest of the land */
let cities: Array<{ at: V3; size: number; rate: number; phase: number }> | null = null;
const HUBS: Array<[number, number]> = [
  [-75, 40], [-87, 41], [-118, 34], [-99, 19], [-46, -23], [-58, -34], [-43, -22], [0, 51], [2, 48], [13, 52], [12, 42], [37, 55], [31, 30], [3, 6], [28, -26], [36, -1], [77, 28], [72, 19], [88, 22], [80, 13],
  [116, 40], [121, 31], [113, 23], [127, 37], [139, 35], [106, -6], [100, 14], [151, -34], [145, -38], [-122, 47], [-80, 26], [-96, 32], [46, 24], [51, 35], [29, 41], [-3, 40], [21, 52], [-70, -33], [-77, -12], [-74, 4],
];
function CITIES() {
  if (cities) return cities;
  const rnd = seeded(77);
  const land = LANDS.slice(0, 11);
  cities = [];
  let tries = 0;
  while (cities.length < 640 && tries++ < 14000) {
    const near = rnd() < 0.62;
    const hub = HUBS[Math.floor(rnd() * HUBS.length)];
    const lon = near ? hub[0] + (rnd() + rnd() - 1) * 7 : rnd() * 360 - 180;
    const lat = near ? hub[1] + (rnd() + rnd() - 1) * 5 : rnd() * 130 - 55;
    if (!land.some((l) => inside(lon, lat, l))) continue;
    cities.push({ at: onBall(lon, lat), size: near ? 0.6 + rnd() * 0.8 : 0.35 + rnd() * 0.5, rate: 1 + rnd() * 4, phase: rnd() * TAU });
  }
  return cities;
}

// ---------- drawing ----------

/** a shape's outline as seen, round the ball at `c` of radius `r` (what's round the back is pressed to its edge); whether any of it's in sight */
function outline(ctx: CanvasRenderingContext2D, c: Point, r: number, m: M3, pts: V3[]): boolean {
  let seen = false;
  ctx.beginPath();
  pts.forEach((p, i) => {
    const v = apply(m, p);
    let x = v[0];
    let y = v[1];
    if (v[2] < 0) {
      const d = Math.hypot(x, y) || 1;
      x /= d;
      y /= d;
    } else seen = true;
    if (i === 0) ctx.moveTo(c.x + x * r, c.y - y * r);
    else ctx.lineTo(c.x + x * r, c.y - y * r);
  });
  ctx.closePath();
  return seen;
}

function fillShapes(ctx: CanvasRenderingContext2D, c: Point, r: number, m: M3, list: V3[][], color: string) {
  ctx.fillStyle = color;
  for (const pts of list) if (outline(ctx, c, r, m, pts)) ctx.fill();
}

/**
 * The part of the ball facing away from `light` (a direction into view):
 * between its edge and the shadow's line, a half-ellipse as seen. `edge`
 * moves that line: further round into the dark (below 0), or the light.
 */
function shadow(ctx: CanvasRenderingContext2D, c: Point, r: number, light: V3, edge: number) {
  const lz = Math.max(-0.98, Math.min(0.98, light[2] + edge));
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.rotate(Math.atan2(-light[1], light[0]));
  ctx.beginPath();
  ctx.arc(0, 0, r, Math.PI / 2, (3 * Math.PI) / 2);
  ctx.ellipse(0, 0, Math.abs(lz) * r, r, 0, (3 * Math.PI) / 2, Math.PI / 2, lz >= 0);
  ctx.fill();
  ctx.restore();
}

/** its clouds, flat white puffs (as seen, squashed towards its edge) */
function drawClouds(ctx: CanvasRenderingContext2D, c: Point, r: number, m: M3, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (const cloud of CLOUDS()) {
    for (const puff of cloud) {
      const v = apply(m, puff.at);
      if (v[2] <= 0.02) continue;
      const pr = Math.sin(puff.r * DEG) * r;
      const x = c.x + v[0] * r;
      const y = c.y - v[1] * r;
      const out = Math.atan2(-v[1], v[0]);
      ctx.moveTo(x + Math.cos(out) * pr * v[2], y + Math.sin(out) * pr * v[2]);
      ctx.ellipse(x, y, pr * v[2], pr, out, 0, TAU);
    }
  }
  ctx.fill();
}

/** the cities' lights: those in sight and in the dark (`dark` says how dark it is at a point, 0 to 1), twinkling, and some out */
function drawCities(ctx: CanvasRenderingContext2D, c: Point, r: number, m: M3, size: number, time: number, outage: number, calm: boolean, dark: (v: V3) => number, view?: { w: number; h: number }) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const lamp = glow('#ffc86a');
  // (each lamp's own transform set outright: hundreds of saves, turns and restores a frame cost more than the lamps)
  const base = ctx.getTransform();
  CITIES().forEach((city, i) => {
    const v = apply(m, city.at);
    if (v[2] <= 0) return;
    const x = c.x + v[0] * r;
    const y = c.y - v[1] * r;
    if (view && (x < -20 || y < -20 || x > view.w + 20 || y > view.h + 20)) return;
    const k = dark(v);
    if (k <= 0.02) return;
    // (going out, more and more of them, flickering)
    const on = calm ? 1 : Math.sin(time * city.rate + city.phase) > outage * 0.95 - 0.55 ? 1 : 0.08;
    const tw = calm ? 0.85 : 0.7 + 0.3 * Math.sin(time * city.rate * 0.7 + i);
    const s = size * city.size * tw * on;
    if (s < 0.4) return;
    ctx.globalAlpha = Math.min(1, k * 1.4);
    // (squashed towards the edge, as everything on it is: along the way out from its middle)
    const len = Math.hypot(v[0], v[1]) || 1;
    const cos = v[0] / len;
    const sin = -v[1] / len;
    const squash = Math.max(0.25, v[2]);
    const a = cos * squash;
    const b = sin * squash;
    ctx.setTransform(base.a * a + base.c * b, base.b * a + base.d * b, base.c * cos - base.a * sin, base.d * cos - base.b * sin, base.a * x + base.c * y + base.e, base.b * x + base.d * y + base.f);
    ctx.drawImage(lamp, -s, -s, s * 2, s * 2);
  });
  ctx.restore();
}

export interface GlobeLook {
  /** how its lands are turned into view, and its clouds (they drift a little faster) */
  lands: M3;
  clouds: M3;
  /** towards the light (into view) */
  light: V3;
  /** how far its day side has dimmed (0 to 1): the Sun gone dark */
  dim: number;
  /** seconds, for the cities' twinkle; how many of their lights have gone out (0 to 1) */
  time: number;
  outage: number;
  calm: boolean;
}

/** the whole Earth, at `c` with radius `r`, lit from `light` */
export function drawGlobe(ctx: CanvasRenderingContext2D, c: Point, r: number, look: GlobeLook) {
  const { lands, light } = look;
  const day = 1 - look.dim;
  const { lands: land, deserts, ice } = SHAPES();
  // its haze, glowing round it
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const air = ctx.createRadialGradient(c.x, c.y, r * 0.98, c.x, c.y, r * 1.24);
  air.addColorStop(0, rgba('#8fdcff', 0.5 * (0.4 + 0.6 * day)));
  air.addColorStop(0.2, rgba('#4f9dff', 0.2));
  air.addColorStop(1, rgba('#3a5cff', 0));
  ctx.fillStyle = air;
  ctx.fillRect(c.x - r * 1.3, c.y - r * 1.3, r * 2.6, r * 2.6);
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.arc(c.x, c.y, r, 0, TAU);
  ctx.clip();
  // the sea, a little lighter towards the light
  const sea = ctx.createRadialGradient(c.x + light[0] * r * 0.4, c.y - light[1] * r * 0.4, 0, c.x, c.y, r);
  sea.addColorStop(0, '#3d9cf5');
  sea.addColorStop(0.6, '#2479dc');
  sea.addColorStop(1, '#1a5cc0');
  ctx.fillStyle = sea;
  ctx.fillRect(c.x - r, c.y - r, r * 2, r * 2);
  fillShapes(ctx, c, r, lands, land, '#5cc24f');
  fillShapes(ctx, c, r, lands, deserts, '#e9c665');
  fillShapes(ctx, c, r, lands, ice, '#f2f9ff');
  drawClouds(ctx, c, r, look.clouds, 'rgba(255, 255, 255, 0.9)');
  // the haze just inside its edge, and a soft shine on its lit side
  const inner = ctx.createRadialGradient(c.x, c.y, r * 0.78, c.x, c.y, r);
  inner.addColorStop(0, 'rgba(150, 220, 255, 0)');
  inner.addColorStop(1, `rgba(170, 228, 255, ${0.5 * (0.5 + 0.5 * day)})`);
  ctx.fillStyle = inner;
  ctx.fillRect(c.x - r, c.y - r, r * 2, r * 2);
  ctx.fillStyle = `rgba(255, 255, 255, ${0.1 * day})`;
  shadow(ctx, c, r, [-light[0], -light[1], 0], 0.72);
  // its night side, in a few soft bands
  ctx.fillStyle = 'rgba(8, 10, 44, 0.3)';
  for (const edge of [0.14, 0.04, -0.06, -0.18]) shadow(ctx, c, r, light, edge);
  // (and all of it dimmer, once the Sun's gone dark)
  if (look.dim > 0) {
    ctx.fillStyle = `rgba(16, 10, 50, ${0.5 * look.dim})`;
    ctx.fillRect(c.x - r, c.y - r, r * 2, r * 2);
  }
  ctx.restore();
  drawCities(ctx, c, r, lands, Math.max(2, r * 0.035), look.time, look.outage, look.calm, (v) => clamp01((-(v[0] * light[0] + v[1] * light[1] + v[2] * light[2]) + 0.1) * 3) + 0.25 * look.dim);

  // a fine bright line round its edge
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = rgba('#bfefff', 0.25 + 0.35 * day);
  ctx.lineWidth = Math.max(1, r * 0.016);
  ctx.beginPath();
  ctx.arc(c.x, c.y, r * 1.004, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

export interface NightLook {
  lands: M3;
  /** seconds, for the cities' twinkle */
  time: number;
  calm: boolean;
  /** how big a city's lights are, in px */
  lamp: number;
  /** the screen (only the cities on it are drawn) */
  w: number;
  h: number;
}

/** Earth's night side, close up (inside its edge, already clipped to it): its dark lands and seas, and its cities alight */
export function drawNightSide(ctx: CanvasRenderingContext2D, c: Point, r: number, look: NightLook) {
  const { lands: land, ice } = SHAPES();
  fillShapes(ctx, c, r, look.lands, land, '#19204d');
  fillShapes(ctx, c, r, look.lands, ice, '#262c5e');
  drawClouds(ctx, c, r, look.lands, 'rgba(70, 82, 150, 0.22)');
  drawCities(ctx, c, r, look.lands, look.lamp, look.time, 0, look.calm, () => 1, { w: look.w, h: look.h });
}
