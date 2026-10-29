import type { CSSProperties } from 'react';
import { useT, useLang } from '../../i18n/useLang';
import { useGameStore } from '../../game/useGameStore';
import { useAchievements, useRank } from '../../game/useAchievements';
import { BADGES, RANK_ICONS, RANK_THRESHOLDS } from '../../game/achievements';
import { masteryCellStyle, masterySummary } from '../../game/masteryStats';
import { dayNumber } from '../../game/memory';
import { MISSION_SYMBOL, opsOf, pairKey } from '../../game/mission';
import { pilotName, useMission, useProfiles } from '../../profiles/useProfiles';
import { isTouchDevice, useSettings } from '../../settings/useSettings';
import { canFeel } from '../../audio/haptics';
import { useAudio } from '../../audio/useAudio';
import { missionName, shipName } from '../../i18n/strings';
import { BadgeArt } from '../badges/BadgeArt';
import { useGameModes } from '../useGameModes';
import Counter from '../reactbits/Counter';
import { SCREEN_BY_ID, type HotspotId, type ScreenId } from './screens';

export { WindscreenFace } from './WindscreenHud';

// What each of the cockpit's screens shows on the wall, live, before it's
// zoomed into (its page, Panel.tsx, opens then): a glowing glass display in
// the screen's own colour, its name across the top, and the gist of what's
// behind it: the pilot and their level, their rank and how many badges, the
// sound's levels bouncing, the ship's switches lit or dark, the practice map
// in miniature, the game modes. They're drawn on the screens with CSS 3D
// (css3d.ts), so they turn and zoom with the cockpit.

const NUMBERS = Array.from({ length: 10 }, (_, i) => i + 1);

function PilotFace() {
  const t = useT();
  const profile = useProfiles((s) => s.profiles.find((p) => p.id === s.activeId));
  const mission = useMission();
  const level = useGameStore((s) => s.progress.level);
  const correct = useGameStore((s) => s.progress.totalCorrectAnswers);
  const best = useGameStore((s) => s.progress.bestStreak);
  return (
    <div className="ck3-pv-pilot">
      <div className="ck3-avatar-ring" aria-hidden>
        <i />
        <span>{profile?.avatar ?? '🙂'}</span>
      </div>
      <div className="ck3-pv-col">
        <div className="ck3-big" dir="auto">
          {pilotName(profile, t.defaultPilotName)}
        </div>
        <div className="ck3-chip">
          <b dir="ltr">{MISSION_SYMBOL[mission]}</b> {missionName(t, mission)}
        </div>
        <div className="ck3-line">
          {t.deck.levelN(level)} · {shipName(t, profile?.ship ?? 'classic')}
        </div>
        <div className="ck3-stats" dir="ltr">
          <span>✓ {correct}</span>
          <span>🔥 {best}</span>
        </div>
      </div>
    </div>
  );
}

function BadgesFace() {
  const tb = useT().badges;
  const rank = useRank();
  const earned = useAchievements((s) => Object.keys(s.earned).length);
  const fresh = useAchievements((s) => s.unseen.length > 0);
  const start = RANK_THRESHOLDS[rank] ?? 0;
  const next = RANK_THRESHOLDS[rank + 1];
  const fill = next === undefined ? 1 : Math.min(1, (earned - start) / Math.max(1, next - start));
  return (
    <div className="ck3-pv-badges">
      <div className="ck3-rank-art">
        <BadgeArt name={`rank-${rank}`} icon={RANK_ICONS[rank]} size={104} />
        {fresh && <span className="ck3-new">{tb.isNew}</span>}
      </div>
      <div className="ck3-pv-col">
        <div className="ck3-big">{tb.ranks[rank]}</div>
        <div className="ck3-bar" aria-hidden>
          <span style={{ width: `${Math.round(fill * 100)}%` }} />
        </div>
        <div className="ck3-line">{tb.earnedCount(earned, BADGES.length)}</div>
      </div>
    </div>
  );
}

/** a level meter: its bars bouncing, as high as the volume lets them */
export function Meter({ level, icon, name }: { level: number; icon: string; name: string }) {
  return (
    <div className="ck3-meter" style={{ '--level': level } as CSSProperties}>
      <div className="ck3-meter-bars" aria-hidden>
        {Array.from({ length: 9 }, (_, i) => (
          <i key={i} style={{ animationDuration: `${0.45 + ((i * 37) % 23) / 40}s`, animationDelay: `${-((i * 53) % 17) / 20}s` }} />
        ))}
      </div>
      <div className="ck3-meter-name">
        {icon} {name}
      </div>
      <div className="ck3-meter-value" dir="ltr">
        {Math.round(level * 100)}%
      </div>
    </div>
  );
}

function SoundFace() {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const music = useAudio((s) => s.musicVolume);
  const effects = useAudio((s) => s.effectsVolume);
  return (
    <div className="ck3-pv-sound">
      <Meter level={music} icon="🎵" name={t.deck.music} />
      <Meter level={effects} icon="✨" name={t.deck.effects} />
      <div className="ck3-lang" dir="ltr">
        <span className={lang === 'en' ? 'is-on' : ''}>EN</span>
        <span className={lang === 'he' ? 'is-on' : ''}>עב</span>
      </div>
    </div>
  );
}

