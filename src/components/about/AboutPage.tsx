import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { pauseGame, resumeGame } from '../../game/gameClock';
import { useLang, useT } from '../../i18n/useLang';
import { CycleScene } from './CycleScene';
import { IN_APP } from '../../storage/backup';

const CONTACT_EMAIL = 'falcondeergames@gmail.com';
import { useBack } from '../../native/back';

// About the maker and the game, over a colour-cycling pixel-art canyon
// (CycleScene). The game is paused while it's open (the clock resumes on close).
// `onHow`: "How does the game work?" (how/HowItWorks.tsx), for curious kids.
export function AboutPage({ onClose, onHow }: { onClose: () => void; onHow: () => void }) {
  const all = useT();
  const t = all.about;
  const lang = useLang((s) => s.lang);

  useBack(onClose);

  useEffect(() => {
    pauseGame('about');
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      resumeGame('about');
    };
  }, [onClose]);

  return createPortal(
    <motion.div className="about-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <CycleScene className="about-bg" />
      <motion.div
        className="about-card"
        dir={lang === 'he' ? 'rtl' : 'ltr'}
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-title"
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.1 }}
      >
        <button className="about-close" onClick={onClose} aria-label={t.close}>
          ✕
        </button>
        {/* the studio's emblem: the winged deer galloping through the air (standing still for reduced motion) */}
        <picture>
          <source srcSet="./studio-deer-still.webp" media="(prefers-reduced-motion: reduce)" />
          <img className="about-studio-logo" src="./studio-deer.webp" alt={t.studioAlt} width={240} height={240} />
        </picture>
        <h2 id="about-title">{t.hello}</h2>
        <p>{t.me}</p>
        <p>
          {t.loomBefore}
          {/* (no link out of the Android app: a child's tap stays in the game) */}
          {IN_APP ? (
            <bdi dir="ltr">Loom</bdi>
          ) : (
            <a className="about-inline-link" href={t.loomUrl} target="_blank" rel="noreferrer" dir="ltr">
              Loom
            </a>
          )}
          {t.loomAfter}
        </p>
        <h3>{t.gameTitle}</h3>
        <p>{t.game1}</p>
        <p>{IN_APP ? t.game2App : t.game2}</p>
        <button type="button" className="about-how" onClick={onHow}>
          {all.how.open}
        </button>
        <div className="about-closing">
          <p>{t.closing}</p>
          <p>{t.thanks}</p>
        </div>
        {/* (in the Android app it's plain text, to copy: a child's tap doesn't leave the game for the mail app) */}
        <p className="about-contact">
          {t.contact}{' '}
          {IN_APP ? (
            <bdi dir="ltr" className="about-email">{CONTACT_EMAIL}</bdi>
          ) : (
            <a className="about-inline-link about-email" href={`mailto:${CONTACT_EMAIL}`} dir="ltr">
              {CONTACT_EMAIL}
            </a>
          )}
        </p>
      </motion.div>
    </motion.div>,
    document.body,
  );
}
