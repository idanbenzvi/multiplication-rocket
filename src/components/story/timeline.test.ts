import { describe, expect, it } from 'vitest';
import { BEATS, HOLD_MAX, StoryClock, beatAt, circleThrough } from './timeline';

describe('beatAt', () => {
  it('finds the beat a moment is in', () => {
    expect(beatAt(0)).toBe(0);
    expect(beatAt(BEATS[1] - 0.01)).toBe(0);
    expect(beatAt(BEATS[1])).toBe(1);
    expect(beatAt(BEATS[4] + 3)).toBe(4);
    expect(beatAt(999)).toBe(4);
  });
});

describe('StoryClock', () => {
  it('runs on while nothing is being read', () => {
    const c = new StoryClock();
    for (let i = 0; i < 100; i++) c.step(0.1, false);
    expect(c.t).toBeCloseTo(10, 5);
  });

  it('waits at the end of a beat while its line is read, then goes on', () => {
    const c = new StoryClock();
    for (let i = 0; i < 120; i++) c.step(0.1, true);
    // (held at the first beat's end)
    expect(c.t).toBeLessThan(BEATS[1]);
    expect(c.t).toBeGreaterThan(BEATS[1] - 0.01);
    c.step(0.1, false);
    expect(c.t).toBeGreaterThanOrEqual(BEATS[1]);
  });

  it('waits no longer than HOLD_MAX', () => {
    const c = new StoryClock();
    let steps = 0;
    while (c.t < BEATS[1] && steps < 1000) {
      c.step(0.1, true);
      steps++;
    }
    expect(steps * 0.1).toBeLessThanOrEqual(BEATS[1] + HOLD_MAX + 0.5);
    expect(c.t).toBeGreaterThanOrEqual(BEATS[1]);
  });
});

describe('circleThrough', () => {
  it('passes through both points, its centre off to the left', () => {
    const a = { x: 120, y: -40 };
    const b = { x: 700, y: 840 };
    const c = circleThrough(a, b, 2000);
    expect(Math.hypot(a.x - c.x, a.y - c.y)).toBeCloseTo(2000, 6);
    expect(Math.hypot(b.x - c.x, b.y - c.y)).toBeCloseTo(2000, 6);
    expect(c.x).toBeLessThan(a.x);
  });

  it('is at least wide enough to reach both', () => {
    const c = circleThrough({ x: 0, y: 0 }, { x: 0, y: 100 }, 10);
    expect(c.r).toBe(50);
    expect(c.x).toBeCloseTo(0, 6);
    expect(c.y).toBeCloseTo(50, 6);
  });
});
