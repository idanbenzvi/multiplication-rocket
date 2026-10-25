import type { FactStat } from './types';
import { covers, type PilotMission } from './mission';

// What a pilot knows is one thing, whichever mission they're flying: a fact
// mastered in Multiplication is mastered in Mixed too. So each pilot's facts
// (their answers, and where each one is in the spaced review, memory.ts) are
// kept once, shared by every mission, while the journey (the level, the fuel,
// the streaks) stays each mission's own (storage/progressStore.ts). A mission
// sees the facts it practises: its view of them. See
// docs/plans/2026-10-25-pilot-modes.md.

export type Facts = Record<string, FactStat>;

/** the facts a mission practises, out of all a pilot's */
export function factsView(facts: Facts, mission: PilotMission): Facts {
  const view: Facts = {};
  for (const key in facts) if (covers(mission, key)) view[key] = facts[key];
  return view;
}

/** a pilot's facts without the ones a mission practises (that mission reset) */
export function withoutMission(facts: Facts, mission: PilotMission): Facts {
  const kept: Facts = {};
  for (const key in facts) if (!covers(mission, key)) kept[key] = facts[key];
  return kept;
}

/** when a mission's record of a fact was last answered, if anyone knows (ms) */
export type LastAnswered = (mission: PilotMission, key: string) => number | undefined;

/**
 * Each mission's facts, from before they were shared, made one: a fact
 * practised in more than one keeps all its answers (the counts added up),
 * and its place in the spaced review from the mission it was answered in
 * last, or, where nothing says when, the one that knows it best (the
 * higher box, then the later check).
 */
export function combineFacts(byMission: Partial<Record<PilotMission, Facts>>, lastAnswered: LastAnswered = () => undefined): Facts {
  const records = new Map<string, Array<{ stat: FactStat; at: number }>>();
  for (const [mission, facts] of Object.entries(byMission) as Array<[PilotMission, Facts | undefined]>) {
    for (const key in facts ?? {}) {
      const entry = { stat: facts![key], at: lastAnswered(mission, key) ?? -Infinity };
      const list = records.get(key);
      if (list) list.push(entry);
      else records.set(key, [entry]);
    }
  }
  const combined: Facts = {};
  for (const [key, list] of records) {
    if (list.length === 1) {
      combined[key] = list[0].stat;
      continue;
    }
    const latest = [...list].sort((x, y) => y.at - x.at || (y.stat.box ?? 0) - (x.stat.box ?? 0) || (y.stat.since ?? 0) - (x.stat.since ?? 0))[0].stat;
    const sum = (f: (s: FactStat) => number) => list.reduce((n, r) => n + f(r.stat), 0);
    combined[key] = { ...latest, attempts: sum((s) => s.attempts), correct: sum((s) => s.correct), wrong: sum((s) => s.wrong) };
  }
  return combined;
}
