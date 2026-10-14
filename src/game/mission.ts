// A pilot's mission: multiplication (the times tables) or addition (sums to
// 10, then 20, then 100). Each pilot picks one, and each mission keeps its
// own progress (see storage/progressStore.ts). A fact key says which mission
// it belongs to: "3x7" is multiplication, "3+4" and the addition kinds
// ("2d+1d:c", see addition.ts) are addition. See docs/plans/2026-10-13-addition.md.

export type Mission = 'mul' | 'add';

export const MISSIONS: Mission[] = ['mul', 'add'];

export const OP_SYMBOL: Record<Mission, string> = { mul: '×', add: '+' };

export function missionOfKey(key: string): Mission {
  return key.includes('+') ? 'add' : 'mul';
}

export function applyOp(mission: Mission, a: number, b: number): number {
  return mission === 'add' ? a + b : a * b;
}

/** the tracked key for a pair, in either order: "3x7", "3+4" */
export function pairKey(mission: Mission, a: number, b: number): string {
  const [lo, hi] = a <= b ? [a, b] : [b, a];
  return `${lo}${mission === 'add' ? '+' : 'x'}${hi}`;
}

/** a concrete problem from its key ("7x8", "37+45"), or null for anything else (an addition kind) */
export function parsePair(key: string): { mission: Mission; a: number; b: number } | null {
  const m = /^(\d{1,3})([x+])(\d{1,3})$/.exec(key);
  if (!m) return null;
  return { mission: m[2] === '+' ? 'add' : 'mul', a: Number(m[1]), b: Number(m[3]) };
}

/** the answer to a concrete problem's key, or null */
export function answerOfKey(key: string): number | null {
  const p = parsePair(key);
  return p ? applyOp(p.mission, p.a, p.b) : null;
}
