import { describe, expect, it } from 'vitest';
import type { Progress } from '../../../game/types';
import { Canyon, CLAY, DUNES, GATE_HALF, HOVER, MAX_HEIGHT, sunlight, WASH } from './field';
import { buildChunk, CHUNK, columns } from './chunk';
import { buildGates, GATE_COUNT, gateDistances, judge, LANE, RULER, RULER_ROOM, runLength, SPAN, uOf, valueAt, windowFor } from './gates';
import { DESCENT_S, OVER_S, PACE_MAX, PACE_MIN, PACE_START, Run, START_HEIGHT } from './run';
import { seeded } from './noise';
import { canLand, nextDue, NO_CANYON } from './arrival';
import { canyonPalette, hexToLinear, linearToHex, STRATA, tint } from './palette';
import { getLevelConfig } from '../../../game/levels';

const progress = (level: number, stage?: number): Progress => ({
  version: 1,
  level,
  fuel: 0,
  currentStreak: 0,
  bestStreak: 0,
  totalCorrectAnswers: 0,
  launchesCompleted: 0,
  mastery: {},
  stage,
});

const canyonFor = (seed: number) => new Canyon({ seed, gates: gateDistances(), end: runLength() });

/** fly a run to its end at 60 fps, `steer` called each frame */
function fly(run: Run, steer: (run: Run) => void = () => {}) {
  const events = [];
  for (let i = 0; i < 60 * 200 && run.phase !== 'done'; i++) {
    steer(run);
    events.push(...run.step(1 / 60));
  }
  return events;
}

describe('Canyon Run: the canyon', () => {
  it('is the same canyon for the same seed (the worker builds what the flight flies)', () => {
    const a = canyonFor(7);
    const b = canyonFor(7);
    for (let d = 0; d < 3000; d += 137) for (const u of [-90, -30, 0, 12, 44]) expect(a.height(d, u)).toBe(b.height(d, u));
    expect(canyonFor(8).height(500, 40)).not.toBe(a.height(500, 40));
  });

  it('starts in the middle, and its floor is clear wherever the ship can fly (spires aside)', () => {
    for (const seed of [1, 2, 3]) {
      const c = canyonFor(seed);
      expect(c.center(0)).toBeCloseTo(0, 6);
      for (let d = 0; d < c.end; d += 9) {
        const lim = c.half(d) - 3.6;
        for (let u = -lim; u <= lim; u += 1.5) {
          const spire = c.spiresNear(d).some((s) => Math.hypot(d - s.d, u - s.u) < s.r * 1.6);
          if (!spire) expect(c.height(d, u)).toBeLessThan(c.floor(d) + HOVER - 3);
        }
      }
    }
  });

  it('has walls that stand well over the ship, and tops out under its ceiling', () => {
    const c = canyonFor(4);
    for (let d = 0; d < c.end; d += 31) {
      for (const side of [-1, 1]) expect(c.height(d, side * (c.half(d) + 30))).toBeGreaterThan(c.floor(d) + 30);
      for (const u of [-400, -150, 0, 150, 400]) expect(c.height(d, u)).toBeLessThan(MAX_HEIGHT);
    }
  });

  it('widens at every gate to hold its number line, with room either end', () => {
    const c = canyonFor(5);
    expect(RULER_ROOM).toBeGreaterThanOrEqual(4);
    for (const g of c.gates) for (const d of [g - 250, g - 100, g, g + 15]) expect(c.half(d)).toBeCloseTo(GATE_HALF, 5);
  });

  it('stands its spires clear of the gates and of the way down at the start, leaving room to pass', () => {
    const c = canyonFor(6);
    expect(c.spires.length).toBeGreaterThan(8);
    for (const s of c.spires) {
      expect(s.d).toBeGreaterThan(360);
      for (const g of c.gates) expect(s.d <= g - 250 || s.d >= g + 50).toBe(true);
      expect(c.half(s.d) - Math.abs(s.u) - s.r).toBeGreaterThanOrEqual(8.9);
    }
  });

  it('changes its floor as it goes: dunes at the start, then every kind, never the same twice running, boulders only in a wash', () => {
    for (const seed of [10, 11, 12, 13]) {
      const c = canyonFor(seed);
      const kinds = c.floors.map((f) => f.kind);
      expect(kinds[0]).toBe(DUNES);
      expect(new Set(kinds)).toEqual(new Set([DUNES, CLAY, WASH]));
      kinds.forEach((k, i) => i && expect(k).not.toBe(kinds[i - 1]));
      expect(c.ground(100)).toEqual([0, 0]);
      let boulders = 0;
      for (let d = 0; d < c.end; d += 3) {
        const [clay, wash] = c.ground(d);
        expect(clay + wash).toBeLessThanOrEqual(1 + 1e-9);
        for (let u = -24; u <= 24; u += 1.5) {
          const b = c.boulders(d, u);
          if (wash === 0 || c.zone(d) === 1) expect(b).toBe(0);
          if (b > 0.5) boulders++;
        }
      }
      expect(boulders).toBeGreaterThan(50);
    }
  });

  it('lights the tableland high up, and shades some of the canyon floor', () => {
    const c = canyonFor(9);
    let shaded = 0;
    let n = 0;
    for (let d = 400; d < 3000; d += 40) {
      const top = c.height(d, 200);
      expect(sunlight(c, [c.center(d) + 200, top + 40, -d])).toBeGreaterThan(0.95);
      const floor = sunlight(c, [c.center(d), c.floor(d) + 1, -d]);
      expect(floor).toBeGreaterThanOrEqual(0);
      expect(floor).toBeLessThanOrEqual(1);
      if (floor < 0.5) shaded++;
      n++;
    }
    expect(shaded).toBeGreaterThan(0);
    expect(shaded).toBeLessThan(n);
  });
});

