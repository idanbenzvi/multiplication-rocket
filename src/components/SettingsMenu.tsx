import { useRef } from 'react';
import { useT } from '../i18n/useLang';
import { useAchievements } from '../game/useAchievements';
import { isTouchDevice } from '../settings/useSettings';
import { useCockpit } from './cockpit360/store';

// ⚙️ in the top bar: into the rocket's cockpit (components/cockpit360), where
// everything else is: the game modes, the practice map, the badges, the
// pilot, the sound and every setting, each on a screen of its own. On a
// phone or a tablet it's all the top bar has besides the pilot.
export function SettingsMenu() {
  const t = useT();
  const buttonRef = useRef<HTMLButtonElement>(null);
  // (where the badges button isn't, a dot here for a new one, to see on its screen in the cockpit)
  const hasNew = useAchievements((s) => s.unseen.length > 0) && isTouchDevice;
  return (
    <button
      ref={buttonRef}
      className={`reset-button settings-button ${hasNew ? 'has-new' : ''}`}
      // (from the tap itself, so the browser lets the cockpit's music start)
      onClick={() => useCockpit.getState().open(buttonRef.current)}
      aria-label={t.settings}
      title={t.settings}
    >
      ⚙️
    </button>
  );
}
