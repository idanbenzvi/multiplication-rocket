import { BlackSunScene, type ShipPose } from '../boss/blackSunScene';
import { hex, type Point, type RGB } from '../arrival/eclipse';
import { glow, rgba } from '../traffic/trafficArt';
import { bloomNumber } from './bloom';
import { AsciiFlares, GlyphSplash } from './corruption';
import { EVIL, ORB_REACH, SunOrb, type OrbLook } from './sunOrb';
import { TAU, clamp01 } from './storyMath';

// The story's Sun (StoryOpening, StoryLaunch): the Black Sun's own scene
// (boss/blackSunScene.ts), placed where the story's camera puts it, with no
// ship of the pilot's below it; and before it turns, the Sun as it was, warm
// and smiling. Its turn: it flickers, its smile turns, dark veins creep in
// across it from its rim, and its light caves in, leaving the eclipse
// (Monster Sun's: the diamond ring flashing, the angry eyes opening), which
// then becomes the black hole, whirlpool and all, and swallows the numbers,
// each with a little bloom, splashing glyphs as it goes in, and spits out what
// it's corrupted them into (corruption.ts). Its face, as it was and as the
// Black Sun's, is a ball of churning light (sunOrb.ts) wherever WebGL is to
// be had: the story says how it looks as it turns (`look`).

/** the Sun as it was: near its rim, further out, furthest */
const WARM: RGB[] = [hex('#fffbe6'), hex('#ffd36b'), hex('#ff9f4a')];
/** the veins of dark creeping across it as it turns: where each starts on the rim (radians), and its wiggles */
const VEINS = Array.from({ length: 9 }, (_, i) => {
  const a = (i / 9) * TAU + Math.sin(i * 7.3) * 0.25;
  const pts: Point[] = [];
  let r = 1;
  let ang = a;
  for (let j = 0; j < 6; j++) {
    pts.push({ x: Math.cos(ang) * r, y: Math.sin(ang) * r });
    r -= 0.11 + 0.03 * Math.sin(i * 3.1 + j * 1.7);
    ang += 0.16 * Math.sin(i * 1.9 + j * 2.3);
  }
  return pts;
});

export interface BrightLook {
  /** how bright it shines (its corona and its glow), 0 to 1 */
  shine: number;
  /** how much of it is still alight, from the middle out (1: all of it, 0: dark) */
  core: number;
  /** its face drawn here (before it turns; after, its eclipse's disc is the orb) */
  disc: boolean;
  /** its mouth: 1 a smile, -1 a frown */
  smile: number;
  /** how far the dark veins have crept in, 0 to 1 */
  veins: number;
}

export class StorySun extends BlackSunScene {
  /** where it is on screen, and its radius: the story's camera sets it every frame */
  at = { x: 0, y: 0, r: 1 };

  private readonly splash = new GlyphSplash();
  private readonly ascii = new AsciiFlares();
  /** when it became the Black Sun (its own time) */
  private awokeAt = Infinity;
  /** how its face looks (sunOrb.ts): the Black Sun's, unless the story's turning it */
  look: OrbLook = EVIL;
  /** its face (undefined: not made yet; null: no WebGL, drawn as before), its smoke's own clock, and how far it's turned */
  private orb: SunOrb | null | undefined;
  private smoke = 0;
  private spin = 0;

  constructor(calm: boolean) {
    super(calm, 'mul');
    // (it turns when the story says: till then its own clock is far from its arrival)
    this.t = -1000;
  }

  override sun(): Point & { r: number } {
    return this.at;
  }

  /** (no ship of the pilot's below it) */
  override ship(): ShipPose {
    return { x: this.at.x, y: this.at.y + this.at.r * 2, w: 1, rot: 0, alpha: 0, burn: 0 };
  }

  override awaken() {
    super.awaken();
    this.awokeAt = this.t;
  }

  protected override numberArt(text: string, color: string): HTMLCanvasElement {
    return bloomNumber(text, color);
  }

  protected override swallowed(text: string, at: Point) {
    if (this.calm) return;
    this.splash.splash(at, text);
    this.ascii.gush(at, text);
  }

  /** a little monster spat out (littleMonsters.ts) `way` (radians, from its middle): a gush of its liquid that way, and a splash at its rim */
  spit(way: number) {
    if (this.calm) return;
    const rim = { x: Math.cos(way), y: Math.sin(way) };
    // (the liquid gushes out of the far side from where it's given)
    this.ascii.gush({ x: -rim.x, y: -rim.y }, '');
    this.splash.splash(rim, '');
  }

  override update(dt: number) {
    super.update(dt);
    if (this.calm) return;
    this.smoke += dt * this.look.speed;
    this.spin += dt * 0.12;
    // (arcs of it leaping off, once it's a black hole)
    this.ascii.rate = this.t - this.awokeAt > 0.8 ? 0.9 : 0;
    this.ascii.step(dt);
    this.splash.step(dt);
  }

  override draw(ctx: CanvasRenderingContext2D, w: number, h: number, t?: number, look?: Point | null) {
    super.draw(ctx, w, h, t, look);
    this.ascii.draw(ctx, this.at, w, h);
    this.splash.draw(ctx, this.at);
  }

  /** its WebGL given back (made again if it's drawn again) */
  dispose() {
    this.orb?.dispose();
    this.orb = undefined;
  }

  /** its face, the ball of light, at `s` with radius `R`; false if there's no WebGL for it */
  private drawOrb(ctx: CanvasRenderingContext2D, s: Point, R: number): boolean {
    if (this.orb === undefined) this.orb = SunOrb.make();
    if (!this.orb) return false;
    const m = ctx.getTransform();
    const reach = R * ORB_REACH;
    const pic = this.orb.render(reach * 2 * (Math.hypot(m.a, m.b) || 1), this.look, this.smoke, this.spin);
    if (!pic) return false;
    ctx.drawImage(pic, s.x - reach, s.y - reach, reach * 2, reach * 2);
    return true;
  }

