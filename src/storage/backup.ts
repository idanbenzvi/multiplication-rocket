import { Capacitor } from '@capacitor/core';
import { progressKeyFor, useProfiles, type Profile } from '../profiles/useProfiles';

// Keeping progress safe (docs/plans/2026-10-20-spaced-review.md). Everything
// the game saves lives in this browser only, and a browser can clear it:
// Safari does, for a website that isn't opened for 7 days. So the game asks
// the browser to keep its storage, and a parent can save it all to a backup
// file, and restore any of the pilots in one on this device or another.

const GAME = 'multiplication-rocket';
const PROFILES_KEY = `${GAME}:profiles`;
const SAVED_AT_KEY = `${GAME}:backup-saved`;
/** this device's own, never in a backup: when it last saved one, and the scratch progress from before a pilot exists */
const DEVICE_ONLY = [SAVED_AT_KEY, `${GAME}:progress:v1:unassigned`];
/** settings for the whole device: a restore takes them only for a device that has none yet */
const DEVICE_SETTINGS = [`${GAME}:settings`, `${GAME}:lang`, `${GAME}:audio`];

export interface Backup {
  game: typeof GAME;
  backup: 1;
  savedAt: number;
  /** every saved key of the game's, as stored */
  keys: Record<string, string>;
}

const isGameKey = (key: string) => key.startsWith(`${GAME}:`) && !DEVICE_ONLY.includes(key);

function gameKeys(): string[] {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && isGameKey(key)) keys.push(key);
  }
  return keys;
}

export function makeBackup(now = Date.now()): Backup {
  const keys: Record<string, string> = {};
  for (const key of gameKeys()) {
    const value = localStorage.getItem(key);
    if (value !== null) keys[key] = value;
  }
  return { game: GAME, backup: 1, savedAt: now, keys };
}

/** a backup file's contents, or null if it isn't one */
export function parseBackup(text: string): Backup | null {
  try {
    const parsed = JSON.parse(text) as Partial<Backup> | null;
    if (!parsed || parsed.game !== GAME || parsed.backup !== 1 || !parsed.keys || typeof parsed.keys !== 'object') return null;
    const keys: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed.keys)) if (isGameKey(key) && typeof value === 'string') keys[key] = value;
    return { game: GAME, backup: 1, savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : 0, keys };
  } catch {
    return null;
  }
}

/** the pilots in a backup */
export function backupPilots(backup: Backup): Profile[] {
  try {
    const saved = JSON.parse(backup.keys[PROFILES_KEY] ?? 'null') as { profiles?: unknown } | null;
    if (!Array.isArray(saved?.profiles)) return [];
    return (saved.profiles as Profile[]).filter((p) => p && typeof p.id === 'string' && p.id && typeof p.name === 'string');
  } catch {
    return [];
  }
}

/** a pilot's level and right answers in their mission, as the backup has them */
export function backupPilotStats(backup: Backup, pilot: Profile): { level: number; correct: number } {
  try {
    const p = JSON.parse(backup.keys[progressKeyFor(pilot.id, pilot.mission ?? 'mul')] ?? 'null') as { level?: number; totalCorrectAnswers?: number } | null;
    return { level: p?.level ?? 1, correct: p?.totalCorrectAnswers ?? 0 };
  } catch {
    return { level: 1, correct: 0 };
  }
}

/**
 * A saved key that's one pilot's: their id is one of its parts (progress,
 * answer history, badges, Black Sun…), or one of a crew's pair ("<a>+<b>").
 */
export function belongsTo(key: string, pilotId: string): boolean {
  return key.split(':').some((part) => part === pilotId || part.split('+').includes(pilotId));
}

/**
 * Writes the chosen pilots from a backup onto this device: each one replaces
 * the same pilot here (all of theirs goes first, so nothing old lingers) or
 * joins the pilots here; the others on this device are left as they are.
 * False if storage refused (full or blocked). The game has to reload after.
 */
