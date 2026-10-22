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
  // only leaving the game shows this screen (the Academy pauses silently), and
  // not over a screen of its own (the cockpit, the parents' dashboard, a mode)
  const paused = usePause((s) => s.away);
  const held = usePause((s) => s.held);

  useEffect(() => {
    const pause = () => {
      pauseGame('away');
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
    const carryOn = () => {
      resumeGame('away');
      resumeSfx();
      resumeMusic();
    };
    const resume = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      carryOn();
    };
    // Back from a moment away while a screen of its own was open (a parent
    // sharing a backup or picking one from the dashboard, a peek at another
    // app from the cockpit): no card to tap through, it simply carries on.
    const returned = () => {
      if (document.visibilityState !== 'hidden' && usePause.getState().held) carryOn();
    };
    // capture phase, so the resuming tap/key doesn't also answer a question
    window.addEventListener('pointerdown', resume, true);
    window.addEventListener('keydown', resume, true);
    document.addEventListener('visibilitychange', returned);
    window.addEventListener('focus', returned);
    window.addEventListener('pageshow', returned);
    return () => {
      window.removeEventListener('pointerdown', resume, true);
      window.removeEventListener('keydown', resume, true);
      document.removeEventListener('visibilitychange', returned);
      window.removeEventListener('focus', returned);
      window.removeEventListener('pageshow', returned);
    };
  }, [paused]);

  if (!paused || held) return null;
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
