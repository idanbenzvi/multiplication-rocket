import { fbm, perlin, ridged, seeded, type Noise2 } from './noise';

// The canyon of a Canyon Run, as a height for every point: a heightfield,
// which is how procedural terrain is usually made, from layered noise
// (fBm). A canyon is carved into it along a winding path, the walls cut
// into ledges as sandstone erodes (terracing), their foot wandering out
// under noise (Quilez's domain warping) and creased by gullies (Musgrave's
// ridged multifractal); its floor is sand in dunes, and out on the
// tableland above, mesas and buttes stand in the haze. Here and there a
// spire of rock stands in the canyon, to be flown round. Where a gate's
// number line spans the canyon, it widens and its floor smooths out.
//
// Its coordinates: `d`, how far along the run (the world's -z); `u`, how
// far across from the canyon's middle (the world's x, less the path's).
// The ship flies along d and steers across u.

export type Vec3 = [number, number, number];

/** how high the ship flies over the canyon's floor */
export const HOVER = 8;
/** the canyon's half-width at a gate, wall to wall */
export const GATE_HALF = 37;
/** the most the terrain rises (where the sun's rays can stop looking) */
export const MAX_HEIGHT = 150;

const normalize = ([x, y, z]: Vec3): Vec3 => {
  const n = Math.hypot(x, y, z);
  return [x / n, y / n, z / n];
};

/** where the sun is: low ahead, a little to the right, so the canyon's bends swing it in and out of the walls' shadow */
export const SUN: Vec3 = normalize([0.26, 0.245, -0.934]);

export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
/** 0 at a, 1 at b, smoothly between */
export const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** cut a height into ledges `step` high: flat for most of each step, then a steep rise to the next */
export function terrace(h: number, step: number): number {
  const k = h / step;
  const i = Math.floor(k);
  return (i + smooth(0.55, 1, k - i)) * step;
}

/** a spire of rock standing in the canyon: where, how wide and how tall */
export interface Spire {
  d: number;
  u: number;
  r: number;
  h: number;
}

export interface CanyonSpec {
  seed: number;
  /** where along the run each gate spans the canyon */
  gates: number[];
  /** where the run ends (the ship climbs out) */
  end: number;
}

/** the path's bends: how far each swings the canyon (units), and how long it is (units per radian) */
const BENDS: Array<[number, number]> = [
  [56, 240],
  [21, 108],
  [6.5, 50],
];
const SPIRE_BIN = 40;

export class Canyon {
  readonly seed: number;
  readonly gates: number[];
  readonly end: number;
  readonly spires: Spire[] = [];
  private readonly bins = new Map<number, Spire[]>();
  private readonly phase: number[];
  private readonly origin: number;
  private readonly n1: Noise2;
  private readonly n2: Noise2;
  private readonly n3: Noise2;
  private readonly n4: Noise2;
  private readonly n5: Noise2;
  private readonly n6: Noise2;

  constructor({ seed, gates, end }: CanyonSpec) {
    this.seed = seed;
    this.gates = gates;
    this.end = end;
    const rand = seeded(seed);
    this.phase = BENDS.map(() => rand() * Math.PI * 2);
    this.n1 = perlin(seed + 1);
    this.n2 = perlin(seed + 2);
    this.n3 = perlin(seed + 3);
    this.n4 = perlin(seed + 4);
    this.n5 = perlin(seed + 5);
    this.n6 = perlin(seed + 6);
    this.origin = 0;
    this.origin = this.center(0);
    this.placeSpires(seeded(seed ^ 0x51ee));
  }

  /** the canyon's middle, across (the world's x) */
  center(d: number): number {
    let x = 0;
    BENDS.forEach(([a, l], i) => (x += a * Math.sin(d / l + this.phase[i])));
    return x - this.origin;
  }

  /** how the middle swings across per unit along (its slope) */
  slope(d: number): number {
    let s = 0;
    BENDS.forEach(([a, l], i) => (s += (a / l) * Math.cos(d / l + this.phase[i])));
    return s;
  }

  /** how fast the slope changes: the bend's tightness, signed */
  curve(d: number): number {
    let c = 0;
    BENDS.forEach(([a, l], i) => (c -= (a / (l * l)) * Math.sin(d / l + this.phase[i])));
    return c;
  }

  private wave(x: number, row: number): number {
    return this.n1(x, row + 0.5);
  }

  /** 1 where a gate's number line spans the canyon (and over the ship's way down into it at the start), 0 elsewhere */
  zone(d: number): number {
    let z = 1 - smooth(150, 320, d);
    for (const g of this.gates) {
      const x = d - g;
      if (x < -360 || x > 80) continue;
      z = Math.max(z, smooth(-340, -260, x) * (1 - smooth(20, 70, x)));
    }
    return z;
  }

  /** the canyon's half-width at its floor: its walls never come closer than this */
  half(d: number): number {
    const free = 31 + 7 * this.wave(d / 170, 0);
    return free + (GATE_HALF - free) * this.zone(d);
  }

