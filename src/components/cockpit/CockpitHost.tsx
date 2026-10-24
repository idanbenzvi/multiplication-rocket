import { useEffect, useState } from 'react';
import { currentTrack, playTrack } from '../../audio/useAudio';
import { ParentDashboard, ParentGate } from '../parents/ParentDashboard';
import { Cockpit } from './Cockpit';
import { useCockpit } from './cockpitStore';

// The cockpit, wherever it was opened from (cockpitStore.ts), and the
// parents' dialogs over it.
export function CockpitHost({ onReset }: { onReset: () => void }) {
  const phase = useCockpit((s) => s.phase);
  const from = useCockpit((s) => s.from);
  const [parents, setParents] = useState<'gate' | 'dashboard' | null>(null);
  // (gone with the cockpit still open: its music goes too)
  useEffect(
    () => () => {
      if (currentTrack() === 'cockpit') playTrack(useCockpit.getState().before);
    },
    [],
  );
  if (phase === 'closed') return null;
  return (
    <>
      <Cockpit
        leaving={phase === 'leaving'}
        from={from}
        covered={parents !== null}
        onClose={useCockpit.getState().close}
        onGone={useCockpit.getState().gone}
        onParents={() => setParents('gate')}
        onReset={onReset}
      />
      {parents === 'gate' && <ParentGate onPass={() => setParents('dashboard')} onCancel={() => setParents(null)} />}
      {parents === 'dashboard' && <ParentDashboard onClose={() => setParents(null)} />}
    </>
  );
}
