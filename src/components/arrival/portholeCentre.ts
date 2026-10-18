import { portholeScreen } from '../../game/flight';

/** the rocket's porthole on screen, as the rocket was last drawn (the middle of the screen before that) */
export function portholeCentre() {
  return portholeScreen.r > 0 ? { x: portholeScreen.x, y: portholeScreen.y } : { x: window.innerWidth / 2, y: window.innerHeight / 2 };
}
