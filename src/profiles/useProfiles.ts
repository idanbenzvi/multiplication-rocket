import { create } from 'zustand';

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
}

export const AVATARS = ['🐶', '🐱', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🐧', '🦄', '🐙'];
export const MAX_NAME_LENGTH = 16;

const PROFILES_KEY = 'multiplication-rocket:profiles';
const PROGRESS_PREFIX = 'multiplication-rocket:progress:v1';
/** progress saved before profiles existed */
const LEGACY_PROGRESS_KEY = PROGRESS_PREFIX;

export function progressKeyFor(profileId: string): string {
  return `${PROGRESS_PREFIX}:${profileId}`;
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
      localStorage.setItem(progressKeyFor(profile.id), legacy);
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
  create: (name: string, avatar: string) => string;
  update: (id: string, patch: Partial<Pick<Profile, 'name' | 'avatar' | 'academySeen'>>) => void;
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
    create: (name, avatar) => {
      const profile: Profile = { id: newId(), name: name.trim().slice(0, MAX_NAME_LENGTH), avatar, createdAt: Date.now() };
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
        localStorage.removeItem(progressKeyFor(id));
        localStorage.removeItem(`multiplication-rocket:log:v1:${id}`); // their answer history
        localStorage.removeItem(`multiplication-rocket:badges:v1:${id}`); // their badges
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

/** a profile's level / correct count for the picker, read straight from storage */
export function profileStats(id: string): { level: number; correct: number } {
  try {
    const raw = localStorage.getItem(progressKeyFor(id));
    if (raw) {
      const p = JSON.parse(raw) as { level?: number; totalCorrectAnswers?: number };
      return { level: p.level ?? 1, correct: p.totalCorrectAnswers ?? 0 };
    }
  } catch {
    // ignore
  }
  return { level: 1, correct: 0 };
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
