import { create } from 'zustand';
import { STRINGS, type Lang, type Strings } from './strings';

const STORAGE_KEY = 'multiplication-rocket:lang';

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'he') return saved;
  } catch {
    // storage blocked — fall through to the browser language
  }
  return navigator.language?.toLowerCase().startsWith('he') ? 'he' : 'en';
}

function applyToDocument(lang: Lang) {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr';
}

interface LangState {
  lang: Lang;
  toggle: () => void;
}

export const useLang = create<LangState>((set, get) => {
  const lang = initialLang();
  applyToDocument(lang);
  return {
    lang,
    toggle: () => {
      const next: Lang = get().lang === 'he' ? 'en' : 'he';
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // non-persistent is fine
      }
      applyToDocument(next);
      set({ lang: next });
    },
  };
});

export function useT(): Strings {
  return STRINGS[useLang((s) => s.lang)];
}
