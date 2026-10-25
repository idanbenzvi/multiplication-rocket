import { lazy, Suspense, useEffect, useState } from 'react';
import { currentTrack, playTrack } from '../../audio/useAudio';
import { usePause } from '../../game/gameClock';
import { ParentDashboard, ParentGate } from '../parents/ParentDashboard';
import { openPage } from '../pages';
import { useCockpit } from './store';

// The cockpit, wherever it was opened from (store.ts), and what opens over
// it: the parents' dialogs, and the top bar's own screens (About, the
// pilots), which it waits under. It's loaded the first time it's needed, and
// its picture fetched once the game has settled, so it's there when it is.

const load = () => import('./Cockpit360');
const Cockpit360 = lazy(() => load().then((m) => ({ default: m.Cockpit360 })));

/** after this long in the game, fetch the cockpit and its picture, ready */
const PRELOAD_AFTER_MS = 6000;

export function CockpitHost({ onReset }: { onReset: () => void }) {
  const phase = useCockpit((s) => s.phase);
  const from = useCockpit((s) => s.from);
  const [parents, setParents] = useState<'gate' | 'dashboard' | null>(null);
  // the top bar's screens, open over it
  const over = usePause((s) => s.why.some((r) => r === 'about' || r === 'how' || r === 'bay'));

  useEffect(() => {
    const id = window.setTimeout(() => {
      load()
        .then(() => import('./preload'))
        .then((m) => m.preloadCockpit())
        .catch(() => {});
    }, PRELOAD_AFTER_MS);
    return () => window.clearTimeout(id);
  }, []);
  // (gone with the cockpit still open: its music goes too)
  useEffect(
    () => () => {
      if (currentTrack() === 'cockpit') playTrack(useCockpit.getState().before);
    },
    [],
  );
  // (the parents' dialogs belong to this visit)
  useEffect(() => {
    if (phase === 'closed') setParents(null);
  }, [phase]);

  if (phase === 'closed') return null;
  return (
    <>
      <Suspense fallback={null}>
        <Cockpit360
          leaving={phase === 'leaving'}
          from={from}
          covered={parents !== null || over}
          onClose={useCockpit.getState().close}
          onGone={useCockpit.getState().gone}
          onParents={() => setParents('gate')}
          onReset={onReset}
          onAbout={() => openPage('about')}
          onPilot={(edit) => openPage(edit ? 'editPilot' : 'pilots')}
        />
      </Suspense>
      {parents === 'gate' && <ParentGate onPass={() => setParents('dashboard')} onCancel={() => setParents(null)} />}
      {parents === 'dashboard' && <ParentDashboard onClose={() => setParents(null)} />}
    </>
  );
}
