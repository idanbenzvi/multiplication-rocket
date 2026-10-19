import { ADMIRAL_BADGE, ADMIRAL_RANK, type BadgeGroup } from '../../game/achievements';
import { AdmiralBadge } from '../boss/AdmiralBadge';

// Badge and rank pictures. Dropping an image named after a badge into
// src/assets/badges (e.g. firstStar.png, or rank-0.png … rank-6.png for the
// ranks) replaces its emoji medallion on the next build — no code change.
// See src/assets/badges/README.md for the full list.
const ART = import.meta.glob('../../assets/badges/*.{png,webp,jpg,svg}', { eager: true, import: 'default' }) as Record<
  string,
  string
>;
const ART_BY_NAME: Record<string, string> = Object.fromEntries(
  Object.entries(ART).map(([path, url]) => [path.slice(path.lastIndexOf('/') + 1).replace(/\.\w+$/, ''), url]),
);

interface Props {
  /** art file name without extension: a badge id, or rank-N */
  name: string;
  icon: string;
  group?: BadgeGroup | 'rank';
  locked?: boolean;
  size?: number;
}

// The Black Sun's badge, which is also the Space Admiral's insignia, is drawn in code (an image dropped in still wins).
const DRAWN = new Set([ADMIRAL_BADGE, `rank-${ADMIRAL_RANK}`]);

export function BadgeArt({ name, icon, group = 'rank', locked = false, size = 64 }: Props) {
  const art = ART_BY_NAME[name];
  if (!art && DRAWN.has(name)) {
    return (
      <span className={`badge-art badge-art-drawn ${locked ? 'is-locked' : ''}`} style={{ width: size, height: size }} aria-hidden="true">
        <AdmiralBadge size={size} />
      </span>
    );
  }
  return (
    <span
      className={`badge-art badge-art-${group} ${locked ? 'is-locked' : ''} ${art ? 'has-image' : ''}`}
      style={{ width: size, height: size, fontSize: size * 0.48 }}
      aria-hidden="true"
    >
      {art ? <img src={art} alt="" draggable={false} /> : icon}
    </span>
  );
}
