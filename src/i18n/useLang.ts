import { create } from 'zustand';
import { STRINGS, type Lang, type Strings } from './strings';
import { guessLang } from './guessLang';

const STORAGE_KEY = 'multiplication-rocket:lang';

/** the language the device suggests: the ones it reads, and where its clock says it is */
function deviceLang(): Lang {
  let zone: string | undefined;
  try {
    zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    // no time zone: by the languages alone
  }
  const languages = navigator.languages?.length ? navigator.languages : [navigator.language ?? ''];
  return guessLang(languages, zone);
}

/** the one chosen before, or else the device's */
function initialLang(): { lang: Lang; chosen: boolean } {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'he') return { lang: saved, chosen: true };
  } catch {
    // storage blocked — fall through to the device's language
  }
  return { lang: deviceLang(), chosen: false };
}

function applyToDocument(lang: Lang) {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr';
}

interface LangState {
  lang: Lang;
  /** chosen (and kept), rather than guessed from the device */
  chosen: boolean;
  toggle: () => void;
}

export const useLang = create<LangState>((set, get) => {
  const { lang, chosen } = initialLang();
  applyToDocument(lang);
  return {
    lang,
    chosen,
    toggle: () => {
      const next: Lang = get().lang === 'he' ? 'en' : 'he';
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // non-persistent is fine
      }
      applyToDocument(next);
      set({ lang: next, chosen: true });
    },
  };
});

export function useT(): Strings {
  return STRINGS[useLang((s) => s.lang)];
}
