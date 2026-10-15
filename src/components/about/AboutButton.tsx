import { useRef, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { useT } from '../../i18n/useLang';
import { currentTrack, playTrack, type Track } from '../../audio/useAudio';
import { AboutPage } from './AboutPage';

// The little ⓘ at the end of the top bar. The About page has its own music
// (Velvet Horizon); closing it goes back to whatever was playing.
export function AboutButton() {
  const t = useT().about;
  const [open, setOpen] = useState(false);
  const before = useRef<Track>('theme');
  return (
    <>
      <button
        className="about-button"
        onClick={() => {
          // (from the tap itself, so the browser lets the music start)
          before.current = currentTrack();
          playTrack('about');
          setOpen(true);
        }}
        aria-label={t.open}
        title={t.open}
      >
        i
      </button>
      <AnimatePresence>
        {open && (
          <AboutPage
            onClose={() => {
              playTrack(before.current);
              setOpen(false);
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}