export function restoreBackup(backup: Backup, pilotIds: string[]): boolean {
  const pilots = backupPilots(backup).filter((p) => pilotIds.includes(p.id));
  if (pilots.length === 0) return false;
  const theirs = (key: string) => pilots.some((p) => belongsTo(key, p.id));
  try {
    for (const key of gameKeys()) if (theirs(key)) localStorage.removeItem(key);
    for (const [key, value] of Object.entries(backup.keys)) if (theirs(key)) localStorage.setItem(key, value);
    for (const key of DEVICE_SETTINGS) {
      if (localStorage.getItem(key) === null && backup.keys[key] !== undefined) localStorage.setItem(key, backup.keys[key]);
    }
    const { profiles, activeId } = useProfiles.getState();
    const kept = profiles.map((p) => pilots.find((r) => r.id === p.id) ?? p);
    const next = [...kept, ...pilots.filter((r) => !profiles.some((p) => p.id === r.id))];
    const active = next.some((p) => p.id === activeId) ? activeId : pilots[0].id;
    localStorage.setItem(PROFILES_KEY, JSON.stringify({ profiles: next, activeId: active }));
    return true;
  } catch {
    return false;
  }
}

/** when this device last saved a backup */
export function lastBackupAt(): number | null {
  try {
    const at = Number(localStorage.getItem(SAVED_AT_KEY));
    return at > 0 ? at : null;
  } catch {
    return null;
  }
}

function dateStamp(at: number): string {
  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** the Android app: the file written to the app's cache and handed to Android's share sheet (Drive, Files, Mail…) */
async function shareFromApp(name: string, json: string): Promise<boolean> {
  const [{ Directory, Encoding, Filesystem }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')]);
  const { uri } = await Filesystem.writeFile({ path: name, data: json, directory: Directory.Cache, encoding: Encoding.UTF8 });
  try {
    await Share.share({ title: name, files: [uri] });
    return true;
  } catch {
    // the share sheet was closed without sending it anywhere
    return false;
  }
}

/** the Android app, where the game's storage is the app's own (it stays until the app is uninstalled) */
export const IN_APP = Capacitor.isNativePlatform();

/**
 * Saves a backup file: in the Android app and on a phone or tablet through
 * the share sheet (Save to Files, Drive, AirDrop, Mail…), elsewhere as a
 * download. False if it was cancelled. Call it straight from a tap: sharing
 * needs one.
 */
export async function saveBackupFile(): Promise<boolean> {
  const backup = makeBackup();
  const name = `${GAME}-backup-${dateStamp(backup.savedAt)}.json`;
  const saved = () => {
    try {
      localStorage.setItem(SAVED_AT_KEY, String(backup.savedAt));
    } catch {
      // ignore
    }
    return true;
  };
  if (IN_APP) return (await shareFromApp(name, JSON.stringify(backup))) && saved();
  const file = new File([JSON.stringify(backup)], name, { type: 'application/json' });
  if (window.matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return saved();
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return false;
      // sharing refused: download it instead
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return saved();
}

/** whether the browser has promised to keep the game's storage (null: it can't say) */
export async function storageKept(): Promise<boolean | null> {
  try {
    return navigator.storage?.persisted ? await navigator.storage.persisted() : null;
  } catch {
    return null;
  }
}

/**
 * Asks the browser to keep the game's storage instead of clearing it to make
 * room, once there's a pilot whose progress is worth keeping. Chrome and Edge
 * decide quietly; Firefox asks the user, once.
 */
export function keepStorageOncePiloted() {
  let asked = false;
  const ask = () => {
    if (asked || useProfiles.getState().profiles.length === 0) return;
    asked = true;
    void storageKept().then((kept) => {
      if (kept === false) navigator.storage.persist().catch(() => {});
    });
  };
  ask();
  if (!asked) {
    const stop = useProfiles.subscribe(() => {
      ask();
      if (asked) stop();
    });
  }
}

/** Safari on an iPad or iPhone, in the browser rather than from the Home Screen: it clears a website's storage after 7 days away */
export function inIosBrowser(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === false && navigator.maxTouchPoints > 1;
}
