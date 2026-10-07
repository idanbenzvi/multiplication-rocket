import { useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { useT } from '../../i18n/useLang';
import { AboutPage } from './AboutPage';

// The little ⓘ at the end of the top bar.
export function AboutButton() {
  const t = useT().about;
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="about-button" onClick={() => setOpen(true)} aria-label={t.open} title={t.open}>
        i
      </button>
      <AnimatePresence>{open && <AboutPage onClose={() => setOpen(false)} />}</AnimatePresence>
    </>
  );
}
