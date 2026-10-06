import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Question } from '../game/useGameStore';
import { FAST_MS, SLOW_MS, speedZone } from '../game/scoring';
import { MultiplicationGrid } from './MultiplicationGrid';
import { useT } from '../i18n/useLang';
import ElectricBorder from './reactbits/ElectricBorder';
import { AnimatePresence, motion } from 'motion/react';
import { streakTier } from '../game/streak';
import { distractors } from '../game/distractors';
import type { AnswerMode, TypedCheck } from '../settings/useSettings';
import { NumPad } from './NumPad';

interface Props {
  question: Question;
  feedback: 'correct' | 'wrong' | null;
  disabled: boolean;
  onAnswer: (value: number, elapsedMs: number) => void;
  onContinue: () => void;
  streak: number;
  mode: AnswerMode;
  /** typed answers: judged as soon as enough digits are in, or on Enter / ✓ / tap */
  typedCheck: TypedCheck;
  /** finger-first device: typing uses the on-screen keypad, not the OS keyboard */
  touch: boolean;
}

const MAX_DIGITS = 3; // the biggest answer is 100

const ZONE_LABEL: Record<ReturnType<typeof speedZone>, 'zoneFast' | 'zoneMid' | 'zoneSlow'> = {
  fast: 'zoneFast',
  mid: 'zoneMid',
  slow: 'zoneSlow',
};

// "On fire" mode: an electric border appears once the streak reaches this,
// and gets wilder (faster, more chaotic, hotter color) as the streak grows.
const ON_FIRE_STREAK = 3;
const FIRE_COLORS = ['#4fd1ff', '#ffd23f', '#ff8c42', '#ff3d6e'];

function fireLevel(streak: number): number {
  return Math.min(FIRE_COLORS.length - 1, Math.floor((streak - ON_FIRE_STREAK) / 3));
}

// Where the fast/mid cutoff sits on the drained-from-top gauge: the fill's
// height equals this value at the instant elapsed time crosses FAST_MS, so
// the marker line lands exactly where the mercury will be at that moment.
const FAST_MARKER_PERCENT = 100 - (FAST_MS / SLOW_MS) * 100;

