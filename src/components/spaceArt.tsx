import { useId, useMemo } from 'react';
import { useAdmiral } from '../game/useAchievements';
import { useShip } from '../profiles/useProfiles';
import { GOLD_STOPS, starPoints } from './scene/illustrations';
import { rearSvg } from './scene/ships';

// Drawings shared by the forward-looking bonus rounds (Fleet Battle,
// Stranded Fleet): the rear-view ship, the saucer, the cannon pickup.

// ---------- small illustrations ----------

// (Space Traffic and the Black Sun draw the same ship on a canvas: rearShipSvg in traffic/trafficArt.ts)
// The pilot's own ship (drawn with no colour given) is the one they fly
// (the Explorer's and Nova's backs are drawn in ships.ts), and wears the admiral's livery
// once they're a Space Admiral: gold wings with a navy star each, and a navy
// band with a gold star across the hull. Other ships (a fleet, teammates)
// are always the classic, in their colour.
export function RearShip({ color, size }: { color?: string; size: number }) {
  const own = color === undefined;
  const admiral = useAdmiral() && own;
  const ship = useShip();
  const pictured = own && ship !== 'classic' ? ship : null;
  const gold = `rear-gold-${useId().replace(/:/g, '')}`;
  const src = useMemo(() => (pictured ? `data:image/svg+xml;utf8,${encodeURIComponent(rearSvg(pictured, admiral))}` : ''), [pictured, admiral]);
  if (pictured) return <img src={src} width={size} height={size} className="rear-ship" alt="" draggable={false} />;
  return (
    <svg width={size} height={size} viewBox="-50 -50 100 100" className="rear-ship">
      {admiral && (
        <defs>
          <linearGradient id={gold} x1="0" y1="0" x2="1" y2="1">
            {GOLD_STOPS.map(([offset, c]) => (
              <stop key={offset} offset={offset} stopColor={c} />
            ))}
          </linearGradient>
        </defs>
      )}
      <path d="M-46 14 L-14 -4 L-14 22 Z M46 14 L14 -4 L14 22 Z" fill={admiral ? `url(#${gold})` : (color ?? '#ff9d76')} stroke="#2b2033" strokeWidth="4" strokeLinejoin="round" />
      <ellipse cx="0" cy="4" rx="22" ry="30" fill="#faf3e6" stroke="#2b2033" strokeWidth="5" />
      <circle cx="0" cy="-6" r="13" fill="#bfe6f5" stroke="#2b2033" strokeWidth="4" />
      <circle cx="-11" cy="28" r="7" fill="#6ad7ff" stroke="#2b2033" strokeWidth="3" />
      <circle cx="11" cy="28" r="7" fill="#6ad7ff" stroke="#2b2033" strokeWidth="3" />
      {admiral && (
        <>
          <polygon points={starPoints(-25, 12, 5)} fill="#24206e" />
          <polygon points={starPoints(25, 12, 5)} fill="#24206e" />
          <rect x="-20" y="10" width="40" height="9" rx="3" fill="#24206e" stroke="#2b2033" strokeWidth="2" />
          <polygon points={starPoints(0, 14.6, 4.6)} fill="#ffcf4a" />
        </>
      )}
    </svg>
  );
}

export function Saucer({ size }: { size: number }) {
  return (
    <svg width={size} height={size * 0.7} viewBox="-50 -35 100 70" className="saucer">
      <ellipse cx="0" cy="-8" rx="20" ry="16" fill="#9fe0a8" stroke="#2b2033" strokeWidth="4" />
      <circle cx="-7" cy="-10" r="4" fill="#2b2033" />
      <circle cx="7" cy="-10" r="4" fill="#2b2033" />
      <ellipse cx="0" cy="8" rx="44" ry="13" fill="#c9a4de" stroke="#2b2033" strokeWidth="4" />
      <circle cx="-24" cy="9" r="3.5" fill="#ffd77a" />
      <circle cx="0" cy="12" r="3.5" fill="#ffd77a" />
      <circle cx="24" cy="9" r="3.5" fill="#ffd77a" />
    </svg>
  );
}

export function CannonPickup({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="-50 -50 100 100" className="cannon-pickup">
      <circle r="44" fill="rgba(255, 106, 213, 0.18)" stroke="#ff6ad5" strokeWidth="4" />
      <rect x="-9" y="-34" width="18" height="44" rx="6" fill="#ffd77a" stroke="#2b2033" strokeWidth="4" />
      <rect x="-20" y="6" width="40" height="22" rx="8" fill="#ff9d76" stroke="#2b2033" strokeWidth="4" />
      <circle cx="0" cy="-36" r="7" fill="#fff" />
    </svg>
  );
}
