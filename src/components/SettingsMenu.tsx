import { useRef, useState } from 'react';
import { useT } from '../i18n/useLang';
import { ParentDashboard, ParentGate } from './parents/ParentDashboard';
import { Cockpit } from './cockpit/Cockpit';

interface Props {
  onReset: () => void;
}

// ⚙️ in the top bar: into the rocket's cockpit, where the settings are
// levers, knobs and switches (answer mode, check, sound, language, the
// parents' dashboard and resetting progress).
export function SettingsMenu({ onReset }: Props) {
  const t = useT();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [cockpit, setCockpit] = useState<'closed' | 'open' | 'leaving'>('closed');
  const [parents, setParents] = useState<'gate' | 'dashboard' | null>(null);
  const close = () => setCockpit((c) => (c === 'open' ? 'leaving' : c));

  return (
    <>
      <button
        ref={buttonRef}
        className="reset-button settings-button"
        onClick={() => setCockpit((c) => (c === 'closed' ? 'open' : c))}
        aria-label={t.settings}
        title={t.settings}
      >
        ⚙️
      </button>
      {cockpit !== 'closed' && (
        <Cockpit
          leaving={cockpit === 'leaving'}
          from={buttonRef.current}
          covered={parents !== null}
          onClose={close}
          onGone={() => {
            setCockpit('closed');
            buttonRef.current?.focus({ preventScroll: true });
          }}
          onParents={() => setParents('gate')}
          onReset={onReset}
        />
      )}
      {parents === 'gate' && <ParentGate onPass={() => setParents('dashboard')} onCancel={() => setParents(null)} />}
      {parents === 'dashboard' && <ParentDashboard onClose={() => setParents(null)} />}
    </>
  );
}
