import { create } from 'zustand';

export type AnswerMode = 'type' | 'choice';
/** typed answers: judged as soon as enough digits are in, or only on confirm (Enter / tap) */
export type TypedCheck = 'auto' | 'confirm';

const STORAGE_KEY = 'multiplication-rocket:settings';

/** true on phones/tablets: the primary pointer is a finger, not a mouse */
export const isTouchDevice = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;

interface Saved {
  answerMode: AnswerMode;
  typedCheck: TypedCheck;
  /** open the practice map automatically after a run of mistakes */
  mistakeReview: boolean;
  /** phone/tablet vibration feedback (where the device supports it) */
  vibration: boolean;
}

function defaults(): Saved {
  return {
    // Tapping one of four answers is the natural default on a tablet; typing
    // (with a real keyboard) on a computer.
    answerMode: isTouchDevice ? 'choice' : 'type',
    // On a computer you finish with Enter (and can fix a typo first); on a
    // tablet the on-screen keypad checks right away unless changed.
    typedCheck: isTouchDevice ? 'auto' : 'confirm',
    mistakeReview: false,
    vibration: true,
  };
}

function load(): Saved {
  const base = defaults();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<Saved>;
    return {
      answerMode: parsed.answerMode === 'type' || parsed.answerMode === 'choice' ? parsed.answerMode : base.answerMode,
      typedCheck: parsed.typedCheck === 'auto' || parsed.typedCheck === 'confirm' ? parsed.typedCheck : base.typedCheck,
      mistakeReview: typeof parsed.mistakeReview === 'boolean' ? parsed.mistakeReview : base.mistakeReview,
      vibration: typeof parsed.vibration === 'boolean' ? parsed.vibration : base.vibration,
    };
  } catch {
    return base; // storage blocked
  }
}

interface SettingsState extends Saved {
  setAnswerMode: (mode: AnswerMode) => void;
  setTypedCheck: (check: TypedCheck) => void;
  setMistakeReview: (on: boolean) => void;
  setVibration: (on: boolean) => void;
}

export const useSettings = create<SettingsState>((set, get) => {
  const update = (patch: Partial<Saved>) => {
    set(patch);
    const { answerMode, typedCheck, mistakeReview, vibration } = get();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ answerMode, typedCheck, mistakeReview, vibration }));
    } catch {
      // non-persistent is fine
    }
  };
  return {
    ...load(),
    setAnswerMode: (answerMode) => update({ answerMode }),
    setTypedCheck: (typedCheck) => update({ typedCheck }),
    setMistakeReview: (mistakeReview) => update({ mistakeReview }),
    setVibration: (vibration) => update({ vibration }),
  };
});
