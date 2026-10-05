// Shared height function so the ground mesh and anything placed on it agree
// on where "flat" ends and "bumpy" begins. Flat near the pad (radius <
// FLAT_RADIUS) so the rocket, tower, and launch ring never clip into terrain
// relief; full bump amplitude by FALLOFF_RADIUS, which is where the
// scattered decorative rocks live.
export const FLAT_RADIUS = 1.4;
export const FALLOFF_RADIUS = 2.3;

export function terrainHeightAt(x: number, z: number): number {
  const raw =
    Math.sin(x * 3.1 + z * 1.7) * 0.05 +
    Math.sin(x * 6.3 - z * 4.1 + 1.3) * 0.025 +
    Math.sin(x * 12.7 + z * 9.4 + 2.6) * 0.012;
  const dist = Math.sqrt(x * x + z * z);
  const falloff = Math.min(1, Math.max(0, (dist - FLAT_RADIUS) / (FALLOFF_RADIUS - FLAT_RADIUS)));
  return raw * falloff;
}
