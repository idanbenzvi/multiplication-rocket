// The cockpit is a panorama: one equirectangular picture (2:1) seen from the
// pilot's seat at its centre, wrapped round the camera. A point of it (u
// across, 0 … 1, from straight behind on the left round to straight behind
// on the right; v down, 0 … 1, from straight up to straight down) is a
// direction from the seat, and a direction is a look: its yaw (radians,
// right of straight ahead) and its pitch (up from level). In three.js's
// terms, ahead is -z, right +x and up +y.
//
// The art's screens are flat, so seen from the seat each one's four corners
// are four directions; screenQuad puts a flat parallelogram on them (the
// screen's glass), for a page laid out flat to be placed on it (ScreenLayer,
// with CSS 3D) and the camera to frame it (frame).

export type Vec3 = [number, number, number];
export type UV = [number, number];

const TAU = Math.PI * 2;

export interface Look {
  yaw: number;
  pitch: number;
}

/** the direction (unit) of a point of the panorama */
export function dirOf([u, v]: UV): Vec3 {
  return dirOfLook(lookOf([u, v]));
}

/** a point of the panorama as a look */
export function lookOf([u, v]: UV): Look {
  return { yaw: (u - 0.5) * TAU, pitch: (0.5 - v) * Math.PI };
}

export function dirOfLook({ yaw, pitch }: Look): Vec3 {
  const c = Math.cos(pitch);
  return [Math.sin(yaw) * c, Math.sin(pitch), -Math.cos(yaw) * c];
}

export function lookOfDir([x, y, z]: Vec3): Look {
  const n = Math.hypot(x, y, z) || 1;
  return { yaw: Math.atan2(x / n, -z / n), pitch: Math.asin(Math.max(-1, Math.min(1, y / n))) };
}

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const length = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
export const normalize = (a: Vec3): Vec3 => scale(a, 1 / (length(a) || 1));

/** the shortest way round from one yaw to another (radians, -π … π) */
export function yawDelta(from: number, to: number): number {
  return ((((to - from) % TAU) + TAU * 1.5) % TAU) - Math.PI;
}

/** three equations in three unknowns (Cramer's rule): the columns a, b, c times x make d */
function solve3(a: Vec3, b: Vec3, c: Vec3, d: Vec3): Vec3 {
  const det = dot(a, cross(b, c));
  return [dot(d, cross(b, c)) / det, dot(a, cross(d, c)) / det, dot(a, cross(b, d)) / det];
}

export interface Quad {
  /** its corners, clockwise from the top left, as seen from the seat */
  corners: [Vec3, Vec3, Vec3, Vec3];
  /** its middle */
  center: Vec3;
  /** along its top edge, left to right, and down its left edge, top to bottom: one corner to the next */
  across: Vec3;
  down: Vec3;
  /** facing the seat (unit) */
  normal: Vec3;
}

/**
 * A screen's glass from its four corners in the panorama (clockwise from
 * the top left): the parallelogram whose corners lie on those four
 * directions (a real screen's a rectangle; seen through the art's own
 * drawing, a parallelogram is the nearest flat shape that fits all four),
 * scaled so its middle is `distance` from the seat. As the camera's at the
 * seat, how far it is doesn't change how it looks.
 */
export function screenQuad(uvs: [UV, UV, UV, UV], distance = 1): Quad {
  const [r0, r1, r2, r3] = uvs.map(dirOf) as [Vec3, Vec3, Vec3, Vec3];
  // P0 + P2 = P1 + P3, with each Pi = ti ri and t0 = 1: t1 r1 - t2 r2 + t3 r3 = r0
  const [t1, t2, t3] = solve3(r1, scale(r2, -1), r3, r0);
  const raw = [r0, scale(r1, t1), scale(r2, t2), scale(r3, t3)];
  const mid = scale(add(raw[0], raw[2]), 0.5);
  const k = distance / length(mid);
  const corners = raw.map((p) => scale(p, k)) as [Vec3, Vec3, Vec3, Vec3];
  const across = sub(corners[1], corners[0]);
  const down = sub(corners[3], corners[0]);
  // (the normal pointing back at the seat, whichever way the cross product came out)
  let normal = normalize(cross(across, down));
  if (dot(normal, mid) > 0) normal = scale(normal, -1);
  return { corners, center: scale(mid, k), across, down, normal };
}

