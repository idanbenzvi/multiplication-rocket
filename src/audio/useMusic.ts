import { create } from 'zustand';

const STORAGE_KEY = 'multiplication-rocket:music';
const VOLUME = 0.35;

// Relative to the page, so it resolves both on a web server and from the
// Electron app's file:// URL.
const audio = new Audio('./audio/theme.mp3');
audio.loop = true;
audio.volume = VOLUME;

function initialOn(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

interface MusicState {
  on: boolean;
  toggle: () => void;
}

export const useMusic = create<MusicState>((set, get) => ({
  on: initialOn(),
  toggle: () => {
    const next = !get().on;
    try {
      localStorage.setItem(STORAGE_KEY, next ? 'on' : 'off');
    } catch {
      // non-persistent is fine
    }
    set({ on: next });
    if (next) void audio.play().catch(() => {});
    else audio.pause();
  },
}));

// Browsers block autoplay until the player interacts with the page, so the
// music starts on the first click/keypress rather than on load.
function startOnFirstGesture() {
  if (useMusic.getState().on) void audio.play().catch(() => {});
  window.removeEventListener('pointerdown', startOnFirstGesture);
  window.removeEventListener('keydown', startOnFirstGesture);
}
window.addEventListener('pointerdown', startOnFirstGesture);
window.addEventListener('keydown', startOnFirstGesture);

// In the Electron app autoplay is allowed, so this starts the music right
// away; in a browser it's rejected silently and the gesture listener above
// takes over.
if (useMusic.getState().on) void audio.play().catch(() => {});
