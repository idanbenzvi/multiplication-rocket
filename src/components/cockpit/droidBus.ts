// What the cockpit's droids (Droid.tsx) react to: the dashboard tells them
// as its settings change. The sound droid answers to the music and the
// effects, the switch droid to the switches, the language and the rest.

export type DroidMood = 'music' | 'effects' | 'happy' | 'sleepy' | 'buzz' | 'hello' | 'scared' | 'cheer';

export interface Emote {
  who: 'sound' | 'switch' | 'both';
  mood: DroidMood;
  /** how loud (0..1), for the sound droid's waves */
  level?: number;
  /** what it says, in a speech bubble */
  word?: string;
}

const listeners = new Set<(e: Emote) => void>();

export function emote(e: Emote) {
  for (const l of listeners) l(e);
}

export function onEmote(l: (e: Emote) => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
