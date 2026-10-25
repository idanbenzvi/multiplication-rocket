import type { Look } from '../scene/planetLooks';

// The destination as seen ahead through the cockpit's windscreen
// (Space.tsx, on a sprite), drawn in 2D in the same storybook way as the planet in the
// sky (DestinationPlanet): its colours, its bands turning (or craters, on a
// rocky one), a two-tone light from the upper right, an atmosphere's glow
// round its edge, the Sun's corona, and rings passing behind it and in front.

const rgba = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

/** a ring, its back half (behind the planet) or its front */
function ring(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string, half: 'back' | 'front') {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.28);
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 1.7, r * 0.42, 0, half === 'back' ? Math.PI : 0, half === 'back' ? Math.PI * 2 : Math.PI);
  ctx.strokeStyle = rgba(color, 0.6);
  ctx.lineWidth = r * 0.3;
  ctx.stroke();
  ctx.restore();
}

/** a few craters for a rocky world, always in the same places for the same world */
function craters(seed: number) {
  let s = seed * 9301 + 49297;
  const next = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  return Array.from({ length: 8 }, () => ({ x: next() * 2 - 1, y: next() * 1.6 - 0.8, r: 0.07 + next() * 0.14 }));
}

/** `index`: which destination (for its craters); `t` (s): turning time */
export function drawPlanet(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, look: Look, index: number, t: number) {
  // its light round it: an atmosphere, or the Sun's corona
  const halo = ctx.createRadialGradient(cx, cy, r * 0.9, cx, cy, r * (look.sun ? 2.3 : 1.55));
  halo.addColorStop(0, rgba(look.glow, look.sun ? 0.8 : 0.32));
  halo.addColorStop(1, rgba(look.glow, 0));
  ctx.fillStyle = halo;
  ctx.fillRect(cx - r * 2.4, cy - r * 2.4, r * 4.8, r * 4.8);

  if (look.ring) ring(ctx, cx, cy, r, look.ring, 'back');

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = look.base;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  if (look.bands > 0) {
    // stripes, gently wavy, drifting as it turns
    const n = look.bands * 2;
    ctx.fillStyle = rgba(look.band, 0.6);
    for (let i = 0; i < n; i += 2) {
      const y0 = cy - r + (i / n) * 2 * r;
      const y1 = cy - r + ((i + 1) / n) * 2 * r;
      ctx.beginPath();
      for (let x = -r; x <= r; x += r / 10) {
        const wave = Math.sin(x / r * 4 + t * 0.3 + i) * r * 0.035;
        ctx.lineTo(cx + x, y0 + wave);
      }
      for (let x = r; x >= -r; x -= r / 10) {
        const wave = Math.sin(x / r * 4 + t * 0.3 + i + 1) * r * 0.035;
        ctx.lineTo(cx + x, y1 + wave);
      }
      ctx.fill();
    }
  } else {
    // craters (or, on Earth, land) drifting across as it turns
    ctx.fillStyle = rgba(look.band, 0.55);
    for (const c of craters(index + 1)) {
      const x = ((c.x + t * 0.02 + 1) % 2) - 1;
      ctx.beginPath();
      ctx.arc(cx + x * r, cy + c.y * r, c.r * r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (!look.sun) {
    // two-tone light from the upper right, like the sky's
    const light = ctx.createRadialGradient(cx + r * 0.4, cy - r * 0.4, r * 0.1, cx + r * 0.2, cy - r * 0.2, r * 1.5);
    light.addColorStop(0, 'rgba(255, 255, 255, 0.16)');
    light.addColorStop(0.55, 'rgba(255, 255, 255, 0)');
    light.addColorStop(0.72, 'rgba(14, 8, 34, 0.42)');
    light.addColorStop(1, 'rgba(14, 8, 34, 0.5)');
    ctx.fillStyle = light;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  }
  // the atmosphere's rim
  const rim = ctx.createRadialGradient(cx, cy, r * 0.72, cx, cy, r);
  rim.addColorStop(0, rgba(look.glow, 0));
  rim.addColorStop(1, rgba(look.glow, 0.7));
  ctx.fillStyle = rim;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.restore();

  if (look.ring) ring(ctx, cx, cy, r, look.ring, 'front');
}
