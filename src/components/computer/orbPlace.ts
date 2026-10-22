// Where the ship's computer's orb floats (ShipComputer.tsx): beside the
// rocket, never over it. The rocket's outline on screen is a turned
// rectangle (it leans with its course: flight.rocketScreen), so the orb
// tries a ring of directions around it, in order of preference, and goes
// as close as it can along the first that's clear: clear of the rocket by
// `margin`, inside the screen, and off the screen's own furniture (the top
// bar, the fuel gauge, the question).

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** the directions tried (degrees, screen-wise: 0 to the right, 90 down), the most natural first */
export const DIRECTIONS = [0, -25, 25, 180, -155, 155, -50, 50, -130, 130, -75, 75, -105, 105, -90, 90];

/** how far `quad` reaches from `from` along the unit vector `d` */
function reach(quad: Point[], from: Point, d: Point): number {
  return Math.max(...quad.map((p) => (p.x - from.x) * d.x + (p.y - from.y) * d.y));
}

function hits(c: Point, r: number, rect: Rect): boolean {
  const nx = Math.max(rect.left, Math.min(c.x, rect.right));
  const ny = Math.max(rect.top, Math.min(c.y, rect.bottom));
  return (c.x - nx) ** 2 + (c.y - ny) ** 2 < r * r;
}

/**
 * The orb's centre, for an orb of radius `r`, around the rocket's outline
 * `quad`, within `area` and off `avoid`; `prefer` (an angle from DIRECTIONS)
 * is kept while it's still clear, so the orb doesn't hop between sides.
 * Along each direction it sits just clear of the rocket: the rocket lies on
 * one side of a line `margin` short of it, the orb on the other.
 */
export function placeOrb(
  quad: Point[],
  r: number,
  margin: number,
  area: Rect,
  avoid: Rect[],
  prefer?: number,
): { at: Point; angle: number } | null {
  if (quad.length < 3) return null;
  const centre = { x: quad.reduce((s, p) => s + p.x, 0) / quad.length, y: quad.reduce((s, p) => s + p.y, 0) / quad.length };
  const order = prefer === undefined ? DIRECTIONS : [prefer, ...DIRECTIONS.filter((a) => a !== prefer)];
  for (const angle of order) {
    const d = { x: Math.cos((angle * Math.PI) / 180), y: Math.sin((angle * Math.PI) / 180) };
    const dist = reach(quad, centre, d) + margin + r;
    const at = { x: centre.x + d.x * dist, y: centre.y + d.y * dist };
    const inside = at.x - r >= area.left && at.x + r <= area.right && at.y - r >= area.top && at.y + r <= area.bottom;
    if (inside && !avoid.some((rect) => hits(at, r + 6, rect))) return { at, angle };
  }
  return null;
}
