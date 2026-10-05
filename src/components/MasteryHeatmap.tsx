import type { FactStat } from '../game/types';

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
  return (
    <div className="heatmap-overlay">
      <div className="heatmap-card">
        <h2>Your Multiplication Map</h2>
        <p className="heatmap-subtitle">Green = mastered &middot; Red = needs more practice</p>

        <div className="heatmap-grid-wrap">
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

        <button className="heatmap-button" onClick={onContinue}>
          Keep Practicing
        </button>
      </div>
    </div>
  );
}
