// Picking one of four answers from the keyboard with the arrow keys, not 1-4
// (a child typing the answer would press those by mistake: "4" picks the
// fourth button). On a computer the answers sit in a cross like a D-pad, as in
// Space Traffic: the first up, then left, right and down
// (`.choice-grid.is-dpad`). Phones and tablets keep their 2 × 2 grid.

/** where each of the four answers sits in the cross, in order */
export const ARROW_DIRS = ['up', 'left', 'right', 'down'] as const;
export const ARROW_GLYPHS = ['▲', '◀', '▶', '▼'] as const;
const KEYS: Record<string, number> = { ArrowUp: 0, ArrowLeft: 1, ArrowRight: 2, ArrowDown: 3 };

/** the answer an arrow key picks (its place in the list), or -1 for any other key */
export function arrowChoice(key: string): number {
  return KEYS[key] ?? -1;
}
