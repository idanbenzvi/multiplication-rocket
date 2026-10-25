import { useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { useT } from '../i18n/useLang';
import GradientText from './reactbits/GradientText';
import { BACKDROP_VARIANTS, SHEET_VARIANTS, type SheetLeave } from './warpTransition';
import { useGameModes } from './useGameModes';
import { useBack } from '../native/back';

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
  const { modes, boss } = useGameModes();
  const close = () => {
    setLeave(null);
    setOpen(false);
  };
  useBack(open && close);

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
                          setLeave(m.leave);
                          m.run(e.currentTarget);
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
