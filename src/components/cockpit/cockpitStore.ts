import { create } from 'zustand';
import { currentTrack, playTrack, type Track } from '../../audio/useAudio';
import { useProfiles } from '../../profiles/useProfiles';

// Whether the cockpit is open, for everything that opens it: the ⚙️ in the
// top bar, the pilot's badge on a phone, and the rocket's window (a tap on
// it flies the camera in). CockpitHost shows it. The cockpit has its own
// music (Starboard View); leaving it goes back to whatever was playing.

interface CockpitState {
  phase: 'closed' | 'open' | 'leaving';
  /** the button it opened from (it opens out of it when it can't fly in through the window), to go back to after */
  from: HTMLElement | null;
  before: Track;
  /** from a tap (so the browser lets its music start) */
  open: (from?: HTMLElement | null) => void;
  /** flying back out */
  close: () => void;
  /** out: gone */
  gone: () => void;
  /** gone at once, without flying out (a game mode starting from inside it) */
  dismiss: () => void;
}

export const useCockpit = create<CockpitState>((set, get) => ({
  phase: 'closed',
  from: null,
  before: 'theme',
  open: (from = null) => {
    if (get().phase !== 'closed') return;
    const before = currentTrack();
    playTrack('cockpit');
    set({ phase: 'open', from, before });
    // (the window stops shimmering once they've been in)
    const { activeId, profiles, update } = useProfiles.getState();
    if (activeId && !profiles.find((p) => p.id === activeId)?.cockpitSeen) update(activeId, { cockpitSeen: true });
  },
  close: () => {
    const { phase, before } = get();
    if (phase !== 'open') return;
    // (unless something else has changed the music meanwhile: a crew flight ending…)
    if (currentTrack() === 'cockpit') playTrack(before);
    set({ phase: 'leaving' });
  },
  gone: () => {
    const { from } = get();
    set({ phase: 'closed', from: null });
    from?.focus({ preventScroll: true });
  },
  dismiss: () => {
    if (get().phase === 'closed') return;
    set({ phase: 'closed', from: null });
  },
}));