/** a direction in the camera's own frame, looking along `look` (x right, y up, -z ahead) */
export function toCamera(d: Vec3, look: Look): Vec3 {
  // turned by the yaw: right is (cos yaw, 0, sin yaw), level ahead (sin yaw, 0, -cos yaw)
  const cy = Math.cos(look.yaw);
  const sy = Math.sin(look.yaw);
  const x = d[0] * cy + d[2] * sy;
  const level = d[0] * sy - d[2] * cy;
  // and pitched up: ahead is level ahead × cos pitch + up × sin pitch, the camera's up -level ahead × sin pitch + up × cos pitch
  const cp = Math.cos(look.pitch);
  const sp = Math.sin(look.pitch);
  return [x, -level * sp + d[1] * cp, -(level * cp + d[1] * sp)];
}

/**
 * Where a direction lands on screen for a camera looking along `look` with
 * vertical field of view `fov` (radians) on a viewport `aspect` wide to 1
 * high: in normalized device coordinates (-1 … 1, y up), or null behind.
 */
export function project(d: Vec3, look: Look, fov: number, aspect: number): [number, number] | null {
  const [x, y, z] = toCamera(d, look);
  if (z >= -1e-6) return null;
  const t = Math.tan(fov / 2);
  return [x / -z / (t * aspect), y / -z / t];
}

/**
 * The look and the field of view that frame a quad: looking at its middle,
 * close enough that it fills `fill` of the screen (0 … 1) one way or the
 * other, whichever it reaches first.
 */
export function frame(quad: Quad, aspect: number, fill: number): { look: Look; fov: number } {
  const look = lookOfDir(quad.center);
  let tx = 0;
  let ty = 0;
  for (const c of quad.corners) {
    const [x, y, z] = toCamera(c, look);
    tx = Math.max(tx, Math.abs(x / -z));
    ty = Math.max(ty, Math.abs(y / -z));
  }
  const t = Math.max(ty, tx / aspect) / fill;
  return { look, fov: 2 * Math.atan(t) };
}

/** the box (CSS px) a quad covers on a viewport w × h px, for a camera looking along `look` */
export function screenBox(quad: Quad, look: Look, fov: number, w: number, h: number) {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const c of quad.corners) {
    const p = project(c, look, fov, w / h);
    if (!p) return null;
    const x = (p[0] * 0.5 + 0.5) * w;
    const y = (0.5 - p[1] * 0.5) * h;
    left = Math.min(left, x);
    right = Math.max(right, x);
    top = Math.min(top, y);
    bottom = Math.max(bottom, y);
  }
  return { left, top, width: right - left, height: bottom - top };
}

/**
 * Where a direction from the seat crosses a quad's glass: across it and
 * down it, as shares of its edges (0 … 1 inside it), or null if it doesn't.
 */
export function pointOnQuad(quad: Quad, d: Vec3): [number, number] | null {
  const along = dot(d, quad.normal);
  if (Math.abs(along) < 1e-9) return null;
  const hit = scale(d, dot(quad.corners[0], quad.normal) / along);
  if (dot(hit, d) <= 0) return null;
  // (in the quad's own skewed frame: hit - corner0 = a across + b down)
  const r = sub(hit, quad.corners[0]);
  const [a, b] = solve3(quad.across, quad.down, quad.normal, r);
  return [a, b];
}

/** the angle (radians) between two directions */
export function angleBetween(a: Vec3, b: Vec3): number {
  return Math.acos(Math.max(-1, Math.min(1, dot(normalize(a), normalize(b)))));
}
