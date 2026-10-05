import { strategyFor } from '../game/strategy';
import { useT } from '../i18n/useLang';

interface Props {
  x: number;
  y: number;
  visible: boolean;
  onToggle: () => void;
}

export function StrategyHint({ x, y, visible, onToggle }: Props) {
  const t = useT();

  if (!visible) {
    return (
      <button className="strategy-hint-chip" onClick={onToggle}>
        💡 {t.showHint} <span className="strategy-hint-key">(H)</span>
      </button>
    );
  }

  const strategy = strategyFor(x, y, t);

  return (
    <button className="strategy-hint" onClick={onToggle} title={t.pressHToHide}>
      <span className="strategy-hint-icon">💡</span>
      <span className="strategy-hint-text">
        {strategy.text}
        {strategy.text && strategy.math && ' '}
        {strategy.math && (
          <bdi dir="ltr" className="strategy-hint-math">
            {strategy.math}
          </bdi>
        )}
      </span>
      <span className="strategy-hint-key">(H)</span>
    </button>
  );
}
