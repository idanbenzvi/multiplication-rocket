import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { BayShip, holdBay, releaseBay, topHolder, updateHold, useBay, type PadShipSpec } from './useBay';

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
  if (!slot || !id) return null;
  const side = layout?.side ?? false;
  // beside the pad, or over the bay below its sign
  const host = side ? { left: (layout?.sideX ?? 0) + 8 } : { paddingTop: Math.min(64 * (layout?.u ?? 1), window.innerHeight * 0.22) + 8 };
  return createPortal(
    <BayShip.Provider value={setGiven}>
      <div className={`bay-screen ${onTop ? '' : 'is-under'}`} aria-hidden={!onTop || undefined}>
        {card ? (
          <div className={`bay-card-host ${side ? 'is-side' : 'is-over'}`} style={host}>
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
      </div>
    </BayShip.Provider>,
    slot,
  );
}
