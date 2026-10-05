import { useEffect, useState } from 'react';
import { useGameStore } from './game/useGameStore';
import { RocketScene } from './components/scene/RocketScene';
import { QuestionForm } from './components/QuestionForm';
import { FuelGauge } from './components/FuelGauge';
import { LevelBanner } from './components/LevelBanner';
import { StrategyHint } from './components/StrategyHint';
import { LaunchOverlay } from './components/LaunchOverlay';
import { MasteryHeatmap } from './components/MasteryHeatmap';
import './App.css';

const ANSWER_FEEDBACK_DELAY_MS = 900;

function App() {
  const progress = useGameStore((s) => s.progress);
  const question = useGameStore((s) => s.question);
  const feedback = useGameStore((s) => s.feedback);
  const justLaunched = useGameStore((s) => s.justLaunched);
  const showHeatmap = useGameStore((s) => s.showHeatmap);
  const init = useGameStore((s) => s.init);
  const submitAnswer = useGameStore((s) => s.submitAnswer);
  const advanceQuestion = useGameStore((s) => s.advanceQuestion);
  const dismissLaunch = useGameStore((s) => s.dismissLaunch);
  const requestHeatmap = useGameStore((s) => s.requestHeatmap);
  const dismissHeatmap = useGameStore((s) => s.dismissHeatmap);
  const resetProgress = useGameStore((s) => s.resetProgress);
  const [locked, setLocked] = useState(false);
  const [showWarp, setShowWarp] = useState(false);
  const [hintVisible, setHintVisible] = useState(true);

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    if (!justLaunched) return;
    setShowWarp(true);
    const timeout = window.setTimeout(() => setShowWarp(false), 1200);
    return () => window.clearTimeout(timeout);
  }, [justLaunched]);

  // Global shortcut so "H" toggles the strategy hint no matter what has
  // focus (the answer input filters non-digit keys anyway, so this never
  // conflicts with typing an answer).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'h') setHintVisible((v) => !v);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const handleAnswer = (value: number, elapsedMs: number) => {
    setLocked(true);
    const correct = submitAnswer(value, elapsedMs);
    if (correct) {
      // Wrong answers wait for an explicit "Continue" instead (see
      // handleContinueAfterWrong) so there's time to look at the grid
      // explainer rather than it flashing by on a fixed timer.
      window.setTimeout(() => {
        advanceQuestion();
        setLocked(false);
      }, ANSWER_FEEDBACK_DELAY_MS);
    }
  };

  const handleContinueAfterWrong = () => {
    advanceQuestion();
    setLocked(false);
  };

  const handleReset = () => {
    if (window.confirm('Reset all progress? This clears every streak and mastered fact.')) {
      resetProgress();
    }
  };

  const displayLevel = justLaunched ? progress.level - 1 : progress.level;

  return (
    <div className="app-root">
      <div className="starfield-layer">
        <RocketScene />
      </div>

      {showWarp && <div className="warp-burst" />}

      <header className="hud-topbar">
        <div className="hud-logo">🚀 MULT-ROCKET</div>
        <LevelBanner level={displayLevel} />
        <div className="hud-topbar-right">
          <div className="hud-stat-chip">✓ {progress.totalCorrectAnswers}</div>
          <button className="reset-button" onClick={requestHeatmap}>
            Stop &amp; Review
          </button>
          <button className="reset-button" onClick={handleReset}>
            Reset
          </button>
        </div>
      </header>

      <FuelGauge
        fuelPercent={progress.fuel}
        bestStreak={progress.bestStreak}
        mastery={progress.mastery}
      />

      {question && !justLaunched && !showHeatmap && (
        <div className="hud-question-zone">
          <StrategyHint
            x={question.x}
            y={question.y}
            visible={hintVisible}
            onToggle={() => setHintVisible((v) => !v)}
          />
          <QuestionForm
            question={question}
            feedback={feedback}
            disabled={locked}
            onAnswer={handleAnswer}
            onContinue={handleContinueAfterWrong}
          />
        </div>
      )}

      {justLaunched && (
        <LaunchOverlay completedLevel={progress.level - 1} onContinue={dismissLaunch} />
      )}

      {showHeatmap && !justLaunched && (
        <MasteryHeatmap mastery={progress.mastery} onContinue={dismissHeatmap} />
      )}
    </div>
  );
}

export default App;
