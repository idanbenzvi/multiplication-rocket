import { create } from 'zustand';
import type { PadShipSpec } from '../bay/useBay';
import { activeProfile, profileStats, useProfiles } from '../../profiles/useProfiles';
import { isAdmiral } from '../../game/useAchievements';
import { colorForLevel } from '../scene/palette';

// The story (docs/plans/2026-10-27-story-intro.md), in acts: the opening
// (StoryOpening), the launch (StoryLaunch) and the title (StoryTitle). The
// opening plays the first time the game opens on a device with no pilots,
// once; the launch and the title are each new pilot's first take-off; and
// About plays them all again, with the pilot flying now.

const SEEN_KEY = 'multiplication-rocket:story-seen';
const VOICE_KEY = 'multiplication-rocket:story-voice';

export type Act = 'opening' | 'launch' | 'title';

/** who's taking off in the launch: their ship, and their name */
export interface StoryPilot extends PadShipSpec {
  name: string;
}

interface StoryState {
  act: Act | null;
  /** watching it again (from About): all three acts, then back */
  replay: boolean;
  pilot: StoryPilot | null;
  /** once the title's gone */
  onDone: (() => void) | null;
  /** the narration read aloud (🔊/🔇, kept) */
  voice: boolean;
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // (shown again next time)
  }
}

/** the first time the game opens on this device, with nobody flying yet: the opening */
const firstOpening = read(SEEN_KEY) !== '1' && useProfiles.getState().profiles.length === 0;

export const useStory = create<StoryState>(() => ({
  act: firstOpening ? 'opening' : null,
  replay: false,
  pilot: null,
  onDone: null,
  voice: read(VOICE_KEY) !== 'off',
}));

export function setStoryVoice(voice: boolean) {
  write(VOICE_KEY, voice ? 'on' : 'off');
  useStory.setState({ voice });
}

/** the opening's over (or skipped): on to the launch when watching it again, or else to the bay */
export function endOpening() {
  write(SEEN_KEY, '1');
  const { replay, pilot } = useStory.getState();
  useStory.setState({ act: replay && pilot ? 'launch' : replay ? 'title' : null });
}

/** a new pilot's first take-off, once the pad's launch is done; `onDone` once the title's gone */
export function startLaunch(pilot: StoryPilot, onDone: () => void) {
  useStory.setState({ act: 'launch', replay: false, pilot, onDone });
}

export function endLaunch() {
  useStory.setState({ act: 'title' });
}

export function endTitle() {
  const { onDone } = useStory.getState();
  useStory.setState({ act: null, replay: false, pilot: null, onDone: null });
  onDone?.();
}

/** the pilot flying now, as the launch shows them */
export function storyPilot(): StoryPilot | null {
  const p = activeProfile();
  if (!p) return null;
  return { name: p.name, ship: p.ship ?? 'classic', accent: colorForLevel(profileStats(p.id).level), admiral: isAdmiral(), avatar: p.avatar };
}

/** watching it all again (About's ▶): `onDone` once it's over */
export function watchStory(onDone: () => void) {
  useStory.setState({ act: 'opening', replay: true, pilot: storyPilot(), onDone });
}
