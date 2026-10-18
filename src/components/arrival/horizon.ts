import { glow, rgba } from '../traffic/trafficArt';
import type { Point } from './eclipse';

// Split Sky's arrival (after React Bits Pro's Horizon Bloom): out of the
// warp, the ship is in orbit over the night side of a dark planet, its edge a
// glowing arc of atmosphere. The sun rises over it ahead of the ship: a glow
// swelling behind the edge, a lens streak along it, and a star of spikes as
// the sun clears it; then curtains of aurora rise off the edge, swaying.
// It stays behind the lobby, the stars twinkling. With reduced motion the sun
// is already up and nothing moves.

const TAU = Math.PI * 2;
const STARS = 90;
const RAYS = 96;
/** the aurora's sheets are stacked this many times over, ever lower, so they fade out towards their tops */
const SHEET_LAYERS = 7;
/** the sun rises, and clears the edge */
const RISE_S = [0.25, 1.35];
/** the aurora rises */
const AURORA_S = 0.9;

const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const easeOut = (t: number) => 1 - (1 - t) ** 3;

export class HorizonScene {
  private readonly calm: boolean;
  private readonly stars = Array.from({ length: STARS }, () => ({ x: Math.random(), y: Math.random(), size: 0.6 + Math.random() * 1.6, phase: Math.random() * TAU, rate: 1 + Math.random() * 2.5 }));

  constructor(calm: boolean) {
    this.calm = calm;
  }

  /** the planet: its centre and radius, and the top of its edge */
  private planet(w: number, h: number) {
    const r = Math.max(w, h) * 1.25;
    const top = h * (w > h ? 0.7 : 0.66);
    return { x: w / 2, y: top + r, r, top };
  }

  /** the height of the planet's edge at x */
  private edgeY(p: { x: number; y: number; r: number }, x: number): number {
    const dx = x - p.x;
    return p.y - Math.sqrt(Math.max(0, p.r * p.r - dx * dx));
  }

  /** where the sun comes up */
  private sunX(w: number): number {
    return w * 0.62;
  }

