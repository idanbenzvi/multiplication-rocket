import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useCrewStore, type CrewQuestion } from '../../game/useCrewStore';
import { pilotName, useProfiles, type Profile } from '../../profiles/useProfiles';
import { gameTimeout } from '../../game/gameClock';
import { bump, kick } from '../../game/flight';
import { speedZone } from '../../game/scoring';
import { isTouchDevice, useSettings } from '../../settings/useSettings';
import { sfx } from '../../audio/sfx';
import { haptics } from '../../audio/haptics';
import { useT } from '../../i18n/useLang';
import { QuestionForm } from '../QuestionForm';
import { NavigatorQuestion } from './NavigatorQuestion';
import { Docking } from './Docking';
import { SEAT_COLORS } from './seatColors';
import GradientText from '../reactbits/GradientText';
import './crew.css';

interface Props {
  onBurst: (x: number, y: number, color: string) => void;
}

const NEXT_TURN_DELAY_MS = 900;

function useCrewProfiles(): [Profile | undefined, Profile | undefined] {
  const profiles = useProfiles((s) => s.profiles);
  const members = useCrewStore((s) => s.members);
  return [profiles.find((p) => p.id === members?.[0].profileId), profiles.find((p) => p.id === members?.[1].profileId)];
}

// ---------- top: both seats and the shared tank ----------

function CrewBar({ pilots, current }: { pilots: [Profile | undefined, Profile | undefined]; current: 0 | 1 | 'both' | null }) {
  const t = useT();
  const members = useCrewStore((s) => s.members);
  const fuel = useCrewStore((s) => s.fuel);
  const contributions = useCrewStore((s) => s.contributions);
  const level = useCrewStore((s) => s.level);
  const land = useCrewStore((s) => s.land);

  const seatCard = (i: 0 | 1) => {
    const p = pilots[i];
    const on = current === i || current === 'both';
    return (
      <div className={`crew-seat ${on ? 'is-turn' : ''}`} style={{ '--seat': SEAT_COLORS[i] } as React.CSSProperties}>
        <span className="crew-seat-avatar">{p?.avatar}</span>
        <span className="crew-seat-text">
          <span className="crew-seat-name" dir="auto">
            {pilotName(p, t.defaultPilotName)}
          </span>
          <span className="crew-seat-role">{members?.[i].seat === 'navigator' ? t.crew.seatNavigator : t.crew.seatPilot}</span>
        </span>
      </div>
    );
  };

  return (
    <div className="crew-bar" dir="ltr">
      {seatCard(0)}
      <div className="crew-tank">
        <div className="crew-tank-head">
          <span>⛽ {t.crew.sharedFuel}</span>
          <span>{t.crew.crewLevel(level)}</span>
        </div>
        <div className="crew-tank-track" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(fuel)}>
          <div className="crew-tank-fill" style={{ width: `${contributions[0]}%`, background: SEAT_COLORS[0] }} />
          <div className="crew-tank-fill" style={{ width: `${Math.min(100 - contributions[0], contributions[1])}%`, background: SEAT_COLORS[1] }} />
        </div>
        <button type="button" className="crew-land" onClick={land}>
          🛬 {t.crew.land}
        </button>
      </div>
      {seatCard(1)}
    </div>
  );
}

// ---------- launch and summary ----------

function CrewLaunch({ onContinue, onLand }: { onContinue: () => void; onLand: () => void }) {
  const t = useT();
  const level = useCrewStore((s) => s.level);
  useEffect(() => {
    sfx.launch();
    kick(1);
  }, []);
  return (
    <motion.div className="crew-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <motion.div className="crew-panel" initial={{ scale: 0.8 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 18 }}>
        <GradientText className="crew-panel-title" colors={['#6ad7ff', '#ffd77a', '#ff9d76', '#6ad7ff']} animationSpeed={3}>
          {t.crew.launchTitle}
        </GradientText>
        <div className="crew-panel-sub">{t.crew.launchSub(level)}</div>
        <button type="button" className="profile-primary" onClick={onContinue} autoFocus>
          {t.crew.keepFlying}
        </button>
        <button type="button" className="profile-secondary" onClick={onLand}>
          🛬 {t.crew.land}
        </button>
      </motion.div>
    </motion.div>
  );
}

