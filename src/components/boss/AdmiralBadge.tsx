import { useId } from 'react';
import './boss.css';

// The Space Admiral's badge, for curing the Black Sun: a gold medal in a
// laurel wreath, on a burst of rays, with the cured sun smiling in the middle
// under five admiral's stars, and a ribbon across the bottom. It's the
// badge's picture in the badges screen (BadgeArt), the Space Admiral rank's
// insignia, and the finale's big badge, where the rays turn and a shine
// sweeps across it (`live`). The ribbon's word shows only when it's big
// enough to read.

const RAYS = 16;
const LEAVES = 8;

function star(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    pts.push(`${(cx + Math.cos(a) * rr).toFixed(2)},${(cy + Math.sin(a) * rr).toFixed(2)}`);
  }
  return pts.join(' ');
}

/** one side of the wreath (`side` -1 left, 1 right): a branch curving up from the bottom, leaves in pairs along it, smaller towards the tip */
function Branch({ side, fill, stroke }: { side: number; fill: string; stroke: string }) {
  const p0 = { x: side * 18, y: 80 };
  const p1 = { x: side * 96, y: 62 };
  const p2 = { x: side * 76, y: -46 };
  const at = (k: number) => ({
    x: (1 - k) ** 2 * p0.x + 2 * (1 - k) * k * p1.x + k * k * p2.x,
    y: (1 - k) ** 2 * p0.y + 2 * (1 - k) * k * p1.y + k * k * p2.y,
  });
  const heading = (k: number) => Math.atan2(2 * (1 - k) * (p1.y - p0.y) + 2 * k * (p2.y - p1.y), 2 * (1 - k) * (p1.x - p0.x) + 2 * k * (p2.x - p1.x));
  const leaf = (len: number, w: number) => `M 0 0 Q ${len / 2} ${-w} ${len} 0 Q ${len / 2} ${w} 0 0 Z`;
  return (
    <g>
      <path d={`M ${p0.x} ${p0.y} Q ${p1.x} ${p1.y} ${p2.x} ${p2.y}`} fill="none" stroke={stroke} strokeWidth="3" strokeLinecap="round" />
      {Array.from({ length: LEAVES }, (_, i) => {
        const k = 0.1 + (i / (LEAVES - 1)) * 0.86;
        const p = at(k);
        const a = (heading(k) * 180) / Math.PI;
        const len = 19 - i * 1.25;
        return (
          <g key={i} transform={`translate(${p.x.toFixed(2)} ${p.y.toFixed(2)})`}>
            {[-1, 1].map((out) => (
              <path key={out} d={leaf(len, len * 0.42)} transform={`rotate(${(a + out * 38).toFixed(1)})`} fill={fill} stroke={stroke} strokeWidth="1.4" strokeLinejoin="round" />
            ))}
          </g>
        );
      })}
      {/* a leaf at the tip */}
      <path d={leaf(12, 4.5)} transform={`translate(${p2.x} ${p2.y}) rotate(${((heading(1) * 180) / Math.PI).toFixed(1)})`} fill={fill} stroke={stroke} strokeWidth="1.4" />
    </g>
  );
}

