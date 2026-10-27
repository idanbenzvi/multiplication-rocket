import type { Lang } from '../../i18n/strings';

// The story read aloud, by the browser's own voice (as the Academy's 🔊 is),
// a line at a time. A recorded voice can take its place later, line by line.

export function narrate(text: string, lang: Lang) {
  try {
    const synth = window.speechSynthesis;
    if (!synth) return;
    synth.cancel();
    // (a device with voices but none in the language would read it out as nonsense: the words are on screen)
    const voices = synth.getVoices();
    const ours = lang === 'he' ? ['he', 'iw'] : ['en'];
    if (voices.length && !voices.some((v) => ours.some((l) => v.lang.toLowerCase().startsWith(l)))) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang === 'he' ? 'he-IL' : 'en-US';
    u.rate = 0.92;
    u.pitch = 1.05;
    synth.speak(u);
  } catch {
    // (no voice on this device: the words are on screen)
  }
}

export function hush() {
  try {
    window.speechSynthesis?.cancel();
  } catch {
    // (nothing to hush)
  }
}

/** still reading */
export function speaking(): boolean {
  try {
    const synth = window.speechSynthesis;
    return !!synth && (synth.speaking || synth.pending);
  } catch {
    return false;
  }
}

/**
 * From a tap: a browser that only lets a page speak after one (Safari) lets
 * the story speak later, at its own moment, once it has spoken in a tap.
 */
export function primeVoice() {
  try {
    const synth = window.speechSynthesis;
    if (!synth || synth.speaking) return;
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    synth.speak(u);
  } catch {
    // (no voice)
  }
}
