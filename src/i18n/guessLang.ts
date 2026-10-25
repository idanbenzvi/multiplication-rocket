import type { Lang } from './strings';

// The game's language the first time it opens, before anyone's chosen one
// (useLang.ts): Hebrew for a device that reads it, or that's in Israel,
// English otherwise. It goes by what the device says of itself; nothing is
// asked of anyone else (where an address is would mean sending it somewhere).

const ISRAEL_ZONES = ['Asia/Jerusalem', 'Asia/Tel_Aviv', 'Israel'];

/** `languages`: the ones its user reads, in order (navigator.languages); `timeZone`: the one its clock is set to */
export function guessLang(languages: readonly string[], timeZone?: string): Lang {
  const tags = languages.map((l) => l.toLowerCase().split(/[-_]/));
  // Hebrew among them, first or not ('iw' is its old code, which some phones still give)
  if (tags.some(([lang]) => lang === 'he' || lang === 'iw')) return 'he';
  // in Israel: its clock, or its locale's region (en-IL)
  if (timeZone && ISRAEL_ZONES.includes(timeZone)) return 'he';
  if (tags.some(([, ...rest]) => rest.includes('il'))) return 'he';
  return 'en';
}
