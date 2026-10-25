import { create } from 'zustand';
import { PILOT_MISSIONS, type PilotMission } from '../game/mission';
import type { ShipId } from '../components/scene/ships';

// Pilot profiles: each child on the device gets a name, an animal avatar and
// their own saved progress (see storage/progressStore.ts, which keys
// progress by the active profile). All local — nothing leaves the device.

export interface Profile {
  id: string;
  name: string;
  avatar: string;
  createdAt: number;
  /** has opened the Deep Space Academy (the porthole stops shimmering) */
  academySeen?: boolean;
  /** what they practise; profiles from before missions existed are multiplication */
  mission?: PilotMission;
  /** addition Academy courses finished ('add1'-'add3') */
  academyDone?: string[];
  /** false: no clock on their questions, and every right answer fills the same (the cockpit's "Speed boost") */
  timedBoost?: boolean;
  /** the ship they fly (chosen in the hangar; till then, the classic rocket, and the hangar opens for them) */
  ship?: ShipId;
  /** how many ships the hangar had when they last chose (it opens again when there's a new one) */
  shipsSeen?: number;
}

export const AVATARS = ['🐶', '🐱', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🐧', '🦄', '🐙'];
export const MAX_NAME_LENGTH = 16;

const PROFILES_KEY = 'multiplication-rocket:profiles';
const PROGRESS_PREFIX = 'multiplication-rocket:progress:v1';
/** progress saved before profiles existed */
const LEGACY_PROGRESS_KEY = PROGRESS_PREFIX;

// Each mission keeps its own journey (its level, fuel and streaks).
// Multiplication stays under the key it always had, so nobody's levels move
// when missions arrive.
export function progressKeyFor(profileId: string, mission: PilotMission): string {
  return mission === 'mul' ? `${PROGRESS_PREFIX}:${profileId}` : `${PROGRESS_PREFIX}:${profileId}:${mission}`;
}

// The facts a pilot knows are kept once, for every mission (game/sharedFacts.ts).
export function factsKeyFor(profileId: string): string {
  return `multiplication-rocket:facts:v1:${profileId}`;
}

interface Saved {
  profiles: Profile[];
  activeId: string | null;
}

function newId(): string {
  return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function persist(state: Saved) {
  try {
    localStorage.setItem(PROFILES_KEY, JSON.stringify(state));
  } catch {
    // storage blocked: profiles last for this session only
  }
}

function load(): Saved {
  try {
    const raw = localStorage.getItem(PROFILES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Saved>;
      const profiles = Array.isArray(parsed.profiles) ? parsed.profiles.filter((p) => p && p.id && p.name) : [];
      const activeId = profiles.some((p) => p.id === parsed.activeId) ? parsed.activeId! : (profiles[0]?.id ?? null);
      return { profiles, activeId };
    }
    // First run with profiles: an existing player's progress becomes their
    // first profile, so nobody loses their levels when this update lands.
    const legacy = localStorage.getItem(LEGACY_PROGRESS_KEY);
    if (legacy) {
      const profile: Profile = { id: newId(), name: '', avatar: AVATARS[0], createdAt: Date.now() };
      localStorage.setItem(progressKeyFor(profile.id, 'mul'), legacy);
      localStorage.removeItem(LEGACY_PROGRESS_KEY);
      const migrated = { profiles: [profile], activeId: profile.id };
      persist(migrated);
      return migrated;
    }
  } catch {
    // fall through to empty
  }
  return { profiles: [], activeId: null };
}

interface ProfilesState extends Saved {
  /** chosen in this session (the picker shows at startup when there are 2+ profiles) */
  chosen: boolean;
  create: (name: string, avatar: string, mission: PilotMission) => string;
  update: (id: string, patch: Partial<Pick<Profile, 'name' | 'avatar' | 'academySeen' | 'mission' | 'academyDone' | 'timedBoost' | 'ship' | 'shipsSeen'>>) => void;
  remove: (id: string) => void;
  select: (id: string) => void;
}

export const useProfiles = create<ProfilesState>((set, get) => {
  const initial = load();
  const save = (next: Saved) => {
    set(next);
    persist(next);
  };
  return {
    ...initial,
    // One profile (or none yet): nothing to choose between.
    chosen: initial.profiles.length < 2,
    create: (name, avatar, mission) => {
      const profile: Profile = { id: newId(), name: name.trim().slice(0, MAX_NAME_LENGTH), avatar, createdAt: Date.now(), mission };
      save({ profiles: [...get().profiles, profile], activeId: profile.id });
      set({ chosen: true });
      return profile.id;
    },
    update: (id, patch) => {
      const profiles = get().profiles.map((p) =>
        p.id === id ? { ...p, ...patch, name: (patch.name ?? p.name).trim().slice(0, MAX_NAME_LENGTH) } : p,
      );
      save({ profiles, activeId: get().activeId });
    },
    remove: (id) => {
      try {
        for (const m of PILOT_MISSIONS) localStorage.removeItem(progressKeyFor(id, m));
        localStorage.removeItem(factsKeyFor(id)); // the facts they know
        localStorage.removeItem(`multiplication-rocket:log:v1:${id}`); // their answer history
        localStorage.removeItem(`multiplication-rocket:badges:v1:${id}`); // their badges
        localStorage.removeItem(`multiplication-rocket:boss:v1:${id}`); // their Black Sun
        // their crews (keys end in "<idA>+<idB>", see game/useCrewStore.ts)
        const crews: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key?.startsWith('multiplication-rocket:crew:v1:') && key.split(':').pop()!.split('+').includes(id)) crews.push(key);
        }
        for (const key of crews) localStorage.removeItem(key);
      } catch {
        // ignore
      }
      const profiles = get().profiles.filter((p) => p.id !== id);
      const activeId = get().activeId === id ? (profiles[0]?.id ?? null) : get().activeId;
      save({ profiles, activeId });
    },
    select: (id) => {
      save({ profiles: get().profiles, activeId: id });
      set({ chosen: true });
    },
  };
});