function shuffled<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function QuestionForm({ question, feedback, disabled, onAnswer, onContinue, streak, mode, typedCheck, touch }: Props) {
  const t = useT();
  // The typed digits are stored *with the question they were typed for*.
  // Clearing them in an effect when a new question arrives isn't enough:
  // for one render the new question is in place while the old digits are
  // still there, and the auto-check would judge e.g. last question's "49"
  // against the new one — marking it wrong before the child even saw it.
  const [entry, setEntry] = useState({ askedAt: question.askedAt, digits: '' });
  const value = entry.askedAt === question.askedAt ? entry.digits : '';
  const setValue = useCallback(
    (next: string | ((v: string) => string)) =>
      setEntry((e) => {
        const current = e.askedAt === question.askedAt ? e.digits : '';
        return { askedAt: question.askedAt, digits: typeof next === 'function' ? next(current) : next };
      }),
    [question.askedAt],
  );
  const [picked, setPicked] = useState<number | null>(null);
  const answer = question.fact.product;
  const usePad = mode === 'type' && touch;

  // Four options: the answer plus three near-misses (neighboring facts —
  // the mistakes children actually make), fixed for the life of the question.
  const choices = useMemo(
    () => shuffled([answer, ...distractors(question.x, question.y, 3)]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [question.askedAt],
  );
  const [elapsedMs, setElapsedMs] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const continueButtonRef = useRef<HTMLButtonElement>(null);

  // Reset the timer only when a genuinely new question arrives.
  useEffect(() => {
    setPicked(null);
    setElapsedMs(0);
    // Focusing the input on a touch device would pop up the OS keyboard over
    // half the screen — there the on-screen keypad is used instead.
    if (mode === 'type' && !touch) inputRef.current?.focus();
  }, [question.askedAt, mode, touch]);

  // Tick while the question is live; stops (and freezes the reading) the
  // moment the answer is locked in, so the number shown at submit time is
  // the reaction time that actually earned the fuel.
  useEffect(() => {
    if (disabled) return;
    const start = question.askedAt;
    const id = window.setInterval(() => setElapsedMs(Date.now() - start), 100);
    return () => window.clearInterval(id);
  }, [question.askedAt, disabled]);

  // Move focus to the Continue button once the explainer appears, so Enter
  // works as "continue" even though the (now disabled) answer input can no
  // longer hold focus to catch it itself.
  useEffect(() => {
    if (feedback === 'wrong') {
      continueButtonRef.current?.focus();
    }
  }, [feedback]);

  const submit = useCallback(
    (v: number) => {
      if (disabled || feedback) return;
      onAnswer(v, Date.now() - question.askedAt);
    },
    [disabled, feedback, onAnswer, question.askedAt],
  );

  // "Right away" checking: once as many digits as the answer has are in,
  // it's judged — right moves on, wrong counts as a mistake. In "confirm"
  // mode nothing happens until Enter / the ✓ key / a tap on the screen.
  useEffect(() => {
    if (mode !== 'type' || typedCheck !== 'auto' || value === '' || disabled || feedback) return;
    if (value.length >= String(answer).length) submit(Number(value));
  }, [mode, typedCheck, value, answer, disabled, feedback, submit]);

  // Confirm mode on a touch device: a tap anywhere on the screen (outside the
  // keypad and other buttons) submits what's typed.
  const confirmByTap = usePad && typedCheck === 'confirm';
  useEffect(() => {
    if (!confirmByTap || value === '' || disabled || feedback) return;
    const onTap = (e: PointerEvent) => {
      if ((e.target as Element | null)?.closest('button, a, input, [role="dialog"]')) return;
      submit(Number(value));
    };
    // Registered on the next tick so the tap that typed the last digit
    // doesn't immediately count as the confirming tap.
    const id = window.setTimeout(() => document.addEventListener('pointerup', onTap), 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener('pointerup', onTap);
    };
  }, [confirmByTap, value, disabled, feedback, submit]);

  const typeDigit = useCallback(
    (d: string) => {
      if (disabled || feedback) return;
      setValue((v) => (v.length >= MAX_DIGITS ? v : v + d));
    },
    [disabled, feedback, setValue],
  );
  // setValue is per-question; a stale copy would write the digits under the
  // previous question and wipe the whole answer instead of one digit.
  const backspace = useCallback(() => setValue((v) => v.slice(0, -1)), [setValue]);

  const choose = useCallback(
    (v: number) => {
      if (disabled || feedback) return;
      setPicked(v);
      submit(v);
    },
    [disabled, feedback, submit],
  );

  // Physical keys where there's no focused <input>: keypad mode (a tablet
  // with a keyboard case) and choice mode (1-4 picks an answer).
  useEffect(() => {
    if (mode === 'type' && !touch) return;
    const onKey = (e: KeyboardEvent) => {
      if (feedback === 'wrong') return; // Enter is handled by the focused Continue button
      if (mode === 'choice') {
        const n = Number(e.key);
        if (Number.isInteger(n) && n >= 1 && n <= choices.length) choose(choices[n - 1]);
        return;
      }
      if (/^[0-9]$/.test(e.key)) typeDigit(e.key);
      else if (e.key === 'Backspace') backspace();
      else if (e.key === 'Enter' && value !== '') submit(Number(value));
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mode, touch, feedback, choices, choose, typeDigit, backspace, submit, value]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (feedback === 'wrong') {
      onContinue();
      return;
    }
    if (value !== '') submit(Number(value));
  };

  const zone = speedZone(elapsedMs);
  const barPercent = Math.max(0, 100 - (Math.min(elapsedMs, SLOW_MS) / SLOW_MS) * 100);
  const onFire = streak >= ON_FIRE_STREAK;
  const heat = onFire ? fireLevel(streak) : 0;
  // Bigger streak = bigger word. Picked by askedAt so it's stable per
  // question and doesn't reshuffle on every timer tick.
  const tier = streakTier(streak);
  const tierWords = t.praise[tier];
  const praise = tierWords[question.askedAt % tierWords.length];

  return (
    <div className="hud-question-widget">
      <AnimatePresence>
        {feedback === 'correct' && (
          <motion.div
            key={question.askedAt}
            className={`praise-pop praise-tier-${tier}`}
            initial={{ opacity: 0, y: 20, scale: 0.4, rotate: -8 - tier * 4 }}
            animate={{ opacity: 1, y: 0, scale: 1 + tier * 0.12, rotate: 0 }}
            exit={{ opacity: 0, y: -30, scale: 1.3 }}
            transition={{ type: 'spring', stiffness: 500, damping: 18 }}
          >
            {praise}
            {streak >= 2 && <span className="praise-streak">🔥 {t.streak(streak)}</span>}
          </motion.div>
        )}
      </AnimatePresence>

      <ElectricBorder
        active={onFire}
        color={FIRE_COLORS[heat]}
        speed={1 + heat * 0.6}
        chaos={0.08 + heat * 0.05}
        borderRadius={14}
        className="question-electric"
      >
        {onFire && <div className="on-fire-badge" style={{ background: FIRE_COLORS[heat] }}>⚡ {t.onFire}</div>}
        <form className="question-card" onSubmit={handleSubmit}>
          <div className="equation-row" dir="ltr">
            <span className="equation-operand">{question.x}</span>
            <span className="equation-op">&times;</span>
            <span className="equation-operand">{question.y}</span>
            <span className="equation-op">=</span>
            {mode === 'type' && !usePad && (
              <input
                ref={inputRef}
                className={`answer-input ${feedback ?? ''}`}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="off"
                value={value}
                disabled={disabled}
                onChange={(e) => setValue(e.target.value.replace(/[^0-9]/g, '').slice(0, MAX_DIGITS))}
                placeholder="?"
                aria-label={t.yourAnswer}
              />
            )}
            {(usePad || mode === 'choice') && (
              <div className={`answer-input answer-display ${feedback ?? ''}`} aria-live="polite" aria-label={t.yourAnswer}>
                {mode === 'choice' ? (picked ?? '?') : value || '?'}
              </div>
            )}
          </div>

          {mode === 'choice' && feedback !== 'wrong' && (
            <div className="choice-grid" dir="ltr">
              {choices.map((c, i) => {
                const state =
                  feedback && c === picked ? (feedback === 'correct' ? 'is-right' : 'is-wrong') : '';
                return (
                  <button
                    key={c}
                    type="button"
                    className={`choice-btn ${state}`}
                    onClick={() => choose(c)}
                    disabled={disabled || !!feedback}
                  >
                    {!touch && <span className="choice-key">{i + 1}</span>}
                    {c}
                  </button>
                );
              })}
            </div>
          )}

          {usePad && feedback !== 'wrong' && (
            <>
              <NumPad
                onDigit={typeDigit}
                onBackspace={backspace}
                onConfirm={typedCheck === 'confirm' ? () => value !== '' && submit(Number(value)) : undefined}
                disabled={disabled || !!feedback}
              />
              {confirmByTap && value !== '' && !feedback && <div className="tap-to-check">{t.tapToCheck}</div>}
            </>
          )}

          {feedback === 'wrong' && (
            <div className="wrong-explainer">
              <MultiplicationGrid x={question.x} y={question.y} />
              <button ref={continueButtonRef} type="submit" className="continue-button">
                {t.gotItContinue} {!touch && <span className="continue-key">(Enter)</span>}
              </button>
            </div>
          )}
        </form>
      </ElectricBorder>

      {feedback !== 'wrong' && (
        <div className={`timer-slider zone-${zone}`}>
          <div className="timer-slider-clock">{(elapsedMs / 1000).toFixed(1)}s</div>
          <div className="timer-slider-track">
            <div className="timer-slider-fill" style={{ height: `${barPercent}%` }} />
            <div className="timer-slider-marker" style={{ bottom: `${FAST_MARKER_PERCENT}%` }} />
          </div>
          <div className="timer-slider-label">{t[ZONE_LABEL[zone]]}</div>
        </div>
      )}
    </div>
  );
}
