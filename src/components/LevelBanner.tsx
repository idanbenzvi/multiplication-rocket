import { getLevelConfig } from '../game/levels';
import { destinationName } from '../i18n/strings';
import { useT } from '../i18n/useLang';

interface Props {
  level: number;
}

export function LevelBanner({ level }: Props) {
  const t = useT();
  const config = getLevelConfig(level);
  const collected = Array.from({ length: level - 1 }, (_, i) => getLevelConfig(i + 1));

  return (
    <div className="level-banner">
      <div className="level-banner-current">
        {t.level(level)} &mdash; {t.destination} {config.destinationEmoji} {destinationName(t, config)}
      </div>
      {collected.length > 0 && (
        <div className="level-banner-collected">
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
