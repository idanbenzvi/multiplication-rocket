import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { BayShip, holdBay, releaseBay, topHolder, updateHold, useBay, type PadShipSpec } from './useBay';
import { useT } from '../../i18n/useLang';

interface Props {
  /** what the sign over the pad reads */
  sign: string;
  /** the ship on the pad (none: the pad's empty) */
  ship?: PadShipSpec | null;
  /** in a card beside the pad (or over the bay, where there's no room beside it) */
  card?: boolean;
  /** what the card is, for screen readers */
  label?: string;
  children: ReactNode;
}

// A screen shown in the launch bay: it holds the bay open while it's here,
// and draws in it. Under another screen opened over it (the ship chooser
// over a pilot's card), it keeps its state, hidden. What's in it can put a
// ship on the pad too (BayShip: a pilot's card, their ship).
export function BayScreen({ sign, ship: own = null, card = false, label, children }: Props) {
  const [id, setId] = useState(0);
  const [given, setGiven] = useState<PadShipSpec | null | undefined>(undefined);
  const ship = given !== undefined ? given : own;
  const latest = useRef({ sign, ship });
  useLayoutEffect(() => {
    latest.current = { sign, ship };
  });
  useLayoutEffect(() => {
    const held = holdBay(latest.current.sign, latest.current.ship);
    setId(held);
    return () => releaseBay(held);
  }, []);
  useLayoutEffect(() => {
    if (id) updateHold(id, sign, ship);
  }, [id, sign, ship]);
  const slot = useBay((s) => s.slot);
  const onTop = useBay((s) => topHolder(s)?.id === id);
  const layout = useBay((s) => s.layout);
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const more = useMoreBelow(host);
  const t = useT();
  if (!slot || !id) return null;
  const side = layout?.cardSide ?? false;
  // beside the pad, or over the bay below its sign (across it, on a phone on its side)
  const wide = !side && (layout?.wide ?? false);
  const place = side ? { left: (layout?.sideX ?? 0) + 8 } : { paddingTop: Math.min(64 * (layout?.u ?? 1), window.innerHeight * 0.22) + 8 };
  return createPortal(
    <BayShip.Provider value={setGiven}>
      <div className={`bay-screen ${onTop ? '' : 'is-under'}`} aria-hidden={!onTop || undefined}>
        {card ? (
          <div ref={setHost} className={`bay-card-host ${side ? 'is-side' : 'is-over'} ${wide ? 'is-wide' : ''}`} style={place}>
            <motion.div
              className="bay-card"
              role="dialog"
              aria-modal="true"
              aria-label={label}
              initial={{ opacity: 0, y: 24, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: 'spring', stiffness: 320, damping: 30, delay: 0.1 }}
            >
              {children}
            </motion.div>
          </div>
        ) : (
          children
        )}
        {card && more && (
          <div className="bay-more" style={{ left: side ? place.left : 0 }}>
            <button
              type="button"
              className="bay-more-button"
              onClick={() => host?.scrollBy({ top: host.clientHeight * 0.6, behavior: 'smooth' })}
              aria-label={t.bay.more}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M5 9l7 7 7-7" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </BayShip.Provider>,
    slot,
  );
}

/** there's more of the card below what's on the screen (scrolled to the bottom, or all of it showing, there isn't) */
function useMoreBelow(host: HTMLElement | null): boolean {
  const [more, setMore] = useState(false);
  useEffect(() => {
    if (!host) return;
    const check = () => setMore(host.scrollHeight - host.clientHeight - host.scrollTop > 12);
    check();
    host.addEventListener('scroll', check, { passive: true });
    const watch = new ResizeObserver(check);
    watch.observe(host);
    for (const el of host.children) watch.observe(el);
    return () => {
      host.removeEventListener('scroll', check);
      watch.disconnect();
    };
  }, [host]);
  return more;
}
