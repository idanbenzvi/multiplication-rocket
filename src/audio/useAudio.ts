import { create } from 'zustand';

const STORAGE_KEY = 'multiplication-rocket:audio';
const LEGACY_MUSIC_KEY = 'multiplication-rocket:music'; // old on/off toggle

const DEFAULT_MUSIC = 0.35;
const DEFAULT_EFFECTS = 0.7;

// Relative to the page, so it resolves both on a web server and from the
// Electron app's file:// URL.
const music = new Audio('./audio/theme.mp3');
music.loop = true;

interface Saved {
  musicVolume: number;
  effectsVolume: number;
}

function load(): Saved {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Saved>;
      return {
        musicVolume: clamp01(parsed.musicVolume ?? DEFAULT_MUSIC),
        effectsVolume: clamp01(parsed.effectsVolume ?? DEFAULT_EFFECTS),
      };
    }
    if (localStorage.getItem(LEGACY_MUSIC_KEY) === 'off') {
      return { musicVolume: 0, effectsVolume: DEFAULT_EFFECTS };
    }
  } catch {
    // storage blocked — use defaults
  }
  return { musicVolume: DEFAULT_MUSIC, effectsVolume: DEFAULT_EFFECTS };
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));
}

function save(state: Saved) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // non-persistent is fine
  }
}

// Volume 0 means "off": pause rather than play silently.
function applyMusic(volume: number) {
  music.volume = volume;
  if (volume > 0) void music.play().catch(() => {});
  else music.pause();
}

interface AudioState extends Saved {
  setMusicVolume: (v: number) => void;
  setEffectsVolume: (v: number) => void;
}

export const useAudio = create<AudioState>((set, get) => ({
  ...load(),
  setMusicVolume: (v) => {
    const musicVolume = clamp01(v);
    set({ musicVolume });
    save({ musicVolume, effectsVolume: get().effectsVolume });
    applyMusic(musicVolume);
  },
  setEffectsVolume: (v) => {
    const effectsVolume = clamp01(v);
    set({ effectsVolume });
    save({ musicVolume: get().musicVolume, effectsVolume });
  },
}));

music.volume = useAudio.getState().musicVolume;

/** game paused (player left the tab/app): stop the music */
export function pauseMusic() {
  music.pause();
}

/** game resumed: music back on, if it isn't turned all the way down */
export function resumeMusic() {
  applyMusic(useAudio.getState().musicVolume);
}

// Browsers block autoplay until the player interacts with the page, so the
// music starts on the first click/keypress rather than on load.
function startOnFirstGesture() {
  applyMusic(useAudio.getState().musicVolume);
  for (const type of GESTURES) window.removeEventListener(type, startOnFirstGesture);
}
// iOS Safari only unlocks media inside touchend/click, not pointerdown.
const GESTURES = ['pointerdown', 'touchend', 'click', 'keydown'] as const;
for (const type of GESTURES) window.addEventListener(type, startOnFirstGesture);

// In the Electron app autoplay is allowed, so this starts the music right
// away; in a browser it's rejected silently and the gesture listener above
// takes over.
if (useAudio.getState().musicVolume > 0) void music.play().catch(() => {});
