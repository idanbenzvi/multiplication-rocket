import { useEffect, useRef, useState } from 'react';
import { useGameStore } from './game/useGameStore';
import { RocketScene } from './components/scene/RocketScene';
import { QuestionForm } from './components/QuestionForm';
import { FuelGauge } from './components/FuelGauge';
import { LevelBanner } from './components/LevelBanner';
import { StrategyHint } from './components/StrategyHint';
import { LaunchOverlay } from './components/LaunchOverlay';
import { MasteryHeatmap } from './components/MasteryHeatmap';
import { useT } from './i18n/useLang';
import { SettingsMenu } from './components/SettingsMenu';
import { ReviewButton } from './components/ReviewButton';
import { PilotButton, ProfileGate } from './components/Profiles';
import { activeProfile, pilotName, useProfileGateOpen } from './profiles/useProfiles';
import { isTouchDevice, useSettings } from './settings/useSettings';
import { sfx } from './audio/sfx';
import { haptics } from './audio/haptics';
import { AudioControls } from './components/AudioControls';
import { MilestoneBanner } from './components/MilestoneBanner';
import { WormholeChallenge } from './components/WormholeChallenge';
import { WormholeFlight } from './components/WormholeFlight';
import { MeteorShower } from './components/MeteorShower';
import { Constellation } from './components/Constellation';
import { FleetBattle } from './components/FleetBattle';
import { StrandedFleet } from './components/StrandedFleet';
import { DevPanel } from './components/DevPanel';
import { PauseController } from './components/PauseController';
import { DeepSpaceAcademy } from './components/academy/DeepSpaceAcademy';
import { usePause } from './game/gameClock';
import { DEV_MODE } from './dev/devMode';
import { isMilestone, streakTier } from './game/streak';
import ClickSpark, { type ClickSparkHandle } from './components/reactbits/ClickSpark';
import CountUp from './components/reactbits/CountUp';
import ShinyText from './components/reactbits/ShinyText';
import { speedZone } from './game/scoring';
import './App.css';

const ANSWER_FEEDBACK_DELAY_MS = 900;

// Correct-answer spark bursts scale with answer speed, so a fast answer
// visibly "hits harder" than a slow one — and with the streak tier, so a
// long run keeps getting more spectacular.
const BURST_BY_ZONE = {
  fast: { color: '#ffd77a', count: 16, scale: 3.2 },
  mid: { color: '#ff9d76', count: 12, scale: 2.2 },
  slow: { color: '#c9a4de', count: 8, scale: 1.5 },
} as const;
const TIER_COLORS = ['#ffd77a', '#6ad7ff', '#ff6ad5', '#7ee08f'];
const MILESTONE_BANNER_MS = 1700;

