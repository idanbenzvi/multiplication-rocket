import { afterEach, describe, expect, it, vi } from 'vitest';
import { DOWN_AFTER_S, freshWatch, judge, pixelRatio, SETTLE_S, UP_AFTER_S, upAfter, type Tier, type Watch } from './quality';

/** `seconds` of drawing at `fps`, a second at a time, from `tier` and `watch` */
function run(tier: Tier, watch: Watch, fps: number, seconds: number) {
  let state = { tier, watch };
  const steps: number[] = [];
  for (let s = 1; s <= seconds; s++) {
    const before = state.tier;
    state = judge(state.tier, state.watch, fps, 1);
    if (state.tier !== before) steps.push(s);
  }
  return { ...state, steps };
}

/** a watch that's done settling */
const settled = (): Watch => ({ ...freshWatch(), settle: 0 });

describe('Auto: how much the game draws', () => {
  it('steps down once it has struggled for 3 seconds in a row, not before', () => {
    expect(run(0, settled(), 20, DOWN_AFTER_S - 1).tier).toBe(0);
    expect(run(0, settled(), 20, DOWN_AFTER_S).tier).toBe(1);
  });

  it('waits for things to settle at the start and after each step, then steps down again, never past the lightest', () => {
    const r = run(0, freshWatch(), 15, 60);
    expect(r.steps).toEqual([SETTLE_S + DOWN_AFTER_S, 2 * (SETTLE_S + DOWN_AFTER_S)]);
    expect(r.tier).toBe(2);
  });

  it('a moment of struggle in between smooth ones is forgiven', () => {
    let state = { tier: 0 as Tier, watch: settled() };
    for (let i = 0; i < 20; i++) state = judge(state.tier, state.watch, i % 3 === 2 ? 45 : 20, 1);
    expect(state.tier).toBe(0);
  });

  it('keeping up, just (30 to 50 a second), stays where it is either way', () => {
    expect(run(1, settled(), 40, 300).tier).toBe(1);
  });

  it('tries the step above once smooth for 15 seconds', () => {
    expect(run(2, settled(), 60, UP_AFTER_S - 1).tier).toBe(2);
    expect(run(2, settled(), 60, UP_AFTER_S).tier).toBe(1);
  });

  it('falling back soon after stepping up doubles the wait before trying again', () => {
    // up from 1 to 0 …
    let state = run(1, settled(), 60, UP_AFTER_S);
    expect(state.tier).toBe(0);
    // … too much: back down to 1
    state = run(state.tier, state.watch, 20, SETTLE_S + DOWN_AFTER_S);
    expect(state.tier).toBe(1);
    expect(state.watch.bounces).toBe(1);
    expect(upAfter(state.watch)).toBe(2 * UP_AFTER_S);
    // smooth again: not after 15 s, but after 30
    const later = run(state.tier, state.watch, 60, SETTLE_S + UP_AFTER_S);
    expect(later.tier).toBe(1);
    expect(run(state.tier, state.watch, 60, SETTLE_S + 2 * UP_AFTER_S).tier).toBe(0);
  });

  it('a screen held to 30 a second (a phone saving its battery) is not struggling', () => {
    expect(run(0, settled(), 29.5, 120).tier).toBe(0);
  });
});

describe('how sharp a canvas draws', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('takes the screen’s pixels up to the canvas’s own limit, then each step’s', () => {
    vi.stubGlobal('window', { devicePixelRatio: 3 });
    expect(pixelRatio(2, 0, 0)).toBe(2);
    expect(pixelRatio(2, 0, 1)).toBe(1);
    expect(pixelRatio(2, 0, 2)).toBe(0.75);
    // (with writing on it, never under 1)
    expect(pixelRatio(2, 1, 2)).toBe(1);
  });

  it('never more than the screen has', () => {
    vi.stubGlobal('window', { devicePixelRatio: 1 });
    expect(pixelRatio(2, 0, 0)).toBe(1);
    expect(pixelRatio(1.5, 1, 2)).toBe(1);
  });
});
