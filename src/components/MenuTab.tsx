import { useEffect, useState } from 'react';
import { usePause } from '../game/gameClock';
import { useT } from '../i18n/useLang';

// the tab says how to pull the menu out, the first time the game shows it
let hinted = false;

/** the drawer's tab on the right edge (see useMenuDrawer.ts), and the shade behind the open drawer */
export function MenuTab({ open, onOpen, onClose }: { open: boolean; onOpen: () => void; onClose: () => void }) {
  const t = useT();
  // (not while the splash, or anything else, holds the game paused)
  const paused = usePause((s) => s.paused);
  const [hint, setHint] = useState(!hinted);
  useEffect(() => {
    if (!hint || paused) return;
    hinted = true;
    const timer = window.setTimeout(() => setHint(false), 5000);
    return () => window.clearTimeout(timer);
  }, [hint, paused]);
  const hinting = hint && !paused && !open;
  return (
    <>
      {open && <div className="menu-shade" onClick={onClose} aria-hidden />}
      <button type="button" className={`menu-tab ${open ? 'is-hidden' : ''} ${hinting ? 'is-hinting' : ''}`} onClick={onOpen} aria-label={t.menu} aria-expanded={open}>
        <span aria-hidden>☰</span>
        {hinting && <span className="menu-tab-hint">{t.menuHint}</span>}
      </button>
    </>
  );
}
