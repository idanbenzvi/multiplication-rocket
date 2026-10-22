import type { FactStat } from './types';
import type { Mission } from './mission';
import { pairKey } from './mission';
import { isMastered } from './memory';

// The ship's computer helping a child who's stuck on a question
// (components/computer/ShipComputer.tsx): ways to think it through, one at a
// time, each with a picture. Like the hints (strategy.ts), none of them
// gives the answer away: each stops a step short ("?"), for the child to
// finish.

/**
 * How long a question goes unanswered before the computer offers to help: a
 * while past the pilot's own pace (7 s at least), or soon for a fact they
 * keep missing.
 */
export function stuckAfterMs(paceMs: number, struggling: boolean): number {
  return struggling ? 3500 : Math.max(7000, paceMs * 1.5);
}

export type ThinkVisual =
  /** `rows` groups of `cols` dots, a row each */
  | { kind: 'groups'; rows: number; cols: number }
  /** `a` dots and `b` more, in rows of ten */
  | { kind: 'join'; a: number; b: number }
  /** two numbers as tens (bars) and ones (dots) */
  | { kind: 'tens'; a: number; b: number }
  /** a count in steps (null: the one to work out) */
  | { kind: 'hops'; values: Array<number | null> };

export type ThinkStep =
  | { id: 'meaningMul'; x: number; y: number; visual: ThinkVisual }
  | { id: 'skip'; by: number; jumps: number; visual: ThinkVisual }
  | { id: 'trick' }
  | { id: 'known'; p: number; q: number; known: number; add: number; math: string }
  | { id: 'swap'; x: number; y: number; math: string; visual?: ThinkVisual }
  | { id: 'meaningAdd'; x: number; y: number; visual: ThinkVisual }
  | { id: 'meaningTens'; x: number; y: number; visual: ThinkVisual }
  | { id: 'countOn'; big: number; small: number; visual: ThinkVisual }
  | { id: 'swapAdd'; x: number; y: number; math: string };

/** the ways to think `x op y` through, for a pilot who knows what's in `mastery` */
export function thinkSteps(x: number, y: number, op: Mission, mastery: Record<string, FactStat>): ThinkStep[] {
  return op === 'add' ? additionSteps(x, y) : multiplicationSteps(x, y, mastery);
}

function multiplicationSteps(x: number, y: number, mastery: Record<string, FactStat>): ThinkStep[] {
  const steps: ThinkStep[] = [{ id: 'meaningMul', x, y, visual: { kind: 'groups', rows: x, cols: y } }];
  // count by the bigger number, the smaller number of times: fewer jumps
  const by = Math.max(x, y);
  const jumps = Math.min(x, y);
  if (jumps >= 2) {
    const values: Array<number | null> = Array.from({ length: jumps - 1 }, (_, i) => by * (i + 1));
    steps.push({ id: 'skip', by, jumps, visual: { kind: 'hops', values: [...values, null] } });
  }
  steps.push({ id: 'trick' });
  const known = knownNeighbour(x, y, mastery);
  if (known) steps.push(known);
  if (x !== y) steps.push({ id: 'swap', x, y, math: `${x} × ${y}  =  ${y} × ${x}`, visual: { kind: 'groups', rows: y, cols: x } });
  return steps;
}

/**
 * A fact one group smaller that the pilot has mastered, to build on: x × y
 * is x × (y − 1) and one more x (or (x − 1) × y and one more y). The bigger
 * of the two if both are known; none if neither is (or it'd be ×1).
 */
function knownNeighbour(x: number, y: number, mastery: Record<string, FactStat>): ThinkStep | null {
  const options = [
    { p: x, q: y - 1, add: x },
    { p: x - 1, q: y, add: y },
  ].filter((o) => o.p >= 2 && o.q >= 2 && isMastered(mastery[pairKey('mul', o.p, o.q)]));
  if (!options.length) return null;
  const { p, q, add } = options.sort((a, b) => b.p * b.q - a.p * a.q)[0];
  const known = p * q;
  return { id: 'known', p, q, known, add, math: `${p} × ${q} = ${known}  →  ${known} + ${add}  →  ?` };
}

function additionSteps(x: number, y: number): ThinkStep[] {
  const steps: ThinkStep[] = [];
  const big = Math.max(x, y);
  const small = Math.min(x, y);
  if (x + y <= 20) steps.push({ id: 'meaningAdd', x, y, visual: { kind: 'join', a: x, b: y } });
  else steps.push({ id: 'meaningTens', x, y, visual: { kind: 'tens', a: x, b: y } });
  // counting on from the bigger number: a few steps at most
  if (small >= 2 && small <= 9) {
    const values: Array<number | null> = [big, ...Array.from({ length: small - 1 }, (_, i) => big + i + 1)];
    steps.push({ id: 'countOn', big, small, visual: { kind: 'hops', values: [...values, null] } });
  }
  steps.push({ id: 'trick' });
  if (x < y) steps.push({ id: 'swapAdd', x, y, math: `${x} + ${y}  =  ${y} + ${x}` });
  return steps;
}