function CrewSummary({ pilots }: { pilots: [Profile | undefined, Profile | undefined] }) {
  const t = useT();
  const members = useCrewStore((s) => s.members);
  const stats = useCrewStore((s) => s.stats);
  const docks = useCrewStore((s) => s.docks);
  const missionLaunches = useCrewStore((s) => s.missionLaunches);
  const close = useCrewStore((s) => s.close);
  return (
    <motion.div className="crew-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <motion.div className="crew-panel" initial={{ scale: 0.85 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 20 }}>
        <GradientText className="crew-panel-title" colors={['#6ad7ff', '#ffd77a', '#ff9d76', '#6ad7ff']} animationSpeed={4}>
          {t.crew.summaryTitle}
        </GradientText>
        <div className="crew-panel-sub">{t.crew.teamwork}</div>
        <div className="crew-summary-seats" dir="ltr">
          {([0, 1] as const).map((i) => (
            <div key={i} className="crew-summary-seat" style={{ '--seat': SEAT_COLORS[i] } as React.CSSProperties}>
              <span className="crew-seat-avatar">{pilots[i]?.avatar}</span>
              <span className="crew-seat-name" dir="auto">
                {pilotName(pilots[i], t.defaultPilotName)}
              </span>
              <span className="crew-seat-role">{members?.[i].seat === 'navigator' ? t.crew.seatNavigator : t.crew.seatPilot}</span>
              <span className="crew-summary-right">{t.crew.summaryRight(stats[i].correct, stats[i].answered)}</span>
            </div>
          ))}
        </div>
        <div className="crew-summary-crew">
          <span>🛰️ {t.crew.summaryDocks(docks)}</span>
          <span>🚀 {t.crew.summaryLaunches(missionLaunches)}</span>
        </div>
        <button type="button" className="profile-primary" onClick={close} autoFocus>
          {t.crew.backToSolo}
        </button>
      </motion.div>
    </motion.div>
  );
}

// ---------- a question turn ----------

function QuestionTurn({ turn, pilot, onBurst }: { turn: CrewQuestion; pilot: Profile | undefined; onBurst: Props['onBurst'] }) {
  const t = useT();
  const members = useCrewStore((s) => s.members);
  const feedback = useCrewStore((s) => s.feedback);
  const answer = useCrewStore((s) => s.answer);
  const next = useCrewStore((s) => s.next);
  const answerMode = useSettings((s) => s.answerMode);
  const typedCheck = useSettings((s) => s.typedCheck);
  const [locked, setLocked] = useState(false);
  const seat = members?.[turn.member].seat ?? 'pilot';
  const color = SEAT_COLORS[turn.member];

  const handle = useCallback(
    (value: number, elapsedMs: number) => {
      setLocked(true);
      const correct = answer(value, elapsedMs);
      if (!correct) {
        sfx.wrong();
        haptics.thump();
        bump();
        return; // wrong answers wait for "Continue"
      }
      sfx.correct(1, seat === 'pilot' && speedZone(elapsedMs) === 'fast');
      haptics.correct(1);
      kick(0.35);
      const el = document.querySelector('.crew-turn-zone .answer-input, .crew-turn-zone .choice-btn.is-right');
      const r = el?.getBoundingClientRect();
      if (r) onBurst(r.left + r.width / 2, r.top + r.height / 2, color);
      gameTimeout(next, NEXT_TURN_DELAY_MS);
    },
    [answer, next, seat, onBurst, color],
  );

  return (
    // keyed by question in CrewFlight, so everything here starts fresh each turn
    <div className="hud-question-zone crew-turn-zone">
      <motion.div
        className="crew-turn-banner"
        style={{ '--seat': color } as React.CSSProperties}
        initial={{ opacity: 0, y: 12, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 360, damping: 22 }}
      >
        <span className="crew-turn-avatar">{pilot?.avatar}</span>
        <span dir="auto">{t.crew.turnOf(pilotName(pilot, t.defaultPilotName))}</span>
        <span className="crew-turn-seat">{seat === 'navigator' ? t.crew.seatNavigator : t.crew.seatPilot}</span>
      </motion.div>
      {seat === 'navigator' ? (
        <NavigatorQuestion question={turn} feedback={feedback} onAnswer={(v) => handle(v, 0)} onContinue={next} />
      ) : (
        <QuestionForm
          question={turn}
          feedback={feedback}
          disabled={locked}
          onAnswer={handle}
          onContinue={next}
          streak={0}
          mode={answerMode}
          typedCheck={typedCheck}
          touch={isTouchDevice}
        />
      )}
    </div>
  );
}

// ---------- the whole crew flight ----------

export function CrewFlight({ onBurst }: Props) {
  const pilots = useCrewProfiles();
  const turn = useCrewStore((s) => s.turn);
  const launching = useCrewStore((s) => s.launching);
  const summary = useCrewStore((s) => s.summary);
  const dock = useCrewStore((s) => s.dock);
  const finishDocking = useCrewStore((s) => s.finishDocking);
  const dismissLaunch = useCrewStore((s) => s.dismissLaunch);
  const land = useCrewStore((s) => s.land);

  const current = turn?.kind === 'docking' ? 'both' : turn ? turn.member : null;
  const showTurn = !launching && !summary;

  return (
    <>
      <CrewBar pilots={pilots} current={current} />
      {showTurn && turn?.kind === 'question' && (
        <QuestionTurn key={turn.askedAt} turn={turn} pilot={pilots[turn.member]} onBurst={onBurst} />
      )}
      {showTurn && turn?.kind === 'docking' && (
        <Docking key={turn.startedAt} turn={turn} pilots={pilots} onDock={dock} onFinish={finishDocking} onBurst={onBurst} />
      )}
      <AnimatePresence>
        {launching && !summary && <CrewLaunch key="launch" onContinue={dismissLaunch} onLand={land} />}
        {summary && <CrewSummary key="summary" pilots={pilots} />}
      </AnimatePresence>
    </>
  );
}
