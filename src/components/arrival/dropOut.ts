// Arriving out of hyperspace (after React Bits Pro's Lightspeed): as a round
// in deep space opens, its stars are long streaks of light rushing out of the
// vanishing point, tinted cyan to violet to pink; then the ship drops out. The
// streaks snap back into stars, a flash goes off at the vanishing point (a
// bloom, a lens streak across it and a blink of the whole sky), and a ring of
// light races out past the screen's edges. useWarpCanvas and Space Traffic's
// sky play it, and the rounds time their ship's entrance to DROP_MS.

/** the ship drops out of hyperspace this long after the round opens */
export const DROP_MS = 650;
/** the flash and its ring are gone */
export const DROP_END_MS = DROP_MS + 950;
/** the streaks take this long to snap back into stars */
const SNAP_MS = 280;
/** the ship takes this long to brake into its place after the drop */
const SETTLE_MS = 750;
/** something warping in after it takes this long */
const WARP_IN_MS = 750;

/** the streaks' colors, tail to head */
export const HYPER_TINTS = ['#6ad7ff', '#b18cff', '#ff6ad5'];

const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const easeOut = (t: number) => 1 - (1 - t) ** 3;
/** eases out past the end and back */
const easeOutBack = (t: number) => 1 + 2.4 * (t - 1) ** 3 + 1.4 * (t - 1) ** 2;

/** reduced motion: no hyperspace and no flash, the round just opens */
export const calmMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/** how deep in hyperspace, `ms` after the round opened: 1 until the drop, then snapping back to 0 */
export function hyperspace(ms: number): number {
  if (ms < DROP_MS) return 1;
  const k = clamp01((ms - DROP_MS) / SNAP_MS);
  return 1 - easeOut(k);
}

/**
 * The pilot's ship (seen from behind) flying in with it, `ms` after the round
 * opened: it rushes in from just behind the camera, big and low, then brakes as
 * it drops out, surging a little past its place and settling back. How far
 * below its place it still is (a share of the screen's height), how big it is
 * (1 in its place) and how hard its engines burn (1 in hyperspace, 0 at cruise).
 */
export function shipArrival(ms: number, calm: boolean): { below: number; scale: number; burn: number } {
  if (calm) return { below: 0, scale: 1, burn: 0 };
  if (ms < DROP_MS) {
    const k = easeOut(clamp01(ms / DROP_MS));
    return { below: 0.16 * (1 - k) + 0.06, scale: 2.3 - 1.05 * k, burn: 1 };
  }
  const k = clamp01((ms - DROP_MS) / SETTLE_MS);
  const e = easeOutBack(k);
  return { below: 0.06 * (1 - e), scale: 1.25 - 0.25 * e, burn: (1 - k) ** 2 };
}

/**
 * Something warping in out of the distance after the pilot, `ms` after it
 * starts (it waits, unseen, until then): a white-hot streak that squashes into
 * shape and settles. Its opacity, its scale across and down, and how bright
 * and blurred it still is.
 */
export function warpIn(ms: number, calm: boolean): { opacity: number; sx: number; sy: number; bright: number; blur: number } {
  const k = clamp01(ms / WARP_IN_MS);
  if (calm) return { opacity: k, sx: 1, sy: 1, bright: 1, blur: 0 };
  if (k <= 0) return { opacity: 0, sx: 0.15, sy: 1.9, bright: 4, blur: 2 };
  // streak (0 to 0.4) → squash (to 0.7) → settle
  if (k < 0.4) {
    const e = easeOut(k / 0.4);
    return { opacity: Math.min(1, k / 0.15), sx: 0.15 + 0.99 * e, sy: 1.9 - 1.02 * e, bright: 4 - 2.4 * e, blur: 2 * (1 - e) };
  }
  if (k < 0.7) {
    const e = (k - 0.4) / 0.3;
    return { opacity: 1, sx: 1.14 - 0.17 * e, sy: 0.88 + 0.16 * e, bright: 1.6 - 0.5 * e, blur: 0 };
  }
  const e = easeOut((k - 0.7) / 0.3);
  return { opacity: 1, sx: 0.97 + 0.03 * e, sy: 1.04 - 0.04 * e, bright: 1.1 - 0.1 * e, blur: 0 };
}

