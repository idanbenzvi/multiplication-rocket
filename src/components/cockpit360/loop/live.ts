// The loop as the space outside the cockpit sees it (Space.tsx reads it each
// frame; LoopShow.tsx writes it): how far round the ship has pitched (the
// stars, the nebula and the destination wheel past the glass the other way;
// the streaks and the numbers, flying along the nose, don't), how fast time
// runs out there (nearly stopped while a moment's frozen), how much faster
// than usual the streaks rush past, and how far round the wheel their trails
// turn.
//
// The wheel: the sky turns round the ship's level axis, whose ends are to the
// left and right. Seen through an anime's wide lens, those ends (the hubs)
// come in to just beyond the windscreen's sides, and everything sweeps down
// round them in arcs, straight down the middle under the nose and curving
// more and more towards each side (wheelAt; the lens smears the sky along the
// same arcs, Effects.tsx).

export const loopFx = {
  on: false,
  /** the ship's pitch round the loop (radians) */
  pitch: 0,
  /** the flight's time: 1 flying, nearly 0 frozen */
  time: 1,
  /** the streaks' speed and length, times this */
  warp: 1,
  /** how far round the wheel a streak's trail turns from its head to its tail (wheelAt's angle) */
  wheel: 0,
  /** where the wheel's hubs are, either side of the nose (in the view's tangents: 1 is 45° off) */
  hub: 1,
};

export function resetLoopFx() {
  loopFx.on = false;
  loopFx.pitch = 0;
  loopFx.time = 1;
  loopFx.warp = 1;
  loopFx.wheel = 0;
  loopFx.hub = 1;
}

/**
 * A point in the view (its tangents from the nose: x right, y up) turned `a`
 * round the wheel, along its circle round the hubs at (±hub, 0): straight
 * down at the middle (more than 0 is down), round the hubs at the sides. (A
 * Möbius turn with the hubs fixed: w = (z − hub) / (z + hub) turned by a.)
 * Effects.tsx's shader does the same. (Into `out`, given one: it's called
 * for every piece of every streak, every frame.)
 */
export function wheelAt(x: number, y: number, a: number, hub: number, out: [number, number] = [0, 0]): [number, number] {
  out[0] = x;
  out[1] = y;
  // w = (z − h) / (z + h)
  const nx = x - hub;
  const dx = x + hub;
  const d = dx * dx + y * y;
  if (d < 1e-12) return out;
  let wx = (nx * dx + y * y) / d;
  let wy = (y * dx - nx * y) / d;
  // turned by a
  const c = Math.cos(a);
  const s = Math.sin(a);
  const tx = wx * c - wy * s;
  wy = wx * s + wy * c;
  wx = tx;
  // z = h (1 + w) / (1 − w)
  const px = 1 + wx;
  const qx = 1 - wx;
  const qy = -wy;
  const q = qx * qx + qy * qy;
  if (q < 1e-12) return out;
  out[0] = (hub * (px * qx + wy * qy)) / q;
  out[1] = (hub * (wy * qx - px * qy)) / q;
  return out;
}
