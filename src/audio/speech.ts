import type { Lang, Strings } from '../i18n/strings';

// Reads text aloud for children who can't read yet (the Academy, the crew
// Navigator). {math} markers and the symbols are spoken as words.
export function speak(text: string, lang: Lang, words: Strings['academy']['speakWords']) {
  try {
    const synth = window.speechSynthesis;
    if (!synth) return;
    synth.cancel();
    const spoken = text
      .replace(/[{}]/g, '')
      .replace(/×/g, ` ${words.times} `)
      .replace(/\+/g, ` ${words.plus} `)
      .replace(/=/g, ` ${words.equals} `)
      .replace(/[🎓🔊]/gu, '');
    const u = new SpeechSynthesisUtterance(spoken);
    u.lang = lang === 'he' ? 'he-IL' : 'en-US';
    u.rate = 0.88;
    u.pitch = 1.08;
    synth.speak(u);
  } catch {
    // no speech synthesis on this device — the text is still on screen
  }
}
