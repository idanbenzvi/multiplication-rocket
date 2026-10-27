import { create } from 'zustand';
import { getLevelConfig } from '../../../game/levels';
import { activeMission, useProfiles } from '../../../profiles/useProfiles';
import { loadCanyonRecord, saveCanyonRecord } from '../../../storage/canyonRecord';

// A Canyon Run at a level's end, now and then: every three or four levels
// (which, at random), the ship that's just reached its destination dives
// into its air, blazing (Descent.tsx), and out of the white the pilot's in
// the cockpit, flying a canyon on it. Never into the asteroid belt, which
// has no ground to fly along: then it waits for the next level's end. Kept
// light, as the game itself starts it: the run is the cockpit's (useCanyon).

/** destinations with no ground to fly a canyon along: the asteroid belt */
export const NO_CANYON = new Set([5]);
/** a run comes every this many levels */
const EVERY = [3, 4];

const between = (rand: () => number) => EVERY[Math.floor(rand() * EVERY.length)];

/** a canyon on the destination `level` reached? */
export function canLand(level: number): boolean {
  return !NO_CANYON.has(getLevelConfig(level).destinationIndex);
}

/** a level's end: whether it lands in a canyon, and the levels to go till the next one */
export function nextDue(due: number, landable: boolean, rand: () => number = Math.random): { land: boolean; due: number } {
  const left = due - 1;
  if (left > 0) return { land: false, due: left };
  // (due, but nowhere to land: the next level's end)
  return landable ? { land: true, due: between(rand) } : { land: false, due: 0 };
}

/** the levels to go, set the first time it's asked */
function dueNow(): number | null {
  const { activeId } = useProfiles.getState();
  if (!activeId) return null;
  const mission = activeMission();
  const record = loadCanyonRecord(activeId, mission);
  if (record.due !== undefined) return record.due;
  return saveCanyonRecord(activeId, mission, { due: between(Math.random) }).due!;
}

/** will the end of `level` land in a canyon? (asking doesn't count it) */
export function canyonAhead(level: number): boolean {
  const due = dueNow();
  return due !== null && nextDue(due, canLand(level), () => 0).land;
}

/** the end of `level`: counted, and whether it lands in a canyon */
export function takeCanyon(level: number): boolean {
  const due = dueNow();
  if (due === null) return false;
  const next = nextDue(due, canLand(level));
  saveCanyonRecord(useProfiles.getState().activeId, activeMission(), { due: next.due });
  return next.land;
}

/** the descent under way: into the destination `level` reached */
export const useArrival = create<{ level: number | null; id: number }>(() => ({ level: null, id: 0 }));

export function startArrival(level: number) {
  if (useArrival.getState().level !== null) return;
  useArrival.setState({ level, id: performance.now() });
}

export function endArrival() {
  useArrival.setState({ level: null });
}