function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/** a star's streak in hyperspace, from (x0, y0) at its tail to (x1, y1) at its head: tinted at the tail, white-hot at the head */
export function hyperStreak(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, width: number, tint: string, alpha: number) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, rgba(tint, 0));
  g.addColorStop(0.55, rgba(tint, alpha * 0.55));
  g.addColorStop(1, `rgba(255, 255, 255, ${alpha})`);
  ctx.strokeStyle = g;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

/** the glow of the tunnel round the vanishing point while in hyperspace (drawn under the streaks) */
export function drawHyperGlow(ctx: CanvasRenderingContext2D, w: number, h: number, cx: number, cy: number, hyper: number) {
  if (hyper <= 0.01) return;
  const r = Math.max(w, h) * 0.55;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, rgba('#9fd8ff', 0.55 * hyper));
  g.addColorStop(0.12, rgba('#6a5cff', 0.32 * hyper));
  g.addColorStop(0.5, rgba('#3a1d7a', 0.18 * hyper));
  g.addColorStop(1, rgba('#3a1d7a', 0));
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/** the flash as the ship drops out at (cx, cy), `ms` after the round opened (drawn over the stars) */
export function drawDropFlash(ctx: CanvasRenderingContext2D, w: number, h: number, cx: number, cy: number, ms: number) {
  const d = ms - DROP_MS;
  if (d < 0 || d > DROP_END_MS - DROP_MS) return;
  const reach = Math.hypot(Math.max(cx, w - cx), Math.max(cy, h - cy));
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  // the whole sky blinks
  const blink = 1 - clamp01(d / 200);
  if (blink > 0) {
    ctx.fillStyle = rgba('#cfe6ff', 0.32 * blink * blink);
    ctx.fillRect(0, 0, w, h);
  }
  // a bloom at the vanishing point, swelling and fading
  const kb = clamp01(d / 520);
  const bloom = (1 - kb) ** 2;
  if (bloom > 0) {
    const r = reach * (0.06 + 0.32 * easeOut(clamp01(d / 240)));
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, `rgba(255, 255, 255, ${bloom})`);
    g.addColorStop(0.2, rgba('#bfe9ff', 0.75 * bloom));
    g.addColorStop(0.55, rgba('#8a7bff', 0.3 * bloom));
    g.addColorStop(1, rgba('#8a7bff', 0));
    ctx.fillStyle = g;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    // a lens streak straight across it
    const sw = w * (0.35 + 0.65 * easeOut(clamp01(d / 300)));
    const sh = Math.max(2, Math.min(w, h) * 0.012) * (1 - kb);
    const s = ctx.createLinearGradient(cx - sw / 2, cy, cx + sw / 2, cy);
    s.addColorStop(0, rgba('#8fd0ff', 0));
    s.addColorStop(0.5, `rgba(255, 255, 255, ${0.9 * bloom})`);
    s.addColorStop(1, rgba('#8fd0ff', 0));
    ctx.fillStyle = s;
    ctx.fillRect(cx - sw / 2, cy - sh / 2, sw, sh);
  }
  // a ring of light racing out past the edges, thinning as it goes
  const kr = clamp01(d / (DROP_END_MS - DROP_MS));
  const ring = (1 - kr) ** 1.5;
  if (ring > 0) {
    const r = reach * 1.15 * easeOut(kr);
    ctx.lineWidth = Math.max(1.5, Math.min(w, h) * 0.028 * (1 - kr));
    ctx.strokeStyle = rgba('#a9dcff', 0.7 * ring);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    // and a fainter, wider one just inside it
    ctx.lineWidth *= 3;
    ctx.strokeStyle = rgba('#b18cff', 0.22 * ring);
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(0, r * 0.94), 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}
