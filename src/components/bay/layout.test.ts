import { describe, expect, it } from 'vitest';
import { BAY, PAD, bayLayout } from './layout';

describe('the launch bay on the screen', () => {
  it('covers the screen, whatever its shape', () => {
    for (const [vw, vh] of [
      [390, 844],
      [844, 390],
      [1440, 900],
      [1920, 900],
      [768, 1024],
    ]) {
      const l = bayLayout(vw, vh);
      expect(BAY.width * l.u).toBeGreaterThanOrEqual(vw - 0.001);
      expect(BAY.height * l.u).toBeGreaterThanOrEqual(vh - 0.001);
      expect(l.left).toBeLessThanOrEqual(0);
      expect(l.left + BAY.width * l.u).toBeGreaterThanOrEqual(vw - 0.001);
      expect(l.top).toBe(0);
    }
  });

  it('puts the pad in the middle of a phone held upright', () => {
    const l = bayLayout(390, 844);
    expect(l.padX).toBeCloseTo(195);
    expect(l.side).toBe(false);
  });

  it("keeps the picture's edge on the screen's when the pad can't be in the middle", () => {
    const l = bayLayout(1440, 900);
    expect(l.left).toBe(0);
    expect(l.padX).toBeCloseTo(PAD.x * l.u);
  });

  it('has room for a panel beside the pad on a computer and a phone on its side, not on a phone upright or a tablet', () => {
    expect(bayLayout(1440, 900).side).toBe(true);
    expect(bayLayout(1280, 720).side).toBe(true);
    expect(bayLayout(844, 390).side).toBe(true);
    expect(bayLayout(390, 844).side).toBe(false);
    expect(bayLayout(768, 1024).side).toBe(false);
  });

  it("puts the ship chooser's panel beside the pad on a phone on its side, even a small one, as there's no room under it", () => {
    // (Safari's toolbars taking some of the height)
    for (const [vw, vh] of [
      [844, 340],
      [932, 380],
      [667, 300],
      [568, 280],
    ]) {
      expect(bayLayout(vw, vh).side).toBe(true);
    }
  });

  it("lays a pilot's card across the bay on a phone on its side, and beside the pad where it's tall enough", () => {
    expect(bayLayout(844, 340)).toMatchObject({ cardSide: false, wide: true });
    expect(bayLayout(667, 300)).toMatchObject({ cardSide: false, wide: true });
    expect(bayLayout(1440, 900)).toMatchObject({ cardSide: true, wide: false });
    expect(bayLayout(1024, 600)).toMatchObject({ cardSide: true, wide: false });
    expect(bayLayout(390, 664)).toMatchObject({ cardSide: false, wide: false });
  });
});