export function AdmiralBadge({ size, live = false, ribbon }: { size: number; live?: boolean; ribbon?: string }) {
  const id = useId().replace(/:/g, '');
  const u = (name: string) => `${name}-${id}`;
  const showWord = !!ribbon && size >= 90;
  return (
    <svg width={size} height={size} viewBox="-100 -100 200 200" className={`admiral-badge ${live ? 'is-live' : ''}`} aria-hidden>
      <defs>
        <linearGradient id={u('gold')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff6cf" />
          <stop offset="0.3" stopColor="#ffd45a" />
          <stop offset="0.55" stopColor="#e39a1b" />
          <stop offset="0.75" stopColor="#ffe48a" />
          <stop offset="1" stopColor="#b26f0c" />
        </linearGradient>
        <radialGradient id={u('enamel')} cx="0.42" cy="0.36" r="0.75">
          <stop offset="0" stopColor="#4a5cf0" />
          <stop offset="0.55" stopColor="#2a2384" />
          <stop offset="1" stopColor="#120c3a" />
        </radialGradient>
        <radialGradient id={u('sun')} cx="0.42" cy="0.38" r="0.7">
          <stop offset="0" stopColor="#fffbe8" />
          <stop offset="0.45" stopColor="#ffe066" />
          <stop offset="1" stopColor="#ff9f2e" />
        </radialGradient>
        <radialGradient id={u('burst')} r="0.5">
          <stop offset="0.35" stopColor="#ffe9a8" stopOpacity="0.95" />
          <stop offset="1" stopColor="#ffb347" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={u('ribbon')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ff6f98" />
          <stop offset="1" stopColor="#b3134f" />
        </linearGradient>
        <linearGradient id={u('shine')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.75" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <clipPath id={u('medal')}>
          <circle r="64" />
        </clipPath>
      </defs>

      {/* the burst of rays behind it */}
      <g className="admiral-badge-rays">
        {Array.from({ length: RAYS }, (_, i) => {
          const a = (i / RAYS) * Math.PI * 2;
          const len = i % 2 ? 84 : 98;
          const w = 0.09;
          return (
            <polygon
              key={i}
              points={`${Math.cos(a - w) * 40},${Math.sin(a - w) * 40} ${Math.cos(a) * len},${Math.sin(a) * len} ${Math.cos(a + w) * 40},${Math.sin(a + w) * 40}`}
              fill={`url(#${u('burst')})`}
            />
          );
        })}
      </g>

      <Branch side={-1} fill="#ffd45a" stroke="#9a5d0a" />
      <Branch side={1} fill="#ffd45a" stroke="#9a5d0a" />

      {/* the medal: a gold rim round deep blue enamel */}
      <circle r="66" fill="#6b3f06" />
      <circle r="64" fill={`url(#${u('gold')})`} />
      <circle r="54" fill={`url(#${u('enamel')})`} stroke="#7a4a08" strokeWidth="2" />
      <circle r="49" fill="none" stroke="#ffd45a" strokeWidth="1.4" strokeDasharray="1.5 4.2" strokeLinecap="round" opacity="0.85" />

      {/* five admiral's stars in an arc */}
      {Array.from({ length: 5 }, (_, i) => {
        const a = (-150 + i * 30) * (Math.PI / 180);
        return <polygon key={i} points={star(Math.cos(a) * 37, Math.sin(a) * 37 + 2, 6.4)} fill="#ffe48a" stroke="#9a5d0a" strokeWidth="1" />;
      })}

      {/* the cured sun, smiling */}
      <g transform="translate(0 10)">
        {Array.from({ length: 12 }, (_, i) => {
          const a = (i / 12) * Math.PI * 2;
          return (
            <polygon
              key={i}
              points={`${Math.cos(a - 0.2) * 19},${Math.sin(a - 0.2) * 19} ${Math.cos(a) * 28},${Math.sin(a) * 28} ${Math.cos(a + 0.2) * 19},${Math.sin(a + 0.2) * 19}`}
              fill="#ffc94a"
              stroke="#b8700c"
              strokeWidth="1"
              strokeLinejoin="round"
            />
          );
        })}
        <circle r="19" fill={`url(#${u('sun')})`} stroke="#b8700c" strokeWidth="1.6" />
        {/* happy closed eyes, rosy cheeks and a grin */}
        <path d="M -10 -3 Q -6.5 -8 -3 -3 M 3 -3 Q 6.5 -8 10 -3" fill="none" stroke="#7a3a12" strokeWidth="2.2" strokeLinecap="round" />
        <ellipse cx="-11" cy="4" rx="3.6" ry="2.2" fill="#ff8fa3" opacity="0.75" />
        <ellipse cx="11" cy="4" rx="3.6" ry="2.2" fill="#ff8fa3" opacity="0.75" />
        <path d="M -7.5 4 Q 0 13 7.5 4 Z" fill="#c2410c" stroke="#7a3a12" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M -3.5 8.2 Q 0 6.4 3.5 8.2 Q 0 10.4 -3.5 8.2 Z" fill="#ff7a8a" />
      </g>

      {/* a shine sweeping across the medal */}
      {live && (
        <g clipPath={`url(#${u('medal')})`}>
          <rect className="admiral-badge-shine" x="-150" y="-80" width="60" height="160" fill={`url(#${u('shine')})`} transform="rotate(20)" />
        </g>
      )}

      {/* the star on top */}
      <polygon points={star(0, -70, 15)} fill={`url(#${u('gold')})`} stroke="#7a4a08" strokeWidth="2" strokeLinejoin="round" />

      {/* the ribbon across the bottom, its tails folded back */}
      <path d="M -86 52 L -66 46 L -62 68 L -84 74 L -76 63 Z" fill="#8f0f3f" stroke="#5c0828" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M 86 52 L 66 46 L 62 68 L 84 74 L 76 63 Z" fill="#8f0f3f" stroke="#5c0828" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M -70 44 Q 0 30 70 44 L 70 66 Q 0 52 -70 66 Z" fill={`url(#${u('ribbon')})`} stroke="#5c0828" strokeWidth="2" strokeLinejoin="round" />
      <path d="M -66 48 Q 0 34.5 66 48" fill="none" stroke="#ffd45a" strokeWidth="1.2" opacity="0.8" />
      {showWord && (
        <text x="0" y="57" textAnchor="middle" fontSize="13" fontWeight="800" letterSpacing="2.5" fill="#fff6e0" style={{ fontFamily: 'var(--font-display)' }}>
          {ribbon}
        </text>
      )}
    </svg>
  );
}
