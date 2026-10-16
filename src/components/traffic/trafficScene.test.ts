import { describe, expect, it } from 'vitest';
import { DODGE_S, HOLD, TrafficScene } from './trafficScene';
import type { TrafficDir } from '../../game/bonusRounds';

// The traffic's rules of the road, checked over many randomized runs played
// the way the round plays them (a slow ship pulls in, the pilot swerves past).
interface Car {
  x: number;
  y: number;
  lx: number;
  ly: number;
  z: number;
  role: string;
}
interface Inside {
  ships: Car[];
  lane: { x: number; y: number };
}

function drive(each: (scene: Inside, t: number, swervedAt: number) => void) {
  const dt = 1 / 60;
  const scene = new TrafficScene({ now: 0, accent: '#ff9d76', numbers: [12, 24, 36, 48], calm: false });
  const inside = scene as unknown as Inside;
  const ways: TrafficDir[] = ['left', 'up', 'right', 'down', 'up'];
  const events: Array<[number, () => void]> = [];
  let at = 3;
  let swervedAt = -Infinity;
  for (const way of ways) {
    events.push([at, () => scene.spawnBlocker(42, t)]);
    events.push([at + 1 + Math.random() * 2, () => ((swervedAt = t), scene.dodge(way, t))]);
    at += 4.5;
  }
  let t = 0;
  for (; t < at + 2; t += dt) {
    while (events.length && events[0][0] <= t) events.shift()![1]();
    scene.update(dt, t);
    each(inside, t, swervedAt);
  }
}

const near = (c: Car, x: number, y: number) => Math.hypot(c.x - x, c.y - y) < 0.5;

describe('Space Traffic: the rules of the road', () => {
  it("never puts other traffic in the pilot's lane ahead of the pilot", () => {
    for (let run = 0; run < 40; run++) {
      drive(({ ships, lane }) => {
        for (const c of ships) {
          if (c.role === 'ambient' && c.z > -1 && c.z < HOLD + 2) expect(near(c, lane.x, lane.y)).toBe(false);
        }
      });
    }
  });

  it('has the lanes next to the pilot clear by the time a swerve lands', () => {
    for (let run = 0; run < 40; run++) {
      drive(({ ships, lane }, t, swervedAt) => {
        if (t - swervedAt < DODGE_S) return; // still swerving: ships from the diagonal lanes are moving out
        for (const c of ships) {
          if (c.role !== 'ambient' || c.z < -1 || c.z > 4) continue;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) expect(near(c, lane.x + dx, lane.y + dy)).toBe(false);
        }
      });
    }
  });

  it('never drives two ships through each other', () => {
    for (let run = 0; run < 40; run++) {
      drive(({ ships }) => {
        for (const a of ships) {
          for (const b of ships) {
            if (a !== b && near(a, b.x, b.y)) expect(Math.abs(a.z - b.z)).toBeGreaterThan(1.2);
          }
        }
      });
    }
  });
});
