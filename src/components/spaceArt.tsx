// Drawings shared by the forward-looking bonus rounds (Fleet Battle,
// Stranded Fleet): the rear-view ship, the saucer, the cannon pickup.

// ---------- small illustrations ----------

export function RearShip({ color = '#ff9d76', size }: { color?: string; size: number }) {
  return (
    <svg width={size} height={size} viewBox="-50 -50 100 100" className="rear-ship">
      <path d="M-46 14 L-14 -4 L-14 22 Z M46 14 L14 -4 L14 22 Z" fill={color} stroke="#2b2033" strokeWidth="4" strokeLinejoin="round" />
      <ellipse cx="0" cy="4" rx="22" ry="30" fill="#faf3e6" stroke="#2b2033" strokeWidth="5" />
      <circle cx="0" cy="-6" r="13" fill="#bfe6f5" stroke="#2b2033" strokeWidth="4" />
      <circle cx="-11" cy="28" r="7" fill="#6ad7ff" stroke="#2b2033" strokeWidth="3" />
      <circle cx="11" cy="28" r="7" fill="#6ad7ff" stroke="#2b2033" strokeWidth="3" />
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