  shipTarget(w: number, h: number): Point {
    const p = this.planet(w, h);
    return { x: this.sunX(w) - w * 0.07, y: p.top - h * 0.05 };
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
    const p = this.planet(w, h);
    const u = Math.min(w, h);
    const rise = this.calm ? 1 : easeOut(clamp01((t - RISE_S[0]) / (RISE_S[1] - RISE_S[0])));
    const sx = this.sunX(w);
    const edge = this.edgeY(p, sx);
    // the sun's centre, climbing from behind the edge to just above it
    const sy = edge + u * (0.05 - 0.075 * rise);

    this.drawStars(ctx, w, p, t);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // the dawn glow round the sun, swelling as it rises (the planet covers the half below the edge)
    const dawn = u * (0.35 + 0.45 * rise);
    const g = ctx.createRadialGradient(sx, edge, 0, sx, edge, dawn);
    g.addColorStop(0, rgba('#fff1c9', 0.85 * rise));
    g.addColorStop(0.18, rgba('#ffb04a', 0.45 * rise));
    g.addColorStop(0.5, rgba('#ff6ad5', 0.14 * rise));
    g.addColorStop(1, rgba('#ff6ad5', 0));
    ctx.fillStyle = g;
    ctx.fillRect(sx - dawn, edge - dawn, dawn * 2, dawn * 2);
    const sun = u * 0.06;
    ctx.drawImage(glow('#ffe7b0'), sx - sun, sy - sun, sun * 2, sun * 2);
    ctx.restore();

    this.drawPlanet(ctx, w, h, p, sx, rise);
    this.drawAurora(ctx, w, p, t);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // a lens streak along the edge, and a star of spikes as the sun clears it
    const streak = u * (0.3 + 0.25 * rise);
    const lg = ctx.createLinearGradient(sx - streak, 0, sx + streak, 0);
    lg.addColorStop(0, rgba('#6ad7ff', 0));
    lg.addColorStop(0.5, rgba('#fff4d6', 0.75 * rise));
    lg.addColorStop(1, rgba('#6ad7ff', 0));
    ctx.fillStyle = lg;
    ctx.fillRect(sx - streak, edge - 1.5, streak * 2, 3);
    const burst = this.calm ? 0 : Math.sin(Math.PI * clamp01((t - RISE_S[1] + 0.35) / 0.9)) ** 0.8;
    if (burst > 0) {
      ctx.translate(sx, Math.min(sy, edge));
      for (let i = 0; i < 6; i++) {
        ctx.rotate(Math.PI / 3);
        const L = u * (i % 2 ? 0.16 : 0.3) * burst;
        const sg = ctx.createLinearGradient(0, 0, L, 0);
        sg.addColorStop(0, `rgba(255, 255, 255, ${0.85 * burst})`);
        sg.addColorStop(1, 'rgba(255, 236, 200, 0)');
        ctx.fillStyle = sg;
        ctx.beginPath();
        ctx.moveTo(0, -u * 0.006);
        ctx.lineTo(L, 0);
        ctx.lineTo(0, u * 0.006);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.restore();
  }

  /** the stars above the edge, twinkling */
  private drawStars(ctx: CanvasRenderingContext2D, w: number, p: { x: number; y: number; r: number; top: number }, t: number) {
    ctx.save();
    for (const s of this.stars) {
      const x = s.x * w;
      const y = s.y * p.top;
      const near = clamp01((this.edgeY(p, x) - y) / (p.top * 0.15));
      const tw = this.calm ? 0.8 : 0.55 + 0.45 * Math.sin(t * s.rate + s.phase);
      ctx.globalAlpha = tw * near * 0.85;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x, y, s.size, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  /** the night side, and its edge of atmosphere lit up most where the sun rises */
  private drawPlanet(ctx: CanvasRenderingContext2D, w: number, h: number, p: { x: number; y: number; r: number; top: number }, sx: number, rise: number) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, TAU);
    const body = ctx.createLinearGradient(0, p.top, 0, h);
    body.addColorStop(0, '#1a1d44');
    body.addColorStop(0.25, '#0e1030');
    body.addColorStop(1, '#07071a');
    ctx.fillStyle = body;
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // the atmosphere, a thin glowing shell round the edge
    const air = ctx.createRadialGradient(p.x, p.y, p.r * 0.992, p.x, p.y, p.r * 1.05);
    air.addColorStop(0, rgba('#6ad7ff', 0));
    air.addColorStop(0.12, rgba('#bff3ff', 0.55 + 0.25 * rise));
    air.addColorStop(0.3, rgba('#6ad7ff', 0.3));
    air.addColorStop(0.65, rgba('#5b6cff', 0.1));
    air.addColorStop(1, rgba('#5b6cff', 0));
    ctx.fillStyle = air;
    ctx.fillRect(0, p.top - p.r * 0.06, w, h - p.top + p.r * 0.06);
    // lit gold where the sun is coming up
    const lit = ctx.createRadialGradient(sx, p.top, 0, sx, p.top, w * 0.45);
    lit.addColorStop(0, rgba('#ffd77a', 0.55 * rise));
    lit.addColorStop(0.4, rgba('#ff9d4a', 0.16 * rise));
    lit.addColorStop(1, rgba('#ff9d4a', 0));
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * 1.012, 0, TAU);
    ctx.arc(p.x, p.y, p.r * 0.985, 0, TAU, true);
    ctx.fillStyle = lit;
    ctx.fill();
    ctx.restore();
  }

  /** curtains of aurora rising off the edge, swaying: a glowing sheet, green at its foot and pink at its top, streaked with rays */
  private drawAurora(ctx: CanvasRenderingContext2D, w: number, p: { x: number; y: number; r: number; top: number }, t: number) {
    const up = this.calm ? 1 : easeOut(clamp01((t - AURORA_S) / 1.2));
    if (up <= 0) return;
    const tt = this.calm ? 0 : t;
    const u = Math.min(w, p.top * 1.5);
    const step = w / RAYS;
    // two sheets, drifting at their own pace, the far one fainter
    for (const [phase, reach, alpha] of [
      [1.3, 0.32, 0.22],
      [4.1, 0.22, 0.32],
    ]) {
      const xs: number[] = [];
      const bases: number[] = [];
      const tops: number[] = [];
      for (let i = 0; i <= RAYS; i++) {
        const x = i * step;
        const n = 0.5 + 0.5 * Math.sin(i * 0.19 + tt * 0.5 + phase) * Math.sin(i * 0.061 - tt * 0.27 + phase * 0.7);
        const base = this.edgeY(p, x) - u * 0.01;
        xs.push(x);
        bases.push(base);
        tops.push(base - u * (0.06 + reach * n) * up);
      }
      const highest = Math.min(...tops);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createLinearGradient(0, p.top, 0, highest);
      g.addColorStop(0, rgba('#7ee08f', 1));
      g.addColorStop(0.45, rgba('#6ad7ff', 0.5));
      g.addColorStop(1, rgba('#ff6ad5', 0.15));
      ctx.fillStyle = g;
      // stacked ever lower, so it fades out softly towards its top
      for (let k = 1; k <= SHEET_LAYERS; k++) {
        const f = k / SHEET_LAYERS;
        ctx.globalAlpha = (alpha * up) / SHEET_LAYERS;
        ctx.beginPath();
        ctx.moveTo(xs[0], bases[0]);
        for (let i = 0; i <= RAYS; i++) ctx.lineTo(xs[i], bases[i] + (tops[i] - bases[i]) * f);
        for (let i = RAYS; i >= 0; i--) ctx.lineTo(xs[i], bases[i]);
        ctx.closePath();
        ctx.fill();
      }
      // and streaked with rays here and there, shimmering, each fading out on its way up
      ctx.lineWidth = Math.max(1, step * 0.22);
      ctx.globalAlpha = 1;
      for (let i = 1; i < RAYS; i += 2) {
        const shimmer = Math.max(0, Math.sin(i * 1.7 + tt * 2.2 + phase) * Math.sin(i * 0.37 - tt * 0.9));
        if (shimmer < 0.05) continue;
        const x = xs[i] + Math.sin(i * 3.1 + phase) * step * 0.5;
        const rg = ctx.createLinearGradient(0, bases[i], 0, tops[i]);
        rg.addColorStop(0, rgba('#c9ffd6', 0));
        rg.addColorStop(0.15, rgba('#c9ffd6', 0.3 * shimmer * up));
        rg.addColorStop(1, rgba('#6ad7ff', 0));
        ctx.strokeStyle = rg;
        ctx.beginPath();
        ctx.moveTo(x, bases[i]);
        ctx.lineTo(x, tops[i]);
        ctx.stroke();
      }
      ctx.restore();
    }
  }
}
