import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { useMission, useProfiles } from '../profiles/useProfiles';
import { useCrewStore } from '../game/useCrewStore';
import { useSkyStore } from '../game/useSkyStore';
import { useSunStore } from '../game/useSunStore';
import { useBossStore } from '../game/useBossStore';
import { useGameStore } from '../game/useGameStore';
import { bossProgress, bossReady } from '../game/blackSun';
import { DEV_MODE } from '../dev/devMode';
import { useT } from '../i18n/useLang';
import { playTrack } from '../audio/useAudio';
import GradientText from './reactbits/GradientText';
import { BACKDROP_VARIANTS, flyOffTo, SHEET_VARIANTS, type SheetLeave } from './warpTransition';
import { useBack } from '../native/back';
import { usePageRequest } from './pages';
import { useCockpit } from './cockpit/cockpitStore';

/**
 * The Black Sun for the active pilot: it opens once every fact of their
 * mission is mastered (and stays open after that), and till they've looked
 * at it, it's new.
 */
function useBossAccess() {
  const mastery = useGameStore((s) => s.progress.mastery);
  const mission = useMission();
  const activeId = useProfiles((s) => s.activeId);
  const record = useBossStore((s) => s.record);
  useEffect(() => useBossStore.getState().refresh(), [activeId, mission]);
  const ready = bossReady(mastery, mission);
  useEffect(() => {
    if (ready && !record.unlocked) useBossStore.getState().unlock();
  }, [ready, record.unlocked]);
  const open = record.unlocked || ready;
  return { unlocked: open || DEV_MODE, isNew: open && !record.seen, wins: record.wins, ...bossProgress(mastery, mission) };
}

// The ways to play together, in their own top-bar button (separate from
// choosing who's flying): Crew Flight (two pilots on one device), Two phones
// (Split Sky, Eclipse Hunters) and Monster Sun (2-6 phones). Each starts with
// the active pilot. The two-phone games are a warp away (ModeWarp), the rocket
// blasting off first; Fly together hands over to the crew sheet, where its own
// launch does the same. Last comes the Black Sun, the final boss, played
// alone: it's locked (showing how close the pilot is) until they've mastered
// every fact, and the button has a dot while it's new to them.
export function GameModesButton() {
  const t = useT();
  const [open, setOpen] = useState(false);
  // how the sheet is leaving, for its exit animation
  const [leave, setLeave] = useState<SheetLeave>(null);
  const pilots = useProfiles((s) => s.profiles.length);
  // an addition pilot's two-phone game is Split Sky (Eclipse Hunters is about multiples)
  const mission = useMission();
  const boss = useBossAccess();
  const close = () => {
    setLeave(null);
    setOpen(false);
  };
  useBack(open && close);
  // (and from the cockpit's door)
  usePageRequest('modes', () => {
    setLeave(null);
    setOpen(true);
  });

  const modes = [
    {
      key: 'crew',
      icon: '👩‍🚀👨‍🚀',
      name: t.crew.flyTogether,
      hint: pilots >= 2 ? t.crew.flyTogetherHint : t.modes.needTwoPilots,
      disabled: pilots < 2,
      start: () => {
        setLeave('handoff');
        useCrewStore.getState().openSetup();
      },
    },
    {
      key: 'sky',
      icon: '📱📱',
      name: t.sky.card,
      hint: mission === 'add' ? t.sky.games.split.name : t.sky.cardHint,
      disabled: false,
      start: (card: Element) => {
        setLeave('warp');
        flyOffTo(() => useSkyStore.getState().openSky(), card);
      },
    },
    {
      key: 'sun',
      icon: '👾',
      name: t.sun.card,
      hint: t.sun.cardHint,
      disabled: false,
      start: (card: Element) => {
        setLeave('warp');
        // Monster Sun's soundtrack starts with the warp, from the tap (browsers only start music from one)
        playTrack('sun');
        flyOffTo(() => useSunStore.getState().openSun(), card);
      },
    },
    {
      key: 'boss',
      icon: <span className="boss-card-icon" />,
      name: t.boss.card,
      hint: !boss.unlocked ? t.boss.cardLocked(boss.have, boss.need) : boss.wins > 0 ? t.boss.cardCured(boss.wins) : boss.isNew ? t.boss.cardNew : t.boss.cardHint,
      disabled: !boss.unlocked,
      start: (card: Element) => {
        setLeave('warp');
        // its own soundtrack starts with the warp, from the tap
        playTrack('boss');
        flyOffTo(() => useBossStore.getState().openBoss(), card);
      },
    },
  ];

  return (
    <>
      <button
        type="button"
        className={`reset-button modes-button ${boss.isNew ? 'has-new' : ''}`}
        onClick={() => {
          setLeave(null);
          setOpen(true);
        }}
        title={t.modes.title}
        aria-label={t.modes.title}
      >
        <span className="modes-icon" aria-hidden>
          🎮
        </span>
        <span className="modes-label">{t.modes.button}</span>
      </button>
      {createPortal(
        <AnimatePresence custom={leave}>
          {open && (
            <motion.div
              className="settings-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              variants={BACKDROP_VARIANTS}
              custom={leave}
              exit="exit"
              onClick={close}
            >
              <motion.div
                className="settings-sheet profile-sheet modes-sheet"
                role="dialog"
                aria-modal="true"
                aria-label={t.modes.title}
                initial={{ y: 40, opacity: 0, scale: 0.96 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                variants={SHEET_VARIANTS}
                custom={leave}
                exit="exit"
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="pilot-picker">
                  <GradientText className="profile-hero" colors={['#6ad7ff', '#c9a4de', '#ffd77a', '#6ad7ff']} animationSpeed={4}>
                    🎮 {t.modes.title}
                  </GradientText>
                  <p className="modes-subtitle">{t.modes.subtitle}</p>
                  <div className="pilot-cards">
                    {modes.map((m, i) => (
                      <motion.button
                        key={m.key}
                        type="button"
                        className={`pilot-card pilot-card-new pilot-card-crew ${m.disabled ? 'is-disabled' : ''} ${m.key === 'boss' ? `pilot-card-boss ${boss.isNew ? 'is-new' : ''} ${boss.wins ? 'is-cured' : ''}` : ''}`}
                        disabled={m.disabled}
                        onClick={(e) => {
                          // (opened from the cockpit: off it goes from there)
                          useCockpit.getState().dismiss();
                          m.start(e.currentTarget);
                          setOpen(false);
                        }}
                        initial={{ opacity: 0, y: 12 }}
                        // a mode that can't start yet stays dimmed (the animation owns the opacity)
                        animate={{ opacity: m.disabled ? 0.45 : 1, y: 0 }}
                        transition={{ delay: 0.05 + i * 0.06 }}
                      >
                        <span className="pilot-card-avatar">{m.icon}</span>
                        {m.key === 'boss' && boss.isNew && <span className="badge-new boss-card-new">{t.badges.isNew}</span>}
                        <span className="pilot-card-name">{m.name}</span>
                        <span className="pilot-card-stats">{m.hint}</span>
                      </motion.button>
                    ))}
                  </div>
                </div>
                <button type="button" className="settings-close" onClick={close}>
                  {t.close}
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
