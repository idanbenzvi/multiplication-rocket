import { useEffect, useMemo, useRef } from 'react';
import { buildMonster, CHEER_AT, drawFriendCells, easeOut, EYE_R, GLYPHS, HEARTS, mouthSpot, N, pickOf, sparkle, type Cell } from './monsterArt';
import { MONSTERS } from './roster';
import { pixelRatio } from '../../settings/quality';

// The monster: a creature made of characters that never sit still (a sun,
// a rabbit, a ghost…: see roster.ts). Its body and limbs are cells on a grid,
// each showing a random glyph that keeps changing, with glaring eyes and a
// grin of teeth. It assembles itself out of flying letters, and it reacts:
//   - a teammate's right answer is a beam in their colour; where it lands
//     the monster winces (> <), shivers and sheds characters (limbs first,
//     eyes last), each flying off as a spark;
//   - a wrong answer feeds it: it chomps, swells and gloats in red;
//   - left alone, it gets hungry: it eyes a number floating in space, opens
//     wide, swallows it, crunches it (crumbs of digits fly) and powers up,
//     the letters it had lost growing back out of its mouth;
//   - weak, it trembles and sweats.
// At zero it's cured: its scrambled letters fly out, swirl back and
// unscramble into a friend that shines, and shows off a moment later.

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ch: string;
  color: string;
  life: number;
  fade: number;
  /** slows down and floats up instead of falling (hearts) */
  float?: boolean;
  /** bigger than a knocked-off letter, in the numbers' own font (crumbs of a crunched number) */
  crumb?: number;
}

interface Beam {
  /** where it starts, as fractions of the canvas (a pilot's ship nose; 1 = the bottom edge) */
  from: number;
  fromY: number;
  /** the arc's bend, sideways */
  bend: number;
  color: string;
  t: number;
  trail: [number, number][];
}

interface Ring {
  color: string;
  life: number;
  width: number;
}

interface Floater {
  text: string;
  x: number;
  y: number;
  life: number;
  color?: string;
}

/** a number on its way into the monster's mouth (canvas px) */
interface Morsel {
  text: string;
  color: string;
  size: number;
  rot: number;
  x: number;
  y: number;
  /** 0 → 1: from where it was caught, into the mouth */
  p: number;
  say: string;
}

/** a number from space, in screen px, as it's handed to the monster to eat */
export interface Snack {
  text: string;
  color: string;
  size: number;
  rot: number;
  x: number;
  y: number;
  /** what it says as it crunches ("CRUNCH!") */
  say: string;
}

/** a sparkle around the cured friend, in grid units */
interface Twinkle {
  x: number;
  y: number;
  size: number;
  color: string;
  life: number;
}

/** seconds a beam takes to reach the monster */
const BEAM_S = 0.36;
/** seconds a caught number takes into the mouth, then chewing, then the power coming back */
const GULP_S = 0.42;
const CHEW_S = 0.7;
const POWER_AT_S = 0.55;
/** seconds a letter that grows back takes to fly out of the mouth into place */
const REGROW_S = 0.55;
const NUMBER_FONT = "'Fredoka', 'Trebuchet MS', sans-serif";
const MONO = 'ui-monospace, Menlo, Consolas, monospace';

/** what the page can make the monster do */
export interface MonsterFx {
  /** a pilot's right answer: a beam in their colour, from a point given as fractions of the canvas (their ship's nose) */
  beam: (color: string, x: number, y?: number) => void;
  /** a wrong answer: it chomps, swells and says this */
  gloat: (text: string) => void;
  /** a team combo: a shockwave ring */
  ring: (color: string) => void;
  /** where its mouth is on screen (and the canvas's own box), for a number to be pulled in */
  mouth: () => { x: number; y: number; box: DOMRect } | null;
  /** hungry: it eyes a spot on screen and opens wide */
  hungry: (x: number, y: number) => void;
  /** a number to eat, handed over from space: in it goes, crunch, and its strength comes back */
  swallow: (snack: Snack) => void;
}

