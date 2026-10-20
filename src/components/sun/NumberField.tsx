import { useEffect, useRef } from 'react';
import { activeMission } from '../../profiles/useProfiles';
import { pickOp, type PilotMission } from '../../game/mission';
import type { MonsterFx } from './MonsterCanvas';

// Numbers drifting through space behind the fight, slowly turning. When the
// monster gets hungry (nobody has answered for a while), feed() picks one
// near it: the monster eyes it and opens wide, the number shivers, then it's
// pulled in, faster and faster, and once it's over the monster it's handed
// over to be swallowed and crunched (MonsterCanvas's swallow).

export interface NumberFieldFx {
  /** pull a number into the monster's mouth; `say` is what it says as it crunches */
  feed: (say: string) => void;
}

interface Num {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  spin: number;
  size: number;
  /** 0.4 (far: small, dim, slow) to 1 (near) */
  depth: number;
  text: string;
  color: string;
  /** when it appears (it fades in) */
  born: number;
  /** when the monster caught it (0: drifting free) */
  caught: number;
  say: string;
}

const COLORS = ['#fdf3e7', '#ffb37a', '#c9a4de', '#7fe0ff', '#ffd77a', '#ff9de2'];
const FONT = "'Fredoka', 'Trebuchet MS', sans-serif";
/** seconds it shivers in the monster's grip before it's pulled */
const GRAB_S = 0.3;
/** at the latest, it's handed over this long after it was caught */
const PULL_S = 1.4;

const rand = (n: number) => Math.floor(Math.random() * n);

function numberText(mission: PilotMission): string {
  if (Math.random() < 0.25) return String(rand(10));
  return pickOp(mission) === 'add' ? String(2 + rand(19)) : String((1 + rand(10)) * (1 + rand(10)));
}

export function NumberField({ fx, field }: { fx: React.RefObject<MonsterFx | null>; field: React.RefObject<NumberFieldFx | null> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const mission = activeMission();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0;
    let h = 0;
    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    };
    resize();
    window.addEventListener('resize', resize);

    const make = (born: number, at?: { x: number; y: number }): Num => {
      const depth = 0.4 + Math.random() * 0.6;
      const a = Math.random() * Math.PI * 2;
      const v = (10 + Math.random() * 26) * depth * (calm ? 0.3 : 1);
      return {
        x: at?.x ?? Math.random() * w,
        y: at?.y ?? Math.random() * h,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        rot: (Math.random() - 0.5) * 0.6,
        spin: (Math.random() - 0.5) * 0.5 * (calm ? 0.3 : 1),
        size: 16 + depth * 20,
        depth,
        text: numberText(mission),
        color: COLORS[rand(COLORS.length)],
        born,
        caught: 0,
        say: '',
      };
    };
    const count = Math.round(Math.min(24, Math.max(8, (w * h) / 28000)));
    let nums: Num[] = Array.from({ length: count }, () => make(performance.now() - 2000));

    field.current = {
      feed: (say) => {
        const mouth = fx.current?.mouth();
        if (!mouth) return;
        const now = performance.now();
        // one drifting near the monster, but not already over it
        const away = (n: Num) => Math.hypot(n.x - mouth.x, n.y - mouth.y);
        const free = nums.filter((n) => !n.caught && n.born <= now && away(n) > mouth.box.width * 0.42).sort((a, b) => away(a) - away(b));
        let snack = free[rand(Math.min(3, free.length))];
        if (!snack) {
          // none about: one drifts in from just beside the monster
          const side = Math.random() < 0.5 ? -1 : 1;
          snack = make(now - 2000, { x: mouth.x + side * mouth.box.width * 0.62, y: mouth.box.top + Math.random() * mouth.box.height * 0.5 });
          nums.push(snack);
        }
        snack.caught = now;
        snack.say = say;
        fx.current?.hungry(snack.x, snack.y);
      },
    };

    let raf = 0;
    let last = performance.now();
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
      last = now;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const mouth = nums.some((n) => n.caught) ? fx.current?.mouth() : null;

      const kept: Num[] = [];
      for (const n of nums) {
        if (n.caught) {
          const e = (now - n.caught) / 1000;
          if (!mouth) continue; // the monster's gone: so is its snack
          const dx = mouth.x - n.x;
          const dy = mouth.y - n.y;
          const dist = Math.hypot(dx, dy) || 1;
          if (e < GRAB_S) {
            // caught: it shivers
            n.x += (Math.random() - 0.5) * 3;
            n.y += (Math.random() - 0.5) * 3;
          } else {
            // pulled in, faster and faster, spinning
            const speed = 60 + 1500 * (e - GRAB_S) ** 2;
            const step = Math.min(dist, speed * dt);
            n.x += (dx / dist) * step;
            n.y += (dy / dist) * step;
            n.rot += dt * 7;
          }
          // grabbed, it's brought close: bigger and brighter, so everyone sees what it's about to eat
          const grip = Math.min(1, e / GRAB_S);
          const size = n.size + (Math.max(34, n.size * 1.3) - n.size) * grip;
          const box = mouth.box;
          const over = n.x > box.left + box.width * 0.15 && n.x < box.right - box.width * 0.15 && n.y > box.top + box.height * 0.1 && n.y < box.bottom - box.height * 0.1;
          if ((over && e >= GRAB_S) || e > PULL_S) {
            // over the monster: it takes it from here
            fx.current?.swallow({ text: n.text, color: n.color, size, rot: n.rot, x: n.x, y: n.y, say: n.say });
            kept.push(make(now + 1500));
            continue;
          }
          kept.push(n);
          ctx.save();
          ctx.translate(n.x, n.y);
          // a smear of it behind, the way it's being pulled
          ctx.font = `700 ${size.toFixed(1)}px ${FONT}`;
          ctx.fillStyle = n.color;
          for (let i = 3; i >= 1; i--) {
            ctx.globalAlpha = 0.12 * (4 - i) * grip;
            ctx.fillText(n.text, (-dx / dist) * i * 9, (-dy / dist) * i * 9);
          }
          ctx.globalAlpha = 1;
          ctx.rotate(n.rot);
          ctx.shadowColor = n.color;
          ctx.shadowBlur = 16;
          ctx.fillText(n.text, 0, 0);
          ctx.restore();
          continue;
        }
        kept.push(n);
        n.x += n.vx * dt;
        n.y += n.vy * dt;
        n.rot += n.spin * dt;
        // drifting off one side brings it back on the other
        const m = n.size * 2;
        if (n.x < -m) n.x = w + m;
        else if (n.x > w + m) n.x = -m;
        if (n.y < -m) n.y = h + m;
        else if (n.y > h + m) n.y = -m;
        const fade = Math.min(1, Math.max(0, (now - n.born) / 1200));
        if (fade <= 0) continue;
        ctx.save();
        ctx.translate(n.x, n.y);
        ctx.rotate(n.rot);
        ctx.globalAlpha = (0.3 + 0.45 * n.depth) * fade;
        ctx.font = `700 ${n.size.toFixed(1)}px ${FONT}`;
        ctx.shadowColor = n.color;
        ctx.shadowBlur = 10 * n.depth;
        ctx.fillStyle = n.color;
        ctx.fillText(n.text, 0, 0);
        ctx.restore();
      }
      nums = kept;
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      field.current = null;
    };
  }, [fx, field]);

  return <canvas ref={canvasRef} className="sun-numbers" aria-hidden />;
}
