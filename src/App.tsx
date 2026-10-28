import { useEffect, useRef, useState } from 'react';
import { useGameStore } from './game/useGameStore';
import { RocketScene } from './components/scene/RocketScene';
import { QuestionForm } from './components/QuestionForm';
import { FuelGauge } from './components/FuelGauge';
import { LevelBanner } from './components/LevelBanner';
import { StrategyHint } from './components/StrategyHint';
import { ShipComputer } from './components/computer/ShipComputer';
import { getStrugglingFactKeys } from './game/facts';
import { LaunchOverlay } from './components/LaunchOverlay';
import { MasteryHeatmap } from './components/MasteryHeatmap';
import { useT } from './i18n/useLang';
import { SettingsMenu } from './components/SettingsMenu';
import { CockpitHost } from './components/cockpit360/CockpitHost';
import { ReviewButton } from './components/ReviewButton';
import { AboutButton } from './components/about/AboutButton';
import { PilotButton, ProfileGate } from './components/Profiles';
import { Hangar } from './components/Hangar';
import { LaunchBay } from './components/bay/LaunchBay';
import { GameModesButton } from './components/GameModes';
import { ModeWarp } from './components/ModeWarp';
import { Descent } from './components/cockpit360/canyon/Descent';
import { startArrival, takeCanyon } from './components/cockpit360/canyon/arrival';
import { StudioSplash } from './components/splash/StudioSplash';
import { LanguageOffer } from './components/LanguageOffer';
import { Story } from './components/story/Story';
import { useStory } from './components/story/useStory';
import { activeProfile, pilotName, useMission, useProfileGateOpen, useTimedBoost } from './profiles/useProfiles';
import { missionOfKey, opsOf } from './game/mission';
import { stagesOf } from './game/stages';
import { missionName } from './i18n/strings';
import { isTouchDevice, useSettings } from './settings/useSettings';
import { sfx } from './audio/sfx';
import { haptics } from './audio/haptics';
import { AudioControls } from './components/AudioControls';
import { MilestoneBanner } from './components/MilestoneBanner';
import { BadgesButton } from './components/badges/BadgesPage';
import { BadgeToast } from './components/badges/BadgeToast';
import { WormholeChallenge } from './components/WormholeChallenge';
import { WormholeFlight } from './components/WormholeFlight';
import { MeteorShower } from './components/MeteorShower';
import { Constellation } from './components/Constellation';
import { FleetBattle } from './components/FleetBattle';
import { StrandedFleet } from './components/StrandedFleet';
import { StardustRun } from './components/stardust/StardustRun';
import { AccelerationRoad } from './components/road/AccelerationRoad';
import { SpaceTraffic } from './components/traffic/SpaceTraffic';
import { DevPanel } from './components/DevPanel';
import { prepareLaunchWarp } from './components/launchWarp';
import { PauseController } from './components/PauseController';
import { DeepSpaceAcademy } from './components/academy/DeepSpaceAcademy';
import { AdditionAcademy } from './components/academy/AdditionAcademy';
import { SubtractionAcademy } from './components/academy/SubtractionAcademy';
import { CrewFlight } from './components/crew/CrewFlight';
import { CrewSetup } from './components/crew/CrewSetup';
import { SplitSky } from './components/sky/SplitSky';
import { SunMonster } from './components/sun/SunMonster';
import { BlackSun } from './components/boss/BlackSun';
import { useCrewStore } from './game/useCrewStore';
import { usePause } from './game/gameClock';
import { DEV_MODE } from './dev/devMode';
import { IS_PREVIEW } from './storage/previewNamespace';
import { isMilestone, streakTier } from './game/streak';
import ClickSpark, { type ClickSparkHandle } from './components/reactbits/ClickSpark';
import CountUp from './components/reactbits/CountUp';
import { SpaceTimesLogo } from './components/logo/SpaceTimesLogo';
import { paceMs, speedZone } from './game/scoring';
import { useSideways } from './components/useSideways';
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
  // Orbie, the ship's computer, can be switched off in the cockpit
  const orbie = useSettings((s) => s.orbie);
  // a crew flight replaces the solo game (its questions, tank and overlays)
  const crewActive = useCrewStore((s) => s.active);
  const closeAcademy = useGameStore((s) => s.closeAcademy);
  // Until a pilot is picked/created the game itself stays hidden.
  const gateOpen = useProfileGateOpen();
  // (the story's title flies into the logo's place: it's hidden till it's there)
  const titling = useStory((s) => s.act === 'title' && !s.replay);
  const typedCheck = useSettings((s) => s.typedCheck);
  const [milestone, setMilestone] = useState<number | null>(null);
  const sparkRef = useRef<ClickSparkHandle>(null);
  const progress = useGameStore((s) => s.progress);
  const mission = useMission();
  const stageUp = useGameStore((s) => s.stageUp);
  const question = useGameStore((s) => s.question);
  const academyOp = question ? missionOfKey(question.fact.key) : opsOf(mission)[0];
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
  // the launch screen's hyperspeed is built ahead of time, once the tank is half full
  const halfFull = progress.fuel >= 50;
  useEffect(() => {
    if (halfFull) prepareLaunchWarp();
  }, [halfFull]);
  // this pilot races the clock for a bigger boost (unless switched off for them in the cockpit)
  const timed = useTimedBoost();
  // the rocket blasting off for a bonus round (it starts once it's gone)
  const departing = useGameStore((s) => s.departing);
  useEffect(() => {
    if (departing) sfx.blastOff();
  }, [departing]);
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

  // A phone on its side: the rocket on the left, the question on the right, the pilot and ⚙️ in the corner (useSideways.ts)
  const sideways = useSideways();

  // The top bar's height varies (it wraps to two rows on phones, and the
  // level banner can wrap too), so overlays position themselves below it
  // via --hud-top instead of guessing a fixed offset. On a phone on its side
  // the top bar is just two buttons in the corner, so they have the whole height.
  const topbarRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = topbarRef.current;
    if (!el) return;
    const apply = () =>
      document.documentElement.style.setProperty(
        '--hud-top',
        sideways ? 'calc(env(safe-area-inset-top) + 8px)' : `${Math.ceil(el.getBoundingClientRect().bottom)}px`,
      );
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, [sideways]);

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
    // the pace the question was raced at (the answer moves it)
    const before = useGameStore.getState();
    const pace = paceMs(before.progress.pace);
    // (worked out with the ship's computer: the full celebration, not the clock's)
    const helped = before.helpedAt === before.question?.askedAt;
    const correct = submitAnswer(value, elapsedMs);
    if (!correct) {
      sfx.wrong();
      haptics.thump();
    }
    if (correct) {
      const { progress: after, justLaunched: launching } = useGameStore.getState();
      const streak = after.currentStreak;
      // without the clock, every right answer gets the full celebration
      const zone = timed && !helped ? speedZone(elapsedMs, pace) : 'fast';
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
    if (window.confirm(t.resetConfirm(pilotName(activeProfile(), t.defaultPilotName), missionName(t, mission)))) {
      resetProgress();
    }
  };

  const displayLevel = justLaunched ? progress.level - 1 : progress.level;

  // on from a launch: back to the game, or now and then down into the destination for a Canyon Run
  const continueAfterLaunch = () => {
    const reached = progress.level - 1;
    dismissLaunch();
    if (!useCrewStore.getState().active && takeCanyon(reached)) startArrival(reached);
  };

  const handleWormholeDone = () => {
    exitWormhole();
    setExitFlash((n) => n + 1); // keyed, so each exit replays the fade
  };

  const burstAt = (x: number, y: number, color: string) =>
    sparkRef.current?.burst(x, y, { color, count: 18, scale: 3 });

  return (
    <ClickSpark ref={sparkRef} sparkColor="#ffd77a" sparkSize={12} sparkRadius={22} sparkCount={10}>
    <div className={`app-root ${paused ? 'is-paused' : ''} ${sideways ? 'is-sideways' : ''}`}>
      <div className="starfield-layer">
        <RocketScene />
      </div>
      {/* a soft cinematic vignette: the sky stays bright in the middle, the HUD readable at the edges */}
      <div className="app-vignette" aria-hidden />

      {showWarp && <div className="warp-burst" />}
      {exitFlash > 0 && <div key={exitFlash} className="wormhole-exit-flash" />}
      <MilestoneBanner streak={milestone} />
      {!gateOpen && <BadgeToast />}

      <header className="hud-topbar" ref={topbarRef}>
        <div className={`hud-logo ${titling ? 'is-awaited' : ''}`}>
          <SpaceTimesLogo className="hud-logo-art" />
          {IS_PREVIEW && <span className="preview-badge">PREVIEW</span>}
        </div>
        {!crewActive && <LevelBanner level={displayLevel} stages={stagesOf(mission, progress)} />}
        {/* on a phone or a tablet, only the pilot and ⚙️: the rest is in the cockpit (About stays, out of sight, for the cockpit to open) */}
        <div className={`hud-topbar-right ${isTouchDevice ? 'is-compact' : ''}`}>
          {/* solo pilot's own things: the crew bar shows both pilots instead */}
          {!crewActive && <PilotButton />}
          {!isTouchDevice && (
            <>
              {!crewActive && <GameModesButton />}
              <BadgesButton />
              {!crewActive && (
                <div className="hud-stat-chip">
                  ✓ <CountUp to={progress.totalCorrectAnswers} duration={0.8} />
                </div>
              )}
              <AudioControls />
              {!crewActive && <ReviewButton mastery={progress.mastery} mission={mission} onClick={requestHeatmap} />}
            </>
          )}
          <SettingsMenu />
          <AboutButton />
        </div>
      </header>

      {!crewActive && (
        <FuelGauge
          fuelPercent={progress.fuel}
          bestStreak={progress.bestStreak}
          mastery={progress.mastery}
        />
      )}

      <ProfileGate />
      {/* the cockpit, from ⚙️ (cockpit360/) */}
      <CockpitHost onReset={handleReset} />
      <Hangar />
      {/* where the two above show: the hangar's launch bay */}
      <LaunchBay />
      <CrewSetup />
      {!gateOpen && <SplitSky />}
      {!gateOpen && <SunMonster />}
      {!gateOpen && <BlackSun />}
      <ModeWarp />
      {/* now and then at a level's end: diving into the destination for a Canyon Run */}
      <Descent />
      {/* the studio's opening, over the game while it loads */}
      <StudioSplash />
      {/* "Switch to English", when Hebrew was guessed */}
      <LanguageOffer />
      {/* the story: its opening the first time, a new pilot's launch, and About's ▶ */}
      <Story />
      {!gateOpen && crewActive && <CrewFlight onBurst={burstAt} />}
      {academyOpen &&
        // (on a mixed mission, the Academy for the kind of question showing)
        (academyOp === 'add' ? (
          <AdditionAcademy onClose={closeAcademy} onBurst={burstAt} />
        ) : academyOp === 'sub' ? (
          <SubtractionAcademy onClose={closeAcademy} onBurst={burstAt} />
        ) : (
          <DeepSpaceAcademy onClose={closeAcademy} onBurst={burstAt} />
        ))}
      <PauseController />
      {DEV_MODE && <DevPanel />}

      {!gateOpen && !crewActive && (
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
          {bonusRound === 'stardust' && !justLaunched && !showHeatmap && (
            <StardustRun key={bonusNonce} onDone={finishBonusRound} onBurst={burstAt} />
          )}
          {bonusRound === 'road' && !justLaunched && !showHeatmap && (
            <AccelerationRoad key={bonusNonce} onDone={finishBonusRound} onBurst={burstAt} />
          )}
          {bonusRound === 'traffic' && !justLaunched && !showHeatmap && (
            <SpaceTraffic key={bonusNonce} onDone={finishBonusRound} onBurst={burstAt} />
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

          {question && !challenge && !bonusRound && !departing && !justLaunched && !showHeatmap && (
            <div className="hud-question-zone">
              <StrategyHint
                x={question.x}
                y={question.y}
                mission={missionOfKey(question.fact.key)}
                visible={hintVisible}
                onToggle={() => setHintVisible((v) => !v)}
                quiet={feedback === 'correct'}
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
                timed={timed}
                paceMs={paceMs(progress.pace)}
              />
            </div>
          )}
          {/* stuck on it a while: the ship's computer offers to think it through */}
          {orbie && question && !challenge && !bonusRound && !departing && !justLaunched && !showHeatmap && feedback === null && !academyOpen && (
            <ShipComputer
              key={question.askedAt}
              question={question}
              paceMs={paceMs(progress.pace)}
              struggling={getStrugglingFactKeys(progress.mastery).includes(question.fact.key)}
            />
          )}

          {justLaunched && (
            <LaunchOverlay
              completedLevel={progress.level - 1}
              newStage={stageUp ?? undefined}
              onContinue={continueAfterLaunch}
            />
          )}

          {showHeatmap && !justLaunched && (
            <MasteryHeatmap mastery={progress.mastery} mission={mission} onContinue={dismissHeatmap} auto={heatmapAuto} />
          )}
        </>
      )}
    </div>
    </ClickSpark>
  );
}

export default App;
