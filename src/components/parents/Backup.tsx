import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '../../i18n/useLang';
import { pilotName, useProfiles } from '../../profiles/useProfiles';
import { MISSION_SYMBOL } from '../../game/mission';
import {
  backupPilots,
  backupPilotStats,
  inIosBrowser,
  lastBackupAt,
  parseBackup,
  restoreBackup,
  saveBackupFile,
  storageKept,
  type Backup,
} from '../../storage/backup';

// Saving and restoring backups (storage/backup.ts): a card on the parent
// dashboard, and the restore dialog it opens (the welcome screen opens it
// too, on a device with no pilots yet).

const dateOf = (at: number) => {
  const d = new Date(at);
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
};

export function BackupCard() {
  const t = useT().backup;
  const [last, setLast] = useState(lastBackupAt);
  const [justSaved, setJustSaved] = useState(false);
  const [kept, setKept] = useState<boolean | null>(null);
  const [restoring, setRestoring] = useState(false);
  useEffect(() => {
    void storageKept().then(setKept);
  }, []);

  const save = async () => {
    if (!(await saveBackupFile())) return;
    setLast(lastBackupAt());
    setJustSaved(true);
  };

  return (
    <section className="pd-card pd-backup">
      <h3 className="pd-card-title">{t.title}</h3>
      <p className="pd-backup-intro">{t.intro}</p>
      <div className="pd-backup-buttons">
        <button type="button" className="pd-button is-primary" onClick={save}>
          {t.save}
        </button>
        <button type="button" className="pd-button" onClick={() => setRestoring(true)}>
          {t.restore}
        </button>
      </div>
      <p className="pd-muted">{justSaved ? t.saved : last ? t.lastSaved(dateOf(last)) : t.never}</p>
      {kept !== null && <p className="pd-muted">{kept ? t.kept : t.notKept}</p>}
      {inIosBrowser() && <p className="pd-backup-tip">{t.iosTip}</p>}
      {restoring && <RestoreDialog onClose={() => setRestoring(false)} />}
    </section>
  );
}

/** pick a backup file, tick the pilots to bring back, and restore them (the game reloads with them) */
export function RestoreDialog({ onClose }: { onClose: () => void }) {
  const all = useT();
  const t = all.backup;
  const here = useProfiles((s) => s.profiles);
  const input = useRef<HTMLInputElement>(null);
  const [backup, setBackup] = useState<Backup | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [bad, setBad] = useState(false);
  const [failed, setFailed] = useState(false);
  const pilots = backup ? backupPilots(backup) : [];

  const read = async (file: File | undefined) => {
    if (!file) return;
    const b = parseBackup(await file.text().catch(() => ''));
    const found = b ? backupPilots(b) : [];
    setBad(found.length === 0);
    setBackup(found.length ? b : null);
    setPicked(found.map((p) => p.id));
    setFailed(false);
  };
  const restore = () => {
    if (!backup) return;
    if (restoreBackup(backup, picked)) window.location.reload();
    else setFailed(true);
  };
  const pick = () => {
    if (input.current) input.current.value = '';
    input.current?.click();
  };

  return createPortal(
    <div className="settings-backdrop backup-backdrop" onClick={onClose}>
      <div className="settings-sheet backup-sheet" role="dialog" aria-modal="true" aria-label={t.restoreTitle} onClick={(e) => e.stopPropagation()}>
        <h2 className="settings-title">📂 {t.restoreTitle}</h2>
        <input ref={input} type="file" accept=".json,application/json" hidden onChange={(e) => void read(e.target.files?.[0])} />
        {backup ? (
          <>
            <p className="backup-from">{t.from(dateOf(backup.savedAt))}</p>
            <div className="profile-label">{t.which}</div>
            <ul className="backup-pilots">
              {pilots.map((p) => {
                const stats = backupPilotStats(backup, p);
                const on = picked.includes(p.id);
                const replaces = here.some((h) => h.id === p.id);
                return (
                  <li key={p.id}>
                    <label className={`backup-pilot ${on ? 'is-on' : ''}`}>
                      <input type="checkbox" checked={on} onChange={() => setPicked(on ? picked.filter((id) => id !== p.id) : [...picked, p.id])} />
                      <span className="backup-pilot-avatar">{p.avatar}</span>
                      <span className="backup-pilot-text">
                        <span className="backup-pilot-name" dir="auto">
                          {pilotName(p, all.defaultPilotName)}
                        </span>
                        <span className="backup-pilot-stats">
                          <span className={`pilot-card-mission is-${p.mission ?? 'mul'}`}>{MISSION_SYMBOL[p.mission ?? 'mul']}</span> {all.level(stats.level)} · ✓ {stats.correct}
                        </span>
                        <span className={`backup-pilot-note ${replaces ? 'is-replace' : ''}`}>{replaces ? t.replaces : t.adds}</span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
            {failed && <div className="ac-wrong">{t.failed}</div>}
            <button type="button" className="profile-primary" disabled={picked.length === 0} onClick={restore}>
              {t.go}
            </button>
            <button type="button" className="profile-secondary" onClick={pick}>
              {t.pick}
            </button>
          </>
        ) : (
          <>
            <button type="button" className="profile-primary" onClick={pick}>
              {t.pick}
            </button>
            {bad && <div className="ac-wrong">{t.bad}</div>}
          </>
        )}
        <button type="button" className="profile-secondary" onClick={onClose}>
          {t.cancel}
        </button>
      </div>
    </div>,
    document.body,
  );
}
