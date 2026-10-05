import { getLevelConfig } from '../game/levels';

interface Props {
  completedLevel: number;
  onContinue: () => void;
}

export function LaunchOverlay({ completedLevel, onContinue }: Props) {
  const config = getLevelConfig(completedLevel);
  const next = getLevelConfig(completedLevel + 1);
  return (
    <div className="launch-overlay">
      <div className="launch-overlay-card">
        <div className="launch-overlay-emoji">🚀{config.destinationEmoji}</div>
        <h2>Blast off!</h2>
        <p>
          You reached {config.destinationEmoji} {config.destinationName}!
        </p>
        <p className="launch-overlay-next">
          Next stop: {next.destinationEmoji} {next.destinationName}
        </p>
        <button className="launch-overlay-button" onClick={onContinue}>
          Next Mission
        </button>
      </div>
    </div>
  );
}
