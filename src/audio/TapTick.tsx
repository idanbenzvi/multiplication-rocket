import { useSettings } from '../settings/useSettings';
import { canTick } from './haptics';

/** a switch is a switch only with the attribute, which React won't write for a boolean it doesn't know */
const makeSwitch = (el: HTMLInputElement | null) => el?.setAttribute('switch', '');

/**
 * The last thing in an answer's button: on an iPhone, an invisible switch
 * over the whole of it, so the finger tapping the answer flips the switch and
 * Safari ticks under it (haptics.ts). The tap still reaches the button; on
 * anything else there's nothing here.
 */
export function TapTick() {
  const on = useSettings((s) => s.vibration);
  if (!canTick || !on) return null;
  return <input ref={makeSwitch} type="checkbox" className="tap-tick" tabIndex={-1} aria-hidden />;
}
