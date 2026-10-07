import { useState } from 'react';
import type { FactStat } from '../game/types';
import { masteryCellStyle, masterySummary } from '../game/masteryStats';
import { useT } from '../i18n/useLang';

interface Props {
  mastery: Record<string, FactStat>;
  onClick: () => void;
}

const NUMBERS = Array.from({ length: 10 }, (_, i) => i + 1);

// "Stop & Review" with a hover peek: resting the mouse on it shows a compact
// read-only practice map (and keyboard focus does too) without pausing the
// game; clicking still opens the full review. Touch has no hover, so a tap
// just opens the full review as before.
export function ReviewButton({ mastery, onClick }: Props) {
  const t = useT();
  const [peek, setPeek] = useState(false);
  const summary = peek ? masterySummary(mastery) : null;

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
        {t.stopAndReview}
      </button>
      {peek && summary && (
        <div className="review-peek" id="review-peek" role="tooltip">
          <div className="review-peek-title">{t.reviewPeekTitle}</div>
          <div className="review-peek-grid" dir="ltr">
            {NUMBERS.map((x) =>
              NUMBERS.map((y) => {
                const style = masteryCellStyle(mastery[`${Math.min(x, y)}x${Math.max(x, y)}`]);
                return (
                  <span key={`${x}-${y}`} className="review-peek-cell" style={style}>
                    {x * y}
                  </span>
                );
              }),
            )}
          </div>
          <div className="review-peek-stats">{t.reviewPeekStats(summary.mastered, summary.practice, summary.untried)}</div>
          <div className="review-peek-hint">{t.reviewPeekHint}</div>
        </div>
      )}
    </div>
  );
}
