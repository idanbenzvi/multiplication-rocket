import { useEffect, useState } from 'react';

// A phone on its side is too short for the top bar above the rocket and the
// question below it. There the top bar is just the pilot and ⚙️ in the
// corner (as on any phone, the rest is in the cockpit), the rocket flies on
// the left and the question sits on the right (App.css lays the sideways
// game out, FlightController moves the rocket to the left).

export const SIDEWAYS_QUERY = '(orientation: landscape) and (max-height: 500px) and (pointer: coarse)';
/** one shared query, so the 3D scene can check it every frame */
export const sidewaysQuery: MediaQueryList | null =
  typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(SIDEWAYS_QUERY) : null;

export function useSideways(): boolean {
  const [on, setOn] = useState(() => sidewaysQuery?.matches ?? false);
  useEffect(() => {
    const query = sidewaysQuery;
    if (!query) return;
    const update = () => setOn(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return on;
}
