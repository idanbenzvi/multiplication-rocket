import { useState } from 'react';
import type { FactStat } from '../game/types';
import { masteryCellStyle as cellStyle } from '../game/masteryStats';
import { applyOp, OP_SYMBOL, pairKey, type Mission, type PilotMission } from '../game/mission';
import { ADD_KINDS, type AddKind } from '../game/addition';
import { useT } from '../i18n/useLang';
import GradientText from './reactbits/GradientText';
import StarBorder from './reactbits/StarBorder';

interface Props {
  mastery: Record<string, FactStat>;
  mission: PilotMission;
  onContinue: () => void;
  /** opened by itself after a run of mistakes: say so */
  auto?: boolean;
}

const NUMBERS = Array.from({ length: 10 }, (_, i) => i + 1);

/** one example of each two-digit kind, for the addition map */
const KIND_EXAMPLES: Record<AddKind, string> = {
  'tens+tens': '40 + 30',
  '2d+1d': '34 + 5',
  '2d+2d': '34 + 25',
  '2d+1d:c': '37 + 5',
  '2d+2d:c': '37 + 45',
};

// The addition map is the same 10 × 10 grid (sums instead of products),
// plus a row for the kinds of two-digit sum. A mixed mission has both, a tab
// each.
export function MasteryHeatmap({ mastery, mission: pilotMission, onContinue, auto = false }: Props) {
  const t = useT();
  const [tab, setTab] = useState<Mission>('mul');
  const mission: Mission = pilotMission === 'mix' ? tab : pilotMission;
  const sym = OP_SYMBOL[mission];
  return (
    <div className="heatmap-overlay">
      <div className="heatmap-card">
        <h2>
          <GradientText colors={['#7ec4b0', '#ffd77a', '#ff9d76', '#7ec4b0']} animationSpeed={5}>
            {pilotMission === 'mix' ? t.heatmapTitleMix : mission === 'add' ? t.heatmapTitleAdd : t.heatmapTitle}
          </GradientText>
        </h2>
        {pilotMission === 'mix' && (
          <div className="heatmap-tabs" role="tablist">
            {(['mul', 'add'] as Mission[]).map((op) => (
              <button key={op} type="button" role="tab" aria-selected={tab === op} className={`heatmap-tab ${tab === op ? 'is-on' : ''}`} onClick={() => setTab(op)}>
                {OP_SYMBOL[op]} {op === 'add' ? t.missionAdd : t.missionMul}
              </button>
            ))}
          </div>
        )}
        {auto && <p className="heatmap-why">{t.heatmapWhy}</p>}
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
                    const stat = mastery[pairKey(mission, x, y)];
                    const style = cellStyle(stat);
                    const value = applyOp(mission, x, y);
                    return (
                      <td key={y} style={style} title={`${x} ${sym} ${y} = ${value}`}>
                        {value}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {mission === 'add' && (
          <div className="heatmap-kinds">
            <div className="heatmap-kinds-title">{t.heatmapKinds}</div>
            <div className="heatmap-kinds-row">
              {ADD_KINDS.map((k) => (
                <div key={k} className="heatmap-kind" style={cellStyle(mastery[k])} title={t.addKinds[k]}>
                  <bdi dir="ltr" className="heatmap-kind-example">
                    {KIND_EXAMPLES[k]}
                  </bdi>
                  <span className="heatmap-kind-name">{t.addKinds[k]}</span>
                </div>
              ))}
            </div>
          </div>
        )}

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
