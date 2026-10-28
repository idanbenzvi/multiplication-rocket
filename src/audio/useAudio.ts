import { create } from 'zustand';

const STORAGE_KEY = 'multiplication-rocket:audio';
const LEGACY_MUSIC_KEY = 'multiplication-rocket:music'; // old on/off toggle

const DEFAULT_MUSIC = 0.35;
const DEFAULT_EFFECTS = 0.7;

// The soundtracks: the theme; Monster Sun's own while that mode is open; The
// View From Higher Ground on a crew flight; The View from the Last Lap against
// the Black Sun, the final boss; Velvet Horizon while the About page is open;
// Starboard View in the cockpit, while the settings are open; and Canyon
// Sprint on a Canyon Run. One plays at a time, at the music volume, and never
// cuts to another: the one playing fades out, then the next fades in. Paths
// are relative to the page, so they resolve both on a web server and from the
// Electron app's file:// URL.
export type Track = 'theme' | 'sun' | 'crew' | 'boss' | 'about' | 'cockpit' | 'bay' | 'canyon';
const tracks: Record<Track, HTMLAudioElement> = {
  theme: new Audio('./audio/theme.mp3'),
  sun: new Audio('./audio/monster-sun.mp3'),
  crew: new Audio('./audio/view-from-higher-ground.mp3'),
  boss: new Audio('./audio/view-from-the-last-lap.mp3'),
  about: new Audio('./audio/velvet-horizon.mp3'),
  cockpit: new Audio('./audio/starboard-view.mp3'),
  bay: new Audio('./audio/apex-ascent.mp3'),
  canyon: new Audio('./audio/canyon-sprint.mp3'),
};
// only fetched when someone opens Monster Sun, a crew flight, the Black Sun, the About page, the cockpit, the launch bay or a Canyon Run
tracks.sun.preload = 'none';
tracks.crew.preload = 'none';
tracks.boss.preload = 'none';
tracks.about.preload = 'none';
tracks.cockpit.preload = 'none';
tracks.bay.preload = 'none';
tracks.canyon.preload = 'none';
for (const t of Object.values(tracks)) t.loop = true;

/** changing soundtracks, the one playing fades out over this long, then the next fades in over this long (and the music fades in starting, or back from a pause) */
const FADE_MS = 500;
/** the soundtrack asked for */
let current: Track = 'theme';
/** the one heard now: the one before, until it has faded out */
let sounding: Track = 'theme';
/** how far in `sounding` has faded (a share of the music volume) */
let level = 0;
let fader = 0;
let lastTick = 0;

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

const musicVolume = () => useAudio.getState().musicVolume;

/** the next soundtrack takes over, silent for now (it fades in): the theme where it left off, the others from the top */
function takeOver() {
  tracks[sounding].pause();
  sounding = current;
  const t = tracks[sounding];
  if (sounding !== 'theme') t.currentTime = 0;
  t.volume = 0;
  t.muted = false;
  level = 0;
}

function fade() {
  const now = performance.now();
  // (the page busy for a moment, opening something heavy, it carries on fading from there rather than cutting)
  const step = Math.min(now - lastTick, 50) / FADE_MS;
  lastTick = now;
  if (sounding !== current) {
    level = Math.max(0, level - step);
    if (level === 0) {
      takeOver();
      void tracks[sounding].play().catch(() => {});
    }
  } else if (tracks[sounding].paused) {
    // (not playing after all: the browser is waiting for a tap; it fades in from there once it plays)
    stopFading();
    return;
  } else if (tracks[sounding].readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
    // (once it's actually sounding: a track still coming over the network fades in when it arrives)
    level = Math.min(1, level + step);
  }
  tracks[sounding].volume = musicVolume() * level;
  if (sounding === current && level === 1) stopFading();
}

function startFading() {
  if (fader) return;
  lastTick = performance.now();
  fader = window.setInterval(fade, 20);
}

function stopFading() {
  window.clearInterval(fader);
  fader = 0;
}

// Volume 0 means "off": pause rather than play silently.
function applyMusic() {
  if (musicVolume() === 0) {
    stopFading();
    if (sounding !== current) takeOver();
    tracks[sounding].pause();
    // (turned back up, it fades in)
    level = 0;
    return;
  }
  tracks[sounding].volume = musicVolume() * level;
  void tracks[sounding].play().catch(() => {});
  if (sounding !== current || level < 1) startFading();
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
    applyMusic();
  },
  setEffectsVolume: (v) => {
    const effectsVolume = clamp01(v);
    set({ effectsVolume });
    save({ musicVolume: get().musicVolume, effectsVolume });
  },
}));

for (const t of Object.values(tracks)) t.volume = 0;

/** game paused (player left the tab/app): stop the music (a change under way is done by the time they're back) */
export function pauseMusic() {
  stopFading();
  if (sounding !== current) takeOver();
  tracks[sounding].pause();
  level = 0;
}

/**
 * Switch soundtracks: the one playing fades out, then the next fades in, the
 * modes', the About page's and the cockpit's from the top each time they
 * open, the theme where it left off. Call it from a tap, so a browser that
 * only plays sound after a gesture lets it start: the next one starts right
 * away, muted until its turn.
 */
export function playTrack(track: Track) {
  if (track === current) return;
  // (one asked for a moment ago, never heard: it's not wanted now)
  if (current !== sounding) {
    tracks[current].pause();
    tracks[current].muted = false;
  }
  current = track;
  if (track !== sounding && musicVolume() > 0) {
    tracks[track].muted = true;
    void tracks[track].play().catch(() => {});
  }
  applyMusic();
}

/**
 * From a tap, for a soundtrack that will start later without one (at the end
 * of an animation): a browser that only plays sound after a tap lets it then.
 * It plays a moment, muted, and stops again.
 */
export function unlockTrack(track: Track) {
  const t = tracks[track];
  if (!t.paused || track === sounding || track === current) return;
  t.muted = true;
  void t
    .play()
    .then(() => {
      // (unless it's been asked for meanwhile: then it's starting, muted till its turn)
      if (track === sounding || track === current) return;
      t.pause();
      t.muted = false;
    })
    .catch(() => {
      if (track !== current) t.muted = false;
    });
}

/** the soundtrack playing now (to go back to it afterwards) */
export function currentTrack(): Track {
  return current;
}

/** game resumed: music back on (fading in), if it isn't turned all the way down */
export function resumeMusic() {
  applyMusic();
}

// Browsers block autoplay until the player interacts with the page, so the
// music starts on the first click/keypress rather than on load.
function startOnFirstGesture() {
  applyMusic();
  for (const type of GESTURES) window.removeEventListener(type, startOnFirstGesture);
}
// iOS Safari only unlocks media inside touchend/click, not pointerdown.
const GESTURES = ['pointerdown', 'touchend', 'click', 'keydown'] as const;
for (const type of GESTURES) window.addEventListener(type, startOnFirstGesture);

// In the Electron app autoplay is allowed, so this starts the music right
// away; in a browser it's rejected silently and the gesture listener above
// takes over.
applyMusic();
