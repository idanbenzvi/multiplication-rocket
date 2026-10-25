import type { PilotMission } from './mission';
import { useGameStore } from './useGameStore';
import { missionOf, useProfiles } from '../profiles/useProfiles';
import { prepareMission } from '../storage/progressStore';

// A pilot switching missions (the cockpit's Pilot screen, or editing them in
// the launch bay): each mission's journey is their own to come back to, and
// the facts they know come along (game/sharedFacts.ts), so a mission they
// set off in takes up its sums where those facts have got to. The game starts
// again in it, for the active pilot.

export function switchMission(profileId: string, mission: PilotMission) {
  if (missionOf(profileId) === mission) return;
  useProfiles.getState().update(profileId, { mission });
  prepareMission(profileId, mission);
  if (useProfiles.getState().activeId === profileId) useGameStore.getState().init();
}
