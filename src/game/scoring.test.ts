import { describe, expect, it } from 'vitest';
import { DEFAULT_PACE_MS, MAX_PACE_MS, MAX_SPEED_FACTOR, MIN_PACE_MS, MIN_SPEED_FACTOR, nextPace, paceMs, speedFactor, speedZone, type Pace } from './scoring';

/** a pilot answering right `n` times, each in `ms` */
function answers(pace: Pace | undefined, ms: number, n: number): Pace | undefined {
  for (let i = 0; i < n; i++) pace = nextPace(pace, ms);
  return pace;
}

describe('the speed boost', () => {
  it('is the same as ever for a new pilot: big under 5 s, small past 10 s', () => {
    expect(paceMs(undefined)).toBe(DEFAULT_PACE_MS);
    expect(speedZone(4999)).toBe('fast');
    expect(speedZone(5000)).toBe('mid');
    expect(speedZone(10000)).toBe('slow');
    expect(speedFactor(2000)).toBe(MAX_SPEED_FACTOR);
    expect(speedFactor(12000)).toBeCloseTo(MIN_SPEED_FACTOR);
  });

  it("stretches with the pilot's pace", () => {
    expect(speedZone(7000, 8000)).toBe('fast');
    expect(speedZone(15000, 8000)).toBe('mid');
    expect(speedFactor(8000, 8000)).toBe(MAX_SPEED_FACTOR);
    expect(speedFactor(12000, 8000)).toBeCloseTo((MAX_SPEED_FACTOR + MIN_SPEED_FACTOR) / 2);
  });
});

describe("a pilot's pace", () => {
  it('waits for a few answers before it moves', () => {
    expect(paceMs(answers(undefined, 9000, 2))).toBe(DEFAULT_PACE_MS);
  });

  it('gives a slow pilot more time, quickly', () => {
    const p = answers(undefined, 8000, 3);
    expect(paceMs(p)).toBeGreaterThan(7000);
    // and soon all they need (8 s answers make the big boost)
    expect(paceMs(answers(p, 8000, 3))).toBeGreaterThan(8000 * 1.15);
  });

  it('tightens for a quick pilot, but only a little at a time', () => {
    const p = answers(undefined, 1500, 3);
    expect(paceMs(p)).toBeLessThan(DEFAULT_PACE_MS);
    expect(paceMs(p)).toBeGreaterThan(4500);
    expect(paceMs(answers(p, 1500, 40))).toBeLessThan(2700);
  });

  it('is quicker to give time than to take it back', () => {
    const settled = answers(undefined, 4000, 20);
    const slower = paceMs(answers(settled, 6400, 3)) - paceMs(settled);
    const faster = paceMs(settled) - paceMs(answers(settled, 2400, 3));
    expect(slower).toBeGreaterThan(faster * 3);
  });

  it("isn't thrown by one answer left far too long", () => {
    const settled = answers(undefined, 3000, 10);
    const distracted = answers(nextPace(settled, 60000), 3000, 2);
    expect(paceMs(distracted)).toBeLessThanOrEqual(paceMs(settled));
  });

  it('stays between 2.5 and 10 seconds', () => {
    expect(paceMs(answers(undefined, 30000, 30))).toBe(MAX_PACE_MS);
    expect(paceMs(answers(undefined, 300, 200))).toBe(MIN_PACE_MS);
  });
});
