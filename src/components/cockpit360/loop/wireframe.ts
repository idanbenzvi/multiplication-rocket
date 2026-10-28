import type { ShipId } from '../../scene/ships';
import type { V3 } from './story';

// The pilot's ship as a wireframe, for the loop's blueprint (LoopShow.tsx):
// line segments in the ship's own frame (x to its right, y up out of its
// canopy, z out of its nose), built as a lathe is turned, a profile swept
// round its axis (its meridians and its rings), with what isn't round added
// on: the classic rocket's three fins and porthole; the Explorer's egg, its
// visor, its four swept legs and its engine bell; Venus's rounder egg, her
// great round window, her curving legs and the filigree round her middle.
// Every ship comes out the same length (LENGTH), its middle at the origin.

export const LENGTH = 2.1;

export interface ShipModel {
  /** the hull and what's on it (the glowing cyan lines), the trim (windows, light lines), the engine (orange) */
  hull: Float32Array;
  trim: Float32Array;
  hot: Float32Array;
  /** where the pilot sits (their window), the engine's nozzle, and the side thrusters under the belly */
  window: V3;
  nozzle: V3;
  belly: V3[];
}

/** a profile: [radius, z] from the tail to the nose */
type Profile = Array<[number, number]>;

class Lines {
  hull: number[] = [];
  trim: number[] = [];
  hot: number[] = [];
  line(to: 'hull' | 'trim' | 'hot', pts: V3[], closed = false) {
    const out = this[to];
    const n = closed ? pts.length : pts.length - 1;
    for (let i = 0; i < n; i++) out.push(...pts[i], ...pts[(i + 1) % pts.length]);
  }
}

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
/** a point at radius r, round the axis by `a` (from the right, towards the top), at z */
const at = (r: number, a: number, z: number): V3 => [r * Math.cos(a), r * Math.sin(a), z];

/** the radius of a profile at z (between its points) */
function radiusAt(p: Profile, z: number): number {
  if (z <= p[0][1]) return p[0][0];
  for (let i = 1; i < p.length; i++) {
    if (z <= p[i][1]) {
      const k = (z - p[i - 1][1]) / (p[i][1] - p[i - 1][1]);
      return p[i - 1][0] + (p[i][0] - p[i - 1][0]) * k;
    }
  }
  return p[p.length - 1][0];
}

/** a profile turned round: `meridians` lines from tail to nose, and a ring at each of its points */
function lathe(l: Lines, to: 'hull' | 'hot', p: Profile, meridians: number, ringSides = 28) {
  for (let m = 0; m < meridians; m++) {
    const a = (m / meridians) * TAU + Math.PI / 2;
    l.line(to, p.map(([r, z]) => at(r, a, z)));
  }
  for (const [r, z] of p) {
    if (r < 0.01) continue;
    l.line(to, Array.from({ length: ringSides }, (_, i) => at(r, (i / ringSides) * TAU, z)), true);
  }
}

/** a ring round the hull at z (a band of light), just proud of it */
function band(l: Lines, p: Profile, z: number, sides = 36) {
  const r = radiusAt(p, z) * 1.01;
  l.line('trim', Array.from({ length: sides }, (_, i) => at(r, (i / sides) * TAU, z)), true);
}

/** a window on the hull, round the axis by `a` at z: an ellipse `across` wide round the hull and `along` tall along it */
function windowOn(l: Lines, p: Profile, a: number, z: number, across: number, along: number, sides = 28) {
  l.line(
    'trim',
    Array.from({ length: sides }, (_, i) => {
      const t = (i / sides) * TAU;
      const zz = z + along * Math.sin(t);
      const r = radiusAt(p, zz) * 1.012;
      return at(r, a + (across * Math.cos(t)) / Math.max(r, 0.05), zz);
    }),
    true,
  );
}

/** something flat off the hull (a fin, a leg) in the plane round the axis by `a`: its outline as [out from the axis, z] */
function flat(l: Lines, to: 'hull' | 'trim' | 'hot', a: number, pts: Array<[number, number]>, closed = false) {
  l.line(
    to,
    pts.map(([d, z]) => at(d, a, z)),
    closed,
  );
}

function classic(l: Lines): Profile {
  const body: Profile = [
    [0.28, -1.18],
    [0.36, -0.95],
    [0.4, -0.55],
    [0.41, -0.1],
    [0.39, 0.3],
    [0.33, 0.62],
    [0.23, 0.9],
    [0.11, 1.12],
    [0, 1.25],
  ];
  lathe(l, 'hull', body, 12);
  lathe(l, 'hot', [
    [0.14, -1.18],
    [0.2, -1.3],
    [0.27, -1.42],
  ], 10, 20);
  // the stripe round its middle, and its porthole up top, ringed twice
  band(l, body, -0.68);
  band(l, body, -0.6);
  windowOn(l, body, 90 * DEG, 0.3, 0.2, 0.18);
  windowOn(l, body, 90 * DEG, 0.3, 0.13, 0.12);
  // three swept fins, one standing up as a tail fin
  for (const a of [90, 210, 330]) {
    const fin: Array<[number, number]> = [
      [0.39, -0.45],
      [0.8, -1.02],
      [0.82, -1.34],
      [0.32, -1.08],
    ];
    flat(l, 'hull', a * DEG, fin, true);
    flat(l, 'trim', a * DEG, [
      [0.39, -0.62],
      [0.7, -1.1],
    ]);
  }
  return body;
}

