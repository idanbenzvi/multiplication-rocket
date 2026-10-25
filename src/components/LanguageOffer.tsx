import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useLang } from '../i18n/useLang';
import { useSplash } from './splash/useSplash';
import { sfx } from '../audio/sfx';

// When the game has guessed Hebrew (useLang.ts: the device reads it, or it's
// in Israel) and nobody has chosen, a little note as it opens, in English,
// for whoever would rather have that: a tap switches, and it's kept, as the
// cockpit's language switch keeps it. ✕ keeps Hebrew, and it isn't offered
// again; left alone it goes after a while, and is back the next time the game
// opens, a few times at most.

const OFFER_KEY = 'multiplication-rocket:lang-offer';
/** how many openings it's offered on, unanswered */
const TIMES = 3;
const SHOW_MS = 12000;

/** how many times it's been offered ('done': answered) */
function readOffers(): number | 'done' {
  try {
    const v = localStorage.getItem(OFFER_KEY);
    return v === 'done' ? 'done' : Number(v) || 0;
  } catch {
    return 0;
  }
}

function writeOffers(v: number | 'done') {
  try {
    localStorage.setItem(OFFER_KEY, String(v));
  } catch {
    // (offered again next time)
  }
}

export function LanguageOffer() {
  const splash = useSplash((s) => s.showing);
  const lang = useLang((s) => s.lang);
  const chosen = useLang((s) => s.chosen);
  const toggle = useLang((s) => s.toggle);
  // (whether it's offered this time, as the game opens)
  const [offer] = useState(() => {
    const { lang, chosen } = useLang.getState();
    const offers = readOffers();
    return lang === 'he' && !chosen && offers !== 'done' && offers < TIMES;
  });
  const [open, setOpen] = useState(false);

  // a moment after the studio's opening has gone
  useEffect(() => {
    if (!offer || splash) return;
    const show = window.setTimeout(() => {
      const offers = readOffers();
      if (offers !== 'done') writeOffers(offers + 1);
      setOpen(true);
    }, 700);
    const hide = window.setTimeout(() => setOpen(false), 700 + SHOW_MS);
    return () => {
      window.clearTimeout(show);
      window.clearTimeout(hide);
    };
  }, [offer, splash]);

  const toEnglish = () => {
    writeOffers('done');
    setOpen(false);
    sfx.blip(6);
    toggle();
  };
  const keepHebrew = () => {
    writeOffers('done');
    setOpen(false);
  };

  return (
    <AnimatePresence>
      {open && lang === 'he' && !chosen && (
        <motion.div
          className="lang-offer"
          dir="ltr"
          lang="en"
          initial={{ opacity: 0, y: -14, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.96 }}
          transition={{ type: 'spring', stiffness: 340, damping: 26 }}
        >
          <button type="button" className="lang-offer-switch" onClick={toEnglish}>
            <span aria-hidden="true">🌐</span> Switch to English
          </button>
          <button type="button" className="lang-offer-close" onClick={keepHebrew} aria-label="Keep Hebrew" title="Keep Hebrew">
            ✕
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
