import { useEffect, useRef } from 'react';
import { activeMission } from '../../profiles/useProfiles';
import { pickOp, type PilotMission } from '../../game/mission';

// Through the cockpit's windscreen: space drifting gently by, and numbers
// floating past among the stars (the pilot's own times tables, or sums).
// Things come from far ahead, grow as they near, and slip past the edges.

interface Star {
  x: number;
  y: number;
  z: number;
  color: string;
}

interface Glyph {
  x: number;
  y: number;
  z: number;
  text: string;
  color: string;
  tilt: number;
  spin: number;
}

const STAR_COLORS = ['#ffffff', '#cfe9ff', '#ffd6f4', '#fff2c4'];
const GLYPH_COLORS = ['#fdf3e7', '#ffb37a', '#c9a4de', '#7fe0ff', '#ffd77a'];
const STARS = 220;
const GLYPHS = 16;
/** depth travelled per second (everything starts at 1): a gentle cruise */
const SPEED = 0.06;
/** how close things come before they're gone */
const NEAR = 0.12;

const rand = (n: number) => Math.floor(Math.random() * n);

function glyphText(mission: PilotMission): string {
  const r = Math.random();
  if (pickOp(mission) === 'add') {
    const a = 1 + rand(19);
    const b = 1 + rand(19);
    return r < 0.45 ? `${a}+${b}` : r < 0.8 ? String(a + b) : String(rand(10));
  }
  const a = 1 + rand(10);
  const b = 1 + rand(10);
  return r < 0.45 ? `${a}×${b}` : r < 0.8 ? String(a * b) : String(rand(10));
}

function newGlyph(mission: PilotMission, z: number): Glyph {
  // out from the middle, so they part around the way ahead rather than fly at your nose
  const angle = Math.random() * Math.PI * 2;
  const dist = 0.3 + Math.random() * 0.9;
  return {
    x: Math.cos(angle) * dist,
    y: Math.sin(angle) * dist * 0.75,
    z,
    text: glyphText(mission),
    color: GLYPH_COLORS[rand(GLYPH_COLORS.length)],
    tilt: (Math.random() - 0.5) * 0.5,
    spin: (Math.random() - 0.5) * 0.3,
  };
}

export function CockpitSpace({ calm }: { calm: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const mission = activeMission();
    const stars: Star[] = Array.from({ length: STARS }, () => ({
      x: (Math.random() - 0.5) * 2.4,
      y: (Math.random() - 0.5) * 2.4,
      z: Math.random(),
      color: STAR_COLORS[rand(STAR_COLORS.length)],
    }));
    // already on their way when the cockpit opens
    const glyphs = Array.from({ length: GLYPHS }, (_, i) => newGlyph(mission, NEAR + ((i + Math.random()) / GLYPHS) * (1 - NEAR)));
    const speed = SPEED * (calm ? 0.2 : 1);

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0;
    let h = 0;
    const resize = () => {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    let raf = 0;
    let last = performance.now();
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (!w || !h) return;
      const cx = w / 2;
      const cy = h * 0.46;
      const f = Math.max(w, h * 1.6) * 0.42;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // deep space, a faint glow far ahead
      const sky = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.85);
      sky.addColorStop(0, '#2a1d55');
      sky.addColorStop(0.5, '#140e2c');
      sky.addColorStop(1, '#07050f');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);

      for (const s of stars) {
        s.z -= dt * speed * 1.6;
        if (s.z <= NEAR) {
          s.x = (Math.random() - 0.5) * 2.4;
          s.y = (Math.random() - 0.5) * 2.4;
          s.z = 1;
        }
        const near = 1 - s.z;
        const x = cx + (s.x / s.z) * f * 0.5;
        const y = cy + (s.y / s.z) * f * 0.5;
        ctx.globalAlpha = Math.min(1, near * 1.4) * 0.9;
        ctx.fillStyle = s.color;
        ctx.beginPath();
        ctx.arc(x, y, 0.5 + near * 1.6, 0, Math.PI * 2);
        ctx.fill();
      }

      // the numbers, farthest first
      glyphs.sort((a, b) => b.z - a.z);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.direction = 'ltr';
      for (let i = 0; i < glyphs.length; i++) {
        const g = glyphs[i];
        g.z -= dt * speed;
        g.tilt += dt * g.spin;
        const x = cx + (g.x / g.z) * f;
        const y = cy + (g.y / g.z) * f;
        const size = 15 / g.z;
        if (g.z <= NEAR || x < -size * 3 || x > w + size * 3 || y < -size * 2 || y > h + size * 2) {
          glyphs[i] = newGlyph(mission, 1);
          continue;
        }
        const fadeIn = Math.min(1, (1 - g.z) / 0.2);
        const fadeOut = Math.min(1, (g.z - NEAR) / 0.18);
        ctx.globalAlpha = 0.75 * fadeIn * fadeOut;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(g.tilt);
        ctx.font = `700 ${size.toFixed(1)}px Fredoka, sans-serif`;
        ctx.shadowColor = g.color;
        ctx.shadowBlur = 10;
        ctx.fillStyle = g.color;
        ctx.fillText(g.text, 0, 0);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [calm]);

  return <canvas ref={canvasRef} className="ck-space" aria-hidden />;
}
