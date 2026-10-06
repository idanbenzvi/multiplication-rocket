import { getLevelConfig } from '../game/levels';
import { destinationName } from '../i18n/strings';
import { useT } from '../i18n/useLang';

interface Props {
  level: number;
}

// Fewer on phones, where the banner shares a narrow top bar.
const MAX_BADGES = typeof window !== 'undefined' && window.innerWidth < 600 ? 4 : 8;

export function LevelBanner({ level }: Props) {
  const t = useT();
  const config = getLevelConfig(level);
  // Only the most recent badges, so the banner stays one row however far the
  // player gets (it used to grow to many rows and cover the play area).
  const allCollected = Array.from({ length: level - 1 }, (_, i) => getLevelConfig(i + 1));
  const collected = allCollected.slice(-MAX_BADGES);
  const hidden = allCollected.length - collected.length;

  return (
    <div className="level-banner">
      <div className="level-banner-current">
        {t.level(level)} &mdash; {t.destination} {config.destinationEmoji} {destinationName(t, config)}
      </div>
      {collected.length > 0 && (
        <div className="level-banner-collected">
          {hidden > 0 && <span className="collected-more">+{hidden}</span>}
          {collected.map((c) => (
            <span key={c.level} title={destinationName(t, c)} className="collected-badge">
              {c.destinationEmoji}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
