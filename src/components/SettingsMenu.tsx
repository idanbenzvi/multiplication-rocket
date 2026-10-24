import { useEffect, useRef, useState } from 'react';
import { useT } from '../i18n/useLang';
import { currentTrack, playTrack, type Track } from '../audio/useAudio';
import { ParentDashboard, ParentGate } from './parents/ParentDashboard';
import { Cockpit } from './cockpit/Cockpit';

interface Props {
  onReset: () => void;
}

// ⚙️ in the top bar: into the rocket's cockpit, where the settings are
// levers, knobs and switches (answer mode, check, sound, language, the
// parents' dashboard and resetting progress). The cockpit has its own music
// (Starboard View); leaving it goes back to whatever was playing.
export function SettingsMenu({ onReset }: Props) {
  const t = useT();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [cockpit, setCockpit] = useState<'closed' | 'open' | 'leaving'>('closed');
  const [parents, setParents] = useState<'gate' | 'dashboard' | null>(null);
  const before = useRef<Track>('theme');
  const close = () => {
    // (unless something else has changed the music meanwhile: a crew flight ending…)
    if (cockpit === 'open' && currentTrack() === 'cockpit') playTrack(before.current);
    setCockpit((c) => (c === 'open' ? 'leaving' : c));
  };
  // (gone with the cockpit still open: its music goes too)
  useEffect(
    () => () => {
      if (currentTrack() === 'cockpit') playTrack(before.current);
    },
    [],
  );

  return (
    <>
      <button
        ref={buttonRef}
        className="reset-button settings-button"
        onClick={() => {
          if (cockpit !== 'closed') return;
          // (from the tap itself, so the browser lets the music start)
          before.current = currentTrack();
          playTrack('cockpit');
          setCockpit('open');
        }}
        aria-label={t.settings}
        title={t.settings}
      >
        ⚙️
        <span className="hud-label">{t.settings}</span>
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
