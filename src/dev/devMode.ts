// Dev mode: add ?devmode=true (or =1) to the URL. Off by default; with it,
// a small panel and Shift+key shortcuts jump straight to any special round
// or game state, so they can be checked without playing up to them.
function readFlag(): boolean {
  try {
    const v = new URLSearchParams(window.location.search).get('devmode');
    return v === 'true' || v === '1';
  } catch {
    return false;
  }
}

export const DEV_MODE = typeof window !== 'undefined' && readFlag();

/** dispatched in dev mode; FleetBattle listens for it to grab all cannons */
export const DEV_COLLECT_EVENT = 'mr-dev-collect';

/** dispatched in dev mode: answer the current Stranded Fleet / Fleet Battle / Stardust Run stop correctly */
export const DEV_SOLVE_EVENT = 'mr-dev-solve';
