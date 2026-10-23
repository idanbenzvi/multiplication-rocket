import { useState } from 'react';
import { motion } from 'motion/react';
import { useT } from '../../i18n/useLang';
import { useMission } from '../../profiles/useProfiles';
import { fadeDays, RECENT_ANSWERS, REVIEW_DAYS, review, TOP_BOX } from '../../game/memory';
import { sfx } from '../../audio/sfx';

// The spaced review's boxes (game/memory.ts), with a fact in them to answer
// and let days go by for: the game's own rules move it, a box up when it's
// remembered on time, back to the start when it's missed, staying put when
// it's checked too soon, and fading when it's left too long.

interface Card {
  last: string;
  box: number;
  since?: number;
  day: number;
  /** what the last answer did (none: what's to come, after days went by) */
  note: null | { k: 'learning' | 'learned' | 'early' | 'slip' | 'missed' } | { k: 'up'; box: number };
}

/** a fact that's been practised a little, and missed a couple of times */
const START: Card = { last: '010', box: 0, day: 1, note: null };

export function MemoryDemo() {
  const t = useT().how.memory;
  const mission = useMission();
  const fact = mission === 'add' ? '8 + 7' : '7 × 8';
  const [card, setCard] = useState<Card>(START);
  const { box, since = card.day, day } = card;
  const waited = day - since;
  const fading = box > 0 && waited >= fadeDays(box);
  const due = box > 0 && waited >= REVIEW_DAYS[box];

  const answer = (correct: boolean) => {
    const next = review(card, correct, day);
    const nb = next.box ?? 0;
    let note: Card['note'];
    if (box === 0) note = { k: nb > 0 ? 'learned' : 'learning' };
    else if (!correct) note = { k: nb > 0 ? 'slip' : 'missed' };
    else if (next.since !== card.since) note = { k: 'up', box: nb };
    else note = { k: 'early' };
    setCard({ last: next.last ?? '', box: nb, since: next.since, day, note });
    if (correct) sfx.correct(nb + 1, false);
    else sfx.wrong();
  };
  const wait = (days: number) => setCard((c) => ({ ...c, day: c.day + days, note: null }));

  const n = card.note;
  const status = n
    ? n.k === 'up'
      ? t.up(t.boxes[n.box])
      : t[n.k]
    : box === 0
      ? t.learning
      : fading
        ? t.fading
        : due
          ? t.due
          : t.waits(REVIEW_DAYS[box] - waited);
  const look = box === 0 ? 'practice' : fading ? 'fading' : due ? 'due' : 'known';
  const answers = card.last.padStart(RECENT_ANSWERS, ' ').slice(-RECENT_ANSWERS);

  return (
    <>
      <div className="how-stage how-memory">
        <div className="how-boxes">
          {t.boxes.map((label, b) => (
            <div key={b} className={`how-box ${b === box ? 'is-here' : ''} ${b === TOP_BOX ? 'is-top' : ''}`}>
              <span className="how-box-label">{label}</span>
              <span className="how-box-slot">
                {b === box && (
                  <motion.bdi layoutId="how-fact" dir="ltr" className={`how-fact is-${look}`} transition={{ type: 'spring', stiffness: 260, damping: 22 }}>
                    {fact}
                  </motion.bdi>
                )}
              </span>
            </div>
          ))}
        </div>
        <div className="how-memory-status">
          <span className="how-day">📅 {t.dayN(day)}</span>
          <span className="how-last" role="img" aria-label={t.last} title={t.last}>
            {[...answers].map((a, i) => (
              <i key={i} className={a === '1' ? 'is-right' : a === '0' ? 'is-wrong' : ''}>
                {a === '1' ? '✓' : a === '0' ? '✗' : ''}
              </i>
            ))}
          </span>
        </div>
        <p className="how-note" aria-live="polite">
          {status}
        </p>
      </div>
      <div className="how-controls">
        <button type="button" className="how-button is-right" onClick={() => answer(true)}>
          {t.right}
        </button>
        <button type="button" className="how-button is-wrong" onClick={() => answer(false)}>
          {t.wrong}
        </button>
        <button type="button" className="how-button" onClick={() => wait(1)}>
          {t.day}
        </button>
        <button type="button" className="how-button" onClick={() => wait(REVIEW_DAYS[box] - waited)} disabled={box === 0 || due}>
          {t.toCheck}
        </button>
      </div>
    </>
  );
}
