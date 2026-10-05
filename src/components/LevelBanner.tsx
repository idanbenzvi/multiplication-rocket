import { getLevelConfig } from '../game/levels';

interface Props {
  level: number;
}

export function LevelBanner({ level }: Props) {
  const config = getLevelConfig(level);
  const collected = Array.from({ length: level - 1 }, (_, i) => getLevelConfig(i + 1));

  return (
    <div className="level-banner">
      <div className="level-banner-current">
        Level {level} &mdash; Destination: {config.destinationEmoji} {config.destinationName}
      </div>
      {collected.length > 0 && (
        <div className="level-banner-collected">
          {collected.map((c) => (
            <span key={c.level} title={c.destinationName} className="collected-badge">
              {c.destinationEmoji}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
