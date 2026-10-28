import { describe, expect, it } from 'vitest';
import { area, cutRect, splitFor } from './split';
import { angleAt, BEATS, buildStory, feltG, forcesAt, FROZEN, holdFor, poseAt, R, speedAt, SPEED, SPEED_START, Story, turnG, type BeatId } from './story';
import { LENGTH, shipModel } from './wireframe';

const HOLDS = Object.fromEntries(BEATS.map((b) => [b.id, 4000])) as Record<BeatId, number>;
const total = (story: Story) => story.segs.reduce((s, g) => s + g.ms, 0);

describe('the loop: its physics', () => {
  it('turns at 3 g: 150 m/s round a 765 m circle', () => {
    expect(turnG()).toBeCloseTo(3, 1);
    expect(speedAt(0.5)).toBe(SPEED);
    expect(feltG(0.5)).toBeCloseTo(3, 1);
  });

  it('speeds up along the run-up, from its start to the loop’s speed, the engine pushing and nothing turning', () => {
    expect(speedAt(-1)).toBe(SPEED_START);
    expect(speedAt(0)).toBeCloseTo(SPEED);
    for (let s = -0.9; s < 0; s += 0.1) expect(speedAt(s)).toBeGreaterThan(speedAt(s - 0.1));
    expect(forcesAt(-0.5)).toEqual({ thrust: 1, turn: 0 });
    expect(feltG(-0.5)).toBe(2);
  });

  it('coasts round the loop: the side thrusters turning it, the engine off (no air: nothing slows it)', () => {
    for (const s of [0.1, 0.25, 0.5, 0.75, 0.9]) expect(forcesAt(s)).toEqual({ thrust: 0, turn: 1 });
  });

  it('flies a circle round its middle, its top always towards it, its nose along its way', () => {
    for (let s = 0; s <= 1; s += 0.05) {
      const { pos, forward, up } = poseAt(s);
      expect(Math.hypot(pos[0], pos[1] - R)).toBeCloseTo(R);
      expect(Math.hypot(...forward)).toBeCloseTo(1);
      expect(forward[0] * up[0] + forward[1] * up[1]).toBeCloseTo(0);
      // (the top points at the middle)
      const toMid = [-pos[0], R - pos[1]];
      const d = Math.hypot(toMid[0], toMid[1]);
      expect(up[0] * (toMid[0] / d) + up[1] * (toMid[1] / d)).toBeCloseTo(1);
    }
    // upside down at the top, back where it went in at the end
    expect(poseAt(0.5).up[1]).toBeCloseTo(-1);
    expect(poseAt(0.5).pos[1]).toBeCloseTo(2 * R);
    expect(poseAt(1).pos[0]).toBeCloseTo(0);
    expect(angleAt(1)).toBeCloseTo(Math.PI * 2);
  });

  it('joins the run-up, the loop and the way out without a jump', () => {
    for (const s of [0, 1]) {
      const a = poseAt(s - 1e-6).pos;
      const b = poseAt(s + 1e-6).pos;
      expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeLessThan(1e-3);
    }
  });
});

describe('the loop: its story', () => {
  it('goes the whole way round, never backwards, stopping at each beat in turn', () => {
    const story = new Story(buildStory(HOLDS));
    let s = -Infinity;
    const beats: BeatId[] = [];
    while (!story.done) {
      const f = story.frame();
      expect(f.s).toBeGreaterThanOrEqual(s - 1e-9);
      s = f.s;
      if (f.beat && beats[beats.length - 1] !== f.beat) beats.push(f.beat);
      story.step(16);
    }
    expect(beats).toEqual(['thrust', 'turn', 'g', 'inertia', 'done']);
    expect(s).toBeGreaterThan(1);
  });

  it('freezes time in a hold, and flies in a burst', () => {
    const story = new Story(buildStory(HOLDS));
    while (story.frame().kind !== 'hold') story.step(10);
    story.step(400);
    const f = story.frame();
    expect(f.beat).toBe('thrust');
    expect(f.time).toBeCloseTo(FROZEN);
    expect(f.rush).toBe(0);
    story.step(4000);
    expect(story.frame().kind).toBe('move');
    expect(story.frame().time).toBe(1);
  });

  it('goes on at a tap in a hold, and nowhere else', () => {
    const story = new Story(buildStory(HOLDS));
    story.step(100);
    story.next();
    story.step(1);
    expect(story.frame().kind).toBe('charge');
    while (story.frame().kind !== 'hold') story.step(10);
    story.next();
    story.step(2);
    expect(story.frame().kind).toBe('move');
  });

  it('skips to the blueprint sliding away', () => {
    const story = new Story(buildStory(HOLDS));
    story.step(1500);
    story.end();
    expect(story.frame().kind).toBe('close');
    story.step(600);
    expect(story.done).toBe(true);
  });

  it('holds long enough to read, within reason', () => {
    expect(holdFor('Go!')).toBe(3400);
    expect(holdFor('x'.repeat(2000))).toBe(7500);
    const story = new Story(buildStory(HOLDS));
    // (the bursts and the holds: about half a minute in all, not more)
    expect(total(story)).toBeLessThan(30000);
  });
});

describe('the loop: the screen split in two', () => {
  for (const [w, h] of [
    [1280, 800],
    [390, 844],
  ]) {
    it(`cuts a ${w} × ${h} screen into the cockpit and the blueprint, which slides in from off it`, () => {
      const sp = splitFor(w, h);
      const panel = cutRect(w, h, sp.a, sp.n, 0, true);
      const cockpit = cutRect(w, h, sp.a, sp.n, 0, false);
      expect(area(panel) + area(cockpit)).toBeCloseTo(w * h, 0);
      // about half each
      expect(area(panel) / (w * h)).toBeGreaterThan(0.38);
      expect(area(panel) / (w * h)).toBeLessThan(0.62);
      // the blueprint's picture on its side, the cockpit's middle on the other
      const side = (p: [number, number]) => (p[0] - sp.a[0]) * sp.n[0] + (p[1] - sp.a[1]) * sp.n[1];
      expect(side([sp.box.cx, sp.box.cy])).toBeGreaterThan(0);
      expect(side(sp.cockpit)).toBeLessThan(0);
      expect(area(cutRect(w, h, sp.a, sp.n, sp.reach, true))).toBe(0);
      expect(sp.portrait).toBe(w < h);
    });
  }
});

describe('the loop: the ships as wireframes', () => {
  for (const ship of ['classic', 'explorer', 'nova'] as const) {
    it(`draws ${ship} the same length, its middle at the middle`, () => {
      const m = shipModel(ship);
      expect(m.hull.length % 6).toBe(0);
      expect(m.hull.length / 6).toBeGreaterThan(150);
      expect(m.trim.length).toBeGreaterThan(0);
      expect(m.hot.length).toBeGreaterThan(0);
      let lo = Infinity;
      let hi = -Infinity;
      for (const arr of [m.hull, m.trim, m.hot])
        for (let i = 2; i < arr.length; i += 3) {
          lo = Math.min(lo, arr[i]);
          hi = Math.max(hi, arr[i]);
        }
      expect(hi - lo).toBeCloseTo(LENGTH);
      expect(hi + lo).toBeCloseTo(0);
      // the pilot's window up top, the nozzle at the back, the side thrusters underneath
      expect(m.window[1]).toBeGreaterThan(0);
      expect(m.nozzle[2]).toBeCloseTo(lo);
      for (const b of m.belly) expect(b[1]).toBeLessThan(0);
    });
  }
});
