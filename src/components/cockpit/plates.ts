import type { CSSProperties } from 'react';

/** the hull's friendly hues: each plate's paint is the hull's own, tinged with one of these, by a little (cockpit.css) */
const TINTS = ['#3fd6c6', '#7f8cff', '#a98bff', '#4fb2ff', '#5fc9a8'];

/**
 * A plate's paint (its number choosing it, the same each time): all of a
 * piece, but no two plates quite the same, as if each was painted on its own.
 */
export function plateTint(n: number): CSSProperties {
  const r = Math.abs(Math.sin(n * 91.7 + 13.1) * 43758.5453) % 1;
  return { '--tint': TINTS[(n * 3 + Math.floor(r * 2)) % TINTS.length], '--tint-k': `${(7 + r * 7).toFixed(1)}%` } as CSSProperties;
}