function App() {
  const t = useT();
  const answerMode = useSettings((s) => s.answerMode);
  const paused = usePause((s) => s.away);
  const academyOpen = useGameStore((s) => s.academyOpen);
  const closeAcademy = useGameStore((s) => s.closeAcademy);
  // Until a pilot is picked/created the game itself stays hidden.
  const gateOpen = useProfileGateOpen();
  const typedCheck = useSettings((s) => s.typedCheck);
  const [milestone, setMilestone] = useState<number | null>(null);
  const sparkRef = useRef<ClickSparkHandle>(null);
  const progress = useGameStore((s) => s.progress);
  const question = useGameStore((s) => s.question);
  const feedback = useGameStore((s) => s.feedback);
  const justLaunched = useGameStore((s) => s.justLaunched);
  const showHeatmap = useGameStore((s) => s.showHeatmap);
  const heatmapAuto = useGameStore((s) => s.heatmapAuto);
  const init = useGameStore((s) => s.init);
  const submitAnswer = useGameStore((s) => s.submitAnswer);
  const advanceQuestion = useGameStore((s) => s.advanceQuestion);
  const dismissLaunch = useGameStore((s) => s.dismissLaunch);
  const requestHeatmap = useGameStore((s) => s.requestHeatmap);
  const challenge = useGameStore((s) => s.challenge);
  const inWormhole = useGameStore((s) => s.inWormhole);
  const enterWormhole = useGameStore((s) => s.enterWormhole);
  const exitWormhole = useGameStore((s) => s.exitWormhole);
  const collapseWormhole = useGameStore((s) => s.collapseWormhole);
  const [exitFlash, setExitFlash] = useState(0);
  const bonusRound = useGameStore((s) => s.bonusRound);
  const bonusNonce = useGameStore((s) => s.bonusNonce);
  const finishBonusRound = useGameStore((s) => s.finishBonusRound);
  const dismissHeatmap = useGameStore((s) => s.dismissHeatmap);
  const resetProgress = useGameStore((s) => s.resetProgress);
  const [locked, setLocked] = useState(false);
  const [showWarp, setShowWarp] = useState(false);
  const [hintVisible, setHintVisible] = useState(true);

  useEffect(() => {
    init();
  }, [init]);

  // The top bar's height varies (it wraps to two rows on phones, and the
  // level banner can wrap too), so overlays position themselves below it
  // via --hud-top instead of guessing a fixed offset.
  const topbarRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = topbarRef.current;
    if (!el) return;
    const apply = () => document.documentElement.style.setProperty('--hud-top', `${Math.ceil(el.getBoundingClientRect().bottom)}px`);
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!justLaunched) return;
    setShowWarp(true);
    sfx.launch();
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
    if (!correct) {
      sfx.wrong();
      haptics.thump();
    }
    if (correct) {
      const { progress: after, justLaunched: launching } = useGameStore.getState();
      const streak = after.currentStreak;
      const zone = speedZone(elapsedMs);
      const tier = streakTier(streak);
      // A launch resets the streak and plays its own sound (see the
      // justLaunched effect), so only celebrate the answer itself otherwise.
      if (!launching) sfx.correct(streak, zone === 'fast');
      haptics.correct(streak);

      const input = document.querySelector('.answer-input');
      if (input) {
        const r = input.getBoundingClientRect();
        const x = r.left + r.width / 2;
        const y = r.top + r.height / 2;
        const base = BURST_BY_ZONE[zone];
        sparkRef.current?.burst(x, y, { ...base, count: base.count + tier * 6, scale: base.scale + tier * 0.8 });
        // From 3 in a row, a second ring in the tier's color.
        if (tier > 0) {
          window.setTimeout(
            () => sparkRef.current?.burst(x, y, { color: TIER_COLORS[tier], count: 10 + tier * 6, scale: 2 + tier }),
            120,
          );
        }
      }

      if (!launching && isMilestone(streak)) {
        sfx.milestone(streak);
        setMilestone(streak);
        window.setTimeout(() => setMilestone((m) => (m === streak ? null : m)), MILESTONE_BANNER_MS);
        // Fireworks: bursts popping all over the screen.
        for (let i = 0; i < 6 + tier * 2; i++) {
          window.setTimeout(() => {
            sparkRef.current?.burst(window.innerWidth * (0.15 + Math.random() * 0.7), window.innerHeight * (0.15 + Math.random() * 0.5), {
              color: TIER_COLORS[i % TIER_COLORS.length],
              count: 14,
              scale: 3 + Math.random() * 2,
            });
          }, i * 110);
        }
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
    if (window.confirm(t.resetConfirm(pilotName(activeProfile(), t.defaultPilotName)))) {
      resetProgress();
    }
  };

  const displayLevel = justLaunched ? progress.level - 1 : progress.level;

  const handleWormholeDone = () => {
    exitWormhole();
    setExitFlash((n) => n + 1); // keyed, so each exit replays the fade
  };

  const burstAt = (x: number, y: number, color: string) =>
    sparkRef.current?.burst(x, y, { color, count: 18, scale: 3 });

  return (
    <ClickSpark ref={sparkRef} sparkColor="#ffd77a" sparkSize={12} sparkRadius={22} sparkCount={10}>
    <div className={`app-root ${paused ? 'is-paused' : ''}`}>
      <div className="starfield-layer">
        <RocketScene />
      </div>

      {showWarp && <div className="warp-burst" />}
      {exitFlash > 0 && <div key={exitFlash} className="wormhole-exit-flash" />}
      <MilestoneBanner streak={milestone} />

      <header className="hud-topbar" ref={topbarRef}>
        <div className="hud-logo">
          🚀 <ShinyText text={t.logo} color="#ffb37a" shineColor="#fff6e0" speed={3} />
        </div>
        <LevelBanner level={displayLevel} />
        <div className="hud-topbar-right">
          <PilotButton />
          <div className="hud-stat-chip">
            ✓ <CountUp to={progress.totalCorrectAnswers} duration={0.8} />
          </div>
          <AudioControls />
          <ReviewButton mastery={progress.mastery} onClick={requestHeatmap} />
          <SettingsMenu onReset={handleReset} />
        </div>
      </header>

      <FuelGauge
        fuelPercent={progress.fuel}
        bestStreak={progress.bestStreak}
        mastery={progress.mastery}
      />

      <ProfileGate />
      {academyOpen && <DeepSpaceAcademy onClose={closeAcademy} onBurst={burstAt} />}
      <PauseController />
      {DEV_MODE && <DevPanel />}

      {!gateOpen && (
        <>
          {bonusRound === 'meteor' && !justLaunched && !showHeatmap && (
            <MeteorShower key={bonusNonce} onDone={finishBonusRound} onBurst={burstAt} />
          )}
          {bonusRound === 'battle' && !justLaunched && !showHeatmap && (
            <FleetBattle key={bonusNonce} onDone={finishBonusRound} onBurst={burstAt} />
          )}
          {bonusRound === 'stranded' && !justLaunched && !showHeatmap && (
            <StrandedFleet key={bonusNonce} onDone={finishBonusRound} onBurst={burstAt} />
          )}
          {bonusRound === 'constellation' && !justLaunched && !showHeatmap && (
            <Constellation key={bonusNonce} onDone={finishBonusRound} onBurst={burstAt} />
          )}

          {challenge && !inWormhole && !justLaunched && !showHeatmap && (
            <WormholeChallenge
              key={challenge.createdAt}
              challenge={challenge}
              onSuccess={enterWormhole}
              onCollapse={collapseWormhole}
              onBurst={burstAt}
            />
          )}

          {challenge && <WormholeFlight level={displayLevel} active={inWormhole} onDone={handleWormholeDone} />}

          {question && !challenge && !bonusRound && !justLaunched && !showHeatmap && (
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
                mode={answerMode}
                typedCheck={typedCheck}
                touch={isTouchDevice}
              />
            </div>
          )}

          {justLaunched && (
            <LaunchOverlay completedLevel={progress.level - 1} onContinue={dismissLaunch} />
          )}

          {showHeatmap && !justLaunched && (
            <MasteryHeatmap mastery={progress.mastery} onContinue={dismissHeatmap} auto={heatmapAuto} />
          )}
        </>
      )}
    </div>
    </ClickSpark>
  );
}

export default App;
