import { useCallback, useLayoutEffect, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { CycleScene } from '../about/CycleScene';
import { useSplash } from '../splash/useSplash';
import { currentTrack, playTrack } from '../../audio/useAudio';
import { pauseGame, resumeGame } from '../../game/gameClock';
import { useLang } from '../../i18n/useLang';
import { BAY, SIGN, bayLayout, type BayLayout } from './layout';
import { bayMusic, topHolder, useBay } from './useBay';
import { PadShip } from './PadShip';
import { PadSmoke } from './PadSmoke';
import './bay.css';

// The launch bay (docs/plans/2026-10-22-launch-bay.md): the hangar where
// pilots are chosen and made, and ships chosen and launched, drawn from the
// pixel-art picture brought in for it and brought to life by colour cycling
// as the About page's canyon is (the steam billowing, the lasers flowing,
// the lightning crackling, glitter falling through the lamp's beam, the
// stars and the galaxy beyond the bay doors, the lamps and the screens). Its
// sign reads what's being chosen, the pad's jets billow smoke, and the ship
// stands on the pad (PadShip). It plays Apex Ascent, and the game waits
// while it's open. Screens show in it with BayScreen.

export function LaunchBay() {
  const open = useBay((s) => s.holders.length > 0);
  // the bay's soundtrack, and back to what was playing (changed with the tap that opens or closes it)
  useLayoutEffect(() => {
    if (!open) return;
    if (currentTrack() !== 'bay') bayMusic.before = currentTrack();
    playTrack('bay');
    pauseGame('bay');
    return () => {
      if (currentTrack() === 'bay') playTrack(bayMusic.before);
      resumeGame('bay');
    };
  }, [open]);
  return createPortal(<AnimatePresence>{open && <BayView key="bay" />}</AnimatePresence>, document.body);
}

function BayView() {
  const [layout, setLayout] = useState<BayLayout>(() => bayLayout(window.innerWidth, window.innerHeight));
  useLayoutEffect(() => {
    const measure = () => {
      const next = bayLayout(window.innerWidth, window.innerHeight);
      setLayout(next);
      useBay.setState({ layout: next });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('resize', measure);
      useBay.setState({ layout: null });
    };
  }, []);
  const [calm] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  // (under the studio's opening, the bay waits to come alive till it's leaving)
  const splash = useSplash((s) => s.showing);
  const top = useBay(topHolder);
  const launch = useBay((s) => s.launch);
  // (once: a new callback each render would hand the screens a new slot each time, and they'd start over)
  const slot = useCallback((el: HTMLDivElement | null) => {
    useBay.setState({ slot: el });
  }, []);
  const { u } = layout;
  const stage = { left: layout.left, top: layout.top, width: BAY.width * u, height: BAY.height * u, '--u': `${u}px` } as CSSProperties;

  return (
    <motion.div
      className={`bay ${launch ? 'is-launching' : ''}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="bay-stage" style={stage}>
        {!splash && <CycleScene src="./bay/hangar.json" className="bay-picture" />}
        <BaySign text={top?.sign ?? ''} layout={layout} />
        {!splash && <PadShip spec={top?.ship ?? null} launch={launch} layout={layout} calm={calm} />}
        {!splash && !calm && <PadSmoke u={u} />}
      </div>
      <div className="bay-slot" ref={slot} />
    </motion.div>
  );
}

/** the sign over the pad, its words lit on its panel as the picture's were, in the visible part of it */
function BaySign({ text, layout }: { text: string; layout: BayLayout }) {
  const lang = useLang((s) => s.lang);
  const { u } = layout;
  const x0 = Math.max(SIGN.x0, -layout.left / u + 4);
  const x1 = Math.min(SIGN.x1, (layout.vw - layout.left) / u - 4);
  if (x1 - x0 < 40) return null;
  const width = (x1 - x0) * u;
  const size = Math.min(15 * u, (width * 0.94) / Math.max(1, text.length * 0.78));
  return (
    <div
      className="bay-sign"
      style={{
        left: x0 * u,
        top: (SIGN.top + SIGN.slope * (x0 - SIGN.x0)) * u,
        width,
        height: SIGN.height * u,
        fontSize: size,
        transform: `skewY(${Math.atan(SIGN.slope)}rad)`,
      }}
      dir={lang === 'he' ? 'rtl' : 'ltr'}
      aria-live="polite"
    >
      <AnimatePresence mode="wait">
        <motion.span
          key={text}
          className="bay-sign-text"
          initial={{ opacity: 0, x: (lang === 'he' ? -1 : 1) * 10 * u, filter: 'brightness(3)' }}
          animate={{ opacity: 1, x: 0, filter: 'brightness(1)' }}
          exit={{ opacity: 0, x: (lang === 'he' ? 1 : -1) * 10 * u }}
          transition={{ duration: 0.28, ease: 'easeOut' }}
        >
          {text}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}
