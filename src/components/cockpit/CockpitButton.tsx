import { useRef } from 'react';
import { useT } from '../../i18n/useLang';
import { useGameStore } from '../../game/useGameStore';
import { useAchievements } from '../../game/useAchievements';
import { useProfiles } from '../../profiles/useProfiles';
import { useCockpit } from './cockpitStore';

// A phone held upright (useMenuDrawer.ts): all there is of the top bar's
// buttons is the pilot's badge, their animal with their right answers under
// it (and a dot when there's a new badge to see). It flies them into their
// rocket's cockpit, as a tap on the rocket's window does, where all the rest is.
export function CockpitButton({ crew }: { crew: boolean }) {
  const t = useT().cockpit;
  const ref = useRef<HTMLButtonElement>(null);
  const avatar = useProfiles((s) => s.profiles.find((p) => p.id === s.activeId)?.avatar);
  const correct = useGameStore((s) => s.progress.totalCorrectAnswers);
  const hasNew = useAchievements((s) => s.unseen.length > 0);
  return (
    <button
      ref={ref}
      type="button"
      className={`cockpit-button ${hasNew ? 'has-new' : ''}`}
      onClick={() => useCockpit.getState().open(ref.current)}
      aria-label={t.enter}
      title={t.enter}
    >
      <span className="cockpit-button-face" aria-hidden>
        {crew ? '🚀' : (avatar ?? '🙂')}
      </span>
      {!crew && (
        <span className="cockpit-button-count" aria-hidden>
          ✓ {correct}
        </span>
      )}
    </button>
  );
}