function SystemsFace() {
  const t = useT();
  const answerMode = useSettings((s) => s.answerMode);
  const orbie = useSettings((s) => s.orbie);
  const review = useSettings((s) => s.mistakeReview);
  const vibration = useSettings((s) => s.vibration);
  const boost = useProfiles((s) => s.profiles.find((p) => p.id === s.activeId)?.timedBoost !== false);
  const rows = [
    { name: t.deck.answers, on: true, value: answerMode === 'type' ? t.modeType : t.modeChoice },
    { name: t.orbieLabel, on: orbie },
    { name: t.mistakeReviewLabel, on: review },
    { name: t.timedBoostLabel, on: boost },
    ...(canFeel ? [{ name: t.vibrationLabel, on: vibration }] : []),
  ];
  return (
    <ul className="ck3-pv-systems">
      {rows.map((r) => (
        <li key={r.name} className={r.on ? 'is-on' : ''}>
          <i aria-hidden />
          <span>{r.name}</span>
          <b>{'value' in r ? r.value : r.on ? t.on : t.off}</b>
        </li>
      ))}
    </ul>
  );
}

function MapFace() {
  const t = useT();
  const mission = useMission();
  const mastery = useGameStore((s) => s.progress.mastery);
  const day = dayNumber();
  const summary = masterySummary(mastery, mission, day);
  const total = summary.mastered + summary.fading + summary.practice + summary.untried;
  const op = opsOf(mission)[0];
  return (
    <div className="ck3-pv-map">
      <div className="ck3-minimap" dir="ltr" aria-hidden>
        {NUMBERS.map((x) =>
          NUMBERS.map((y) => {
            // (subtraction's grid is the table read backwards: x taken from x + y)
            const { background } = masteryCellStyle(mastery[op === 'sub' ? pairKey(op, x + y, x) : pairKey(op, x, y)], day);
            return <i key={`${x}-${y}`} style={{ background }} />;
          }),
        )}
      </div>
      <div className="ck3-pv-col">
        <div className="ck3-huge" dir="ltr">
          <Counter value={summary.mastered} fontSize={64} textColor="currentColor" fontWeight={800} intro={false} />
          <small>/{total}</small>
        </div>
        <div className="ck3-line">{t.deck.mastered(summary.mastered, total)}</div>
        <ul className="ck3-legend">
          <li className="is-mastered">{t.deck.legend.mastered}</li>
          <li className="is-fading">{t.deck.legend.fading}</li>
          <li className="is-practice">{t.deck.legend.practice}</li>
        </ul>
      </div>
    </div>
  );
}

function ModesFace() {
  const { modes } = useGameModes();
  return (
    <ul className="ck3-pv-modes">
      {modes.map((m, i) => (
        <li key={m.key} className={`${m.disabled ? 'is-off' : ''} is-${m.key}`} style={{ animationDelay: `${i * 0.9}s` }}>
          <span className="ck3-pv-mode-icon">{m.icon}</span>
          <b>{m.name}</b>
          {m.disabled && <em aria-hidden>🔒</em>}
        </li>
      ))}
    </ul>
  );
}

const FACES: Record<ScreenId, () => React.JSX.Element> = {
  pilot: PilotFace,
  badges: BadgesFace,
  sound: SoundFace,
  systems: SystemsFace,
  map: MapFace,
  modes: ModesFace,
};

export function ScreenFace({ id, lit, open, rtl }: { id: ScreenId; lit: boolean; open: boolean; rtl: boolean }) {
  const t = useT();
  const spot = SCREEN_BY_ID[id];
  const Body = FACES[id];
  return (
    <div className={`ck3-display ck3-target ${lit ? 'is-lit' : ''} ${open ? 'is-open' : ''}`} style={{ '--glow': spot.glow } as CSSProperties} dir={rtl ? 'rtl' : 'ltr'}>
      <header className="ck3-display-head">
        <span className="ck3-display-icon" aria-hidden>
          {spot.icon}
        </span>
        <span className="ck3-display-title">{t.deck.screens[id]}</span>
        <span className="ck3-display-live" aria-hidden>
          <i />
          {t.deck.live}
        </span>
      </header>
      <div className="ck3-display-body">
        <Body />
      </div>
      <footer className="ck3-display-foot">
        <span aria-hidden>▸▸</span> {isTouchDevice ? t.deck.tapToOpen : t.deck.clickToOpen}
      </footer>
      <span className="ck3-display-scan" aria-hidden />
      <span className="ck3-display-glare" aria-hidden />
    </div>
  );
}

/** a part of the cockpit that does something when touched: an invisible pad on it, ringed when it's under the hand */
export function HotspotFace({ id }: { id: HotspotId }) {
  const t = useT().deck;
  const label = id === 'stick' ? t.stick : id === 'manual' ? t.manual : id === 'overhead' ? t.overhead : id === 'boost' ? t.boost : t.remote;
  return (
    <button type="button" className={`ck3-pad ck3-target is-${id}`} aria-label={label}>
      <span className="ck3-pad-ring" aria-hidden />
    </button>
  );
}