  /** the Black Sun's disc: the orb, dark */
  protected override drawDisc(ctx: CanvasRenderingContext2D, s: Point, R: number, t: number, b: number) {
    if (!this.drawOrb(ctx, s, R)) super.drawDisc(ctx, s, R, t, b);
  }

  /** the Sun as it was, warm, shining and smiling, at `time` (seconds, for its corona's motion) */
  drawBright(ctx: CanvasRenderingContext2D, time: number, look: BrightLook) {
    const s = this.at;
    const R = s.r;
    if (look.shine > 0.01) {
      ctx.save();
      // (turned, the orb's already drawn, its eyes on it: its light dies away round it, not over it)
      if (!look.disc && this.orb) {
        ctx.beginPath();
        ctx.rect(s.x - R * 8, s.y - R * 8, R * 16, R * 16);
        ctx.arc(s.x, s.y, R, 0, TAU);
        ctx.clip('evenodd');
      }
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = look.shine;
      const halo = R * 6;
      ctx.drawImage(glow('#ffb347'), s.x - halo / 2, s.y - halo / 2, halo, halo);
      ctx.globalAlpha = 1;
      this.drawCorona(ctx, s, R, time, 1.05 * look.shine, 1, WARM, this.calm ? 0 : time * 0.03);
      ctx.restore();
    }
    if (look.core <= 0.01) return;
    // its face, the orb: as it was, turning (its veins and its colour are the orb's own); then, turned, it's the eclipse's disc
    if (this.orb !== null && (!look.disc || this.drawOrb(ctx, s, R))) {
      if (look.core > 0.8) {
        ctx.save();
        ctx.globalAlpha = clamp01((look.core - 0.8) / 0.2);
        this.drawWarmFace(ctx, look.smile);
        ctx.restore();
      }
      return;
    }
    const r = R * look.core;
    ctx.save();
    // the face of it, white-hot in the middle
    const g = ctx.createRadialGradient(s.x - R * 0.2, s.y - R * 0.25, 0, s.x, s.y, r);
    g.addColorStop(0, '#fffdf2');
    g.addColorStop(0.5, '#ffe58a');
    g.addColorStop(0.85, '#ffbb4a');
    g.addColorStop(1, look.core < 1 ? '#ff6a3d' : '#ff9a3d');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(s.x, s.y, r, 0, TAU);
    ctx.fill();
    // the dark veins creeping in from its rim, a bruise of violet spreading with them
    if (look.veins > 0.01) {
      const bruise = ctx.createRadialGradient(s.x, s.y, r * 0.2, s.x, s.y, r);
      bruise.addColorStop(0, 'rgba(120, 40, 200, 0)');
      bruise.addColorStop(1, `rgba(110, 30, 190, ${0.6 * look.veins})`);
      ctx.fillStyle = bruise;
      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, TAU);
      ctx.fill();
      this.drawVeins(ctx, look.veins);
    }
    // its light caving in: a hot edge where it meets the dark
    if (look.core < 1) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba('#ff8a5c', 0.85);
      ctx.lineWidth = Math.max(1.5, R * 0.05);
      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, TAU);
      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    }
    // its face, as long as there's enough of it
    if (look.core > 0.8) {
      ctx.globalAlpha = clamp01((look.core - 0.8) / 0.2);
      this.drawWarmFace(ctx, look.smile);
    }
    ctx.restore();
  }

  /** closed, happy eyes and a smile (or, turning, flat eyes and a frown) */
  private drawWarmFace(ctx: CanvasRenderingContext2D, smile: number) {
    const s = this.at;
    const R = s.r;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#a8461a';
    ctx.lineWidth = Math.max(1.5, R * 0.07);
    const happy = Math.max(0, smile);
    for (const side of [-1, 1]) {
      const ex = s.x + side * R * 0.33;
      const ey = s.y - R * 0.1;
      ctx.beginPath();
      // ∩ when happy, a flat line when not
      ctx.moveTo(ex - R * 0.13, ey + R * 0.04 * happy);
      ctx.quadraticCurveTo(ex, ey - R * 0.12 * happy, ex + R * 0.13, ey + R * 0.04 * happy);
      ctx.stroke();
      // rosy cheeks
      ctx.save();
      ctx.globalAlpha *= 0.35 * happy;
      ctx.fillStyle = '#ff6f7d';
      ctx.beginPath();
      ctx.ellipse(s.x + side * R * 0.5, s.y + R * 0.18, R * 0.12, R * 0.07, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    ctx.beginPath();
    ctx.moveTo(s.x - R * 0.28, s.y + R * 0.3);
    ctx.quadraticCurveTo(s.x, s.y + R * (0.3 + 0.28 * smile), s.x + R * 0.28, s.y + R * 0.3);
    ctx.stroke();
    ctx.restore();
  }

  private drawVeins(ctx: CanvasRenderingContext2D, k: number) {
    const s = this.at;
    const R = s.r;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const [width, color] of [
      [0.16, 'rgba(150, 60, 255, 0.35)'],
      [0.075, 'rgba(70, 14, 120, 0.8)'],
      [0.035, '#14031f'],
    ] as Array<[number, string]>) {
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1, R * width);
      for (const pts of VEINS) {
        const n = Math.max(2, Math.ceil(pts.length * k));
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const p = pts[i];
          if (i === 0) ctx.moveTo(s.x + p.x * R, s.y + p.y * R);
          else ctx.lineTo(s.x + p.x * R, s.y + p.y * R);
        }
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}
