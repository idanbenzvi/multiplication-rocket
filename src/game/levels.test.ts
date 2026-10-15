import { describe, expect, it } from 'vitest';
import { DESTINATION_COUNT, getLevelConfig } from './levels';
import { STRINGS, destinationName } from '../i18n/strings';

describe('the journey', () => {
  it('names every stop in every language', () => {
    for (const t of Object.values(STRINGS)) expect(t.destinations).toHaveLength(DESTINATION_COUNT);
  });

  it('tours the solar system, then starts a new lap at the Moon', () => {
    const en = STRINGS.en;
    const names = Array.from({ length: DESTINATION_COUNT }, (_, i) => destinationName(en, getLevelConfig(i + 1)));
    for (const body of ['The Sun', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto']) expect(names).toContain(body);
    expect(names[names.length - 1]).toMatch(/Earth/);
    const lap2 = getLevelConfig(DESTINATION_COUNT + 1);
    expect(lap2.destinationIndex).toBe(0);
    expect(lap2.destinationSector).toBe(2);
  });

  it('flies a new course every level: straight up first, then up to 45° either way', () => {
    expect(getLevelConfig(1).headingDeg).toBe(0);
    for (let level = 1; level <= 40; level++) {
      const { headingDeg } = getLevelConfig(level);
      expect(Math.abs(headingDeg)).toBeLessThanOrEqual(45);
      // a turn you can see from one level to the next
      expect(Math.abs(headingDeg - getLevelConfig(level + 1).headingDeg)).toBeGreaterThanOrEqual(15);
    }
  });
});
