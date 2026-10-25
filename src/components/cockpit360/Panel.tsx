import { useLayoutEffect, useState, type CSSProperties } from 'react';
import { useLang, useT } from '../../i18n/useLang';
import DecryptedText from '../reactbits/DecryptedText';
import { screenBox } from './geometry';
import { QUADS, SCREEN_BY_ID, type ScreenId } from './screens';
import { stopLook } from './store';
import { ModesPage } from './pages/Modes';
import { MapPage } from './pages/Map';
import { BadgesScreenPage } from './pages/Badges';
import { PilotPage } from './pages/Pilot';
import { SoundPage } from './pages/Sound';
import { SystemsPage } from './pages/Systems';

// A screen zoomed into: its page, on it. With the view zoomed in, the
// screen fills most of it, and the page opens right over the screen's glass
// (where the view has it), powering on like an old tube: a line of light
// opening out to the whole screen, its title decrypting. On a phone held
// upright, or a phone on its side, the screen is too small for its page, so
// the page grows out of it to fill the view (a little room left round it,
// and the arrows under it, or beside it on its side). Its contents are the game's own: the modes, the
// practice map, the badges, the pilot, the sound and the ship's systems.

interface Props {
  id: ScreenId;
  onClose: () => void;
  onParents: () => void;
  onReset: () => void;
  onAbout: () => void;
  onPilot: (edit: boolean) => void;
}

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** the room the page has: the screen's glass, as the zoomed-in view has it, or (where that's too small) most of the view */
function boxes(id: ScreenId): { glass: Box; page: Box } {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const { look, fov } = stopLook(id, W / H);
  const glass = screenBox(QUADS[id], look, fov, W, H) ?? { left: W * 0.1, top: H * 0.1, width: W * 0.8, height: H * 0.8 };
  // (big enough for the page as it is: any screen on a computer's, the tall one on a phone's held upright)
  const roomy = glass.width >= 320 && glass.height >= 360 && glass.width * glass.height >= 160_000;
  if (roomy) return { glass, page: glass };
  // (a phone on its side: all the height, the arrows in a column on the right)
  if (H < 500 && W > H) return { glass, page: { left: 10, top: 8, width: W - 10 - 142, height: H - 16 } };
  const top = Math.max(10, Math.min(64, H * 0.08));
  const bottom = W < H ? 108 : 12;
  const side = W < H ? 8 : Math.max(10, (W - Math.min(W - 20, H * 1.6)) / 2);
  return { glass, page: { left: side, top, width: W - side * 2, height: H - top - bottom } };
}

const PAGES: Record<ScreenId, (p: Props) => React.JSX.Element> = {
  modes: () => <ModesPage />,
  map: () => <MapPage />,
  badges: () => <BadgesScreenPage />,
  pilot: (p) => <PilotPage onPilot={p.onPilot} />,
  sound: () => <SoundPage />,
  systems: (p) => <SystemsPage onParents={p.onParents} onReset={p.onReset} onAbout={p.onAbout} />,
};

export function Panel(props: Props) {
  const { id, onClose } = props;
  const t = useT();
  const lang = useLang((s) => s.lang);
  const spot = SCREEN_BY_ID[id];
  const [box, setBox] = useState(() => boxes(id));
  // first on the glass, then (where it's bigger) out to its room
  const [grown, setGrown] = useState(false);
  useLayoutEffect(() => {
    const raf = requestAnimationFrame(() => setGrown(true));
    const onResize = () => setBox(boxes(id));
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
    };
  }, [id]);
  const at = grown ? box.page : box.glass;
  const Page = PAGES[id];
  const title = t.deck.screens[id];

  return (
    <div
      className={`ck3-panel is-${id} ${grown ? 'is-grown' : ''}`}
      role="dialog"
      aria-label={title}
      dir={lang === 'he' ? 'rtl' : 'ltr'}
      style={{ left: at.left, top: at.top, width: at.width, height: at.height, '--glow': spot.glow } as CSSProperties}
      // (a click inside it isn't a click on the cockpit behind it)
      onClick={(e) => e.stopPropagation()}
    >
      <div className="ck3-panel-tube">
        <header className="ck3-panel-head">
          <span className="ck3-panel-icon" aria-hidden>
            {spot.icon}
          </span>
          <h2 className="ck3-panel-title">
            <DecryptedText text={title} animateOn="view" speed={45} maxIterations={12} sequential revealDirection="start" characters="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*+×" />
          </h2>
          <button type="button" className="ck3-panel-close" onClick={onClose} aria-label={t.deck.toDeck} title={t.deck.toDeck}>
            ✕
          </button>
        </header>
        <div className="ck3-panel-body">
          <Page {...props} />
        </div>
      </div>
      <span className="ck3-panel-scan" aria-hidden />
      <span className="ck3-panel-corners" aria-hidden />
    </div>
  );
}
