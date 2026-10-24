import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useT } from '../i18n/useLang';
import { useGameStore } from '../game/useGameStore';
import { useAchievements } from '../game/useAchievements';
import { useProfiles } from '../profiles/useProfiles';
import { sfx } from '../audio/sfx';

// A phone held upright (see useMenuDrawer.ts): the pilot's badge is all
// there is of the top bar's buttons, with their right answers on it, and a
// dot when there's a new badge to see. Tapping it opens the station with the
// rest. In it, the grown-ups' things (the sound, the settings, About) open
// with a long press on their lock, a countdown of clicks, which children
// mostly don't keep up; it locks again each time the station is put away.

export function StationButton({ open, crew, onToggle }: { open: boolean; crew: boolean; onToggle: () => void }) {
  const t = useT().station;
  const avatar = useProfiles((s) => s.profiles.find((p) => p.id === s.activeId)?.avatar);
  const correct = useGameStore((s) => s.progress.totalCorrectAnswers);
  const hasNew = useAchievements((s) => s.unseen.length > 0);
  return (
    <button
      type="button"
      className={`station-button ${open ? 'is-open' : ''} ${hasNew && !open ? 'has-new' : ''}`}
      onClick={onToggle}
      aria-label={open ? t.close : t.open}
      aria-expanded={open}
    >
      <span className="station-button-face" aria-hidden>
        {open ? '✕' : crew ? '🚀' : (avatar ?? '🙂')}
      </span>
      {!crew && !open && (
        <span className="station-button-count" aria-hidden>
          ✓ {correct}
        </span>
      )}
    </button>
  );
}

/** how long the lock is held to open, and the clicks counting it down */
const HOLD_MS = 1200;
const TICKS = 3;

/** the grown-ups' lock; the things after it in the top bar are locked until it's held (App.css) */
export function StationLock() {
  const t = useT().station;
  const [state, setState] = useState<'locked' | 'holding' | 'open'>('locked');
  const timers = useRef<number[]>([]);
  const clear = () => {
    timers.current.forEach(window.clearTimeout);
    timers.current = [];
  };
  useEffect(() => clear, []);

  const start = () => {
    if (state !== 'locked') return;
    setState('holding');
    timers.current = [
      ...Array.from({ length: TICKS }, (_, i) => window.setTimeout(() => sfx.knob(), ((i + 1) * HOLD_MS) / (TICKS + 1))),
      window.setTimeout(() => {
        setState('open');
        sfx.clunk(true);
      }, HOLD_MS),
    ];
  };
  const stop = () => {
    if (state !== 'holding') return;
    clear();
    setState('locked');
  };
  const isKey = (e: KeyboardEvent) => e.key === 'Enter' || e.key === ' ';

  return (
    <button
      type="button"
      className={`station-lock is-${state}`}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if (!isKey(e)) return;
        e.preventDefault();
        if (!e.repeat) start();
      }}
      onKeyUp={(e) => isKey(e) && stop()}
      aria-label={state === 'open' ? t.grownUps : `${t.grownUps}: ${t.hold}`}
    >
      <span className="station-lock-fill" aria-hidden />
      <span className="station-lock-icon" aria-hidden>
        {state === 'open' ? '🔓' : '🔒'}
      </span>
      <span className="station-lock-label">{t.grownUps}</span>
      {state !== 'open' && <span className="station-lock-hint">{t.hold}</span>}
    </button>
  );
}