export function activeProfile(): Profile | null {
  const { profiles, activeId } = useProfiles.getState();
  return profiles.find((p) => p.id === activeId) ?? null;
}

/** a pilot's mission (multiplication unless they picked addition) */
export function missionOf(profileId: string | null | undefined): PilotMission {
  return useProfiles.getState().profiles.find((p) => p.id === profileId)?.mission ?? 'mul';
}

export function activeMission(): PilotMission {
  return missionOf(useProfiles.getState().activeId);
}

export function useMission(): PilotMission {
  return useProfiles((s) => s.profiles.find((p) => p.id === s.activeId)?.mission ?? 'mul');
}

/** a pilot races the clock for a bigger boost (unless it's switched off for them in the cockpit) */
export function timedBoostOf(profileId: string | null | undefined): boolean {
  return useProfiles.getState().profiles.find((p) => p.id === profileId)?.timedBoost !== false;
}

export function activeTimedBoost(): boolean {
  return timedBoostOf(useProfiles.getState().activeId);
}

export function useTimedBoost(): boolean {
  return useProfiles((s) => s.profiles.find((p) => p.id === s.activeId)?.timedBoost !== false);
}

/** the ship a pilot flies (the classic rocket until they've chosen) */
export function shipOf(profileId: string | null | undefined): ShipId {
  return useProfiles.getState().profiles.find((p) => p.id === profileId)?.ship ?? 'classic';
}

export function activeShip(): ShipId {
  return shipOf(useProfiles.getState().activeId);
}

export function useShip(): ShipId {
  return useProfiles((s) => s.profiles.find((p) => p.id === s.activeId)?.ship ?? 'classic');
}

/** a profile's level / correct count in a mission (their current one unless said), for the picker, read straight from storage; `played` if they've flown it */
export function profileStats(id: string, mission: PilotMission = missionOf(id)): { level: number; correct: number; played: boolean } {
  try {
    const raw = localStorage.getItem(progressKeyFor(id, mission));
    if (raw) {
      const p = JSON.parse(raw) as { level?: number; totalCorrectAnswers?: number };
      return { level: p.level ?? 1, correct: p.totalCorrectAnswers ?? 0, played: true };
    }
  } catch {
    // ignore
  }
  return { level: 1, correct: 0, played: false };
}

/** display name, with a friendly fallback for a profile migrated without one */
export function pilotName(p: Profile | null | undefined, fallback: string): string {
  return p?.name || fallback;
}

/** true while the startup gate (welcome / "who's flying?") is showing */
export function useProfileGateOpen(): boolean {
  const profiles = useProfiles((s) => s.profiles);
  const activeId = useProfiles((s) => s.activeId);
  const chosen = useProfiles((s) => s.chosen);
  const active = profiles.find((p) => p.id === activeId);
  return profiles.length === 0 || (!!active && !active.name) || !chosen;
}