describe('Canyon Run: its chunks', () => {
  it('builds a mesh of the canyon a stretch at a time, joining up end to end', () => {
    const c = canyonFor(11);
    const cols = columns('low').length;
    const a = buildChunk(c, 3, 'low');
    const b = buildChunk(c, 4, 'low');
    const points = a.positions.length / 3;
    expect(a.normals.length).toBe(points * 3);
    expect(a.shade.length).toBe(points * 4);
    expect(Math.max(...a.indices)).toBeLessThan(points);
    // (the last row of one is the first of the next)
    for (let k = 0; k < cols; k++) {
      const i = points - cols + k;
      expect(a.positions[i * 3]).toBeCloseTo(b.positions[k * 3], 4);
      expect(a.positions[i * 3 + 1]).toBeCloseTo(b.positions[k * 3 + 1], 4);
      expect(a.positions[i * 3 + 2]).toBeCloseTo(-4 * CHUNK, 4);
    }
    for (let i = 0; i < points; i++) {
      expect(Math.hypot(a.normals[i * 3], a.normals[i * 3 + 1], a.normals[i * 3 + 2])).toBeCloseTo(1, 4);
      // (a heightfield faces up)
      expect(a.normals[i * 3 + 1]).toBeGreaterThan(0);
      for (const v of [a.shade[i * 4], a.shade[i * 4 + 1]]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it('keeps a detailed chunk within 16-bit indices', () => {
    const c = canyonFor(12);
    const chunk = buildChunk(c, 0, 'high');
    expect(chunk.indices).toBeInstanceOf(Uint16Array);
  });
});

describe('Canyon Run: the gates', () => {
  it("puts the answer somewhere along its ruler, never at either end's last three, never below 0", () => {
    const rand = seeded(3);
    for (let i = 0; i < 2000; i++) {
      const answer = Math.floor(rand() * 101);
      const lo = windowFor(answer, rand);
      expect(lo).toBeGreaterThanOrEqual(0);
      expect(answer - lo).toBeLessThanOrEqual(SPAN - 3);
      if (answer >= 3) expect(answer - lo).toBeGreaterThanOrEqual(3);
    }
  });

  it('reads the number flown through from where across the canyon the ship is', () => {
    const gate = { lo: 41 };
    for (let n = 41; n <= 41 + SPAN; n++) {
      expect(valueAt(gate, uOf(gate, n))).toBe(n);
      expect(valueAt(gate, uOf(gate, n) + LANE * 0.45)).toBe(n);
    }
    expect(uOf(gate, 41)).toBe(-RULER);
    expect(uOf(gate, 41 + SPAN)).toBeCloseTo(RULER, 9);
    // (past the ends, the ends)
    expect(valueAt(gate, -RULER - 4)).toBe(41);
    expect(valueAt(gate, RULER + 4)).toBe(41 + SPAN);
  });

  it('calls it a bullseye on the answer, close within two, a miss further', () => {
    expect(judge(56, 56)).toBe('bullseye');
    expect(judge(54, 56)).toBe('close');
    expect(judge(58, 56)).toBe('close');
    expect(judge(53, 56)).toBe('miss');
  });

  it("asks the pilot's own facts: a different answer at each gate, no × 1", () => {
    for (let i = 0; i < 50; i++) {
      const gates = buildGates(progress(4), 'mul');
      expect(gates).toHaveLength(GATE_COUNT);
      expect(new Set(gates.map((g) => g.answer)).size).toBe(GATE_COUNT);
      for (const g of gates) {
        expect(Math.min(g.x, g.y)).toBeGreaterThanOrEqual(2);
        expect(g.x * g.y).toBe(g.answer);
        expect(g.op).toBe('mul');
      }
      gates.slice(1).forEach((g, k) => expect(g.d).toBeGreaterThan(gates[k].d));
    }
  });

  it('asks sums on the addition mission, and both on a mixed one', () => {
    const add = buildGates(progress(1, 1), 'add');
    for (const g of add) {
      expect(g.op).toBe('add');
      expect(g.x + g.y).toBe(g.answer);
    }
    const ops = new Set(Array.from({ length: 20 }, () => buildGates(progress(3, 2), 'mix').map((g) => g.op)).flat());
    expect(ops).toEqual(new Set(['mul', 'add']));
  });
});

describe('Canyon Run: the flight', () => {
  const runFor = (seed: number, calm = false, pace?: number) => {
    const rand = seeded(seed);
    const gates = buildGates(progress(4), 'mul', rand);
    return new Run(new Canyon({ seed, gates: gates.map((g) => g.d), end: runLength() }), gates, calm, pace);
  };

  it('dives in, flies the canyon through every gate by itself, climbs out and ends', () => {
    const run = runFor(21);
    const events = fly(run);
    expect(run.phase).toBe('done');
    expect(run.results).toHaveLength(GATE_COUNT);
    expect(events.filter((e) => e.type === 'climb')).toHaveLength(1);
    expect(events.filter((e) => e.type === 'done')).toHaveLength(1);
    // a minute and a half or two (not steered, it misses, so it slows to its gentlest)
    expect(run.time).toBeGreaterThan(50);
    expect(run.time).toBeLessThan(130);
  });

  it('dives in as a film opens: a glide high over the canyon, then a smooth swoop, its nose never far down, levelling out over the floor', () => {
    for (const calm of [false, true]) {
      const run = runFor(23, calm);
      const types: string[] = [];
      let steepest = 0;
      let turning = 0;
      let last = run.ship.pitch;
      while (run.phase === 'descent') {
        types.push(...run.step(1 / 60).map((e) => e.type));
        const s = run.ship;
        const h = s.y - run.canyon.floor(s.d);
        // (gliding over it a moment after the white's cleared, looking a little down along it)
        if (run.time < OVER_S) {
          expect(h).toBeCloseTo(HOVER + START_HEIGHT, 0);
          expect(s.pitch).toBeLessThan(0);
          expect(s.pitch).toBeGreaterThan(-0.15);
        }
        steepest = Math.min(steepest, s.pitch);
        turning = Math.max(turning, Math.abs(s.pitch - last) * 60);
        last = s.pitch;
        // (where the world sets things along its way down, the wisps of cloud: about where it goes)
        const p = run.descentAt(run.time);
        expect(Math.abs(p.d - s.d)).toBeLessThan(5);
        expect(Math.abs(p.y - s.y)).toBeLessThan(1);
      }
      expect(types).toEqual(['dive', 'level']);
      expect(run.time).toBeCloseTo(DESCENT_S, 1);
      // nose down into it, but never so far it loses the canyon ahead, and turning smoothly
      expect(steepest).toBeLessThan(-0.3);
      expect(steepest).toBeGreaterThan(-0.55);
      expect(turning).toBeLessThan(0.8);
      // levelled out at the hover's height
      expect(run.ship.y - run.canyon.floor(run.ship.d)).toBeCloseTo(HOVER, 1);
      expect(Math.abs(run.ship.pitch)).toBeLessThan(0.02);
    }
  });

  it('keeps over the floor and inside the walls all the way', () => {
    const run = runFor(22);
    let lowest = Infinity;
    for (let i = 0; i < 60 * 200 && run.phase !== 'done'; i++) {
      // (a pilot who holds right half the time, left the other)
      if (i % 240 === 0) run.press(i % 480 ? 1 : -1);
      if (i % 240 === 120) run.release();
      run.step(1 / 60);
      const s = run.ship;
      if (run.phase === 'fly') lowest = Math.min(lowest, s.y - run.canyon.height(s.d, s.u));
      expect(Math.abs(s.u)).toBeLessThanOrEqual(run.canyon.half(s.d) - 3.59);
    }
    expect(lowest).toBeGreaterThan(2);
  });

  it('flies a perfect run to all bullseyes, faster with each in a row', () => {
    const run = runFor(23);
    let fastest = 0;
    let first = 0;
    fly(run, (r) => {
      const g = r.ahead();
      if (g) r.dragTo(uOf(g, g.answer));
      if (r.next === 1 && !first) first = r.forward();
      fastest = Math.max(fastest, r.ship.speed);
    });
    expect(run.results.every((r) => r.verdict === 'bullseye')).toBe(true);
    expect(run.bestCombo).toBe(GATE_COUNT);
    expect(fastest).toBeGreaterThan(run.ship.speed * 0.9);
    expect(fastest).toBeGreaterThan(70);
  });

  it('eases its pace down with misses and up with bullseyes, between its slowest and fastest', () => {
    const missed = runFor(26);
    expect(missed.pace).toBe(PACE_START);
    fly(missed, (r) => {
      const g = r.ahead();
      if (g) r.dragTo(uOf(g, g.answer + (g.answer - g.lo > 10 ? -6 : 6)));
    });
    expect(missed.results.every((r) => r.verdict === 'miss')).toBe(true);
    expect(missed.pace).toBe(PACE_MIN);
    const flown = runFor(26, false, 1);
    fly(flown, (r) => {
      const g = r.ahead();
      if (g) r.dragTo(uOf(g, g.answer));
    });
    expect(flown.pace).toBe(PACE_MAX);
    // (and a run carries on at the pace it's given, within the bounds)
    expect(runFor(26, false, 3).pace).toBe(PACE_MAX);
  });

  it('aims where the mouse points, settling on the nearest number', () => {
    const run = runFor(27);
    for (let i = 0; i < 60 * 4; i++) run.step(1 / 60);
    const g = run.ruler()!;
    run.aimAt(uOf(g, g.lo + 12) + LANE * 0.3);
    expect(run.aimed()).toBe(g.lo + 12);
    for (let i = 0; i < 60 * 1.5; i++) run.step(1 / 60);
    expect(valueAt(g, run.ship.u)).toBe(g.lo + 12);
    expect(run.ship.u).toBeCloseTo(uOf(g, g.lo + 12), 1);
  });

  it('steps one number along a tap, and glides held', () => {
    const run = runFor(24);
    for (let i = 0; i < 60 * 4; i++) run.step(1 / 60);
    const g = run.ruler()!;
    const at = valueAt(g, run.ship.u);
    run.press(1);
    run.release(1);
    for (let i = 0; i < 60; i++) run.step(1 / 60);
    expect(valueAt(g, run.ship.u)).toBe(at + 1);
    // settled on the number's place
    expect(run.ship.u).toBeCloseTo(uOf(g, at + 1), 1);
    run.press(-1);
    for (let i = 0; i < 60; i++) run.step(1 / 60);
    run.release(-1);
    for (let i = 0; i < 60; i++) run.step(1 / 60);
    expect(valueAt(g, run.ship.u)).toBeLessThan(at - 3);
    expect(Math.abs(run.ship.u - uOf(g, valueAt(g, run.ship.u)))).toBeLessThan(0.15);
  });

  it('adds taps up into one smooth slide, never pushed harder than its thrusters, and counts a bounce once', () => {
    const run = runFor(28);
    for (let i = 0; i < 60 * 4; i++) run.step(1 / 60);
    const g = run.ruler()!;
    const at = valueAt(g, run.ship.u);
    const dir = at - g.lo > 10 ? -1 : 1;
    // (a key's bounce a frame later: one press)
    run.press(dir);
    run.step(1 / 60);
    run.press(dir);
    run.release(dir);
    expect(run.pending()).toBe(dir);
    let most = 0;
    let back = 0;
    let last = run.ship.vu;
    for (let i = 0; i < 60 * 1.5; i++) {
      // two more taps, a tenth of a second apart
      if (i === 6 || i === 12) {
        run.press(dir);
        run.release(dir);
      }
      run.step(1 / 60);
      most = Math.max(most, Math.abs(run.ship.vu - last) * 60);
      last = run.ship.vu;
      // (it doesn't stop between taps, nor turn back before it's there)
      if (Math.abs(uOf(g, at + 3 * dir) - run.ship.u) > 0.3) back = Math.max(back, -run.ship.vu * dir);
    }
    expect(run.aimed()).toBe(at + 3 * dir);
    expect(valueAt(g, run.ship.u)).toBe(at + 3 * dir);
    expect(run.pending()).toBe(0);
    expect(run.ship.u).toBeCloseTo(uOf(g, at + 3 * dir), 0);
    expect(back).toBeLessThan(0.5);
    expect(most).toBeLessThanOrEqual(150.5);
  });

  it('follows the mouse smoothly across, and rests on the nearest number', () => {
    const run = runFor(29);
    for (let i = 0; i < 60 * 4; i++) run.step(1 / 60);
    const g = run.ruler()!;
    const from = run.ship.u;
    const to = from + (from < 0 ? 1 : -1) * LANE * 6.4;
    let most = 0;
    let last = run.ship.vu;
    for (let i = 0; i < 60 * 1.5; i++) {
      if (i < 30) run.aimAt(from + ((to - from) * i) / 29);
      run.step(1 / 60);
      most = Math.max(most, Math.abs(run.ship.vu - last) * 60);
      last = run.ship.vu;
    }
    expect(most).toBeLessThanOrEqual(150.5);
    expect(run.ship.u).toBeCloseTo(uOf(g, valueAt(g, to)), 0);
    expect(Math.abs(run.ship.vu)).toBeLessThan(1);
  });

  it('scrapes along a wall rather than through it', () => {
    const run = runFor(25);
    run.press(1);
    const events = [];
    for (let i = 0; i < 60 * 8; i++) events.push(...run.step(1 / 60));
    expect(events.some((e) => e.type === 'scrape')).toBe(true);
  });
});

describe('Canyon Run: arriving at a level’s end', () => {
  it('lands every three or four levels, never into the asteroid belt (then the next level’s end)', () => {
    expect(nextDue(3, true)).toEqual({ land: false, due: 2 });
    expect(nextDue(2, true)).toEqual({ land: false, due: 1 });
    const landed = nextDue(1, true, () => 0.99);
    expect(landed.land).toBe(true);
    expect([3, 4]).toContain(landed.due);
    expect(nextDue(1, true, () => 0).due).toBe(3);
    // due at the asteroid belt: held over
    expect(nextDue(1, false)).toEqual({ land: false, due: 0 });
    expect(nextDue(0, true).land).toBe(true);
    // over many level ends, about one in three or four
    const rand = seeded(5);
    let due = 3;
    let lands = 0;
    for (let level = 1; level <= 120; level++) {
      const next = nextDue(due, canLand(level), rand);
      due = next.due;
      if (next.land) {
        lands++;
        expect(NO_CANYON.has(getLevelConfig(level).destinationIndex)).toBe(false);
      }
    }
    expect(lands).toBeGreaterThan(120 / 4.6);
    expect(lands).toBeLessThan(120 / 2.8);
  });

  it('knows the asteroid belt has no ground', () => {
    const belt = Array.from({ length: 16 }, (_, i) => i + 1).find((l) => getLevelConfig(l).destinationIndex === 5)!;
    expect(canLand(belt)).toBe(false);
    expect(canLand(belt + 1)).toBe(true);
  });
});

describe('Canyon Run: its colours', () => {
  it('keeps the canyon as it was with no world, and leans it towards a world’s colours, its layers as light and dark', () => {
    const plain = canyonPalette(null, null);
    expect(plain.strata).toEqual(STRATA);
    const neptune = canyonPalette(9, 9);
    const lum = ([r, g, b]: [number, number, number]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
    neptune.strata.forEach(([hex], i) => {
      const before = hexToLinear(STRATA[i][0]);
      const after = hexToLinear(hex);
      // bluer than it was, about as bright
      expect(after[2] / Math.max(after[0], 1e-3)).toBeGreaterThan(before[2] / Math.max(before[0], 1e-3));
      expect(lum(after)).toBeCloseTo(lum(before), 1);
    });
    // its star's light leaning to the star's colour
    expect(neptune.sunLight[2] / neptune.sunLight[0]).toBeGreaterThan(plain.sunLight[2] / plain.sunLight[0]);
  });

  it('round-trips colours, and tints by none at all when asked to', () => {
    expect(linearToHex(hexToLinear('#c8653b'))).toBe('#c8653b');
    const c = hexToLinear('#c8653b');
    expect(tint(c, hexToLinear('#4a78e0'), 0)).toEqual(c);
  });
});
