import { useEffect, useState } from 'react';
import type { Side } from '../../game/splitSky';

interface Props {
  rows: number;
  /** columns on this phone */
  cols: number;
  /** the wider half's columns: both phones size their stars by it, so they match across the seam */
  sizeCols: number;
  side: Side;
  lit: boolean;
}

const WAVE_STEP_MS = 90;

function useViewport() {
  const [size, setSize] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  useEffect(() => {
    const on = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return size;
}

// This phone's half of the sky. It hugs the seam (the edge touching the
// other phone), so the two halves read as one array when the phones are
// side by side. When the constellation lights, a glow wave starts at the
// seam and runs outward: each star waits by its distance from the seam, so
// on the two phones together the wave looks continuous across the gap.
export function SkyGrid({ rows, cols, sizeCols, side, lit }: Props) {
  const { w, h } = useViewport();
  const cell = Math.floor(Math.max(18, Math.min(52, (w - 32) / sizeCols, (h * 0.4) / rows)));
  return (
    <div className={`sky-grid-wrap is-${side}`} dir="ltr">
      <div
        className={`sky-grid ${lit ? 'is-lit' : ''}`}
        style={{ gridTemplateColumns: `repeat(${cols}, ${cell}px)`, gridAutoRows: `${cell}px` }}
      >
        {Array.from({ length: rows * cols }, (_, i) => {
          const c = i % cols;
          const fromSeam = side === 'left' ? cols - 1 - c : c;
          return <span key={i} className="sky-star" style={{ animationDelay: lit ? `${fromSeam * WAVE_STEP_MS}ms` : `${(i % 7) * 0.4}s` }} />;
        })}
      </div>
      <div className="sky-seam" aria-hidden />
    </div>
  );
}
