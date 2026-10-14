import { strategyFor } from '../game/strategy';
import type { Mission } from '../game/mission';
import { useT } from '../i18n/useLang';

interface Props {
  x: number;
  y: number;
  mission: Mission;
  visible: boolean;
  onToggle: () => void;
}

export function StrategyHint({ x, y, mission, visible, onToggle }: Props) {
  const t = useT();

  if (!visible) {
    return (
      <button className="strategy-hint-chip" onClick={onToggle}>
        💡 {t.showHint} <span className="strategy-hint-key">(H)</span>
      </button>
    );
  }

  const strategy = strategyFor(x, y, t, mission);

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
