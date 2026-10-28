// A pilot's mission: multiplication (the times tables), addition (sums to
// 10, then 20, then 100), subtraction (differences within 10, then back
// across ten from the teens, then within 100), or two mixed: × and + ('mix'),
// or + and − ('addsub', fact families). Each pilot picks one, and each
// mission keeps its own progress (see storage/progressStore.ts). A fact key
// says which operation it belongs to: "3x7" is multiplication, "3+4" and the
// addition kinds ("2d+1d:c", see addition.ts) are addition, "9-4" and the
// subtraction kinds ("2d-1d:b", see subtraction.ts) are subtraction. See
// docs/plans/2026-10-13-addition.md, docs/plans/2026-10-20-mixed.md and
// docs/plans/2026-10-28-subtraction.md.

/** an operation: what a fact, a question or a bonus round is (and the missions that are just one) */
export type Mission = 'mul' | 'add' | 'sub';

export const MISSIONS: Mission[] = ['mul', 'add', 'sub'];

/** what a pilot practises: one operation, or two mixed (each question either one, at random) */
export type PilotMission = Mission | 'mix' | 'addsub';

/** every mission, append only: the answer log stores a mission by its index here */
export const PILOT_MISSIONS: PilotMission[] = ['mul', 'add', 'mix', 'sub', 'addsub'];

/** the missions in the order they're offered: each operation, then the mixes */
export const MISSION_MENU: PilotMission[] = ['mul', 'add', 'sub', 'mix', 'addsub'];

export const OP_SYMBOL: Record<Mission, string> = { mul: '×', add: '+', sub: '−' };

/** a pilot's mission at a glance */
export const MISSION_SYMBOL: Record<PilotMission, string> = { mul: '×', add: '+', sub: '−', mix: '×+', addsub: '+−' };

/** the operations a pilot's mission practises */
export function opsOf(mission: PilotMission): Mission[] {
  return mission === 'mix' ? ['mul', 'add'] : mission === 'addsub' ? ['add', 'sub'] : [mission];
}

/** the operations whose sums climb in stages (addition.ts, subtraction.ts): all but × */
export function climbs(mission: PilotMission): boolean {
  return opsOf(mission).some((op) => op !== 'mul');
}

/** whether a fact (by its key) is one this mission practises */
export function covers(mission: PilotMission, key: string): boolean {
  return opsOf(mission).includes(missionOfKey(key));
}

/** the operation for one question or one bonus round: a mixed mission's is picked at random */
export function pickOp(mission: PilotMission, rand: () => number = Math.random): Mission {
  const ops = opsOf(mission);
  return ops.length === 1 ? ops[0] : rand() < 0.5 ? ops[0] : ops[1];
}

export function missionOfKey(key: string): Mission {
  return key.includes('+') ? 'add' : key.includes('-') ? 'sub' : 'mul';
}

/** a × b, a + b, or a − b (a the bigger: never below zero) */
export function applyOp(mission: Mission, a: number, b: number): number {
  return mission === 'add' ? a + b : mission === 'sub' ? a - b : a * b;
}

/** the tracked key for a pair, in either order: "3x7", "3+4"; a difference's bigger number first, "9-4" */
export function pairKey(mission: Mission, a: number, b: number): string {
  const [lo, hi] = a <= b ? [a, b] : [b, a];
  return mission === 'sub' ? `${hi}-${lo}` : `${lo}${mission === 'add' ? '+' : 'x'}${hi}`;
}

/** whether a problem's numbers can be shown either way round (not a difference's) */
export function commutes(mission: Mission): boolean {
  return mission !== 'sub';
}

/** a concrete problem from its key ("7x8", "37+45", "52-27"), or null for anything else (a kind) */
export function parsePair(key: string): { mission: Mission; a: number; b: number } | null {
  const m = /^(\d{1,3})([x+-])(\d{1,3})$/.exec(key);
  if (!m) return null;
  return { mission: m[2] === '+' ? 'add' : m[2] === '-' ? 'sub' : 'mul', a: Number(m[1]), b: Number(m[3]) };
}

/** the answer to a concrete problem's key, or null */
export function answerOfKey(key: string): number | null {
  const p = parsePair(key);
  return p ? applyOp(p.mission, p.a, p.b) : null;
}
