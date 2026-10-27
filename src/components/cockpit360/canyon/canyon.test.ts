import { describe, expect, it } from 'vitest';
import type { Progress } from '../../../game/types';
import { Canyon, GATE_HALF, HOVER, MAX_HEIGHT, sunlight } from './field';
import { buildChunk, CHUNK, columns } from './chunk';
import { buildGates, GATE_COUNT, gateDistances, judge, LANE, RULER, RULER_ROOM, runLength, SPAN, uOf, valueAt, windowFor } from './gates';
import { Run } from './run';
import { seeded } from './noise';

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
  const runFor = (seed: number, calm = false) => {
    const rand = seeded(seed);
    const gates = buildGates(progress(4), 'mul', rand);
    return new Run(new Canyon({ seed, gates: gates.map((g) => g.d), end: runLength() }), gates, calm);
  };

  it('dives in, flies the canyon through every gate by itself, climbs out and ends', () => {
    const run = runFor(21);
    const events = fly(run);
    expect(run.phase).toBe('done');
    expect(run.results).toHaveLength(GATE_COUNT);
    expect(events.filter((e) => e.type === 'climb')).toHaveLength(1);
    expect(events.filter((e) => e.type === 'done')).toHaveLength(1);
    // about a minute and a bit
    expect(run.time).toBeGreaterThan(50);
    expect(run.time).toBeLessThan(95);
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

  it('scrapes along a wall rather than through it', () => {
    const run = runFor(25);
    run.press(1);
    const events = [];
    for (let i = 0; i < 60 * 8; i++) events.push(...run.step(1 / 60));
    expect(events.some((e) => e.type === 'scrape')).toBe(true);
  });
});
