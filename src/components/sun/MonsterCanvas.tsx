import { useEffect, useMemo, useRef } from 'react';

// The monster: a sun made of characters that never sit still. Its body and
// rays are cells on a grid, each showing a random glyph that keeps changing,
// with two glaring eyes and a grin of teeth. It assembles itself out of
// flying letters, and it reacts:
//   - a teammate's right answer is a beam in their colour; where it lands
//     the monster winces (> <), shivers and sheds characters (rays first,
//     eyes last), each flying off as a spark;
//   - a wrong answer feeds it: it chomps, swells and gloats in red;
//   - weak, it trembles and sweats; at zero it bursts into a cloud of letters.

const GLYPHS = '#@%&*+=?!$<>{}[]/\\~^0XЖΨΩ§∑∆≈¥¤'.split('');
const N = 29;
const EYE_R = 0.1;
const EYES: [number, number][] = [
  [-0.17, -0.12],
  [0.17, -0.12],
];

type Kind = 'body' | 'ray' | 'eye' | 'mouth';

interface Cell {
  x: number;
  y: number;
  d: number;
  kind: Kind;
  ch: string;
  /** where it flies in from, and when, as the monster assembles */
  sx: number;
  sy: number;
  delay: number;
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ch: string;
  color: string;
  life: number;
  fade: number;
  /** slows down and floats instead of falling (the cloud of letters) */
  drag?: boolean;
}

interface Beam {
  /** where it starts along the bottom edge, 0..1 */
  from: number;
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
}

interface Palette {
  core: string;
  mid: string;
  ray: string;
  glow: string;
  eye: string;
}

const PALETTES: Palette[] = [
  { core: '#fff6c8', mid: '#ffd77a', ray: '#ff9d4a', glow: '255, 160, 60', eye: '#ff2d2d' },
  { core: '#ffe3f6', mid: '#ff8fd0', ray: '#c45bff', glow: '220, 80, 255', eye: '#7dff6a' },
  { core: '#e2fbff', mid: '#6ad7ff', ray: '#5a6bff', glow: '90, 160, 255', eye: '#ff2d2d' },
];

/** seconds a beam takes to reach the monster */
const BEAM_S = 0.36;
const MONO = 'ui-monospace, Menlo, Consolas, monospace';

const glyph = () => GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
const easeOut = (p: number) => 1 - (1 - p) ** 3;

/** the cells, in the order they're knocked off (eyes last) */
function buildMonster(monster: number): Cell[] {
  const tier = Math.min(2, monster);
  const rays = 8 + tier * 4;
  const R = 0.4 + tier * 0.03;
  const tilt = Math.random() * Math.PI;
  const h = (N - 1) / 2;
  const cells: (Cell & { order: number })[] = [];
  const add = (x: number, y: number, kind: Kind) => {
    const d = Math.hypot(x, y);
    const rank = kind === 'eye' ? 3 : kind === 'mouth' ? 2 : kind === 'body' ? 1 : 0;
    const a = Math.random() * Math.PI * 2;
    const far = 1.6 + Math.random() * 0.9;
    cells.push({
      x,
      y,
      d,
      kind,
      ch: glyph(),
      sx: Math.cos(a) * far,
      sy: Math.sin(a) * far,
      delay: kind === 'eye' ? 1.15 : 0.1 + Math.random() * 0.8 + d * 0.15,
      order: rank * 10 - d * 4 + Math.random() * 0.8,
    });
  };
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const x = (c - h) / h;
      const y = (r - h) / h;
      const d = Math.hypot(x, y);
      // eye sockets stay dark: the eyes are drawn whole
      if (EYES.some(([ex, ey]) => Math.hypot(x - ex, y - ey) < EYE_R)) continue;
      if (y > 0.1 && y < 0.26 && Math.abs(x) < 0.25 && Math.abs(y - (0.14 + 0.9 * x * x)) < 0.05) add(x, y, 'mouth');
      else if (d <= R) add(x, y, 'body');
      else {
        // rays: alternating long and short on the tougher monsters
        const step = (Math.PI * 2) / rays;
        const a = Math.atan2(y, x) - tilt;
        const k = Math.round(a / step);
        const da = Math.abs(a - k * step);
        const reach = R + (0.95 - R) * (tier > 0 && k % 2 ? 0.62 : 1);
        const taper = 1 - (d - R) / (reach - R);
        if (d <= reach && da < step * 0.42 * taper) add(x, y, 'ray');
      }
    }
  }
  for (const [ex, ey] of EYES) add(ex, ey, 'eye');
  return cells.sort((a, b) => a.order - b.order);
}

/** what the page can make the monster do */
export interface MonsterFx {
  /** a pilot's right answer: a beam in their colour, from along the bottom edge (0 = left, 1 = right) */
  beam: (color: string, from: number) => void;
  /** a wrong answer: it chomps, swells and says this */
  gloat: (text: string) => void;
  /** a team combo: a shockwave ring */
  ring: (color: string) => void;
}