function explorer(l: Lines): Profile {
  const body: Profile = [
    [0.3, -0.95],
    [0.5, -0.8],
    [0.6, -0.55],
    [0.64, -0.2],
    [0.62, 0.15],
    [0.55, 0.45],
    [0.42, 0.72],
    [0.24, 0.92],
    [0, 1.02],
  ];
  lathe(l, 'hull', body, 14);
  lathe(l, 'hot', [
    [0.2, -0.9],
    [0.27, -1.05],
    [0.35, -1.22],
  ], 10, 20);
  // the navy nose's edge, the light lines round its middle, and the visor
  band(l, body, 0.72);
  band(l, body, -0.22);
  band(l, body, -0.14);
  windowOn(l, body, 90 * DEG, 0.25, 0.34, 0.25);
  windowOn(l, body, 90 * DEG, 0.25, 0.27, 0.19);
  // four swept legs, orange-tipped
  for (const a of [45, 135, 225, 315]) {
    flat(l, 'hull', a * DEG, [
      [0.58, -0.4],
      [0.86, -0.85],
      [0.98, -1.2],
    ]);
    flat(l, 'hull', a * DEG, [
      [0.6, -0.62],
      [0.84, -0.9],
    ]);
    flat(l, 'hot', a * DEG, [
      [0.9, -1.24],
      [1.08, -1.2],
    ]);
  }
  return body;
}

function venus(l: Lines): Profile {
  const body: Profile = [
    [0.32, -0.92],
    [0.52, -0.78],
    [0.64, -0.5],
    [0.68, -0.12],
    [0.65, 0.22],
    [0.56, 0.52],
    [0.4, 0.78],
    [0.2, 0.95],
    [0, 1.02],
  ];
  lathe(l, 'hull', body, 14);
  lathe(l, 'hot', [
    [0.22, -0.88],
    [0.27, -1.0],
    [0.33, -1.15],
  ], 10, 20);
  // her great round window in its frame
  windowOn(l, body, 90 * DEG, 0.2, 0.36, 0.34);
  windowOn(l, body, 90 * DEG, 0.2, 0.29, 0.28);
  windowOn(l, body, 90 * DEG, 0.2, 0.22, 0.21);
  // the filigree scrolling round her middle
  const sides = 96;
  l.line(
    'trim',
    Array.from({ length: sides }, (_, i) => {
      const a = (i / sides) * TAU;
      const z = -0.42 + 0.06 * Math.sin(a * 6);
      return at(radiusAt(body, z) * 1.01, a, z);
    }),
    true,
  );
  // four legs curving down
  for (const a of [45, 135, 225, 315]) {
    flat(l, 'hull', a * DEG, [
      [0.62, -0.35],
      [0.82, -0.6],
      [0.92, -0.9],
      [0.88, -1.18],
    ]);
    flat(l, 'hot', a * DEG, [
      [0.88, -1.18],
      [1.0, -1.24],
    ]);
  }
  return body;
}

const cache = new Map<ShipId, ShipModel>();

/** the pilot's ship as a wireframe */
export function shipModel(ship: ShipId): ShipModel {
  const hit = cache.get(ship);
  if (hit) return hit;
  const l = new Lines();
  const body = ship === 'explorer' ? explorer(l) : ship === 'nova' ? venus(l) : classic(l);
  const all = [...l.hull, ...l.trim, ...l.hot];
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 2; i < all.length; i += 3) {
    lo = Math.min(lo, all[i]);
    hi = Math.max(hi, all[i]);
  }
  // (the same length for every ship, its middle at the origin)
  const k = LENGTH / (hi - lo);
  const mid = (lo + hi) / 2;
  const fit = (arr: number[]) => Float32Array.from(arr, (v, i) => (i % 3 === 2 ? (v - mid) * k : v * k));
  const point = ([x, y, z]: V3): V3 => [x * k, y * k, (z - mid) * k];
  const windowZ = ship === 'explorer' ? 0.25 : ship === 'nova' ? 0.2 : 0.3;
  const model: ShipModel = {
    hull: fit(l.hull),
    trim: fit(l.trim),
    hot: fit(l.hot),
    window: point([0, radiusAt(body, windowZ), windowZ]),
    nozzle: point([0, 0, lo]),
    belly: [0.5, -0.45].map((z) => point([0, -radiusAt(body, z), z])),
  };
  cache.set(ship, model);
  return model;
}
