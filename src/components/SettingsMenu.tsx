import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { useSettings, type AnswerMode } from '../settings/useSettings';
import { useLang, useT } from '../i18n/useLang';

interface Props {
  onReset: () => void;
}

const MODES: AnswerMode[] = ['choice', 'type'];

// ⚙️ in the top bar: answer mode (typing vs multiple choice), language and
// resetting progress — kept out of the top bar itself so it fits on phones.
export function SettingsMenu({ onReset }: Props) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const toggleLang = useLang((s) => s.toggle);
  const answerMode = useSettings((s) => s.answerMode);
  const setAnswerMode = useSettings((s) => s.setAnswerMode);
  const [open, setOpen] = useState(false);

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
    </>
  );
}