  /** the floor's height under the middle */
  floor(d: number): number {
    return 5 * this.wave(d / 300 + 9, 3) + 2.2 * this.wave(d / 95 + 3, 6);
  }

  /** how high the walls stand over the floor */
  depth(d: number): number {
    return 64 + 20 * this.wave(d / 380 + 40, 9);
  }

  /** the world's position of a point on the run */
  toWorld(d: number, u: number, y: number): Vec3 {
    return [this.center(d) + u, y, -d];
  }

  /**
   * The ground's height at (d, u). `fine` adds what only shows close up (the
   * dunes, the gullies, the rock's roughness); without it, it's the shape the
   * sun's shadows are cast by.
   */
  height(d: number, u: number, fine = true): number {
    const au = Math.abs(u);
    // (each side its own: the walls don't mirror each other)
    const side = u < 0 ? 0 : 57.3;
    const F = this.floor(d);
    const W = this.half(d);
    const warp = 5.5 * (0.5 + 0.5 * fbm(this.n2, d * 0.012 + side, au * 0.012, fine ? 3 : 2));
    const gully = fine ? 3.4 * ridged(this.n3, d * 0.05 + side, au * 0.012, 3) : 1.7;
    const t = au - (W + warp + gully);
    let h = F;
    // dunes, their crests across the way (none where a gate's number line is)
    if (fine) h += (1 - this.zone(d)) * 1.1 * (ridged(this.n4, d * 0.03, u * 0.11, 2) - 0.35);
    // the scree at the walls' foot
    const s = clamp01((t + 10) / 10);
    h += 5 * s * s;
    if (t > 0) {
      // the wall: steep from the floor, easing out onto the tableland, in ledges
      let r = this.depth(d) * (1 - Math.exp(-t / 11));
      r += 4 * fbm(this.n2, d * 0.017 + 5, au * 0.025 + side, 2);
      h += terrace(r, 9.5);
      if (fine) h += 1.8 * fbm(this.n5, d * 0.08 + side, au * 0.08 + h * 0.04, 3) * Math.min(1, t / 5);
      // far out, mesas and buttes
      if (au > 130) h += 42 * smooth(130, 320, au) * (ridged(this.n6, d * 0.0035 + side, au * 0.0035, 3) - 0.4);
    }
    const near = this.bins.get(Math.floor(d / SPIRE_BIN));
    if (near) {
      for (const sp of near) {
        const dd = d - sp.d;
        const du = u - sp.u;
        const q = (dd * dd + du * du) / (sp.r * sp.r);
        if (q > 2.2) continue;
        // a column, steep-sided on a flared foot, in ledges of its own
        const tall = Math.max(1 - smooth(0.75, 1.25, q), (1 - smooth(1, 2.2, q)) * 0.12);
        h = Math.max(h, F + 1 + terrace(sp.h * tall, 6.5));
      }
    }
    return h;
  }

  /** the spires near d (to fly round them) */
  spiresNear(d: number): Spire[] {
    return this.bins.get(Math.floor(d / SPIRE_BIN)) ?? [];
  }

  private placeSpires(rand: () => number) {
    let d = 330;
    for (;;) {
      d += 90 + rand() * 100;
      if (d > this.end - 80) break;
      // (none on the way down at the start, nor where a gate's ruler needs reading)
      if (d < 360 || this.gates.some((g) => d > g - 250 && d < g + 50)) continue;
      const r = 3.6 + rand() * 2.8;
      const room = Math.max(0, this.half(d) - 9 - r);
      const sp = { d, u: (rand() * 2 - 1) * room, r, h: this.depth(d) * (0.55 + rand() * 0.45) };
      this.spires.push(sp);
    }
    // each in the bins it reaches into
    for (const sp of this.spires) {
      const reach = sp.r * Math.sqrt(2.2);
      for (let b = Math.floor((sp.d - reach) / SPIRE_BIN); b <= Math.floor((sp.d + reach) / SPIRE_BIN); b++) {
        const list = this.bins.get(b) ?? [];
        list.push(sp);
        this.bins.set(b, list);
      }
    }
  }
}

/**
 * How much sunlight reaches a point (0 in shadow … 1 in full sun): a ray
 * marched towards the sun over the heightfield, its shadow softened by how
 * near it passes the ground, as Quilez marches terrain's soft shadows.
 */
export function sunlight(c: Canyon, [x, y, z]: Vec3, softness = 9): number {
  let res = 1;
  let t = 0.8;
  for (let i = 0; i < 56 && t < 900; i++) {
    const py = y + SUN[1] * t;
    if (py > MAX_HEIGHT) break;
    const d = -(z + SUN[2] * t);
    const u = x + SUN[0] * t - c.center(d);
    const gap = py - c.height(d, u, false);
    if (gap < 0.02) return 0;
    res = Math.min(res, (softness * gap) / t);
    t += Math.min(30, Math.max(0.7, gap * 0.45));
  }
  return smooth(0, 1, res);
}
