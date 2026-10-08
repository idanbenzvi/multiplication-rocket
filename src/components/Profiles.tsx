import { useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { AVATARS, MAX_NAME_LENGTH, pilotName, profileStats, useProfiles, type Profile } from '../profiles/useProfiles';
import { useGameStore } from '../game/useGameStore';
import { useCrewStore } from '../game/useCrewStore';
import { useSkyStore } from '../game/useSkyStore';
import { useT } from '../i18n/useLang';
import GradientText from './reactbits/GradientText';

// After switching or creating a pilot, reload the game with their progress.
function startGameForActive() {
  useGameStore.getState().init();
}

// ---------- create / edit ----------

interface EditorProps {
  profile?: Profile; // edit mode when given
  title: string;
  onDone: () => void;
  onCancel?: () => void;
}

function ProfileEditor({ profile, title, onDone, onCancel }: EditorProps) {
  const t = useT();
  const create = useProfiles((s) => s.create);
  const update = useProfiles((s) => s.update);
  const remove = useProfiles((s) => s.remove);
  const profiles = useProfiles((s) => s.profiles);
  const activeId = useProfiles((s) => s.activeId);
  const [name, setName] = useState(profile?.name ?? '');
  const taken = new Set(profiles.filter((p) => p.id !== profile?.id).map((p) => p.avatar));
  const [avatar, setAvatar] = useState(profile?.avatar ?? AVATARS.find((a) => !taken.has(a)) ?? AVATARS[0]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const canSave = name.trim().length > 0;

  const save = () => {
    if (!canSave) return;
    if (profile) {
      update(profile.id, { name, avatar });
    } else {
      create(name, avatar);
      startGameForActive();
    }
    onDone();
  };

  const doDelete = () => {
    if (!profile) return;
    const wasActive = profile.id === activeId;
    remove(profile.id);
    if (wasActive) startGameForActive();
    onDone();
  };

  return (
    <div className="profile-editor">
      <h2 className="profile-title">{title}</h2>
      <div className="profile-preview">
        <span className="profile-avatar-big">{avatar}</span>
      </div>
      <label className="profile-label" htmlFor="pilot-name">
        {t.pilotNameLabel}
      </label>
      <input
        id="pilot-name"
        className="profile-name-input"
        dir="auto"
        value={name}
        maxLength={MAX_NAME_LENGTH}
        placeholder={t.pilotNamePlaceholder}
        autoComplete="off"
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && save()}
      />
      <div className="profile-label">{t.pickAnimal}</div>
      <div className="avatar-grid" role="radiogroup" aria-label={t.pickAnimal}>
        {AVATARS.map((a) => (
          <button
            key={a}
            type="button"
            role="radio"
            aria-checked={avatar === a}
            className={`avatar-option ${avatar === a ? 'is-on' : ''}`}
            onClick={() => setAvatar(a)}
          >
            {a}
          </button>
        ))}
      </div>
      <button type="button" className="profile-primary" onClick={save} disabled={!canSave}>
        {profile ? t.save : t.letsFly}
      </button>
      {onCancel && (
        <button type="button" className="profile-secondary" onClick={onCancel}>
          {t.cancel}
        </button>
      )}
      {profile &&
        (confirmDelete ? (
          <div className="profile-confirm">
            <span>{t.deletePilotConfirm(pilotName(profile, t.defaultPilotName))}</span>
            <div className="profile-confirm-buttons">
              <button type="button" className="settings-danger" onClick={doDelete}>
                {t.delete}
              </button>
              <button type="button" className="profile-secondary" onClick={() => setConfirmDelete(false)}>
                {t.cancel}
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="profile-delete-link" onClick={() => setConfirmDelete(true)}>
            {t.deletePilot}
          </button>
        ))}
    </div>
  );
}

// ---------- pick a pilot ----------

function PilotPicker({ onPicked, onNew, onEdit }: { onPicked: () => void; onNew: () => void; onEdit: (p: Profile) => void }) {
  const t = useT();
  const profiles = useProfiles((s) => s.profiles);
  const activeId = useProfiles((s) => s.activeId);
  const select = useProfiles((s) => s.select);

  return (
    <div className="pilot-picker">
      <GradientText className="profile-hero" colors={['#ffd77a', '#ff9d76', '#c9a4de', '#ffd77a']} animationSpeed={4}>
        {t.whosFlying}
      </GradientText>
      <div className="pilot-cards">
        {profiles.map((p) => {
          const stats = profileStats(p.id);
          return (
            <div key={p.id} className={`pilot-card ${p.id === activeId ? 'is-active' : ''}`}>
              <button
                type="button"
                className="pilot-card-main"
                onClick={() => {
                  const changed = p.id !== activeId;
                  select(p.id);
                  if (changed) startGameForActive();
                  onPicked();
                }}
              >
                <span className="pilot-card-avatar">{p.avatar}</span>
                <span className="pilot-card-name" dir="auto">
                  {pilotName(p, t.defaultPilotName)}
                </span>
                <span className="pilot-card-stats">
                  {t.level(stats.level)} · ✓ {stats.correct}
                </span>
              </button>
              <button type="button" className="pilot-card-edit" onClick={() => onEdit(p)} aria-label={t.editPilot}>
                ✏️
              </button>
            </div>
          );
        })}
        <button type="button" className="pilot-card pilot-card-new" onClick={onNew}>
          <span className="pilot-card-avatar">＋</span>
          <span className="pilot-card-name">{t.newPilot}</span>
        </button>
        {profiles.length >= 2 && (
          <button
            type="button"
            className="pilot-card pilot-card-new pilot-card-crew"
            onClick={() => {
              // leaves the startup gate too: the solo pilot stays whoever was active
              select(activeId ?? profiles[0].id);
              onPicked();
              useCrewStore.getState().openSetup();
            }}
          >
            <span className="pilot-card-avatar">👩‍🚀👨‍🚀</span>
            <span className="pilot-card-name">{t.crew.flyTogether}</span>
            <span className="pilot-card-stats">{t.crew.flyTogetherHint}</span>
          </button>
        )}
        {profiles.length >= 1 && (
          <button
            type="button"
            className="pilot-card pilot-card-new pilot-card-crew"
            onClick={() => {
              // the active pilot plays on this phone
              select(activeId ?? profiles[0].id);
              onPicked();
              useSkyStore.getState().openSky();
            }}
          >
            <span className="pilot-card-avatar">📱📱</span>
            <span className="pilot-card-name">{t.sky.card}</span>
            <span className="pilot-card-stats">{t.sky.cardHint}</span>
          </button>
        )}
      </div>
    </div>
  );
}

// ---------- the full-screen gate at startup ----------

type GateView = { kind: 'pick' } | { kind: 'new' } | { kind: 'edit'; profile: Profile };

// Blocks the game until there's a named pilot: the welcome screen on first
// launch (or to name a profile migrated from before profiles existed), and
// "Who's flying today?" at startup when the device has several pilots.
export function ProfileGate() {
  const t = useT();
  const profiles = useProfiles((s) => s.profiles);
  const activeId = useProfiles((s) => s.activeId);
  const chosen = useProfiles((s) => s.chosen);
  const [view, setView] = useState<GateView>({ kind: 'pick' });
  const active = profiles.find((p) => p.id === activeId);

  let content: React.ReactNode = null;
  if (profiles.length === 0) {
    content = <ProfileEditor title={t.welcomePilot} onDone={() => setView({ kind: 'pick' })} />;
  } else if (active && !active.name) {
    content = <ProfileEditor profile={active} title={t.welcomePilot} onDone={() => setView({ kind: 'pick' })} />;
  } else if (!chosen) {
    content =
      view.kind === 'new' ? (
        <ProfileEditor title={t.newPilot} onDone={() => setView({ kind: 'pick' })} onCancel={() => setView({ kind: 'pick' })} />
      ) : view.kind === 'edit' ? (
        <ProfileEditor profile={view.profile} title={t.editPilot} onDone={() => setView({ kind: 'pick' })} onCancel={() => setView({ kind: 'pick' })} />
      ) : (
        <PilotPicker onPicked={() => {}} onNew={() => setView({ kind: 'new' })} onEdit={(p) => setView({ kind: 'edit', profile: p })} />
      );
  }
  if (!content) return null;
  return <div className="profile-gate">{content}</div>;
}

// ---------- top-bar chip ----------

export function PilotButton() {
  const t = useT();
  const profiles = useProfiles((s) => s.profiles);
  const activeId = useProfiles((s) => s.activeId);
  const active = profiles.find((p) => p.id === activeId);
  const [view, setView] = useState<GateView | null>(null);
  const close = () => setView(null);

  return (
    <>
      <button type="button" className="reset-button pilot-button" onClick={() => setView({ kind: 'pick' })} title={t.switchPilot}>
        <span className="pilot-button-avatar">{active?.avatar ?? '🙂'}</span>
        <span className="pilot-button-name" dir="auto">
          {pilotName(active, t.defaultPilotName)}
        </span>
      </button>
      {createPortal(
        <AnimatePresence>
          {view && (
            <motion.div
              className="settings-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={close}
            >
              <motion.div
                className="settings-sheet profile-sheet"
                role="dialog"
                aria-modal="true"
                aria-label={t.switchPilot}
                initial={{ y: 40, opacity: 0, scale: 0.96 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                exit={{ y: 40, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                onClick={(e) => e.stopPropagation()}
              >
                {view.kind === 'pick' && (
                  <PilotPicker onPicked={close} onNew={() => setView({ kind: 'new' })} onEdit={(p) => setView({ kind: 'edit', profile: p })} />
                )}
                {view.kind === 'new' && <ProfileEditor title={t.newPilot} onDone={close} onCancel={() => setView({ kind: 'pick' })} />}
                {view.kind === 'edit' && (
                  <ProfileEditor profile={view.profile} title={t.editPilot} onDone={close} onCancel={() => setView({ kind: 'pick' })} />
                )}
                {view.kind === 'pick' && (
                  <button type="button" className="settings-close" onClick={close}>
                    {t.close}
                  </button>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
