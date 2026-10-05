import { useEffect, useRef, useState } from 'react';
import { useGameStore } from './game/useGameStore';
import { RocketScene } from './components/scene/RocketScene';
import { QuestionForm } from './components/QuestionForm';
import { FuelGauge } from './components/FuelGauge';
import { LevelBanner } from './components/LevelBanner';
import { StrategyHint } from './components/StrategyHint';
import { LaunchOverlay } from './components/LaunchOverlay';
import { MasteryHeatmap } from './components/MasteryHeatmap';
import { useLang, useT } from './i18n/useLang';
import { useMusic } from './audio/useMusic';
import ClickSpark, { type ClickSparkHandle } from './components/reactbits/ClickSpark';
import CountUp from './components/reactbits/CountUp';
import ShinyText from './components/reactbits/ShinyText';
import { speedZone } from './game/scoring';
import './App.css';

const ANSWER_FEEDBACK_DELAY_MS = 900;

// Correct-answer spark bursts scale with answer speed, so a fast answer
// visibly "hits harder" than a slow one.
const BURST_BY_ZONE = {
  fast: { color: '#ffd77a', count: 16, scale: 3.2 },
  mid: { color: '#ff9d76', count: 12, scale: 2.2 },
  slow: { color: '#c9a4de', count: 8, scale: 1.5 },
} as const;

function App() {
  const t = useT();
  const toggleLang = useLang((s) => s.toggle);
  const musicOn = useMusic((s) => s.on);
  const toggleMusic = useMusic((s) => s.toggle);
  const sparkRef = useRef<ClickSparkHandle>(null);
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
      const input = document.querySelector('.answer-input');
      if (input) {
        const r = input.getBoundingClientRect();
        sparkRef.current?.burst(r.left + r.width / 2, r.top + r.height / 2, BURST_BY_ZONE[speedZone(elapsedMs)]);
      }
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
    if (window.confirm(t.resetConfirm)) {
      resetProgress();
    }
  };

  const displayLevel = justLaunched ? progress.level - 1 : progress.level;

  return (
    <ClickSpark ref={sparkRef} sparkColor="#ffd77a" sparkSize={12} sparkRadius={22} sparkCount={10}>
    <div className="app-root">
      <div className="starfield-layer">
        <RocketScene />
      </div>

      {showWarp && <div className="warp-burst" />}

      <header className="hud-topbar">
        <div className="hud-logo">
          🚀 <ShinyText text={t.logo} color="#ffb37a" shineColor="#fff6e0" speed={3} />
        </div>
        <LevelBanner level={displayLevel} />
        <div className="hud-topbar-right">
          <div className="hud-stat-chip">
            ✓ <CountUp to={progress.totalCorrectAnswers} duration={0.8} />
          </div>
          <button
            className="reset-button music-button"
            onClick={toggleMusic}
            title={musicOn ? t.musicOn : t.musicOff}
            aria-label={musicOn ? t.musicOn : t.musicOff}
          >
            {musicOn ? '🔊' : '🔇'}
          </button>
          <button className="reset-button lang-button" onClick={toggleLang} title={t.langToggleTitle}>
            {t.langToggle}
          </button>
          <button className="reset-button" onClick={requestHeatmap}>
            {t.stopAndReview}
          </button>
          <button className="reset-button" onClick={handleReset}>
            {t.reset}
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
            streak={progress.currentStreak}
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
    </ClickSpark>
  );
}

export default App;
