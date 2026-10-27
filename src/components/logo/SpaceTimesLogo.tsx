import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { LOGO } from './layout';
import './logo.css';

// The game's logo, SPACE TIMES (docs/brand/space-times-logo.jpg, cut into its
// pieces by scripts/space-times-logo.py): the art itself without its
// background, its pieces moving. The + × − ÷ tokens orbit the globe along
// their ring (hidden by the globe on the far side, slipping behind the letters
// on the near one), a shine sweeps across the chrome letters, a light scans
// down the globe's lines, the lightning flickers, the little rockets swoop
// off along their trails and come back, and the sparkles twinkle. With
// reduced motion, or `still`, it's the art as drawn.

const DIR = './brand/space-times/';
/** one turn of the tokens round the globe */
const ORBIT_S = 36;

const calm = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/** a layer showing only through one of the logo's masks */
const masked = (name: string): CSSProperties => {
  const url = `url(${DIR}${name}.webp)`;
  return { maskImage: url, WebkitMaskImage: url };
};

/** `height` in px; or else the CSS's --st-h (a number of px) */
export function SpaceTimesLogo({ height, still = false, label = 'Space Times', className = '' }: { height?: number; still?: boolean; label?: string; className?: string }) {
  const tokens = useRef<Array<HTMLImageElement | null>>([]);
  const [moving] = useState(() => !still && !calm());

  // the tokens round their orbit: nearer and bigger along the near side, the globe hiding them on the far side
  useEffect(() => {
    if (!moving) return;
    const { orbit: o, globe: g } = LOGO;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const turn = (((now - start) / 1000) * Math.PI * 2) / ORBIT_S;
      LOGO.tokens.forEach((t, i) => {
        const el = tokens.current[i];
        if (!el) return;
        const a = t.angle - turn;
        const c = Math.cos(a);
        const s = Math.sin(a);
        const dx = o.x + o.long * c * o.ux + o.short * s * o.vx - t.x;
        const dy = o.y + o.long * c * o.uy + o.short * s * o.vy - t.y;
        const k = 1 + 0.12 * s;
        el.style.transform = `translate(${dx}px, ${dy}px) scale(${k})`;
        let mask = 'none';
        if (s < 0) {
          // (the globe, in the token's own pixels: it's moved by dx, dy and scaled by k about its centre)
          const cx = t.x - t.left + (g.x - t.x - dx) / k;
          const cy = t.y - t.top + (g.y - t.y - dy) / k;
          const r = g.r / k;
          mask = `radial-gradient(circle ${r}px at ${cx}px ${cy}px, transparent ${r - 1}px, #000 ${r + 1}px)`;
        }
        el.style.maskImage = mask;
        el.style.setProperty('-webkit-mask-image', mask);
        el.style.opacity = s < 0 ? '0.88' : '1';
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [moving]);

  return (
    <div
      className={`st-logo ${moving ? 'is-moving' : ''} ${className}`}
      style={{ ...(height ? { '--st-h': height } : {}), '--st-art-w': LOGO.width, '--st-art-h': LOGO.height } as CSSProperties}
      role="img"
      aria-label={label}
    >
      <div className="st-logo-art" style={{ width: LOGO.width, height: LOGO.height }}>
        <img className="st-whole" src={`${DIR}base.webp`} alt="" draggable={false} />
        {LOGO.tokens.map((t, i) => (
          <img
            key={i}
            ref={(el) => {
              tokens.current[i] = el;
            }}
            className="st-token"
            src={`${DIR}token-${i}.webp`}
            style={{ left: t.left, top: t.top, width: t.width, height: t.height }}
            alt=""
            draggable={false}
          />
        ))}
        {/* the letters again, over whatever passes behind them */}
        <img className="st-whole" src={`${DIR}base.webp`} style={masked('plate')} alt="" draggable={false} />
        <i className="st-shine" style={masked('shine')} />
        <i className="st-scan" style={masked('globe')} />
        <i className="st-sparks" style={masked('sparks')} />
        {LOGO.rockets.map((r, i) => (
          <img
            key={i}
            className="st-rocket"
            src={`${DIR}rocket-${i}.webp`}
            style={{ left: r.left, top: r.top, width: r.width, height: r.height, '--dx': r.dx, '--dy': r.dy, animationDelay: `${-i * 1.9}s` } as CSSProperties}
            alt=""
            draggable={false}
          />
        ))}
        {LOGO.sparkles.map((s, i) => (
          <img
            key={i}
            className="st-sparkle"
            src={`${DIR}sparkle-${i}.webp`}
            style={{ left: s.left, top: s.top, width: s.width, height: s.height, animationDuration: `${1.7 + ((i * 0.53) % 1.5)}s`, animationDelay: `${-i * 0.71}s` }}
            alt=""
            draggable={false}
          />
        ))}
      </div>
    </div>
  );
}
