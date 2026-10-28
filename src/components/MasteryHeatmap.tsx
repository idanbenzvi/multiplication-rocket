import { useState } from 'react';
import type { FactStat } from '../game/types';
import { masteryCellStyle as cellStyle } from '../game/masteryStats';
import { dayNumber, factStatus } from '../game/memory';
import { applyOp, OP_SYMBOL, opsOf, pairKey, type Mission, type PilotMission } from '../game/mission';
import { ADD_KINDS, type AddKind } from '../game/addition';
import { SUB_KINDS, type SubKind } from '../game/subtraction';
import { missionName, type Strings } from '../i18n/strings';
import { useT } from '../i18n/useLang';
import GradientText from './reactbits/GradientText';
import StarBorder from './reactbits/StarBorder';
import { useBack } from '../native/back';

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

/** and of each two-digit kind of difference, for the subtraction map */
const SUB_KIND_EXAMPLES: Record<SubKind, string> = {
  'tens-tens': '70 − 30',
  '2d-1d': '58 − 3',
  '2d-2d': '58 − 23',
  '2d-1d:b': '52 − 7',
  '2d-2d:b': '52 − 27',
};

/** the map's title for a mission */
function mapTitle(t: Strings, mission: PilotMission): string {
  return { mul: t.heatmapTitle, add: t.heatmapTitleAdd, sub: t.heatmapTitleSub, mix: t.heatmapTitleMix, addsub: t.heatmapTitleAddSub }[mission];
}

// The addition map is the same 10 × 10 grid (sums instead of products),
// plus a row for the kinds of two-digit sum. The subtraction map is that
// grid read backwards: a row for each number taken away and a column for
// each left, so each square is the number taken from (row 5, column 8: 13,
// for 13 − 5 = 8), and a row for the kinds of two-digit difference. A mixed
// mission has both of its own, a tab each.
export function MasteryHeatmap({ mastery, mission: pilotMission, onContinue, auto = false }: Props) {
  const t = useT();
  useBack(onContinue);
  return (
    <div className="heatmap-overlay">
      <div className="heatmap-card">
        <h2>
          <GradientText colors={['#7ec4b0', '#ffd77a', '#ff9d76', '#7ec4b0']} animationSpeed={5}>
            {mapTitle(t, pilotMission)}
          </GradientText>
        </h2>
        {auto && <p className="heatmap-why">{t.heatmapWhy}</p>}
        <MasteryMap mastery={mastery} mission={pilotMission} />

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

/**
 * The map itself (the practice map's, and the cockpit's console screen's):
 * the tabs of a mixed mission, the 10 × 10 grid, and the kinds of two-digit
 * sum under an addition one.
 */
export function MasteryMap({ mastery, mission: pilotMission }: { mastery: Record<string, FactStat>; mission: PilotMission }) {
  const t = useT();
  const ops = opsOf(pilotMission);
  const [tab, setTab] = useState<Mission>(ops[0]);
  const mission: Mission = ops.includes(tab) ? tab : ops[0];
  const sym = OP_SYMBOL[mission];
  const day = dayNumber();
  const taking = mission === 'sub';
  // a square's problem: x op y, or for subtraction, (x + y) − x, leaving y
  const problem = (x: number, y: number): [number, number] => (taking ? [x + y, x] : [x, y]);
  const kinds = taking ? SUB_KINDS : mission === 'add' ? ADD_KINDS : [];
  const kindName = (k: string) => (taking ? t.subKinds[k as SubKind] : t.addKinds[k as AddKind]);
  const kindExample = (k: string) => (taking ? SUB_KIND_EXAMPLES[k as SubKind] : KIND_EXAMPLES[k as AddKind]);
  return (
    <>
    {ops.length > 1 && (
      <div className="heatmap-tabs" role="tablist">
        {ops.map((op) => (
          <button key={op} type="button" role="tab" aria-selected={mission === op} className={`heatmap-tab ${mission === op ? 'is-on' : ''}`} onClick={() => setTab(op)}>
            {OP_SYMBOL[op]} {missionName(t, op)}
          </button>
        ))}
      </div>
    )}
    <p className="heatmap-subtitle">{taking ? t.heatmapSubtitleSub : t.heatmapSubtitle}</p>

    <div className="heatmap-grid-wrap" dir="ltr">
      <table className="heatmap-grid">
        <thead>
          <tr>
            <th className={taking ? 'heatmap-corner' : undefined}>{taking ? '−\u2009=' : null}</th>
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
                const [a, b] = problem(x, y);
                const stat = mastery[pairKey(mission, a, b)];
                const status = factStatus(stat, day);
                const value = applyOp(mission, a, b);
                return (
                  <td
                    key={y}
                    className={`is-${status}`}
                    style={cellStyle(stat, day)}
                    title={`${a} ${sym} ${b} = ${value}${status === 'fading' ? ` · ${t.heatmapFading}` : ''}`}
                  >
                    {taking ? a : value}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    {kinds.length > 0 && (
      <div className="heatmap-kinds">
        <div className="heatmap-kinds-title">{taking ? t.heatmapKindsSub : t.heatmapKinds}</div>
        <div className="heatmap-kinds-row">
          {kinds.map((k) => (
            <div
              key={k}
              className={`heatmap-kind is-${factStatus(mastery[k], day)}`}
              style={cellStyle(mastery[k], day)}
              title={factStatus(mastery[k], day) === 'fading' ? `${kindName(k)} · ${t.heatmapFading}` : kindName(k)}
            >
              <bdi dir="ltr" className="heatmap-kind-example">
                {kindExample(k)}
              </bdi>
              <span className="heatmap-kind-name">{kindName(k)}</span>
            </div>
          ))}
        </div>
      </div>
    )}
    </>
  );
}
