import type { FactStat } from '../game/types';
import { useT } from '../i18n/useLang';
import GradientText from './reactbits/GradientText';
import StarBorder from './reactbits/StarBorder';

interface Props {
  mastery: Record<string, FactStat>;
  onContinue: () => void;
}

const NUMBERS = Array.from({ length: 10 }, (_, i) => i + 1);

function cellStyle(stat: FactStat | undefined): { background: string; color: string } {
  if (!stat || stat.attempts === 0) {
    return { background: 'rgba(255,255,255,0.05)', color: '#5f6b8c' };
  }
  const ratio = stat.correct / stat.attempts;
  const hue = ratio * 120; // 0 = red, 120 = green
  return {
    background: `hsl(${hue}, 70%, 32%)`,
    color: `hsl(${hue}, 90%, 85%)`,
  };
}

export function MasteryHeatmap({ mastery, onContinue }: Props) {
  const t = useT();
  return (
    <div className="heatmap-overlay">
      <div className="heatmap-card">
        <h2>
          <GradientText colors={['#7ec4b0', '#ffd77a', '#ff9d76', '#7ec4b0']} animationSpeed={5}>
            {t.heatmapTitle}
          </GradientText>
        </h2>
        <p className="heatmap-subtitle">{t.heatmapSubtitle}</p>

        <div className="heatmap-grid-wrap" dir="ltr">
          <table className="heatmap-grid">
            <thead>
              <tr>
                <th />
                {NUMBERS.map((y) => (
                  <th key={y}>{y}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {NUMBERS.map((x) => (
                <tr key={x}>
                  <th>{x}</th>
                  {NUMBERS.map((y) => {
                    const key = `${Math.min(x, y)}x${Math.max(x, y)}`;
                    const stat = mastery[key];
                    const style = cellStyle(stat);
                    return (
                      <td key={y} style={style} title={`${x} × ${y} = ${x * y}`}>
                        {x * y}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <StarBorder
          className="heatmap-button"
          color="#7ec4b0"
          speed="4s"
          thickness={3}
          backgroundColor="#1f3a36"
          textColor="#d8f3ea"
          borderColor="rgba(126, 196, 176, 0.4)"
          onClick={onContinue}
        >
          {t.keepPracticing}
        </StarBorder>
      </div>
    </div>
  );
}
