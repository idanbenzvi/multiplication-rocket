import { describe, expect, it } from 'vitest';
import { MONSTERS } from './roster';
import { buildMonster, inMouth, mouthSpot } from './monsterArt';
import { SUN_KINDS } from '../../game/sun';
import { STRINGS } from '../../i18n/strings';

describe('the monster roster', () => {
  it('has every monster the game draws from, each with a name and a cured line in both languages', () => {
    expect(MONSTERS).toHaveLength(SUN_KINDS);
    for (const t of Object.values(STRINGS)) {
      expect(t.sun.names).toHaveLength(SUN_KINDS);
      expect(t.sun.cured).toHaveLength(SUN_KINDS);
      expect(new Set(t.sun.names).size).toBe(SUN_KINDS);
    }
  });

  it('gives every monster a body, limbs to knock off first, its eyes, a mouth inside its body, and a friend', () => {
    MONSTERS.forEach((design, k) => {
      const cells = buildMonster(design);
      const count = (kind: string) => cells.filter((c) => c.kind === kind).length;
      expect(count('body'), `monster ${k}`).toBeGreaterThan(40);
      expect(count('ray'), `monster ${k}`).toBeGreaterThan(5);
      expect(count('eye'), `monster ${k}`).toBe(design.eyes.length);
      expect(count('mouth'), `monster ${k}`).toBeGreaterThan(1);
      // the number it eats goes into its mouth, which is on its body
      const [mx, my] = mouthSpot(design);
      expect(design.body(mx, my - 0.03) && inMouth(design.mouth, mx, my - 0.03), `monster ${k}`).toBe(true);
      // limbs first, eyes last
      expect(cells[0].kind, `monster ${k}`).toBe('ray');
      expect(cells[cells.length - 1].kind, `monster ${k}`).toBe('eye');
      expect(design.friend.build().length, `monster ${k}`).toBeGreaterThan(60);
    });
  });
});
