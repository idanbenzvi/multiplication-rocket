import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { isTouchDevice, useSettings, type AnswerMode, type TypedCheck } from '../settings/useSettings';
import { useLang, useT } from '../i18n/useLang';
import { canVibrate, haptics } from '../audio/haptics';
import { ParentDashboard, ParentGate } from './parents/ParentDashboard';

interface Props {
  onReset: () => void;
}

const MODES: AnswerMode[] = ['choice', 'type'];
const CHECKS: TypedCheck[] = ['auto', 'confirm'];

// ⚙️ in the top bar: answer mode (typing vs multiple choice), language and
// resetting progress — kept out of the top bar itself so it fits on phones.
export function SettingsMenu({ onReset }: Props) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const toggleLang = useLang((s) => s.toggle);
  const answerMode = useSettings((s) => s.answerMode);
  const setAnswerMode = useSettings((s) => s.setAnswerMode);
  const typedCheck = useSettings((s) => s.typedCheck);
  const setTypedCheck = useSettings((s) => s.setTypedCheck);
  const mistakeReview = useSettings((s) => s.mistakeReview);
  const setMistakeReview = useSettings((s) => s.setMistakeReview);
  const vibration = useSettings((s) => s.vibration);
  const setVibration = useSettings((s) => s.setVibration);
  const checkName = (c: TypedCheck) =>
    c === 'auto' ? t.typedCheckAuto : isTouchDevice ? t.typedCheckConfirmTouch : t.typedCheckConfirmKeys;
  const checkHint = (c: TypedCheck) =>
    c === 'auto' ? t.typedCheckAutoHint : isTouchDevice ? t.typedCheckConfirmTouchHint : t.typedCheckConfirmKeysHint;
  const [open, setOpen] = useState(false);
  const [parents, setParents] = useState<'gate' | 'dashboard' | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button className="reset-button settings-button" onClick={() => setOpen(true)} aria-label={t.settings} title={t.settings}>
        ⚙️
      </button>
      {/* Portaled to <body>: the top bar uses backdrop-filter, which makes it
          the containing block for position:fixed children, so a modal
          rendered inside it would be confined to the 100px-tall bar. */}
      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              className="settings-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
            >
              <motion.div
                className="settings-sheet"
                role="dialog"
                aria-modal="true"
                aria-label={t.settings}
                initial={{ y: 40, opacity: 0, scale: 0.96 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                exit={{ y: 40, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                onClick={(e) => e.stopPropagation()}
              >
                <h2 className="settings-title">⚙️ {t.settings}</h2>

                <section className="settings-section">
                  <div className="settings-label">{t.answerBy}</div>
                  <div className="settings-segment" role="radiogroup" aria-label={t.answerBy}>
                    {MODES.map((m) => (
                      <button
                        key={m}
                        role="radio"
                        aria-checked={answerMode === m}
                        className={`settings-option ${answerMode === m ? 'is-on' : ''}`}
                        onClick={() => setAnswerMode(m)}
                      >
                        <span className="settings-option-name">{m === 'type' ? t.modeType : t.modeChoice}</span>
                        <span className="settings-option-hint">{m === 'type' ? t.modeTypeHint : t.modeChoiceHint}</span>
                      </button>
                    ))}
                  </div>
                </section>

                {/* Touch devices only: on a computer, typed answers always wait for Enter. */}
                {answerMode === 'type' && isTouchDevice && (
                  <section className="settings-section">
                    <div className="settings-label">{t.typedCheckLabel}</div>
                    <div className="settings-segment" role="radiogroup" aria-label={t.typedCheckLabel}>
                      {CHECKS.map((c) => (
                        <button
                          key={c}
                          role="radio"
                          aria-checked={typedCheck === c}
                          className={`settings-option ${typedCheck === c ? 'is-on' : ''}`}
                          onClick={() => setTypedCheck(c)}
                        >
                          <span className="settings-option-name">{checkName(c)}</span>
                          <span className="settings-option-hint">{checkHint(c)}</span>
                        </button>
                      ))}
                    </div>
                  </section>
                )}

                {/* Only where the device can actually vibrate (not iPhone/iPad). */}
                {canVibrate && (
                  <section className="settings-section">
                    <div className="settings-label">{t.vibrationLabel}</div>
                    <button
                      role="switch"
                      aria-checked={vibration}
                      className={`settings-option settings-toggle ${vibration ? 'is-on' : ''}`}
                      onClick={() => {
                        setVibration(!vibration);
                        if (!vibration) haptics.correct(); // preview when switching on
                      }}
                    >
                      <span className="settings-option-name">{vibration ? t.on : t.off}</span>
                      <span className="settings-option-hint">{t.vibrationHint}</span>
                    </button>
                  </section>
                )}

                <section className="settings-section">
                  <div className="settings-label">{t.mistakeReviewLabel}</div>
                  <button
                    role="switch"
                    aria-checked={mistakeReview}
                    className={`settings-option settings-toggle ${mistakeReview ? 'is-on' : ''}`}
                    onClick={() => setMistakeReview(!mistakeReview)}
                  >
                    <span className="settings-option-name">{mistakeReview ? t.on : t.off}</span>
                    <span className="settings-option-hint">{t.mistakeReviewHint}</span>
                  </button>
                </section>

                <section className="settings-section">
                  <div className="settings-label">{t.language}</div>
                  <div className="settings-segment settings-segment-row">
                    {(['he', 'en'] as const).map((l) => (
                      <button
                        key={l}
                        className={`settings-option settings-option-small ${lang === l ? 'is-on' : ''}`}
                        onClick={() => lang !== l && toggleLang()}
                        aria-pressed={lang === l}
                      >
                        {l === 'he' ? 'עברית' : 'English'}
                      </button>
                    ))}
                  </div>
                </section>

                <section className="settings-section">
                  <button
                    type="button"
                    className="settings-option settings-toggle"
                    onClick={() => {
                      setOpen(false);
                      setParents('gate');
                    }}
                  >
                    <span className="settings-option-name">{t.parents.open}</span>
                  </button>
                </section>

                <section className="settings-section">
                  <div className="settings-label">{t.progressSection}</div>
                  <button
                    className="settings-danger"
                    onClick={() => {
                      setOpen(false);
                      onReset();
                    }}
                  >
                    {t.reset}
                  </button>
                </section>

                <button className="settings-close" onClick={() => setOpen(false)}>
                  {t.close}
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
      document.body,
      )}
      {parents === 'gate' && <ParentGate onPass={() => setParents('dashboard')} onCancel={() => setParents(null)} />}
      {parents === 'dashboard' && <ParentDashboard onClose={() => setParents(null)} />}
    </>
  );
}
