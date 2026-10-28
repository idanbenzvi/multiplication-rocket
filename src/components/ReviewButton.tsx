import { useState } from 'react';
import type { FactStat } from '../game/types';
import { masteryCellStyle, masterySummary } from '../game/masteryStats';
import { dayNumber, factStatus } from '../game/memory';
import { applyOp, OP_SYMBOL, opsOf, pairKey, type PilotMission } from '../game/mission';
import { useT } from '../i18n/useLang';
import type { Strings } from '../i18n/strings';

interface Props {
  mastery: Record<string, FactStat>;
  mission: PilotMission;
  onClick: () => void;
}

const NUMBERS = Array.from({ length: 10 }, (_, i) => i + 1);

// "Stop & Review" with a hover peek: resting the mouse on it shows a compact
// read-only practice map (and keyboard focus does too) without pausing the
// game; clicking still opens the full review. Touch has no hover, so a tap
// just opens the full review as before. A mixed mission's peek has both maps.
/** the peek's title for a mission */
function peekTitle(t: Strings, mission: PilotMission): string {
  return { mul: t.reviewPeekTitle, add: t.reviewPeekTitleAdd, sub: t.reviewPeekTitleSub, mix: t.reviewPeekTitleMix, addsub: t.reviewPeekTitleAddSub }[mission];
}

export function ReviewButton({ mastery, mission, onClick }: Props) {
  const t = useT();
  const [peek, setPeek] = useState(false);
  const day = dayNumber();
  const summary = peek ? masterySummary(mastery, mission, day) : null;

  return (
    <div
      className="review-wrap"
      onPointerEnter={(e) => e.pointerType === 'mouse' && setPeek(true)}
      onPointerLeave={() => setPeek(false)}
    >
      <button
        className="reset-button"
        onClick={() => {
          setPeek(false);
          onClick();
        }}
        onFocus={(e) => e.currentTarget.matches(':focus-visible') && setPeek(true)}
        onBlur={() => setPeek(false)}
        aria-describedby={peek ? 'review-peek' : undefined}
      >
        <span className="review-icon" aria-hidden>
          🗺️
        </span>
        <span className="review-label">{t.stopAndReview}</span>
      </button>
      {peek && summary && (
        <div className="review-peek" id="review-peek" role="tooltip">
          <div className="review-peek-title">{peekTitle(t, mission)}</div>
          <div className={`review-peek-maps ${opsOf(mission).length > 1 ? 'is-two' : ''}`}>
            {opsOf(mission).map((op) => (
              <div key={op} className="review-peek-map">
                {opsOf(mission).length > 1 && <div className="review-peek-op">{OP_SYMBOL[op]}</div>}
                <div className="review-peek-grid" dir="ltr">
                  {NUMBERS.map((x) =>
                    NUMBERS.map((y) => {
                      // (subtraction's grid is the table read backwards: x taken from x + y)
                      const [a, b] = op === 'sub' ? [x + y, x] : [x, y];
                      const stat = mastery[pairKey(op, a, b)];
                      return (
                        <span key={`${x}-${y}`} className={`review-peek-cell is-${factStatus(stat, day)}`} style={masteryCellStyle(stat, day)}>
                          {op === 'sub' ? a : applyOp(op, a, b)}
                        </span>
                      );
                    }),
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="review-peek-stats">{t.reviewPeekStats(summary.mastered, summary.fading, summary.practice, summary.untried)}</div>
          <div className="review-peek-hint">{t.reviewPeekHint}</div>
        </div>
      )}
    </div>
  );
}
