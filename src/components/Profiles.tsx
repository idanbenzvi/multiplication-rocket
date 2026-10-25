import { useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { AVATARS, MAX_NAME_LENGTH, pilotName, profileStats, useProfiles, type Profile } from '../profiles/useProfiles';
import { MISSION_SYMBOL, PILOT_MISSIONS, type PilotMission } from '../game/mission';
import { useGameStore } from '../game/useGameStore';
import { switchMission } from '../game/switchMission';
import { useLang, useT } from '../i18n/useLang';
import { missionHint, missionName, shipName } from '../i18n/strings';
import GradientText from './reactbits/GradientText';
import { RestoreDialog } from './parents/Backup';
import { useHangar } from '../profiles/useHangar';
import { useBack } from '../native/back';
import { useAdmiral } from '../game/useAchievements';
import { colorForLevel } from './scene/palette';
import { BayScreen } from './bay/BayScreen';
import { BayShip } from './bay/useBay';
import { haptics } from '../audio/haptics';
import { usePageRequest } from './pages';

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
  /** the welcome screen, on a device with no pilots yet: bring them over from a backup instead */
  onRestore?: () => void;
}

function ProfileEditor({ profile, title, onDone, onCancel, onRestore }: EditorProps) {
  const t = useT();
  const create = useProfiles((s) => s.create);
  const update = useProfiles((s) => s.update);
  const remove = useProfiles((s) => s.remove);
  const profiles = useProfiles((s) => s.profiles);
  const activeId = useProfiles((s) => s.activeId);
  const [name, setName] = useState(profile?.name ?? '');
  const taken = new Set(profiles.filter((p) => p.id !== profile?.id).map((p) => p.avatar));
  const [avatar, setAvatar] = useState(profile?.avatar ?? AVATARS.find((a) => !taken.has(a)) ?? AVATARS[0]);
  // a new pilot chooses; an existing one (even from before missions) has one
  const [mission, setMission] = useState<PilotMission | null>(profile ? (profile.mission ?? 'mul') : null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // (changed in the hangar, over this editor)
  const ship = useProfiles((s) => s.profiles.find((p) => p.id === profile?.id)?.ship);
  const canSave = name.trim().length > 0 && mission !== null;
  // in the launch bay, the pilot's ship stands on the pad with them at its window (a new pilot's, the classic rocket)
  const padShip = useContext(BayShip);
  const [level] = useState(() => (profile ? profileStats(profile.id).level : 1));
  const admiral = useAdmiral() && !!profile && profile.id === activeId;
  useEffect(() => {
    padShip?.({ ship: ship ?? 'classic', accent: colorForLevel(level), admiral, avatar });
  }, [padShip, ship, level, admiral, avatar]);
  useEffect(() => () => padShip?.(undefined), [padShip]);

  const save = () => {
    if (!canSave) return;
    if (profile) {
      update(profile.id, { name, avatar });
      // the other mission has its own journey: set off in it (game/switchMission.ts)
      switchMission(profile.id, mission);
    } else {
      create(name, avatar, mission);
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
      {/* (in parts: across a phone on its side, the pilot and their ship on one side, their animal and the buttons on the other) */}
      <div className="profile-part is-who">
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
        <div className="profile-label">{t.pickMission}</div>
        <div className="mission-options" role="radiogroup" aria-label={t.pickMission}>
          {PILOT_MISSIONS.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mission === m}
              className={`mission-option is-${m} ${mission === m ? 'is-on' : ''}`}
              onClick={() => setMission(m)}
            >
              <span className="mission-option-symbol">{MISSION_SYMBOL[m]}</span>
              <span className="mission-option-name">{missionName(t, m)}</span>
              <span className="mission-option-hint">{missionHint(t, m)}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="profile-part is-look">
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
      </div>
      {profile && (
        <div className="profile-part is-ship">
          <div className="profile-label">{t.hangar.label}</div>
          <button type="button" className="profile-secondary profile-ship" onClick={() => useHangar.getState().open(profile.id)}>
            🚀 {shipName(t, ship ?? 'classic')} · {t.hangar.change}
          </button>
        </div>
      )}
      <div className="profile-part is-go">
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
        {onRestore && (
          <button type="button" className="profile-restore-link" onClick={onRestore}>
            {t.backup.link}
          </button>
        )}
      </div>
    </div>
  );
}

// ---------- pick a pilot ----------

/** at most this many rows of pilots on a page */
const MAX_ROWS = 3;
/** the page dots and arrows under them, and the space above them (px, as in App.css), when there's more than a page */
const PAGER_SPACE = 52;
/** how far a swipe across the pilots must go to turn the page (px), and how soon after it a click is the swipe's own (ms) */
const SWIPE = 40;
const SWIPE_CLICK_MS = 400;

interface PageFit {
  cols: number;
  rows: number;
  /** a pilot's tile, and the space between them (px) */
  tile: number;
  gap: number;
}

/**
 * How many pilots fit on a page: as many columns as the grid makes, and as
 * many rows as fit the card's screen (beside the pad or over the bay) with
 * everything else on the card, and the page dots if they're needed.
 */
function usePageFit(pages: React.RefObject<HTMLDivElement | null>, tiles: number): PageFit {
  const [fit, setFit] = useState<PageFit>({ cols: 2, rows: 2, tile: 0, gap: 0 });
  useLayoutEffect(() => {
    const box = pages.current;
    const host = box?.closest<HTMLElement>('.bay-card-host');
    const card = box?.closest<HTMLElement>('.bay-card');
    if (!box || !host || !card) return;
    const measure = () => {
      const grid = box.querySelector<HTMLElement>('.pilot-cards');
      const first = box.querySelector<HTMLElement>('.pilot-card');
      if (!grid || !first) return;
      const g = getComputedStyle(grid);
      const cols = Math.max(1, g.gridTemplateColumns.split(' ').length);
      const gap = parseFloat(g.rowGap) || 0;
      const tile = first.offsetHeight;
      const h = getComputedStyle(host);
      const room = host.clientHeight - parseFloat(h.paddingTop) - parseFloat(h.paddingBottom);
      const pager = card.querySelector<HTMLElement>('.pilot-pager');
      // (all that's on the card but the pilots and the dots)
      const rest = card.offsetHeight - box.offsetHeight - (pager ? pager.offsetHeight + parseFloat(getComputedStyle(pager).marginTop) : 0);
      const rowsIn = (space: number) => Math.max(1, Math.min(MAX_ROWS, Math.floor((space + gap) / (tile + gap))));
      let rows = rowsIn(room - rest);
      if (tiles > cols * rows) rows = rowsIn(room - rest - PAGER_SPACE);
      setFit((f) => (f.cols === cols && f.rows === rows && f.tile === tile && f.gap === gap ? f : { cols, rows, tile, gap }));
    };
    measure();
    const watch = new ResizeObserver(measure);
    watch.observe(host);
    return () => watch.disconnect();
  }, [pages, tiles]);
  return fit;
}

// Who's flying: a tile for each pilot (✏️ to edit them) and one for a new
// pilot. More of them than fit the screen come in pages, turned with the
// arrows, the dots, a swipe across them or ← →.
function PilotPicker({ onPicked, onNew, onEdit }: { onPicked: () => void; onNew: () => void; onEdit: (p: Profile) => void }) {
  const t = useT();
  const rtl = useLang((s) => s.lang) === 'he';
  const calm = useReducedMotion();
  const profiles = useProfiles((s) => s.profiles);
  const activeId = useProfiles((s) => s.activeId);
  const select = useProfiles((s) => s.select);

  const pagesRef = useRef<HTMLDivElement>(null);
  const tiles = profiles.length + 1;
  const fit = usePageFit(pagesRef, tiles);
  const per = fit.cols * fit.rows;
  const pages = Math.max(1, Math.ceil(tiles / per));
  const [want, setWant] = useState(0);
  const page = Math.min(want, pages - 1);
  // which way the pages move: on, the next comes in from the end (the right, or in Hebrew the left)
  const [heading, setHeading] = useState<1 | -1>(1);
  const go = (next: number) => {
    if (next < 0 || next >= pages || next === page) return;
    setHeading(next > page ? 1 : -1);
    setWant(next);
    haptics.tick();
  };
  const goRef = useRef(go);
  useEffect(() => {
    goRef.current = go;
  });
  const pageRef = useRef(page);
  useEffect(() => {
    pageRef.current = page;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      goRef.current(pageRef.current + ((e.key === 'ArrowRight') !== rtl ? 1 : -1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rtl]);

  // a swipe across them turns the page (and isn't a tap on the pilot it started on: the click straight after it is let go)
  const swiped = useRef(0);

  const tile = (p: Profile) => {
    const stats = profileStats(p.id);
    // the other missions they've flown, each with its own level
    const others = PILOT_MISSIONS.filter((m) => m !== (p.mission ?? 'mul'))
      .map((m) => ({ m, s: profileStats(p.id, m) }))
      .filter(({ s }) => s.played);
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
            <span className={`pilot-card-mission is-${p.mission ?? 'mul'}`}>{MISSION_SYMBOL[p.mission ?? 'mul']}</span> {t.level(stats.level)} · ✓ {stats.correct}
          </span>
          {others.length > 0 && (
            <span className="pilot-card-others">
              {others.map(({ m, s }) => (
                <span key={m} title={missionName(t, m)}>
                  <span className={`pilot-card-mission is-${m}`}>{MISSION_SYMBOL[m]}</span> {t.level(s.level)}
                </span>
              ))}
            </span>
          )}
        </button>
        <button type="button" className="pilot-card-edit" onClick={() => onEdit(p)} aria-label={t.editPilot}>
          ✏️
        </button>
      </div>
    );
  };
  const shown = profiles.slice(page * per, page * per + per);
  const withNew = page === pages - 1;
  const slide = (calm ? 0 : 44) * heading * (rtl ? -1 : 1);

  // just the pilots: the ways to play together have their own 🎮 button (GameModes.tsx)
  return (
    <div className="pilot-picker">
      <GradientText className="profile-hero" colors={['#ffd77a', '#ff9d76', '#c9a4de', '#ffd77a']} animationSpeed={4}>
        {t.whosFlying}
      </GradientText>
      <div
        ref={pagesRef}
        className="pilot-pages"
        // (a page as tall as a full one, the last too, so the card doesn't jump about)
        style={pages > 1 && fit.tile ? { minHeight: fit.rows * fit.tile + (fit.rows - 1) * fit.gap } : undefined}
        onPointerDown={(e) => {
          const from = { x: e.clientX, y: e.clientY };
          swiped.current = 0;
          // (wherever it comes up: a mouse dragged off them too)
          const up = (u: PointerEvent) => {
            window.removeEventListener('pointerup', up);
            window.removeEventListener('pointercancel', cancel);
            const dx = u.clientX - from.x;
            if (Math.abs(dx) < SWIPE || Math.abs(dx) < Math.abs(u.clientY - from.y)) return;
            swiped.current = performance.now();
            goRef.current(pageRef.current + ((dx < 0) !== rtl ? 1 : -1));
          };
          const cancel = () => {
            window.removeEventListener('pointerup', up);
            window.removeEventListener('pointercancel', cancel);
          };
          window.addEventListener('pointerup', up);
          window.addEventListener('pointercancel', cancel);
        }}
        onClickCapture={(e) => {
          if (performance.now() - swiped.current > SWIPE_CLICK_MS) return;
          swiped.current = 0;
          e.stopPropagation();
          e.preventDefault();
        }}
      >
        <AnimatePresence initial={false} mode="popLayout" custom={slide}>
          <motion.div
            key={page}
            className="pilot-cards"
            custom={slide}
            variants={{ in: (x: number) => ({ opacity: 0, x }), shown: { opacity: 1, x: 0 }, out: (x: number) => ({ opacity: 0, x: -x }) }}
            initial="in"
            animate="shown"
            exit="out"
            transition={{ duration: 0.24, ease: 'easeOut' }}
          >
            {shown.map(tile)}
            {withNew && (
              <button type="button" className="pilot-card pilot-card-new" onClick={onNew}>
                <span className="pilot-card-avatar">＋</span>
                <span className="pilot-card-name">{t.newPilot}</span>
              </button>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
      {pages > 1 && (
        // (in the language's own order: in Hebrew the first page is on the right, and ‹ › point the other way)
        <div className="pilot-pager">
          <button type="button" className="pilot-page-turn" onClick={() => go(page - 1)} disabled={page === 0} aria-label={t.bay.pilotsPrevious}>
            ‹
          </button>
          <div className="pilot-page-dots">
            {Array.from({ length: pages }, (_, i) => (
              <button
                key={i}
                type="button"
                className={`pilot-page-dot ${i === page ? 'is-on' : ''}`}
                onClick={() => go(i)}
                aria-label={t.bay.pilotsPage(i + 1, pages)}
                aria-current={i === page || undefined}
              />
            ))}
          </div>
          <button type="button" className="pilot-page-turn" onClick={() => go(page + 1)} disabled={page === pages - 1} aria-label={t.bay.pilotsNext}>
            ›
          </button>
        </div>
      )}
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
  const [restoring, setRestoring] = useState(false);
  const active = profiles.find((p) => p.id === activeId);
  // a new pilot or an edit, from "Who's flying?": Back is its Cancel
  useBack(profiles.length > 0 && !!active?.name && !chosen && view.kind !== 'pick' && (() => setView({ kind: 'pick' })));

  let content: React.ReactNode = null;
  let sign = t.bay.whosFlying;
  if (profiles.length === 0) {
    sign = t.bay.welcome;
    content = (
      <>
        <ProfileEditor title={t.welcomePilot} onDone={() => setView({ kind: 'pick' })} onRestore={() => setRestoring(true)} />
        {restoring && <RestoreDialog onClose={() => setRestoring(false)} />}
      </>
    );
  } else if (active && !active.name) {
    sign = t.bay.welcome;
    content = <ProfileEditor profile={active} title={t.welcomePilot} onDone={() => setView({ kind: 'pick' })} />;
  } else if (!chosen) {
    sign = view.kind === 'new' ? t.bay.newPilot : view.kind === 'edit' ? t.bay.editPilot : t.bay.whosFlying;
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
  return (
    <BayScreen sign={sign} card label={sign}>
      {content}
    </BayScreen>
  );
}

// ---------- top-bar chip ----------

export function PilotButton() {
  const t = useT();
  const profiles = useProfiles((s) => s.profiles);
  const activeId = useProfiles((s) => s.activeId);
  const active = profiles.find((p) => p.id === activeId);
  const [view, setView] = useState<GateView | null>(null);
  const close = () => setView(null);
  // Back: the pilots again from a new one or an edit (their Cancel), and from the pilots, closed
  useBack(view && (view.kind === 'pick' ? close : () => setView({ kind: 'pick' })));
  // (the cockpit's pilot screen opens them too)
  usePageRequest('pilots', () => setView({ kind: 'pick' }));
  usePageRequest('editPilot', () => active && setView({ kind: 'edit', profile: active }));

  return (
    <>
      <button type="button" className="reset-button pilot-button" onClick={() => setView({ kind: 'pick' })} title={t.switchPilot}>
        <span className="pilot-button-avatar">{active?.avatar ?? '🙂'}</span>
        <span className="pilot-button-name" dir="auto">
          {pilotName(active, t.defaultPilotName)}
        </span>
      </button>
      {view && (
        <BayScreen sign={view.kind === 'new' ? t.bay.newPilot : view.kind === 'edit' ? t.bay.editPilot : t.bay.whosFlying} card label={t.switchPilot}>
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
        </BayScreen>
      )}
    </>
  );
}
