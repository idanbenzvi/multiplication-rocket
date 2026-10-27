import { Canyon, clamp01, sunlight } from './field';

// The canyon, built a stretch at a time (a chunk, CHUNK long) as a mesh:
// a grid along the run and across it, dense where the walls rise and
// coarse out on the tableland, out to the horizon. Each point carries what
// the terrain's shader needs that would cost too much to work out per
// pixel: how much sun reaches it (the shadows, marched once, here, on every
// other point and filled in between), how open it is to the sky (deep in a
// crevice or at the canyon's bottom, less), the rock's layer (its height,
// tilted and wavering a little: the strata's colours) and how far across it
// is (the gates' number lines are painted on the floor by it).

/** how long a chunk is, along the run */
export const CHUNK = 96;

export type Quality = 'high' | 'low';

const SHAPES: Record<Quality, { rows: number; near: number; mid: number }> = {
  high: { rows: 60, near: 1.3, mid: 4 },
  low: { rows: 40, near: 2, mid: 6 },
};
/** the columns far out, to the horizon */
const FAR = [210, 270, 360, 500, 700, 1000];

/** the columns' places across (u), from one horizon to the other */
export function columns(q: Quality): number[] {
  const { near, mid } = SHAPES[q];
  const side: number[] = [];
  let u = near;
  for (; u < 66; u += near) side.push(u);
  for (u = 66; u < 172; u += mid) side.push(u);
  side.push(...FAR);
  return [...side.map((v) => -v).reverse(), 0, ...side];
}

export interface ChunkData {
  index: number;
  positions: Float32Array;
  normals: Float32Array;
  /** per point: sunlight, sky (ambient occlusion), the rock's layer, how far across */
  shade: Float32Array;
  indices: Uint16Array | Uint32Array;
}

export function buildChunk(c: Canyon, index: number, q: Quality): ChunkData {
  const cols = columns(q);
  const C = cols.length;
  const R = SHAPES[q].rows + 1;
  const step = CHUNK / SHAPES[q].rows;
  const d0 = index * CHUNK;
  // heights with a row either side (for the normals at the chunk's edges)
  const H = new Float64Array((R + 2) * C);
  const centers = new Float64Array(R + 2);
  for (let r = 0; r < R + 2; r++) {
    const d = d0 + (r - 1) * step;
    centers[r] = c.center(d);
    for (let k = 0; k < C; k++) H[r * C + k] = c.height(d, cols[k]);
  }
  const at = (r: number, k: number) => H[(r + 1) * C + Math.max(0, Math.min(C - 1, k))];

  const positions = new Float32Array(R * C * 3);
  const normals = new Float32Array(R * C * 3);
  const shade = new Float32Array(R * C * 4);
  for (let r = 0; r < R; r++) {
    const d = d0 + r * step;
    for (let k = 0; k < C; k++) {
      const i = r * C + k;
      positions[i * 3] = centers[r + 1] + cols[k];
      positions[i * 3 + 1] = at(r, k);
      positions[i * 3 + 2] = -d;
      // the normal, from the neighbours either side and before and after
      const k0 = Math.max(0, k - 1);
      const k1 = Math.min(C - 1, k + 1);
      const ax = centers[r + 1] + cols[k1] - (centers[r + 1] + cols[k0]);
      const ay = at(r, k1) - at(r, k0);
      const bx = centers[r + 2] - centers[r];
      const by = at(r + 1, k) - at(r - 1, k);
      const bz = -2 * step;
      // (across × along)
      let nx = ay * bz;
      let ny = -ax * bz;
      let nz = ax * by - ay * bx;
      const n = Math.hypot(nx, ny, nz) || 1;
      nx /= n;
      ny /= n;
      nz /= n;
      normals[i * 3] = nx;
      normals[i * 3 + 1] = ny;
      normals[i * 3 + 2] = nz;
      // how open to the sky: a hollow's darker, and so is low down between the walls
      let around = 0;
      for (const [dr, dk] of [[0, -3], [0, 3], [-3, 0], [3, 0]]) around += at(Math.max(-1, Math.min(R, r + dr)), k + dk);
      const hollow = clamp01(1 - Math.max(0, around / 4 - at(r, k)) * 0.09);
      const open = clamp01((at(r, k) - c.floor(d)) / c.depth(d));
      shade[i * 4 + 1] = hollow * (0.52 + 0.48 * Math.sqrt(open));
      // the rock's layers: by height, dipping gently along the run and wavering
      shade[i * 4 + 2] = at(r, k) + d * 0.012 + 3.2 * Math.sin(d * 0.013 + cols[k] * 0.021) * Math.cos(d * 0.0041 - cols[k] * 0.009);
      shade[i * 4 + 3] = cols[k];
    }
  }

  // the sun's shadows: marched on every other point, filled in between
  const sun = (r: number, k: number) => {
    const i = r * C + k;
    // (lifted a hair off the ground, so it doesn't shadow itself)
    return sunlight(c, [positions[i * 3] + normals[i * 3] * 0.4, positions[i * 3 + 1] + normals[i * 3 + 1] * 0.4, positions[i * 3 + 2] + normals[i * 3 + 2] * 0.4]);
  };
  const lit = new Float32Array(R * C).fill(-1);
  for (let r = 0; r < R; r += 2) for (let k = 0; k < C; k += 2) lit[r * C + k] = sun(r, k);
  // (the last row and column, if the step skipped them)
  if ((R - 1) % 2) for (let k = 0; k < C; k += 2) lit[(R - 1) * C + k] = sun(R - 1, k);
  if ((C - 1) % 2) for (let r = 0; r < R; r += 2) lit[r * C + C - 1] = sun(r, C - 1);
  if ((R - 1) % 2 && (C - 1) % 2) lit[R * C - 1] = sun(R - 1, C - 1);
  const known = (r: number, k: number) => lit[r * C + k];
  for (let r = 0; r < R; r++) {
    for (let k = 0; k < C; k++) {
      const i = r * C + k;
      if (lit[i] >= 0) continue;
      // between marched ones: their average (a row's, a column's, or the four round it)
      const rs = r % 2 ? [r - 1, Math.min(R - 1, r + 1)] : [r];
      const ks = k % 2 ? [k - 1, Math.min(C - 1, k + 1)] : [k];
      let sum = 0;
      let n = 0;
      for (const rr of rs) for (const kk of ks) {
        const v = known(rr, kk);
        if (v >= 0) {
          sum += v;
          n++;
        }
      }
      lit[i] = n ? sum / n : sun(r, k);
    }
  }
  for (let i = 0; i < R * C; i++) shade[i * 4] = lit[i];

  const count = (R - 1) * (C - 1) * 6;
  const indices = R * C > 65535 ? new Uint32Array(count) : new Uint16Array(count);
  let o = 0;
  for (let r = 0; r < R - 1; r++) {
    for (let k = 0; k < C - 1; k++) {
      const a = r * C + k;
      const b = a + 1;
      const e = a + C;
      const f = e + 1;
      // (wound to face up, seen from above)
      indices[o++] = a;
      indices[o++] = b;
      indices[o++] = e;
      indices[o++] = b;
      indices[o++] = f;
      indices[o++] = e;
    }
  }
  return { index, positions, normals, shade, indices };
}
