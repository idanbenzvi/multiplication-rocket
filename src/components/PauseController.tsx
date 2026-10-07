import { useEffect } from 'react';
import { pauseGame, resumeGame, usePause } from '../game/gameClock';
import { pauseMusic, resumeMusic } from '../audio/useAudio';
import { resumeSfx, suspendSfx } from '../audio/sfx';
import { useT } from '../i18n/useLang';

// Leaving the game — another tab, another app, minimizing, locking the
// tablet — pauses it: the game clock stops (timers, answer speed, bonus
// rounds), the 3D scene stops rendering, and the music and sounds go quiet.
// Coming back shows a paused screen; a tap or key press carries on exactly
// where it left off.
export function PauseController() {
  const t = useT();
  const paused = usePause((s) => s.paused);

  useEffect(() => {
    const pause = () => {
      pauseGame();
      pauseMusic();
      suspendSfx();
    };
    const onVisibility = () => document.visibilityState === 'hidden' && pause();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', pause);
    window.addEventListener('pagehide', pause);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', pause);
      window.removeEventListener('pagehide', pause);
    };
  }, []);

  useEffect(() => {
    if (!paused) return;
    const resume = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      resumeGame();
      resumeSfx();
      resumeMusic();
    };
    // capture phase, so the resuming tap/key doesn't also answer a question
    window.addEventListener('pointerdown', resume, true);
    window.addEventListener('keydown', resume, true);
    return () => {
      window.removeEventListener('pointerdown', resume, true);
      window.removeEventListener('keydown', resume, true);
    };
  }, [paused]);

  if (!paused) return null;
  return (
    <div className="pause-overlay" role="dialog" aria-label={t.pausedTitle}>
      <div className="pause-card">
        <div className="pause-icon">⏸</div>
        <div className="pause-title">{t.pausedTitle}</div>
        <div className="pause-hint">{t.pausedHint}</div>
      </div>
    </div>
  );
}
