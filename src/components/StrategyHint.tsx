import { strategyFor } from '../game/strategy';

interface Props {
  x: number;
  y: number;
  visible: boolean;
  onToggle: () => void;
}

export function StrategyHint({ x, y, visible, onToggle }: Props) {
  if (!visible) {
    return (
      <button className="strategy-hint-chip" onClick={onToggle}>
        💡 Show hint <span className="strategy-hint-key">(H)</span>
      </button>
    );
  }

  const strategy = strategyFor(x, y);

  return (
    <button className="strategy-hint" onClick={onToggle} title="Press H to hide">
      <span className="strategy-hint-icon">💡</span>
      <span className="strategy-hint-text">{strategy.summary}</span>
      <span className="strategy-hint-key">(H)</span>
    </button>
  );
}
