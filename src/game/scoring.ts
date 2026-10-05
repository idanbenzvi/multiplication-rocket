// Reaction-time reward curve, matched 1:1 to the on-screen timer in
// QuestionForm.tsx so what the child sees is exactly what they earn:
// under 5s = big fuel boost, over 10s = small boost, linear ramp between.
export const FAST_MS = 5000;
export const SLOW_MS = 10000;
export const MAX_SPEED_FACTOR = 2;
export const MIN_SPEED_FACTOR = 0.3;

export type SpeedZone = 'fast' | 'mid' | 'slow';

export function speedZone(elapsedMs: number): SpeedZone {
  if (elapsedMs < FAST_MS) return 'fast';
  if (elapsedMs < SLOW_MS) return 'mid';
  return 'slow';
}

export function speedFactor(elapsedMs: number): number {
  const clamped = Math.min(SLOW_MS, Math.max(FAST_MS, elapsedMs));
  const t = (clamped - FAST_MS) / (SLOW_MS - FAST_MS);
  return MAX_SPEED_FACTOR - t * (MAX_SPEED_FACTOR - MIN_SPEED_FACTOR);
}
