import { useEffect, useMemo, useRef } from 'react';

// The monster: a sun made of characters that never sit still. Its body,
// rays, eyes and jagged mouth are cells on a grid, each showing a random
// glyph that keeps changing. As its hit points drop it sheds cells, rays
// first and eyes last, each one flying off as a spark; a blow makes it
// shiver, a heal flashes it red, and at zero it bursts into letters.

const GLYPHS = '#@%&*+=?!$<>{}[]/\\~^0XЖΨΩ§∑∆≈¥¤'.split('');
const N = 29;

type Kind = 'body' | 'ray' | 'eye' | 'mouth';

interface Cell {
  x: number;
  y: number;
  d: number;
  kind: Kind;
  ch: string;
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ch: string;
  color: string;
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

const glyph = () => GLYPHS[Math.floor(Math.random() * GLYPHS.length)];

/** the cells, in the order they're knocked off (eyes last) */
function buildMonster(monster: number): Cell[] {
  const tier = Math.min(2, monster);
  const rays = 8 + tier * 4;
  const R = 0.4 + tier * 0.03;
  const tilt = Math.random() * Math.PI;
  const h = (N - 1) / 2;
  const cells: (Cell & { order: number })[] = [];
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const x = (c - h) / h;
      const y = (r - h) / h;
      const d = Math.hypot(x, y);
      let kind: Kind | null = null;
      const eye = Math.min(Math.hypot(x + 0.17, y + 0.12), Math.hypot(x - 0.17, y + 0.12));
      if (eye < 0.085) kind = 'eye';
      else if (y > 0.1 && y < 0.26 && Math.abs(x) < 0.25 && Math.abs(y - (0.14 + 0.9 * x * x)) < 0.05) kind = 'mouth';
      else if (d <= R) kind = 'body';
      else {
        // rays: alternating long and short on the tougher monsters
        const step = (Math.PI * 2) / rays;
        const a = Math.atan2(y, x) - tilt;
        const k = Math.round(a / step);
        const da = Math.abs(a - k * step);
        const reach = R + (0.95 - R) * (tier > 0 && k % 2 ? 0.62 : 1);
        const taper = 1 - (d - R) / (reach - R);
        if (d <= reach && da < step * 0.42 * taper) kind = 'ray';
      }
      if (!kind) continue;
      const rank = kind === 'eye' ? 3 : kind === 'mouth' ? 2 : kind === 'body' ? 1 : 0;
      cells.push({ x, y, d, kind, ch: glyph(), order: rank * 10 - d * 4 + Math.random() * 0.8 });
    }
  }
  return cells.sort((a, b) => a.order - b.order);
}

interface Props {
  monster: number;
  hp: number;
  maxHp: number;
  /** running counts from the referee: each step is one blow / one heal */
  blows: number;
  heals: number;
}

