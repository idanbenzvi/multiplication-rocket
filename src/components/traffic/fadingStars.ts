import { glow, rgba } from './trafficArt';

// Space Traffic's sky: stars pouring out of the vanishing point on trails that
// fade behind them (after React Bits Pro's Fading Stars, flowing "out"). Each
// star speeds up as it goes and its trail grows with its speed, fading from
// the head back to nothing and from pink at the head to violet at the tail; a
// share of them are far off (smaller, dimmer, slower); they twinkle, the
// brightest heads glow, and they fade in near the vanishing point and out
// again before the edge. The faster the pilot flies, the faster they pour, and
// a burst sends a ring of them out at once. With reduced motion they hold still.

/** trail and head colors */
const TAIL = '#5227ff';
const HEAD = '#ff9ffc';
const MID = '#a863fe';
/** share of the way to the far corner per second, near the vanishing point (it builds up on the way out) */
const SPEED = 0.16;
const SPEED_VARIANCE = 0.6;
const ACCELERATION = 0.9;
/** at full speed, a trail is this share of the way to the corner */
const TRAIL = 0.45;
/** how fast a trail fades from head to tail */
const TRAIL_FADE = 1.6;
const FADE_IN = 0.06;
const FADE_OUT = 0.3;
/** share of far-off stars */
const DEPTH = 0.5;
const TWINKLE = 0.35;
const GLOW = 0.45;
/** stars for a 1280×720 screen (as many for the same area elsewhere, up to 420) */
const COUNT = 480;
const BURST = 64;

interface Star {
  a: number;
  /** how far out: 0 at the vanishing point, 1 at the far corner */
  r: number;
  v: number;
  far: boolean;
  twinkle: number;
  /** a burst's star: gone once it's out, not born again */
  once: boolean;
}

/** a star's own speed out at `r`, as a share of the way to the corner per second */
const rate = (s: Star, r: number) => SPEED * s.v * (s.far ? 0.55 : 1) * (0.35 + ACCELERATION * 2.2 * r);
const FULL_RATE = SPEED * (0.35 + ACCELERATION * 2.2);

export class FadingStars {
  private stars: Star[] = [];
  private size = { w: 0, h: 0 };
  private readonly calm: boolean;

  constructor(calm: boolean) {
    this.calm = calm;
  }

  /** a ring of stars bursting out of the vanishing point */
  burst(n = BURST) {
    if (this.calm) return;
    const turn = Math.random() * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      this.stars.push({ a: turn + (i / n) * Math.PI * 2, r: 0.02, v: 1.6, far: false, twinkle: Math.random() * 7, once: true });
    }
  }

  /** `flow`: how fast they pour, 1 at cruising speed */
  update(dt: number, flow: number) {
    if (this.calm) return;
    for (const s of this.stars) s.r += rate(s, s.r) * flow * dt;
    this.stars = this.stars.filter((s) => s.r < 1 || !s.once);
    for (const s of this.stars) if (s.r >= 1) Object.assign(s, this.star(Math.random() * 0.03));
  }

  private star(r: number): Star {
    return {
      a: Math.random() * Math.PI * 2,
      r,
      v: 1 - SPEED_VARIANCE / 2 + Math.random() * SPEED_VARIANCE,
      far: Math.random() < DEPTH,
      twinkle: Math.random() * 7,
      once: false,
    };
  }

  /** the deep-space backdrop, and the stars pouring out of (ox, oy) */
  draw(ctx: CanvasRenderingContext2D, w: number, h: number, ox: number, oy: number, flow: number, now: number) {
    if (w !== this.size.w || h !== this.size.h) {
      this.size = { w, h };
      const n = Math.round(Math.max(140, Math.min(420, (COUNT * w * h) / (1280 * 720))));
      // the sky is already full when the round opens
      while (this.stars.filter((s) => !s.once).length < n) this.stars.push(this.star(Math.random()));
      let extra = this.stars.filter((s) => !s.once).length - n;
      this.stars = this.stars.filter((s) => s.once || extra-- <= 0);
    }
    const reach = Math.hypot(Math.max(ox, w - ox), Math.max(oy, h - oy));
    const sky = ctx.createRadialGradient(ox, oy, 0, ox, oy, Math.max(w, h) * 0.8);
    sky.addColorStop(0, '#2a1d55');
    sky.addColorStop(0.5, '#140e2c');
    sky.addColorStop(1, '#07050f');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const s of this.stars) {
      const fade = Math.min(1, s.r / FADE_IN, (1 - s.r) / FADE_OUT);
      if (fade <= 0) continue;
      const alpha = fade * (s.far ? 0.45 : 1);
      // the trail grows with the star's speed
      const trail = Math.min(s.r, (TRAIL * rate(s, s.r) * Math.max(1, flow * 0.8)) / FULL_RATE);
      const c = Math.cos(s.a);
      const sn = Math.sin(s.a);
      const d1 = reach * s.r;
      const d0 = reach * (s.r - trail);
      const x1 = ox + c * d1;
      const y1 = oy + sn * d1;
      if (x1 < -20 || x1 > w + 20 || y1 < -20 || y1 > h + 20) continue;
      const x0 = ox + c * d0;
      const y0 = oy + sn * d0;
      const g = ctx.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, rgba(s.far ? MID : TAIL, 0));
      g.addColorStop(0.55, rgba(s.far ? MID : TAIL, alpha * 0.55 ** TRAIL_FADE));
      g.addColorStop(1, rgba(s.far ? MID : HEAD, alpha));
      ctx.strokeStyle = g;
      ctx.lineWidth = s.far ? 0.6 : 1 + s.r * 0.6;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      // the head, twinkling, and a halo round the brightest
      const shimmer = 1 - TWINKLE * (0.5 + 0.5 * Math.sin(now * 6 + s.twinkle));
      const size = (s.far ? 1.3 : 2.2) * 2.6;
      ctx.globalAlpha = alpha * shimmer;
      ctx.drawImage(glow(s.far ? MID : '#ffffff'), x1 - size / 2, y1 - size / 2, size, size);
      if (!s.far && s.r > 0.35) {
        const halo = size * 4;
        ctx.globalAlpha = alpha * shimmer * GLOW;
        ctx.drawImage(glow(HEAD), x1 - halo / 2, y1 - halo / 2, halo, halo);
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }
}
