import { useCallback, useState } from 'react';
import { calmMotion } from './dropOut';

// When a game mode's lobby card arrives, after the ship has flown in
// (ModeArrival.tsx): the mode's overlay keeps it (useArrivalCard) and its lobby
// panel zooms in then (useCardEntrance).

/** the lobby's card arrives this long after the mode opened (it zooms in for 0.8s more) */
export const ARRIVAL_MS = 1650;

/** when the open mode's lobby card arrives (performance.now()), and whether the ship is there yet */
export interface ArrivalCard {
  at: number;
  arrived: boolean;
}

/** the mode's overlay: its card's arrival, and what ModeArrival calls once the ship is there */
export function useArrivalCard() {
  const [card, setCard] = useState<ArrivalCard>(() => {
    const calm = calmMotion();
    return { at: performance.now() + (calm ? 0 : ARRIVAL_MS), arrived: calm };
  });
  const arrived = useCallback((skipped: boolean) => setCard((c) => ({ at: skipped ? Math.min(c.at, performance.now()) : c.at, arrived: true })), []);
  return [card, arrived] as const;
}

/** the lobby: its panel zooms in as the card arrives (or at once, opened again later), and can't be tapped before */
export function useCardEntrance(card: ArrivalCard) {
  const [mountedAt] = useState(() => performance.now());
  return { className: card.arrived ? '' : 'is-waiting', style: { animationDelay: `${Math.max(0.1, (card.at - mountedAt) / 1000)}s` } };
}
