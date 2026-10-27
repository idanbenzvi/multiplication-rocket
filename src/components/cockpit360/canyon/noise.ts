// The noise the canyon is made of, seeded, so a run's canyon is the same
// wherever it's built (the terrain's worker, the flight's own checks):
// Perlin's gradient noise (with his improved, quintic fade), summed in
// octaves into fractal Brownian motion, and Musgrave's ridged multifractal,
// whose sharp creases read as eroded rock.

/** a small, fast seeded generator (mulberry32): 0 ≤ n < 1 */
export function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Noise2 = (x: number, y: number) => number;

/** gradient noise in two dimensions, about -1 … 1 */
export function perlin(seed: number): Noise2 {
  const rand = seeded(seed);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  // twelve directions, evenly round
  const gx = new Float64Array(12);
  const gy = new Float64Array(12);
  for (let i = 0; i < 12; i++) {
    gx[i] = Math.cos((i * Math.PI) / 6);
    gy[i] = Math.sin((i * Math.PI) / 6);
  }
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  return (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const X = xi & 255;
    const Y = yi & 255;
    const a = perm[X] + Y;
    const b = perm[X + 1] + Y;
    const g00 = perm[a] % 12;
    const g10 = perm[b] % 12;
    const g01 = perm[a + 1] % 12;
    const g11 = perm[b + 1] % 12;
    const n00 = gx[g00] * xf + gy[g00] * yf;
    const n10 = gx[g10] * (xf - 1) + gy[g10] * yf;
    const n01 = gx[g01] * xf + gy[g01] * (yf - 1);
    const n11 = gx[g11] * (xf - 1) + gy[g11] * (yf - 1);
    const u = fade(xf);
    const v = fade(yf);
    const top = n00 + (n10 - n00) * u;
    const bottom = n01 + (n11 - n01) * u;
    return (top + (bottom - top) * v) * 1.42;
  };
}

/** fractal Brownian motion: `octaves` of the noise, each twice as fine and half as strong (about -1 … 1) */
export function fbm(noise: Noise2, x: number, y: number, octaves: number): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += noise(x, y) * amp;
    norm += amp;
    amp *= 0.5;
    // (each octave turned a little, so their grids don't line up)
    const nx = x * 1.6 - y * 1.2 + 17.3;
    y = x * 1.2 + y * 1.6 - 9.1;
    x = nx;
  }
  return sum / norm;
}

/**
 * Musgrave's ridged multifractal (0 … about 1): the noise folded at its
 * zeroes into sharp ridges, each octave weighted by the one before, so
 * the fine detail gathers along the ridges, as erosion leaves it.
 */
export function ridged(noise: Noise2, x: number, y: number, octaves: number): number {
  let sum = 0;
  let amp = 0.5;
  let weight = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    let n = 1 - Math.abs(noise(x, y));
    n *= n * weight;
    weight = Math.min(1, Math.max(0, n * 2));
    sum += n * amp;
    norm += amp;
    amp *= 0.5;
    const nx = x * 1.6 - y * 1.2 + 31.7;
    y = x * 1.2 + y * 1.6 + 4.3;
    x = nx;
  }
  return sum / norm;
}