export function MonsterCanvas({ monster, hp, maxHp, blows, heals }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cells = useMemo(() => buildMonster(monster), [monster]);
  const live = useRef({ hp, maxHp, blows, heals });
  live.current = { hp, maxHp, blows, heals };

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const tier = Math.min(2, monster);
    const pal = PALETTES[tier];
    const mutate = 0.03 + tier * 0.025;
    // already worn down (a phone that joins or reloads mid-fight): no burst for those
    const start = live.current;
    const startGone = start.maxHp > 0 ? Math.round(cells.length * (1 - Math.max(0, start.hp) / start.maxHp)) : 0;
    const shown = cells.map((_, i) => i >= startGone);
    let sparks: Spark[] = [];
    let shake = 0;
    let flash = 0;
    let appear = 0;
    let { blows: seenBlows, heals: seenHeals } = live.current;
    let raf = 0;
    let last = performance.now();
    const t0 = last;

    const colorOf = (c: Cell) =>
      c.kind === 'eye' ? pal.eye : c.kind === 'mouth' ? '#2a0610' : c.kind === 'ray' ? pal.ray : c.d < 0.22 ? pal.core : pal.mid;

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

      const { hp: nowHp, maxHp: nowMax, blows: b, heals: hl } = live.current;
      if (b > seenBlows) shake = 1;
      if (hl > seenHeals) flash = 1;
      seenBlows = b;
      seenHeals = hl;
      shake = Math.max(0, shake - dt * 2.2);
      flash = Math.max(0, flash - dt * 1.6);
      appear = Math.min(1, appear + dt * 0.9);

      const strength = nowMax > 0 ? Math.max(0, nowHp) / nowMax : 1;
      const gone = Math.round(cells.length * (1 - strength));
      const half = size / 2;
      const ease = 1 - (1 - appear) ** 3;
      const scale = half * 0.92 * ease * (1 + 0.025 * Math.sin(t * 2.4));
      const jx = (Math.random() - 0.5) * 14 * shake;
      const jy = (Math.random() - 0.5) * 14 * shake;
      const rot = Math.sin(t * 0.5) * 0.07 + shake * (Math.random() - 0.5) * 0.15;
      const cos = Math.cos(rot);
      const sin = Math.sin(rot);
      const at = (x: number, y: number): [number, number] => [half + jx + (x * cos - y * sin) * scale, half + jy + (x * sin + y * cos) * scale];

      // corona: fades as the monster weakens
      if (gone < cells.length) {
        const pulse = 0.75 + 0.25 * Math.sin(t * 3.1);
        const g = ctx.createRadialGradient(half + jx, half + jy, 0, half + jx, half + jy, scale * 0.95);
        g.addColorStop(0, `rgba(${pal.glow}, ${0.55 * pulse * (0.35 + 0.65 * strength)})`);
        g.addColorStop(0.5, `rgba(${pal.glow}, ${0.18 * pulse * strength})`);
        g.addColorStop(1, `rgba(${pal.glow}, 0)`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, size, size);
      }
      if (flash > 0) {
        const g = ctx.createRadialGradient(half, half, 0, half, half, scale);
        g.addColorStop(0, `rgba(255, 40, 60, ${0.5 * flash})`);
        g.addColorStop(1, 'rgba(255, 40, 60, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, size, size);
      }

      const cell = (scale * 2) / N;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `700 ${cell * 1.08}px ui-monospace, Menlo, Consolas, monospace`;
      for (let i = 0; i < cells.length; i++) {
        const c = cells[i];
        const visible = i >= gone;
        if (shown[i] && !visible) {
          // knocked off: it flies away as a spark
          const [px, py] = at(c.x, c.y);
          const away = Math.atan2(c.y, c.x) + (Math.random() - 0.5) * 0.9;
          const speed = 120 + Math.random() * 220;
          sparks.push({ x: px, y: py, vx: Math.cos(away) * speed, vy: Math.sin(away) * speed, ch: c.ch, color: colorOf(c), life: 1 });
        }
        shown[i] = visible;
        if (!visible) continue;
        if (c.kind !== 'eye' && c.kind !== 'mouth' && Math.random() < mutate) c.ch = glyph();
        const [px, py] = at(c.x, c.y);
        ctx.fillStyle = flash > 0.3 && c.kind !== 'eye' ? '#ff6b7a' : colorOf(c);
        if (c.kind === 'eye') {
          // the eyes glare: a big glowing ring, blinking now and then
          if ((t + i * 0.01) % 4.2 < 0.12) continue;
          ctx.shadowColor = pal.eye;
          ctx.shadowBlur = 10;
          ctx.fillText('◉', px, py);
          ctx.shadowBlur = 0;
        } else {
          ctx.fillText(c.kind === 'mouth' ? '▼' : c.ch, px, py);
        }
      }

      ctx.font = `700 ${cell * 1.2}px ui-monospace, Menlo, Consolas, monospace`;
      sparks = sparks.filter((s) => (s.life -= dt * 0.9) > 0);
      for (const s of sparks) {
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.vy += 60 * dt;
        ctx.globalAlpha = s.life;
        ctx.fillStyle = s.color;
        ctx.fillText(s.ch, s.x, s.y);
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [cells, monster]);

  return <canvas ref={canvasRef} className="sun-monster" aria-hidden />;
}
