import { useRef } from 'react';
import { useT } from '../i18n/useLang';
import { useCockpit } from './cockpit/cockpitStore';

// ⚙️ in the top bar: into the rocket's cockpit (CockpitHost), where the
// settings are levers, knobs and switches, and from where the rest of the
// game's screens are a turn of the head away.
export function SettingsMenu() {
  const t = useT();
  const buttonRef = useRef<HTMLButtonElement>(null);
  return (
    <button
      ref={buttonRef}
      className="reset-button settings-button"
      onClick={() => useCockpit.getState().open(buttonRef.current)}
      aria-label={t.settings}
      title={t.settings}
    >
      ⚙️
      <span className="hud-label">{t.settings}</span>
    </button>
  );
}
