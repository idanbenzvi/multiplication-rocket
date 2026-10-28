// The screen split in two for the loop (LoopShow.tsx): a slanted cut across
// it, the cockpit on one side and the blueprint on the other, as a manga page
// is cut into panels. On a screen wider than tall the cut runs from the top
// a little right of the middle down to the bottom a little left of it, the
// blueprint on the right; held upright, it runs across, the blueprint below.
// The blueprint slides in from beyond the far edge, its own edge the cut.

export type P2 = [number, number];

export interface Split {
  /** the cut, from one edge of the screen to the other */
  a: P2;
  b: P2;
  /** its normal, pointing into the blueprint */
  n: P2;
  /** how far the blueprint's edge travels from off the screen to the cut (px) */
  reach: number;
  /** the blueprint's picture: its middle and size (px); upright, between the Skip at its top and its numbers along its foot (its words go over the cockpit) */
  box: { cx: number; cy: number; w: number; h: number };
  /** the middle of what's left of the cockpit */
  cockpit: P2;
  portrait: boolean;
}

const dot = (p: P2, q: P2) => p[0] * q[0] + p[1] * q[1];

export function splitFor(w: number, h: number): Split {
  const portrait = w < h;
  const a: P2 = portrait ? [0, h * 0.52] : [w * 0.66, 0];
  const b: P2 = portrait ? [w, h * 0.36] : [w * 0.38, h];
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  // (the normal turned towards the far side, where the blueprint is)
  let n: P2 = [dy / len, -dx / len];
  const far: P2 = [w, h];
  if (dot([far[0] - a[0], far[1] - a[1]], n) < 0) n = [-n[0], -n[1]];
  const reach = Math.max(...[[0, 0], [w, 0], [w, h], [0, h]].map((c) => dot([c[0] - a[0], c[1] - a[1]], n))) + 40;
  const mid = (a[1] + b[1]) / 2;
  // (wide: a little above the middle, the words under it)
  const top = a[1] + 52;
  const bottom = h - 86;
  const box = portrait ? { cx: w / 2, cy: (top + bottom) / 2, w, h: Math.max(120, bottom - top) } : { cx: ((a[0] + b[0]) / 2 + w) / 2, cy: h * 0.45, w: w - (a[0] + b[0]) / 2, h };
  const cockpit: P2 = portrait ? [w / 2, mid / 2] : [(a[0] + b[0]) / 4, h / 2];
  return { a, b, n, reach, box, cockpit, portrait };
}

/** the screen's rectangle cut to one side of a line: where (p - a)·n is at least `off` (or, `inside` false, less) */
export function cutRect(w: number, h: number, a: P2, n: P2, off: number, inside = true): P2[] {
  const side = (p: P2) => (dot([p[0] - a[0], p[1] - a[1]], n) - off) * (inside ? 1 : -1);
  const rect: P2[] = [
    [0, 0],
    [w, 0],
    [w, h],
    [0, h],
  ];
  const out: P2[] = [];
  rect.forEach((p, i) => {
    const q = rect[(i + 1) % 4];
    const sp = side(p);
    const sq = side(q);
    if (sp >= 0) out.push(p);
    if (sp >= 0 !== sq >= 0) {
      const t = sp / (sp - sq);
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
  });
  return out;
}

/** a polygon's area (px²) */
export function area(poly: P2[]): number {
  let s = 0;
  poly.forEach((p, i) => {
    const q = poly[(i + 1) % poly.length];
    s += p[0] * q[1] - q[0] * p[1];
  });
  return Math.abs(s) / 2;
}
