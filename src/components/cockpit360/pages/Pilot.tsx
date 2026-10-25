import type { CSSProperties } from 'react';
import { useT } from '../../../i18n/useLang';
import { useGameStore } from '../../../game/useGameStore';
import { MISSION_SYMBOL, PILOT_MISSIONS, type PilotMission } from '../../../game/mission';
import { switchMission } from '../../../game/switchMission';
import { pilotName, useMission, useProfiles } from '../../../profiles/useProfiles';
import { missionStats } from '../../../storage/progressStore';
import { missionName, shipName } from '../../../i18n/strings';
import { useAdmiral } from '../../../game/useAchievements';
import { sfx } from '../../../audio/sfx';
import { colorForLevel } from '../../scene/palette';
import { ShipPicture } from '../../ShipPicture';
import Counter from '../../reactbits/Counter';
import StarBorder from '../../reactbits/StarBorder';
import { useCockpit } from '../store';

// The top left of the bank of screens on the left wall: who's flying, their
// mission and how far they've come, their ship turning slowly as a hologram
// with them at its window, their missions to switch between, and the way to
// the launch bay to switch pilot or change theirs (the pilots' own screens,
// opened by the top bar's pilot button: Profiles.tsx).

/**
 * The missions, side by side: each one's own level, and how many of its
 * facts are mastered (the facts are the pilot's, whichever mission they were
 * learned in: game/sharedFacts.ts). Picking another leaves the cockpit and
 * flies it, taking up its journey where the pilot left it.
 */
function Missions({ profileId }: { profileId: string }) {
  const t = useT();
  const current = useMission();
  const fly = (mission: PilotMission) => {
    if (mission === current) return;
    sfx.hyperdrive();
    // (out of the cockpit first: the music back, the game running, and then the new mission's start)
    useCockpit.getState().dismiss();
    switchMission(profileId, mission);
  };
  return (
    <section className="ck3-missions">
      <div className="ck3-missions-head">
        <h3 className="ck3-page-section">{t.deck.missions}</h3>
        <span className="ck3-field-hint">{t.deck.missionsHint}</span>
      </div>
      <div className="ck3-mission-row" role="radiogroup" aria-label={t.deck.missions}>
        {PILOT_MISSIONS.map((m) => {
          const s = missionStats(profileId, m);
          const on = m === current;
          const name = missionName(t, m);
          return (
            <button key={m} type="button" role="radio" aria-checked={on} className={`ck3-mission is-${m} ${on ? 'is-on' : ''}`} title={on ? undefined : t.deck.flyMission(name)} onClick={() => fly(m)}>
              <span className="ck3-mission-symbol" dir="ltr" aria-hidden>
                {MISSION_SYMBOL[m]}
              </span>
              <span className="ck3-mission-name">{name}</span>
              <span className="ck3-mission-level">{s.played || on ? t.deck.levelN(s.level) : t.deck.newMission}</span>
              <span className="ck3-mission-bar" style={{ '--k': s.facts ? s.mastered / s.facts : 0 } as CSSProperties} aria-hidden>
                <i />
              </span>
              <span className="ck3-mission-facts" dir="ltr" title={t.deck.mastered(s.mastered, s.facts)}>
                {s.mastered}/{s.facts}
              </span>
              {on && (
                <span className="ck3-mission-flying">
                  <i aria-hidden /> {t.deck.flyingNow}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function PilotPage({ onPilot }: { onPilot: (edit: boolean) => void }) {
  const t = useT();
  const profile = useProfiles((s) => s.profiles.find((p) => p.id === s.activeId));
  const mission = useMission();
  const level = useGameStore((s) => s.progress.level);
  const correct = useGameStore((s) => s.progress.totalCorrectAnswers);
  const best = useGameStore((s) => s.progress.bestStreak);
  const admiral = useAdmiral();
  return (
    <div className="ck3-page ck3-pilot">
      <div className="ck3-pilot-main">
        <div className="ck3-pilot-who">
          <div className="ck3-avatar-ring is-big" aria-hidden>
            <i />
            <span>{profile?.avatar ?? '🙂'}</span>
          </div>
          <div>
            <div className="ck3-pilot-name" dir="auto">
              {pilotName(profile, t.defaultPilotName)}
            </div>
            <div className="ck3-chip">
              <b dir="ltr">{MISSION_SYMBOL[mission]}</b> {missionName(t, mission)}
            </div>
            <div className="ck3-line">🚀 {shipName(t, profile?.ship ?? 'classic')}</div>
          </div>
        </div>
        <ul className="ck3-pilot-stats">
          <li>
            <b dir="ltr">
              <Counter value={level} fontSize={40} textColor="currentColor" fontWeight={800} />
            </b>
            <span>{t.deck.level}</span>
          </li>
          <li>
            <b dir="ltr">
              <Counter value={correct} fontSize={40} textColor="currentColor" fontWeight={800} />
            </b>
            <span>{t.deck.correctAnswers}</span>
          </li>
          <li>
            <b dir="ltr">
              <Counter value={best} fontSize={40} textColor="currentColor" fontWeight={800} />
            </b>
            <span>{t.deck.bestStreak}</span>
          </li>
        </ul>
        {profile && <Missions profileId={profile.id} />}
        <div className="ck3-page-buttons">
          <StarBorder className="ck3-star-button" color="#ffb35c" speed="5s" thickness={2} backgroundColor="#1d1208" textColor="#ffe2bd" borderColor="rgba(255, 179, 92, 0.45)" onClick={() => onPilot(false)}>
            🧑‍🚀 {t.deck.switchPilot}
          </StarBorder>
          <StarBorder className="ck3-star-button" color="#5cf2ff" speed="6s" thickness={2} backgroundColor="#071a1d" textColor="#cff9ff" borderColor="rgba(92, 242, 255, 0.4)" onClick={() => onPilot(true)}>
            ✏️ {t.deck.editPilot}
          </StarBorder>
        </div>
      </div>
      <div className="ck3-holo" aria-hidden>
        <ShipPicture ship={profile?.ship ?? 'classic'} accent={colorForLevel(level)} admiral={admiral} avatar={profile?.avatar} fit />
      </div>
    </div>
  );
}
