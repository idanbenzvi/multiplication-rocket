import { describe, expect, it } from 'vitest';
import { add, dirOf, dirOfLook, frame, length, lookOfDir, normalize, pointOnQuad, project, screenBox, screenQuad, toCamera, yawDelta, type Vec3 } from './geometry';
import { QUADS, SCREENS } from './screens';

const close = (a: Vec3, b: Vec3, digits = 6) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], digits));

describe('the panorama', () => {
  it('has straight ahead in its middle, right to the right of it, and up at its top', () => {
    close(dirOf([0.5, 0.5]), [0, 0, -1]);
    close(dirOf([0.75, 0.5]), [1, 0, 0]);
    close(dirOf([0.25, 0.5]), [-1, 0, 0]);
    close(dirOf([0.5, 0]), [0, 1, 0]);
    close(dirOf([0, 0.5]), [0, 0, 1]);
  });

  it('turns a look into a direction and back', () => {
    for (const look of [
      { yaw: 0.3, pitch: -0.2 },
      { yaw: -2.9, pitch: 1.1 },
      { yaw: 1.7, pitch: 0 },
    ]) {
      const back = lookOfDir(dirOfLook(look));
      expect(back.yaw).toBeCloseTo(look.yaw, 9);
      expect(back.pitch).toBeCloseTo(look.pitch, 9);
    }
  });

  it("sees what it's looking at straight ahead, in the middle of the screen", () => {
    for (const look of [
      { yaw: 0.8, pitch: 0.3 },
      { yaw: -1.6, pitch: -0.5 },
    ]) {
      close(toCamera(dirOfLook(look), look), [0, 0, -1]);
      const p = project(dirOfLook(look), look, 1.2, 1.6)!;
      expect(p[0]).toBeCloseTo(0, 9);
      expect(p[1]).toBeCloseTo(0, 9);
    }
    // a little to the right of it lands right of the middle; a little above it, above
    const look = { yaw: 0.4, pitch: 0.1 };
    expect(project(dirOfLook({ yaw: 0.5, pitch: 0.1 }), look, 1, 1)![0]).toBeGreaterThan(0);
    expect(project(dirOfLook({ yaw: 0.4, pitch: 0.2 }), look, 1, 1)![1]).toBeGreaterThan(0);
    // and behind it isn't on the screen
    expect(project(dirOfLook({ yaw: 0.4 + Math.PI, pitch: 0 }), look, 1, 1)).toBeNull();
  });

  it('turns the short way round', () => {
    expect(yawDelta(3, -3)).toBeCloseTo(2 * Math.PI - 6, 9);
    expect(yawDelta(-3, 3)).toBeCloseTo(6 - 2 * Math.PI, 9);
    expect(yawDelta(0.2, 0.5)).toBeCloseTo(0.3, 9);
  });
});

describe('a screen', () => {
  it('is a flat parallelogram with its corners where the art has them', () => {
    for (const s of SCREENS) {
      const q = screenQuad(s.corners, 1000);
      q.corners.forEach((c, i) => close(normalize(c), dirOf(s.corners[i])));
      close(add(q.corners[0], q.corners[2]), add(q.corners[1], q.corners[3]), 3);
      expect(length(q.center)).toBeCloseTo(1000, 6);
    }
  });

  it('is nearly a rectangle, as the screens in the art are', () => {
    for (const s of SCREENS) {
      const q = QUADS[s.id];
      const cos = (q.across[0] * q.down[0] + q.across[1] * q.down[1] + q.across[2] * q.down[2]) / (length(q.across) * length(q.down));
      expect(Math.abs(cos)).toBeLessThan(0.12);
    }
  });

  it('is crossed where a look meets it', () => {
    for (const s of SCREENS) {
      const q = QUADS[s.id];
      const mid = pointOnQuad(q, normalize(q.center))!;
      expect(mid[0]).toBeCloseTo(0.5, 6);
      expect(mid[1]).toBeCloseTo(0.5, 6);
      const corner = pointOnQuad(q, normalize(q.corners[2]))!;
      expect(corner[0]).toBeCloseTo(1, 6);
      expect(corner[1]).toBeCloseTo(1, 6);
      expect(pointOnQuad(q, normalize(q.center).map((v) => -v) as Vec3)).toBeNull();
    }
  });

  it('is framed to fill the screen one way or the other', () => {
    for (const aspect of [16 / 9, 390 / 844]) {
      for (const s of SCREENS) {
        const { look, fov } = frame(QUADS[s.id], aspect, 0.8);
        const box = screenBox(QUADS[s.id], look, fov, aspect * 1000, 1000)!;
        const fill = Math.max(box.width / (aspect * 1000), box.height / 1000);
        expect(fill).toBeGreaterThan(0.7);
        expect(fill).toBeLessThanOrEqual(0.8 + 1e-6);
        expect(box.left).toBeGreaterThan(0);
        expect(box.top).toBeGreaterThan(0);
      }
    }
  });
});
