import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { pauseGame, resumeGame } from '../../game/gameClock';
import { useLang, useT } from '../../i18n/useLang';
import Dither from './Dither';

const GITHUB_URL = 'https://github.com/idanbenzvi';

// About the maker and the game, over a dithered-wave background. The game is
// paused while it's open (the clock resumes on close).
export function AboutPage({ onClose }: { onClose: () => void }) {
  const t = useT().about;
  const lang = useLang((s) => s.lang);

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
      <div className="about-bg" aria-hidden="true">
        <Dither
          waveColor={[0.45, 0.32, 0.95]}
          backgroundColor={[0.03, 0.02, 0.09]}
          waveSpeed={0.01}
          waveFrequency={3}
          waveAmplitude={0.3}
          colorNum={4}
          pixelSize={2}
          enableMouseInteraction
          mouseRadius={0.4}
        />
      </div>
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
        <h2 id="about-title">{t.hello}</h2>
        <p>{t.me}</p>
        <h3>{t.gameTitle}</h3>
        <p>{t.game1}</p>
        <p>{t.game2}</p>
        <a className="about-github" href={GITHUB_URL} target="_blank" rel="noreferrer">
          <svg viewBox="0 0 16 16" width="20" height="20" aria-hidden="true">
            <path
              fill="currentColor"
              d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
            />
          </svg>
          <span>{t.github}</span>
          <span className="about-github-handle" dir="ltr">github.com/idanbenzvi</span>
        </a>
      </motion.div>
    </motion.div>,
    document.body,
  );
}
