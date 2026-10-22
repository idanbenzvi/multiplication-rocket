import { describe, expect, it } from 'vitest';
import { placeOrb, type Point } from './orbPlace';

/** a rocket-ish rectangle, w × h, centred at (cx, cy), leaning `deg` to the right */
function rocket(cx: number, cy: number, w: number, h: number, deg: number): Point[] {
  const a = (deg * Math.PI) / 180;
  return [
    [-w / 2, -h / 2],
    [w / 2, -h / 2],
    [w / 2, h / 2],
    [-w / 2, h / 2],
  ].map(([x, y]) => ({ x: cx + x * Math.cos(a) - y * Math.sin(a), y: cy + x * Math.sin(a) + y * Math.cos(a) }));
}

/** how far the circle's edge is from the rectangle `quad` (positive: clear of it) */
function clearance(quad: Point[], c: Point, r: number): number {
  // the farthest separating line among the quad's edges' normals and the axis to the centre
  let best = -Infinity;
  for (let i = 0; i < quad.length; i++) {
    const p = quad[i];
    const q = quad[(i + 1) % quad.length];
    const n = { x: q.y - p.y, y: p.x - q.x };
    const len = Math.hypot(n.x, n.y);
    const u = { x: n.x / len, y: n.y / len };
    const quadMax = Math.max(...quad.map((v) => v.x * u.x + v.y * u.y));
    best = Math.max(best, c.x * u.x + c.y * u.y - r - quadMax);
  }
  return best;
}

const screen = { left: 8, top: 110, right: 1272, bottom: 600 };

describe('where the orb floats', () => {
  it('goes to the right of an upright rocket, a margin clear of it', () => {
    const quad = rocket(600, 350, 160, 320, 0);
    const spot = placeOrb(quad, 46, 22, screen, [])!;
    expect(spot.angle).toBe(0);
    expect(clearance(quad, spot.at, 46)).toBeCloseTo(22, 5);
  });

  it('stays clear of a leaning rocket, whichever way it leans', () => {
    for (const lean of [-45, -30, 0, 20, 35, 45]) {
      const quad = rocket(600, 350, 160, 320, lean);
      const spot = placeOrb(quad, 46, 22, screen, [])!;
      expect(clearance(quad, spot.at, 46)).toBeGreaterThanOrEqual(22 - 1e-6);
    }
  });

  it('finds the room left round a phone-sized rocket, or says there is none', () => {
    const phone = { left: 8, top: 110, right: 382, bottom: 330 };
    const quad = rocket(200, 220, 70, 200, 35);
    const spot = placeOrb(quad, 35, 16, phone, []);
    if (spot) {
      expect(clearance(quad, spot.at, 35)).toBeGreaterThanOrEqual(16 - 1e-6);
      expect(spot.at.x + 35).toBeLessThanOrEqual(phone.right);
    }
  });

  it('keeps off the screen furniture', () => {
    const quad = rocket(600, 350, 160, 320, 0);
    const gauge = { left: 740, top: 250, right: 800, bottom: 450 };
    const spot = placeOrb(quad, 46, 22, screen, [gauge])!;
    expect(spot.angle).not.toBe(0);
  });

  it('keeps to the side it chose while that stays clear', () => {
    const quad = rocket(600, 350, 160, 320, 0);
    expect(placeOrb(quad, 46, 22, screen, [], 180)!.angle).toBe(180);
  });
});