interface Props {
  /** which monster of the fight (0-based): the later ones flicker faster */
  monster: number;
  /** which one of the roster it is (roster.ts); the fight's own number unless it says */
  kind?: number;
  hp: number;
  maxHp: number;
  fx?: React.RefObject<MonsterFx | null>;
  /** lobby: just lurking and looking around */
  lurk?: boolean;
  /** already cured (the summary): seconds before its friend swirls in */
  wait?: number;
  /** the moment it's cured, and the moment its friend shows off (for the sounds) */
  onCured?: () => void;
  onCheer?: () => void;
  /** it bites into a number it ate, and its strength comes back after (show the new strength then) */
  onCrunch?: () => void;
  onFed?: () => void;
}

export function MonsterCanvas({ monster, kind = monster, hp, maxHp, fx, lurk = false, wait = 0, onCured, onCheer, onCrunch, onFed }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const design = MONSTERS[((kind % MONSTERS.length) + MONSTERS.length) % MONSTERS.length];
  const cells = useMemo(() => buildMonster(design), [design]);
  const friend = useMemo(() => design.friend.build(), [design]);
  const live = useRef({ hp, maxHp, onCured, onCheer, onCrunch, onFed });
  useEffect(() => {
    live.current = { hp, maxHp, onCured, onCheer, onCrunch, onFed };
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const tier = Math.min(2, monster);
    const pal = design.palette;
    const glyphs = design.glyphs ?? GLYPHS;
    const eyeR = design.eyeR ?? EYE_R;
    const pupil = design.pupil ?? 'round';
    /** the friend it turns into */
    const looks = design.friend;
    const mouthAt = mouthSpot(design);
    // its glow sits round its middle (most are in the middle; a moon's face is off to one side)
    const glowAt = (design.heart ?? [0, 0]).map((v) => v * 0.7);
    // where it sweats from: above its eyes
    const eyeMid = design.eyes.reduce((a, [x]) => a + x, 0) / design.eyes.length;
    const brow = Math.min(...design.eyes.map(([, y]) => y)) - 0.26;
    const floats = looks.floats ?? { chars: ['♥'], colors: HEARTS };
    const mutate = 0.03 + tier * 0.025;
    const total = cells.length;
    const goneFor = (h: number, m: number) => (m > 0 ? Math.round(total * (1 - Math.max(0, h) / m)) : 0);
    // already worn down (a phone that joins or reloads mid-fight): no sparks for those
    const shown = cells.map((_, i) => i >= goneFor(live.current.hp, live.current.maxHp));
    // already cured: the friend swirls in quietly
    const quiet = shown.every((s) => !s);
    let curedAt: number | null = quiet ? wait : null;
    let cheered = false;
    let twinkles: Twinkle[] = [];
    let sparks: Spark[] = [];
    let beams: Beam[] = [];
    let rings: Ring[] = [];
    let floaters: Floater[] = [];
    let morsels: Morsel[] = [];
    /** when each fed number's strength comes back */
    let powerUps: number[] = [];
    /** when each knocked-off letter grew back (0: never knocked off) */
    const back = new Float32Array(total);
    let hungerFor = 0;
    let chew = 0;
    let fedGlow = 0;
    let shake = 0;
    let redFlash = 0;
    let whiteFlash = 0;
    let hurt = 0;
    let gloat = 0;
    let look: [number, number] = [0, 1];
    let lookFor = 0;
    let raf = 0;
    let last = performance.now();
    const t0 = last;
    let mouthPx: [number, number] = [canvas.clientWidth / 2, canvas.clientWidth * 0.58];

    const colorOf = (c: Cell) => (c.kind === 'mouth' ? '#c0163f' : c.kind === 'ray' ? pal.ray : c.core ? pal.core : pal.mid);
    const burstAt = (x: number, y: number, n: number, colors: string[], speed: number) => {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = speed * (0.4 + Math.random());
        sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, ch: pickOf(glyphs), color: colors[i % colors.length], life: 1, fade: 0.7 + Math.random() * 0.8 });
      }
    };
    /** hearts (or whatever this friend gives off) floating up from a spot */
    const floatUp = (x: number, y: number, n: number, speed: number) => {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = speed * (0.3 + Math.random() * 0.7);
        sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, ch: pickOf(floats.chars), color: floats.colors[i % floats.colors.length], life: 1, fade: 0.45 + Math.random() * 0.25, float: true });
      }
    };

    if (fx) {
      fx.current = {
        beam: (color, from, fromY = 1) => {
          beams.push({ from, fromY, bend: (Math.random() - 0.5) * 0.4, color, t: 0, trail: [] });
          look = [from * 2 - 1, Math.min(1, fromY * 2 - 1)];
          lookFor = 1.2;
        },
        gloat: (text) => {
          gloat = 1.3;
          hurt = 0; // the latest feeling wins
          redFlash = 1;
          floaters.push({ text, x: mouthAt[0] + (Math.random() - 0.5) * 0.3, y: design.mouth.y + 0.16, life: 1 });
        },
        ring: (color) => {
          rings.push({ color, life: 1, width: 8 }, { color: '#ffffff', life: 0.75, width: 3 });
          shake = Math.max(shake, 0.8);
        },
        mouth: () => {
          const box = canvas.getBoundingClientRect();
          if (!box.width) return null;
          const k = box.width / Math.max(1, canvas.clientWidth);
          return { x: box.left + mouthPx[0] * k, y: box.top + mouthPx[1] * k, box };
        },
        hungry: (x, y) => {
          const box = canvas.getBoundingClientRect();
          const half = box.width / 2 || 1;
          const dx = (x - box.left - half) / half;
          const dy = (y - box.top - half) / half;
          const len = Math.hypot(dx, dy) || 1;
          look = [dx / len, dy / len];
          lookFor = 2.2;
          hungerFor = 2.6;
        },
        swallow: (snack) => {
          const box = canvas.getBoundingClientRect();
          const k = Math.max(1, canvas.clientWidth) / (box.width || 1);
          morsels.push({ ...snack, x: (snack.x - box.left) * k, y: (snack.y - box.top) * k, size: snack.size * k, p: 0 });
          hungerFor = Math.max(hungerFor, GULP_S + 0.1);
          lookFor = 0;
        },
      };
    }

    const draw = (now: number) => {
      // the first frame can be stamped before the effect ran
      const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
      last = now;
      const t = (now - t0) / 1000;
      const dpr = pixelRatio(2, 1);
      const size = canvas.clientWidth;
      if (canvas.width !== Math.round(size * dpr)) {
        canvas.width = Math.round(size * dpr);
        canvas.height = Math.round(size * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);

      const { hp: nowHp, maxHp: nowMax } = live.current;
      const strength = nowMax > 0 ? Math.max(0, nowHp) / nowMax : 1;
      const low = strength > 0 && strength < 0.25 && !lurk;
      // a cell goes when the beam that knocks it off lands, not before
      const gone = Math.max(0, Math.min(total, goneFor(nowHp, nowMax) - beams.length));
      // cured: the last beam has landed
      const curing = curedAt === null && gone >= total && beams.length === 0;
      if (curing) {
        curedAt = t;
        whiteFlash = 1;
        live.current.onCured?.();
      }
      const ft = curedAt === null ? -1 : t - curedAt;

      shake = Math.max(low ? 0.12 : 0, shake - dt * 2.2);
      redFlash = Math.max(0, redFlash - dt * 1.6);
      whiteFlash = Math.max(0, whiteFlash - dt * 1.4);
      hurt = Math.max(0, hurt - dt);
      gloat = Math.max(0, gloat - dt);
      lookFor = Math.max(0, lookFor - dt);
      hungerFor = Math.max(0, hungerFor - dt);
      chew = Math.max(0, chew - dt);
      fedGlow = Math.max(0, fedGlow - dt * 0.8);

      const half = size / 2;
      const swell = 1 + 0.07 * Math.sin(Math.min(1, gloat) * Math.PI) + 0.06 * Math.sin((chew / CHEW_S) * Math.PI) + 0.04 * fedGlow;
      const scale = half * 0.92 * (1 + 0.025 * Math.sin(t * 2.4)) * swell;
      const jx = (Math.random() - 0.5) * 14 * shake;
      // the friend bobs, happily
      const jy = (Math.random() - 0.5) * 14 * shake + (curedAt === null ? 0 : Math.sin(t * 2.2) * half * 0.025);
      const rot = Math.sin(t * 0.5) * 0.07 + shake * (Math.random() - 0.5) * 0.15;
      const cos = Math.cos(rot);
      const sin = Math.sin(rot);
      const at = (x: number, y: number): [number, number] => [half + jx + (x * cos - y * sin) * scale, half + jy + (x * sin + y * cos) * scale];
      const cell = (scale * 2) / N;
      mouthPx = at(mouthAt[0], mouthAt[1]);

      // corona: fades as the monster weakens, flickers when it's nearly done
      const [gx0, gy0] = at(glowAt[0], glowAt[1]);
      if (gone < total) {
        const pulse = (0.75 + 0.25 * Math.sin(t * 3.1)) * (low ? 0.6 + Math.random() * 0.4 : 1) * (1 + fedGlow);
        const g = ctx.createRadialGradient(gx0, gy0, 0, gx0, gy0, scale * 0.95);
        g.addColorStop(0, `rgba(${pal.glow}, ${0.55 * pulse * (0.35 + 0.65 * strength)})`);
        g.addColorStop(0.5, `rgba(${pal.glow}, ${0.18 * pulse * strength})`);
        g.addColorStop(1, `rgba(${pal.glow}, 0)`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, size, size);
      }
      // the friend's warm glow
      if (ft > 0) {
        const k = Math.min(1, ft / 1.5) * (0.85 + 0.15 * Math.sin(t * 2));
        const g = ctx.createRadialGradient(gx0, gy0, 0, gx0, gy0, scale * 1.05);
        g.addColorStop(0, `rgba(${looks.glow}, ${0.55 * k})`);
        g.addColorStop(0.45, `rgba(${looks.glow}, ${0.2 * k})`);
        g.addColorStop(1, `rgba(${looks.glow}, 0)`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, size, size);
      }
      if (curing) {
        // its scrambled letters fly out
        rings.push({ color: pal.mid, life: 1, width: 10 }, { color: '#ffffff', life: 0.8, width: 5 });
        burstAt(half, half, 45, [pal.core, pal.mid, pal.ray], 300);
      }
      if (redFlash > 0) {
        const g = ctx.createRadialGradient(half, half, 0, half, half, scale);
        g.addColorStop(0, `rgba(255, 40, 60, ${0.5 * redFlash})`);
        g.addColorStop(1, 'rgba(255, 40, 60, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, size, size);
      }

      // shockwaves
      rings = rings.filter((r) => (r.life -= dt * 1.1) > 0);
      for (const r of rings) {
        ctx.globalAlpha = r.life;
        ctx.strokeStyle = r.color;
        ctx.lineWidth = r.width * r.life;
        ctx.beginPath();
        ctx.arc(half, half, scale * (0.35 + (1 - r.life) * 0.9), 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // the body and limbs, flying into place as it assembles
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `700 ${cell * 1.08}px ${MONO}`;
      // chewing, or chomping as it gloats; wide open when it's hungry
      const mouthCh =
        chew > 0 || gloat > 0 ? (Math.floor(t * (chew > 0 ? 16 : 12)) % 2 ? '▲' : '▼') : hungerFor > 0 ? 'O' : hurt > 0 || low ? '~' : '▼';
      const eyes: [Cell, number, number, number][] = [];
      for (let i = 0; i < total; i++) {
        const c = cells[i];
        const visible = i >= gone;
        const p = Math.min(1, Math.max(0, (t - c.delay) / 0.9));
        const k = easeOut(p);
        // its limbs move (tentacles writhe, wings flap)
        const [mx, my] = c.kind === 'ray' && design.sway ? design.sway(c.x, c.y, t) : [0, 0];
        const [tx, ty] = at(c.x + mx, c.y + my);
        const px = p < 1 ? half + c.sx * scale * (1 - k) + (tx - half) * k : tx;
        const py = p < 1 ? half + c.sy * scale * (1 - k) + (ty - half) * k : ty;
        if (shown[i] && !visible) {
          // knocked off: it flies away as a spark
          const away = Math.atan2(c.y, c.x) + (Math.random() - 0.5) * 0.9;
          const speed = 120 + Math.random() * 220;
          sparks.push({ x: px, y: py, vx: Math.cos(away) * speed, vy: Math.sin(away) * speed, ch: c.kind === 'eye' ? '◉' : c.ch, color: c.kind === 'eye' ? pal.eye : colorOf(c), life: 1, fade: 0.9 });
        }
        // healed: a letter it had lost grows back, flying out of its mouth
        if (!shown[i] && visible && p >= 1) back[i] = t;
        shown[i] = visible;
        if (!visible || p <= 0) continue;
        const grow = back[i] ? (t - back[i]) / REGROW_S : 1;
        let gx = px;
        let gy = py;
        if (grow < 1) {
          const g = easeOut(Math.max(0, grow));
          gx = mouthPx[0] + (px - mouthPx[0]) * g;
          gy = mouthPx[1] + (py - mouthPx[1]) * g;
        }
        if (c.kind === 'eye') {
          eyes.push([c, gx, gy, k]);
          continue;
        }
        if (c.kind !== 'mouth' && Math.random() < mutate * (low ? 2 : 1)) c.ch = pickOf(glyphs);
        ctx.globalAlpha = Math.min(1, p * 1.5, grow < 1 ? 0.3 + grow : 1);
        ctx.fillStyle = grow < 0.6 ? '#ffffff' : redFlash > 0.3 ? '#ff6b7a' : colorOf(c);
        ctx.fillText(c.kind === 'mouth' ? mouthCh : c.ch, gx, gy);
      }
      ctx.globalAlpha = 1;

      // the eyes: glaring, wincing (> <) when hit, gleeful (^ ^) when fed
      const blink = t % 4.2 < 0.12;
      const gaze: [number, number] = low
        ? [Math.random() * 2 - 1, Math.random() * 2 - 1] // panic
        : lookFor > 0
          ? look
          : [Math.sin(t * 0.7) * 0.8, Math.cos(t * 0.53) * 0.5];
      for (const [c, px, py, k] of eyes) {
        const r = scale * eyeR * 1.07 * k;
        ctx.fillStyle = pal.eye;
        ctx.shadowColor = pal.eye;
        ctx.shadowBlur = 14;
        if (hurt > 0 || gloat > 0 || chew > 0) {
          ctx.font = `900 ${cell * 3 * (eyeR / EYE_R)}px ${MONO}`;
          if (hurt > 0) ctx.fillText(Math.abs(c.x - eyeMid) < 0.05 ? 'x' : c.x < eyeMid ? '>' : '<', px, py);
          else ctx.fillText('^', px, py + cell * 0.5);
        } else if (blink) {
          ctx.fillRect(px - r, py - cell * 0.15, r * 2, cell * 0.3);
        } else {
          ctx.beginPath();
          if (pupil === 'square') ctx.roundRect(px - r, py - r * 0.85, r * 2, r * 1.7, r * 0.3);
          else ctx.arc(px, py, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
          // the pupil follows the beams
          const len = Math.hypot(gaze[0], gaze[1]) || 1;
          const reach = r * 0.42 * Math.min(1, len);
          const gx = px + (gaze[0] / len) * reach;
          const gy = py + (gaze[1] / len) * reach;
          const pr = r * (low ? 0.3 : 0.48);
          ctx.fillStyle = '#12051a';
          ctx.beginPath();
          if (pupil === 'slit') ctx.ellipse(gx, gy, pr * 0.34, pr * 1.45, 0, 0, Math.PI * 2);
          else if (pupil === 'square') ctx.rect(gx - pr * 0.8, gy - pr * 0.8, pr * 1.6, pr * 1.6);
          else ctx.arc(gx, gy, pr, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.shadowBlur = 0;
      }

      // cured: the friend swirls in, unscrambles and shows off
      if (ft > 0) {
        // drawn in grid units, moving and turning with the letters
        const inGrid = (alpha: number, paint: () => void) => {
          if (alpha <= 0) return;
          ctx.save();
          ctx.translate(half + jx, half + jy);
          ctx.rotate(rot);
          ctx.scale(scale, scale);
          ctx.globalAlpha = Math.min(1, alpha);
          paint();
          ctx.restore();
        };
        if (looks.back) inGrid((ft - 0.9) / 0.7, () => looks.back?.(ctx, ft, t));
        ctx.font = `800 ${cell * 1.15}px ${MONO}`;
        drawFriendCells(ctx, friend, looks, ft, t, at, pal.mid, cell);
        inGrid((ft - 1.1) / 0.5, () => looks.face(ctx, ft, t));
        if (!cheered && ft >= CHEER_AT) {
          cheered = true;
          rings.push({ color: looks.cheer, life: 1, width: 6 }, { color: '#ffffff', life: 0.7, width: 3 });
          floatUp(half, half, 14, 170);
          if (!quiet) live.current.onCheer?.();
        }
        // sparkles all around, and hearts (or bubbles, or notes…) floating up
        if (ft > 1.6 && Math.random() < dt * 5) {
          const a = Math.random() * Math.PI * 2;
          const r = 0.5 + Math.random() * 0.5;
          twinkles.push({ x: Math.cos(a) * r, y: Math.sin(a) * r, size: 0.5 + Math.random() * 0.6, color: Math.random() < 0.5 ? '#ffffff' : '#fff3b0', life: 1 });
        }
        if (cheered && Math.random() < dt * 1.3) {
          const [fx0, fy0] = floats.at ?? [0, 0.35];
          const [hx, hy] = at(fx0 + (Math.random() - 0.5) * (floats.at ? 0.2 : 0.9), fy0 + (Math.random() - 0.5) * (floats.at ? 0.15 : 0.3));
          floatUp(hx, hy, 1, 25);
        }
      }
      twinkles = twinkles.filter((w) => (w.life -= dt * 1.3) > 0);
      for (const w of twinkles) {
        const [px, py] = at(w.x, w.y);
        ctx.fillStyle = w.color;
        sparkle(ctx, px, py, cell * 0.9 * w.size * Math.sin(Math.PI * w.life));
      }

      // weak: it sweats
      if (low && Math.random() < dt * 4) {
        const [sx, sy] = at(eyeMid + (Math.random() - 0.5) * 0.6, brow);
        sparks.push({ x: sx, y: sy, vx: (Math.random() - 0.5) * 30, vy: 40, ch: '💧', color: '#9be6ff', life: 1, fade: 1.2 });
      }

      // the gloat, rising out of its mouth
      floaters = floaters.filter((f) => (f.life -= dt * 0.7) > 0);
      ctx.font = `900 ${cell * 2.3}px ${MONO}`;
      ctx.lineJoin = 'round';
      for (const f of floaters) {
        const [fx0, fy0] = at(f.x, f.y);
        const y = fy0 - (1 - f.life) * scale * 0.9;
        ctx.globalAlpha = Math.min(1, f.life * 2);
        ctx.lineWidth = 5;
        ctx.strokeStyle = '#2a0610';
        ctx.strokeText(f.text, fx0, y);
        ctx.fillStyle = f.color ?? '#ff4d6a';
        ctx.fillText(f.text, fx0, y);
      }
      ctx.globalAlpha = 1;

      // a number it caught, pulled in spinning and shrinking; then crunch, and its strength comes back
      morsels = morsels.filter((m) => {
        m.p += dt / GULP_S;
        const q = Math.min(1, m.p);
        const e = q * q;
        // a little swirl on the way in
        const side = Math.sin(q * Math.PI) * 0.18;
        const dx = mouthPx[0] - m.x;
        const dy = mouthPx[1] - m.y;
        const x = m.x + dx * e - dy * side;
        const y = m.y + dy * e + dx * side;
        if (q < 1) {
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(m.rot + q * 7);
          ctx.font = `700 ${(m.size * (1 - 0.7 * q)).toFixed(1)}px ${NUMBER_FONT}`;
          ctx.shadowColor = m.color;
          ctx.shadowBlur = 14;
          ctx.fillStyle = m.color;
          ctx.fillText(m.text, 0, 0);
          ctx.restore();
          return true;
        }
        // crunch: it chews, and crumbs of the number fly out
        chew = CHEW_S;
        shake = Math.max(shake, 0.6);
        const bits = [...m.text, '.', '•', ',', '·'];
        for (let i = 0; i < 18; i++) {
          // mostly out and down, like crumbs
          const a = Math.PI / 2 + (Math.random() - 0.5) * 2.8;
          const v = 70 + Math.random() * 170;
          const digit = i < bits.length - 4 || i % 2 === 0;
          sparks.push({
            x: mouthPx[0],
            y: mouthPx[1],
            vx: Math.cos(a) * v,
            vy: Math.sin(a) * v - 40,
            ch: digit ? m.text[i % m.text.length] : bits[m.text.length + (i % 4)],
            color: i % 3 ? m.color : '#ffffff',
            life: 1,
            fade: 0.8 + Math.random() * 0.5,
            crumb: digit ? m.size * (0.45 + Math.random() * 0.35) : m.size * 0.5,
          });
        }
        floaters.push({ text: m.say, x: mouthAt[0] + (Math.random() - 0.5) * 0.25, y: design.mouth.y + 0.16, life: 1, color: '#ffd77a' });
        powerUps.push(t + POWER_AT_S);
        live.current.onCrunch?.();
        return false;
      });
      powerUps = powerUps.filter((at0) => {
        if (at0 > t) return true;
        fedGlow = 1;
        rings.push({ color: pal.mid, life: 0.9, width: 7 }, { color: '#ffffff', life: 0.6, width: 3 });
        live.current.onFed?.();
        return false;
      });

      // beams: from a pilot's ship, arcing into the monster
      ctx.font = `700 ${cell * 1.3}px ${MONO}`;
      beams = beams.filter((b) => {
        b.t += dt / BEAM_S;
        const sx = b.from * size;
        const sy = b.fromY * size;
        const ang = Math.atan2(sy - half, sx - half);
        const ex = half + Math.cos(ang) * scale * 0.4;
        const ey = half + Math.sin(ang) * scale * 0.4;
        const cx = (sx + ex) / 2 + b.bend * size;
        const cy = (sy + ey) / 2;
        const p = Math.min(1, b.t);
        const q = 1 - p;
        const x = q * q * sx + 2 * q * p * cx + p * p * ex;
        const y = q * q * sy + 2 * q * p * cy + p * p * ey;
        b.trail.push([x, y]);
        if (b.trail.length > 9) b.trail.shift();
        b.trail.forEach(([tx, ty], i) => {
          ctx.globalAlpha = ((i + 1) / b.trail.length) * 0.8;
          ctx.fillStyle = b.color;
          ctx.fillText(i % 2 ? '*' : '+', tx, ty);
        });
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = b.color;
        ctx.shadowBlur = 18;
        ctx.beginPath();
        ctx.arc(x, y, cell * 0.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        if (b.t < 1) return true;
        // impact
        shake = 1;
        hurt = 0.55;
        gloat = Math.min(gloat, 0.2);
        burstAt(x, y, 10, [b.color, '#ffffff'], 160);
        rings.push({ color: b.color, life: 0.45, width: 4 });
        return false;
      });

      // sparks and knocked-off characters fall; hearts float up
      sparks = sparks.filter((s) => (s.life -= dt * 0.9 * s.fade) > 0);
      for (const float of [false, true]) {
        ctx.font = `700 ${cell * (float ? 1.5 : 1.2)}px ${MONO}`;
        for (const s of sparks) {
          if (!!s.float !== float) continue;
          s.x += s.vx * dt;
          s.y += s.vy * dt;
          if (float) {
            const slow = Math.exp(-dt * 1.4);
            s.vx *= slow;
            s.vy = s.vy * slow - 40 * dt;
          } else {
            s.vy += 60 * dt;
          }
          ctx.globalAlpha = Math.min(1, s.life * 1.5);
          ctx.fillStyle = s.color;
          if (s.crumb) {
            // a broken-off piece of the number, tumbling
            ctx.save();
            ctx.font = `700 ${s.crumb.toFixed(1)}px ${NUMBER_FONT}`;
            ctx.translate(s.x, s.y);
            ctx.rotate(s.life * 6 * (s.vx < 0 ? -1 : 1));
            ctx.fillText(s.ch, 0, 0);
            ctx.restore();
          } else ctx.fillText(s.ch, s.x, s.y);
        }
      }
      ctx.globalAlpha = 1;

      // the moment it's cured: a warm flash
      if (whiteFlash > 0) {
        const g = ctx.createRadialGradient(half, half, 0, half, half, half);
        g.addColorStop(0, `rgba(255, 244, 214, ${0.9 * whiteFlash})`);
        g.addColorStop(1, 'rgba(255, 244, 214, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, size, size);
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      if (fx) fx.current = null;
    };
  }, [cells, friend, design, monster, fx, lurk, wait]);

  return <canvas ref={canvasRef} className={`sun-monster ${lurk ? 'is-lurking' : ''}`} aria-hidden />;
}
