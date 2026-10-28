import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import type { CrewQuestion } from '../../game/useCrewStore';
import { skipCounts } from '../../game/crew';
import { applyOp, missionOfKey } from '../../game/mission';
import { useLang, useT } from '../../i18n/useLang';
import { speak } from '../../audio/speech';
import { isTouchDevice } from '../../settings/useSettings';
import { ARROW_DIRS, ARROW_GLYPHS, arrowChoice } from '../arrowChoices';

interface Props {
  question: CrewQuestion;
  feedback: 'correct' | 'wrong' | null;
  onAnswer: (value: number) => void;
  onContinue: () => void;
}

// The Navigator's turn: the fact drawn as equal groups of stars ("3 groups
// of 4 stars"), four big answer buttons, and the question read aloud on
// request. A miss counts the groups up together (4, 8, 12): the Academy's
// equal-groups lesson, practised. Untimed: counting takes what it takes.
// On the addition mission it's two groups (3 stars and 4 more), and a miss
// counts on from the first group (4, 5, 6, 7). On subtraction it's one
// group with some flying off (8 stars, 3 fly away), and a miss counts the
// ones left.
export function NavigatorQuestion({ question, feedback, onAnswer, onContinue }: Props) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const [picked, setPicked] = useState<number | null>(null);
  const { x: groups, y: size, choices } = question;
  const op = missionOfKey(question.fact.key);
  const adding = op === 'add';
  const taking = op === 'sub';
  const answer = applyOp(op, groups, size);
  const prompt = taking ? t.crew.navSubQuestion(groups, size) : adding ? t.crew.navAddQuestion(groups, size) : t.crew.navQuestion(groups, size);
  const continueRef = useRef<HTMLButtonElement>(null);

  const choose = (v: number) => {
    if (feedback || picked !== null) return;
    setPicked(v);
    onAnswer(v);
  };
  const chooseRef = useRef(choose);
  chooseRef.current = choose;

  useEffect(() => {
    // an arrow key picks an answer
    const handler = (e: KeyboardEvent) => {
      const i = arrowChoice(e.key);
      if (i < 0 || i >= choices.length) return;
      e.preventDefault();
      chooseRef.current(choices[i]);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [choices]);

  useEffect(() => {
    if (feedback === 'wrong') continueRef.current?.focus();
  }, [feedback]);

  const counts = skipCounts(groups, size);
  // a group reads as one shape: a single row up to 5, two even rows above that
  const starColumns = size <= 5 ? size : Math.ceil(size / 2);

  return (
    <div className="nav-card">
      <div className="nav-prompt">
        <span>{prompt}</span>
        <button type="button" className="nav-speak" onClick={() => speak(prompt, lang, t.academy.speakWords)} aria-label="🔊">
          🔊
        </button>
      </div>

      {taking ? (
        <TakeAwayStars a={groups} b={size} countLeft={feedback === 'wrong'} />
      ) : adding ? (
        <AddGroups a={groups} b={size} countOn={feedback === 'wrong'} />
      ) : (
        <div className="nav-groups" dir="ltr">
          {counts.map((total, g) => (
            <motion.div
              key={g}
              className="nav-group"
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 320, damping: 18, delay: g * 0.08 }}
            >
              <div className="nav-stars" style={{ gridTemplateColumns: `repeat(${starColumns}, auto)` }}>
                {Array.from({ length: size }, (_, i) => (
                  <span key={i} className="nav-star">
                    ⭐
                  </span>
                ))}
              </div>
              {feedback === 'wrong' && (
                <motion.div
                  className="nav-count"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 + g * 0.45 }}
                >
                  {total}
                </motion.div>
              )}
            </motion.div>
          ))}
        </div>
      )}

      {feedback === 'wrong' ? (
        <div className="nav-explainer">
          <div>{taking ? t.crew.navSubCountLeft : adding ? t.crew.navAddCountOn : t.crew.navCountAlong}</div>
          <motion.div
            className="nav-total"
            dir="ltr"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: taking ? 0.6 + answer * 0.3 : adding ? 0.6 + size * 0.4 : 0.4 + groups * 0.45 }}
          >
            {taking ? `${groups} − ${size} = ${answer}` : adding ? `${groups} + ${size} = ${answer}` : t.crew.navTotal(groups, size)}
          </motion.div>
          <button ref={continueRef} type="button" className="continue-button" onClick={onContinue}>
            {t.gotItContinue}
          </button>
        </div>
      ) : (
        <div className={`choice-grid nav-choices ${isTouchDevice ? '' : 'is-dpad'}`} dir="ltr">
          {choices.map((c, i) => {
            const state = picked === c ? (c === answer ? 'is-right' : 'is-wrong') : '';
            return (
              <button
                key={c}
                type="button"
                data-dir={ARROW_DIRS[i]}
                className={`choice-btn ${state}`}
                disabled={picked !== null}
                onClick={() => choose(c)}
              >
                {!isTouchDevice && <span className="choice-key">{ARROW_GLYPHS[i]}</span>}
                {c}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** the two groups of an addition question; counting on, the second group's stars get numbers */
function AddGroups({ a, b, countOn }: { a: number; b: number; countOn: boolean }) {
  const columns = (n: number) => (n <= 5 ? n : Math.ceil(n / 2));
  const group = (n: number, second: boolean) => (
    <motion.div
      className="nav-group"
      initial={{ scale: 0.4, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 320, damping: 18, delay: second ? 0.12 : 0 }}
    >
      <div className={`nav-stars ${second ? 'is-second' : ''}`} style={{ gridTemplateColumns: `repeat(${columns(n)}, auto)` }}>
        {Array.from({ length: n }, (_, i) => (
          <span key={i} className="nav-star">
            ⭐
            {countOn && second && (
              <motion.i className="nav-star-n" initial={{ opacity: 0, scale: 0.4 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.5 + i * 0.4 }}>
                {a + i + 1}
              </motion.i>
            )}
          </span>
        ))}
      </div>
      {countOn && !second && (
        <motion.div className="nav-count" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          {a}
        </motion.div>
      )}
    </motion.div>
  );
  return (
    <div className="nav-groups nav-add" dir="ltr">
      {group(a, false)}
      <span className="nav-plus">+</span>
      {group(b, true)}
    </div>
  );
}

/** a subtraction question: `a` stars, the last `b` flying off; counting what's left, the stars still there get numbers */
function TakeAwayStars({ a, b, countLeft }: { a: number; b: number; countLeft: boolean }) {
  const left = a - b;
  return (
    <div className="nav-groups nav-sub" dir="ltr">
      <motion.div className="nav-group" initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 320, damping: 18 }}>
        <div className="nav-stars" style={{ gridTemplateColumns: `repeat(${Math.min(5, a)}, auto)` }}>
          {Array.from({ length: a }, (_, i) => (
            <motion.span
              key={i}
              className={`nav-star ${i >= left ? 'is-gone' : ''}`}
              initial={false}
              animate={i >= left ? { opacity: 0.22, y: -8, scale: 0.8 } : { opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: i >= left ? 0.7 + (i - left) * 0.15 : 0, duration: 0.45 }}
            >
              ⭐
              {countLeft && i < left && (
                <motion.i className="nav-star-n" initial={{ opacity: 0, scale: 0.4 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.4 + i * 0.3 }}>
                  {i + 1}
                </motion.i>
              )}
            </motion.span>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
