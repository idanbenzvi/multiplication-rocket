import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** the module afresh, on a phone that can vibrate (it looks once, as it loads) */
async function load() {
  vi.resetModules();
  const vibrate = vi.fn<(pattern: number[]) => boolean>(() => true);
  vi.stubGlobal('navigator', { vibrate, userAgent: 'Android' });
  vi.stubGlobal('window', { setTimeout, clearTimeout });
  const mod = await import('./haptics');
  const { useSettings } = await import('../settings/useSettings');
  return { ...mod, vibrate, useSettings };
}

const total = (pattern: number[]) => pattern.reduce((a, b) => a + b, 0);

describe('haptics', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] }));
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('the engines charge for as long as asked, pulses growing and closing in, ending on a buzz', async () => {
    const { chargePattern } = await load();
    const p = chargePattern(0.8);
    expect(p.length % 2).toBe(1);
    expect(Math.abs(total(p) - 800)).toBeLessThan(130);
    const on = p.filter((_, i) => i % 2 === 0);
    const off = p.filter((_, i) => i % 2 === 1);
    expect(on[on.length - 1]).toBeGreaterThan(on[0]);
    expect(off[off.length - 1]).toBeLessThan(off[0]);
  });

  it('a celebration waits for the answer’s own buzz to finish', async () => {
    const { haptics, vibrate } = await load();
    haptics.correct(5);
    expect(vibrate).toHaveBeenCalledTimes(1);
    const answer = vibrate.mock.calls[0][0];
    haptics.cheer();
    expect(vibrate).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(total(answer) - 1);
    expect(vibrate).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(vibrate).toHaveBeenCalledTimes(2);
  });

  it('with nothing buzzing, a celebration comes at once', async () => {
    const { haptics, vibrate } = await load();
    haptics.cheer(true);
    expect(vibrate).toHaveBeenCalledTimes(1);
  });

  it('a new moment cuts off a celebration still waiting', async () => {
    const { haptics, vibrate } = await load();
    haptics.correct();
    haptics.cheer();
    haptics.thump();
    vi.advanceTimersByTime(5000);
    expect(vibrate).toHaveBeenCalledTimes(2);
    expect(vibrate.mock.calls[1][0]).toEqual([85, 45, 25]);
  });

  it('a scrape along the wall buzzes at most every 120 ms', async () => {
    const { haptics, vibrate } = await load();
    for (let i = 0; i < 10; i++) {
      haptics.scrape(0.5);
      vi.advanceTimersByTime(20);
    }
    expect(vibrate).toHaveBeenCalledTimes(2);
  });

  it('nothing with the Vibration switch off', async () => {
    const { haptics, vibrate, useSettings } = await load();
    useSettings.setState({ vibration: false });
    haptics.launch();
    haptics.cheer();
    expect(vibrate).not.toHaveBeenCalled();
  });
});
