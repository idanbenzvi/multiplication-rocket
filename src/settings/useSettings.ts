import { create } from 'zustand';

export type AnswerMode = 'type' | 'choice';

const STORAGE_KEY = 'multiplication-rocket:settings';

/** true on phones/tablets: the primary pointer is a finger, not a mouse */
export const isTouchDevice = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;

function load(): { answerMode: AnswerMode } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { answerMode?: string };
      if (parsed.answerMode === 'type' || parsed.answerMode === 'choice') return { answerMode: parsed.answerMode };
    }
  } catch {
    // storage blocked — use the default
  }
  // Tapping one of four answers is the natural default on a tablet; typing
  // (with a real keyboard) on a computer.
  return { answerMode: isTouchDevice ? 'choice' : 'type' };
}

interface SettingsState {
  answerMode: AnswerMode;
  setAnswerMode: (mode: AnswerMode) => void;
}

export const useSettings = create<SettingsState>((set) => ({
  ...load(),
  setAnswerMode: (answerMode) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ answerMode }));
    } catch {
      // non-persistent is fine
    }
    set({ answerMode });
  },
}));