interface Props {
  monster: number;
  hp: number;
  maxHp: number;
  fx?: React.RefObject<MonsterFx | null>;
  /** lobby: just lurking and looking around */
  lurk?: boolean;
  /** the moment it bursts (for the sound) */
  onBurst?: () => void;
}

export function MonsterCanvas({ monster, hp, maxHp, fx, lurk = false, onBurst }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cells = useMemo(() => buildMonster(monster), [monster]);
  const live = useRef({ hp, maxHp, onBurst });
  useEffect(() => {
    live.current = { hp, maxHp, onBurst };
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const tier = Math.min(2, monster);
    const pal = PALETTES[tier];
    const mutate = 0.03 + tier * 0.025;
    const total = cells.length;
    const goneFor = (h: number, m: number) => (m > 0 ? Math.round(total * (1 - Math.max(0, h) / m)) : 0);
    // already worn down (a phone that joins or reloads mid-fight): no burst for those
    const shown = cells.map((_, i) => i >= goneFor(live.current.hp, live.current.maxHp));
    let sparks: Spark[] = [];
    let beams: Beam[] = [];
    let rings: Ring[] = [];
    let floaters: Floater[] = [];
    let shake = 0;
    let redFlash = 0;
    let whiteFlash = 0;
    let hurt = 0;
    let gloat = 0;
    let look: [number, number] = [0, 1];
    let lookFor = 0;
    let burst = shown.every((s) => !s);
    let raf = 0;
    let last = performance.now();
    const t0 = last;

    const colorOf = (c: Cell) => (c.kind === 'mouth' ? '#c0163f' : c.kind === 'ray' ? pal.ray : c.d < 0.22 ? pal.core : pal.mid);
    const burstAt = (x: number, y: number, n: number, colors: string[], speed: number, linger = false) => {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = speed * (0.4 + Math.random());
        // a lingering cloud drifts slowly and fades over a few seconds
        const fade = linger ? 0.22 + Math.random() * 0.2 : 0.7 + Math.random() * 0.8;
        sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, ch: glyph(), color: colors[i % colors.length], life: 1, fade, drag: linger });
      }
    };

    if (fx) {
      fx.current = {
        beam: (color, from) => {
          beams.push({ from, bend: (Math.random() - 0.5) * 0.5, color, t: 0, trail: [] });
          look = [from * 2 - 1, 1];
          lookFor = 1.2;
        },
        gloat: (text) => {
          gloat = 1.3;
          hurt = 0; // the latest feeling wins
          redFlash = 1;
          floaters.push({ text, x: (Math.random() - 0.5) * 0.3, y: 0.3, life: 1 });
        },
        ring: (color) => {
          rings.push({ color, life: 1, width: 8 }, { color: '#ffffff', life: 0.75, width: 3 });
          shake = Math.max(shake, 0.8);
        },
      };
    }

    const draw = (now: number) => {
      // the first frame can be stamped before the effect ran
      const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
      last = now;
      const t = (now - t0) / 1000;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
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

      shake = Math.max(low ? 0.12 : 0, shake - dt * 2.2);
      redFlash = Math.max(0, redFlash - dt * 1.6);
      whiteFlash = Math.max(0, whiteFlash - dt * 1.4);
      hurt = Math.max(0, hurt - dt);
      gloat = Math.max(0, gloat - dt);
      lookFor = Math.max(0, lookFor - dt);

      const half = size / 2;
      const swell = 1 + 0.07 * Math.sin(Math.min(1, gloat) * Math.PI);
      const scale = half * 0.92 * (1 + 0.025 * Math.sin(t * 2.4)) * swell;
      const jx = (Math.random() - 0.5) * 14 * shake;
      const jy = (Math.random() - 0.5) * 14 * shake;
      const rot = Math.sin(t * 0.5) * 0.07 + shake * (Math.random() - 0.5) * 0.15;
      const cos = Math.cos(rot);
      const sin = Math.sin(rot);
      const at = (x: number, y: number): [number, number] => [half + jx + (x * cos - y * sin) * scale, half + jy + (x * sin + y * cos) * scale];
      const cell = (scale * 2) / N;

      // corona: fades as the monster weakens, flickers when it's nearly done
      if (gone < total) {
        const pulse = (0.75 + 0.25 * Math.sin(t * 3.1)) * (low ? 0.6 + Math.random() * 0.4 : 1);
        const g = ctx.createRadialGradient(half + jx, half + jy, 0, half + jx, half + jy, scale * 0.95);
        g.addColorStop(0, `rgba(${pal.glow}, ${0.55 * pulse * (0.35 + 0.65 * strength)})`);
        g.addColorStop(0.5, `rgba(${pal.glow}, ${0.18 * pulse * strength})`);
        g.addColorStop(1, `rgba(${pal.glow}, 0)`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, size, size);
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

      // the body and rays, flying into place as it assembles
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `700 ${cell * 1.08}px ${MONO}`;
      const mouthCh = gloat > 0 ? (Math.floor(t * 12) % 2 ? '▲' : '▼') : hurt > 0 || low ? '~' : '▼';
      const eyes: [Cell, number, number, number][] = [];
      for (let i = 0; i < total; i++) {
        const c = cells[i];
        const visible = i >= gone;
        const p = Math.min(1, Math.max(0, (t - c.delay) / 0.9));
        const k = easeOut(p);
        const [tx, ty] = at(c.x, c.y);
        const px = p < 1 ? half + c.sx * scale * (1 - k) + (tx - half) * k : tx;
        const py = p < 1 ? half + c.sy * scale * (1 - k) + (ty - half) * k : ty;
        if (shown[i] && !visible) {
          // knocked off: it flies away as a spark
          const away = Math.atan2(c.y, c.x) + (Math.random() - 0.5) * 0.9;
          const speed = 120 + Math.random() * 220;
          sparks.push({ x: px, y: py, vx: Math.cos(away) * speed, vy: Math.sin(away) * speed, ch: c.kind === 'eye' ? '◉' : c.ch, color: c.kind === 'eye' ? pal.eye : colorOf(c), life: 1, fade: 0.9 });
        }
        shown[i] = visible;
        if (!visible || p <= 0) continue;
        if (c.kind === 'eye') {
          eyes.push([c, px, py, k]);
          continue;
        }
        if (c.kind !== 'mouth' && Math.random() < mutate * (low ? 2 : 1)) c.ch = glyph();
        ctx.globalAlpha = Math.min(1, p * 1.5);
        ctx.fillStyle = redFlash > 0.3 ? '#ff6b7a' : colorOf(c);
        ctx.fillText(c.kind === 'mouth' ? mouthCh : c.ch, px, py);
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
        const r = cell * 1.55 * k;
        ctx.fillStyle = pal.eye;
        ctx.shadowColor = pal.eye;
        ctx.shadowBlur = 14;
        if (hurt > 0 || gloat > 0) {
          ctx.font = `900 ${cell * 3}px ${MONO}`;
          if (hurt > 0) ctx.fillText(c.x < 0 ? '>' : '<', px, py);
          else ctx.fillText('^', px, py + cell * 0.5);
        } else if (blink) {
          ctx.fillRect(px - r, py - cell * 0.15, r * 2, cell * 0.3);
        } else {
          ctx.beginPath();
          ctx.arc(px, py, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
          // the pupil follows the beams
          const len = Math.hypot(gaze[0], gaze[1]) || 1;
          const reach = r * 0.42 * Math.min(1, len);
          ctx.fillStyle = '#12051a';
          ctx.beginPath();
          ctx.arc(px + (gaze[0] / len) * reach, py + (gaze[1] / len) * reach, r * (low ? 0.3 : 0.48), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.shadowBlur = 0;
      }

      // weak: it sweats
      if (low && Math.random() < dt * 4) {
        const [sx, sy] = at((Math.random() - 0.5) * 0.6, -0.38);
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
        ctx.fillStyle = '#ff4d6a';
        ctx.fillText(f.text, fx0, y);
      }
      ctx.globalAlpha = 1;

      // beams: from the bottom edge, arcing into the monster
      ctx.font = `700 ${cell * 1.3}px ${MONO}`;
      beams = beams.filter((b) => {
        b.t += dt / BEAM_S;
        const sx = b.from * size;
        const sy = size;
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

      // sparks and knocked-off characters
      ctx.font = `700 ${cell * 1.2}px ${MONO}`;
      sparks = sparks.filter((s) => (s.life -= dt * 0.9 * s.fade) > 0);
      for (const s of sparks) {
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        if (s.drag) {
          const slow = Math.exp(-dt * 1.6);
          s.vx *= slow;
          s.vy = s.vy * slow - 4 * dt;
          if (Math.random() < dt * 3) s.ch = glyph();
        } else {
          s.vy += 60 * dt;
        }
        ctx.globalAlpha = s.life;
        ctx.fillStyle = s.color;
        ctx.fillText(s.ch, s.x, s.y);
      }
      ctx.globalAlpha = 1;

      // defeated: one big flash and a cloud of letters
      if (!burst && gone >= total && beams.length === 0) {
        burst = true;
        whiteFlash = 1;
        rings.push({ color: pal.mid, life: 1, width: 10 }, { color: '#ffffff', life: 0.8, width: 5 });
        burstAt(half, half, 50, [pal.core, pal.mid, pal.ray, '#ffffff'], 320);
        burstAt(half, half, 70, [pal.core, pal.mid, pal.ray], 140, true);
        live.current.onBurst?.();
      } else if (gone < total) {
        burst = false;
      }
      if (whiteFlash > 0) {
        const g = ctx.createRadialGradient(half, half, 0, half, half, half);
        g.addColorStop(0, `rgba(255, 255, 255, ${0.9 * whiteFlash})`);
        g.addColorStop(1, 'rgba(255, 255, 255, 0)');
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
  }, [cells, monster, fx, lurk]);

  return <canvas ref={canvasRef} className={`sun-monster ${lurk ? 'is-lurking' : ''}`} aria-hidden />;
}
