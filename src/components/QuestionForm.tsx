import { useEffect, useRef, useState } from 'react';
import type { Question } from '../game/useGameStore';
import { FAST_MS, SLOW_MS, speedZone } from '../game/scoring';
import { MultiplicationGrid } from './MultiplicationGrid';

interface Props {
  question: Question;
  feedback: 'correct' | 'wrong' | null;
  disabled: boolean;
  onAnswer: (value: number, elapsedMs: number) => void;
  onContinue: () => void;
}

const ZONE_LABEL: Record<ReturnType<typeof speedZone>, string> = {
  fast: 'BIG BOOST',
  mid: 'NORMAL',
  slow: 'SMALL BOOST',
};

// Where the fast/mid cutoff sits on the drained-from-top gauge: the fill's
// height equals this value at the instant elapsed time crosses FAST_MS, so
// the marker line lands exactly where the mercury will be at that moment.
const FAST_MARKER_PERCENT = 100 - (FAST_MS / SLOW_MS) * 100;

export function QuestionForm({ question, feedback, disabled, onAnswer, onContinue }: Props) {
  const [value, setValue] = useState('');
  const [elapsedMs, setElapsedMs] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const continueButtonRef = useRef<HTMLButtonElement>(null);

  // Reset the timer only when a genuinely new question arrives.
  useEffect(() => {
    setValue('');
    setElapsedMs(0);
    inputRef.current?.focus();
  }, [question.askedAt]);

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (feedback === 'wrong') {
      onContinue();
      return;
    }
    if (disabled || value === '') return;
    onAnswer(Number(value), Date.now() - question.askedAt);
  };

  const zone = speedZone(elapsedMs);
  const barPercent = Math.max(0, 100 - (Math.min(elapsedMs, SLOW_MS) / SLOW_MS) * 100);

  return (
    <div className="hud-question-widget">
      <form className="question-card" onSubmit={handleSubmit}>
        <div className="equation-row">
          <span className="equation-operand">{question.x}</span>
          <span className="equation-op">&times;</span>
          <span className="equation-operand">{question.y}</span>
          <span className="equation-op">=</span>
          <input
            ref={inputRef}
            className={`answer-input ${feedback ?? ''}`}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            value={value}
            disabled={disabled}
            onChange={(e) => setValue(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
            placeholder="?"
            aria-label="Your answer"
          />
        </div>

        {feedback === 'wrong' && (
          <div className="wrong-explainer">
            <MultiplicationGrid x={question.x} y={question.y} />
            <button ref={continueButtonRef} type="submit" className="continue-button">
              Got it! Continue <span className="continue-key">(Enter)</span>
            </button>
          </div>
        )}
      </form>

      {feedback !== 'wrong' && (
        <div className={`timer-slider zone-${zone}`}>
          <div className="timer-slider-clock">{(elapsedMs / 1000).toFixed(1)}s</div>
          <div className="timer-slider-track">
            <div className="timer-slider-fill" style={{ height: `${barPercent}%` }} />
            <div className="timer-slider-marker" style={{ bottom: `${FAST_MARKER_PERCENT}%` }} />
          </div>
          <div className="timer-slider-label">{ZONE_LABEL[zone]}</div>
        </div>
      )}
    </div>
  );
}
