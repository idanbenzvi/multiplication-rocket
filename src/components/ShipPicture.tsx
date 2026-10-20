import { useId, useMemo } from 'react';
import { shipArt, type ShipId } from './scene/ships';

interface Props {
  ship: ShipId;
  /** the classic rocket's colour */
  accent: string;
  admiral?: boolean;
  /** the pilot, looking out of the window */
  avatar?: string;
  /** just the ship, filling the picture (rather than the rocket's whole frame) */
  fit?: boolean;
  className?: string;
}

// A ship's front as a picture on the page (the hangar, the wormhole's dive):
// the same art as the 3D rocket's texture (ships.ts), with the pilot in the
// window behind the glass, drawn in an SVG so it's sharp at any size.
export function ShipPicture({ ship, accent, admiral = false, avatar, fit = false, className = '' }: Props) {
  const id = useId().replace(/:/g, '');
  const art = useMemo(() => shipArt(ship, accent, false, admiral), [ship, accent, admiral]);
  const drawing = useMemo(() => (art.svg ? `data:image/svg+xml;utf8,${encodeURIComponent(art.svg)}` : null), [art]);
  const w = art.windows[0];
  // the frame is 200 × 400; window fractions are of the width (y of the height)
  const cx = w.x * 200;
  const cy = w.y * 400;
  const rx = w.radius * 200;
  const ry = (w.ry ?? w.radius) * 200;
  const tilt = ((w.tilt ?? 0) * 180) / Math.PI;
  const seat = w.seat ?? { dx: 0, dy: 0.12 * w.radius, size: 1.8 };
  const p = art.picture;
  return (
    <svg className={`ship-picture ${className}`} viewBox={fit ? art.bounds.join(' ') : '0 0 200 400'} aria-hidden="true">
      <defs>
        <clipPath id={`${id}-glass`}>
          <ellipse cx={cx} cy={cy} rx={rx} ry={ry} transform={`rotate(${tilt} ${cx} ${cy})`} />
        </clipPath>
        <radialGradient id={`${id}-glare`} cx="0.3" cy="0.28" r="0.6">
          <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="0.4" stopColor="#fff" stopOpacity="0.12" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      {p && <image href={p.url} x={p.x * 200} y={p.y * 400} width={p.width * 200} height={p.height * 400} />}
      {drawing && <image href={drawing} x="0" y="0" width="200" height="400" />}
      {avatar && (
        <g clipPath={`url(#${id}-glass)`}>
          <text
            x={cx + seat.dx * 200}
            y={cy + seat.dy * 200}
            fontSize={rx * seat.size}
            textAnchor="middle"
            dominantBaseline="central"
          >
            {avatar}
          </text>
          {w.tint && <rect x={cx - rx} y={cy - ry} width={rx * 2} height={ry * 2} fill={w.tint} />}
          {w.glare !== false && <rect x={cx - rx} y={cy - ry} width={rx * 2} height={ry * 2} fill={`url(#${id}-glare)`} />}
        </g>
      )}
    </svg>
  );
}
