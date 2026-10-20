import { describe, expect, it } from 'vitest';
import { EXPLORER_VISOR, explorerRearSvg, NOVA_WINDOW, novaRearSvg, REAR_ENGINES, REAR_WINDOWS, shipArt, SHIPS, spriteSize } from './ships';
import { ROCKET_PORTHOLE } from './illustrations';
import { rearShipSvg } from '../traffic/trafficArt';

describe('the ships', () => {
  it('flies the classic rocket in the level colour, or the Explorer from its picture', () => {
    const classic = shipArt('classic', '#7ec4b0');
    expect(classic.picture).toBeUndefined();
    expect(classic.svg).toContain('#7ec4b0');
    const explorer = shipArt('explorer', '#7ec4b0');
    expect(explorer.picture?.url).toBe('./ships/explorer.webp');
    expect(explorer.windows).toEqual([EXPLORER_VISOR]);
    expect(spriteSize('explorer')).toEqual([520, 1040]);
  });

  it("puts the Explorer's visor where the classic's porthole is, at its height and size, a little left of the middle", () => {
    expect(EXPLORER_VISOR.y).toBeCloseTo(ROCKET_PORTHOLE.y);
    expect(EXPLORER_VISOR.radius / ROCKET_PORTHOLE.radius).toBeGreaterThan(0.85);
    expect(EXPLORER_VISOR.radius / ROCKET_PORTHOLE.radius).toBeLessThan(1.15);
    expect(EXPLORER_VISOR.x).toBeLessThan(0.45);
    const p = shipArt('explorer', '#fff').picture!;
    for (const v of [p.x, p.y, p.x + p.width, p.y + p.height]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('flies Nova from its picture, its window right of the middle, its nozzle lower down (it stands taller)', () => {
    const nova = shipArt('nova', '#fff');
    expect(nova.picture?.url).toBe('./ships/nova.webp');
    expect(nova.windows).toEqual([NOVA_WINDOW]);
    expect(NOVA_WINDOW.y).toBeCloseTo(ROCKET_PORTHOLE.y);
    expect(NOVA_WINDOW.x).toBeGreaterThan(0.55);
    expect(nova.nozzle).toBeGreaterThan(shipArt('classic', '#fff').nozzle);
    expect(shipArt('nova', '#fff', false, true).picture?.url).toBe('./ships/nova-admiral.webp');
    expect(novaRearSvg(true)).toContain('nr-gold');
    expect(rearShipSvg(undefined, false, 'nova')).toBe(novaRearSvg(false));
    expect(SHIPS).toEqual(['classic', 'explorer', 'nova']);
  });

  it("gives a Space Admiral's Explorer gold trim and the medal", () => {
    const art = shipArt('explorer', '#fff', false, true);
    expect(art.picture?.url).toBe('./ships/explorer-admiral.webp');
    expect(art.svg).toContain('ship-gold');
  });

  it('flies a crew in the classic rocket with its two windows, whatever the pilot picked', () => {
    const crew = shipArt('explorer', '#fff', true);
    expect(crew.picture).toBeUndefined();
    expect(crew.windows).toHaveLength(2);
    expect(spriteSize('explorer', true)).toEqual([260, 520]);
  });

  it("draws the Explorer from behind with its one copper bell, and the classic with its two engines", () => {
    expect(rearShipSvg(undefined, false, 'explorer')).toBe(explorerRearSvg(false));
    expect(explorerRearSvg(false)).toContain('xr-bell');
    expect(explorerRearSvg(true)).toContain('xr-gold');
    expect(REAR_ENGINES.explorer).toHaveLength(1);
    expect(REAR_ENGINES.classic).toHaveLength(2);
    expect(REAR_WINDOWS.explorer.y).toBeCloseTo(REAR_WINDOWS.classic.y, 1);
  });
});
