import { lazy, Suspense, useRef, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { useT } from '../../i18n/useLang';
import { currentTrack, playTrack, type Track } from '../../audio/useAudio';
import { AboutPage } from './AboutPage';
import { usePageRequest } from '../pages';

// (loaded the first time it's opened)
const HowItWorks = lazy(() => import('../how/HowItWorks').then((m) => ({ default: m.HowItWorks })));

// The little ⓘ at the end of the top bar. The About page has its own music
// (Velvet Horizon), playing on through "How does the game work?" from it;
// closing them goes back to whatever was playing.
export function AboutButton() {
  const t = useT().about;
  const [open, setOpen] = useState<'about' | 'how' | null>(null);
  const before = useRef<Track>('theme');
  const close = () => {
    playTrack(before.current);
    setOpen(null);
  };
  const show = () => {
    // (from the tap itself, so the browser lets the music start)
    before.current = currentTrack();
    playTrack('about');
    setOpen('about');
  };
  // (the cockpit's panel overhead opens it too)
  usePageRequest('about', show);
  return (
    <>
      <button
        className="about-button"
        onClick={show}
        aria-label={t.open}
        title={t.open}
      >
        i
      </button>
      <AnimatePresence>
        {open === 'about' && <AboutPage key="about" onClose={close} onHow={() => setOpen('how')} />}
      </AnimatePresence>
      <Suspense fallback={null}>
        <AnimatePresence>{open === 'how' && <HowItWorks key="how" onClose={() => setOpen('about')} onDone={close} />}</AnimatePresence>
      </Suspense>
    </>
  );
}
