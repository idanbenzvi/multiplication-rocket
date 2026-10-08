import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import type { CrewQuestion } from '../../game/useCrewStore';
import { skipCounts } from '../../game/crew';
import { useLang, useT } from '../../i18n/useLang';
import { speak } from '../../audio/speech';

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
export function NavigatorQuestion({ question, feedback, onAnswer, onContinue }: Props) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const [picked, setPicked] = useState<number | null>(null);
  const { x: groups, y: size, choices } = question;
  const answer = groups * size;
  const prompt = t.crew.navQuestion(groups, size);
  const continueRef = useRef<HTMLButtonElement>(null);

  const choose = (v: number) => {
    if (feedback || picked !== null) return;
    setPicked(v);
    onAnswer(v);
  };
  const chooseRef = useRef(choose);
  chooseRef.current = choose;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= choices.length) chooseRef.current(choices[n - 1]);
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

      {feedback === 'wrong' ? (
        <div className="nav-explainer">
          <div>{t.crew.navCountAlong}</div>
          <motion.div
            className="nav-total"
            dir="ltr"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 + groups * 0.45 }}
          >
            {t.crew.navTotal(groups, size)}
          </motion.div>
          <button ref={continueRef} type="button" className="continue-button" onClick={onContinue}>
            {t.gotItContinue}
          </button>
        </div>
      ) : (
        <div className="choice-grid nav-choices" dir="ltr">
          {choices.map((c) => {
            const state = picked === c ? (c === answer ? 'is-right' : 'is-wrong') : '';
            return (
              <button key={c} type="button" className={`choice-btn ${state}`} disabled={picked !== null} onClick={() => choose(c)}>
                {c}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
