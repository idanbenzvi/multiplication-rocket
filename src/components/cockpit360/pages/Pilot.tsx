import { useT } from '../../../i18n/useLang';
import { useGameStore } from '../../../game/useGameStore';
import { MISSION_SYMBOL } from '../../../game/mission';
import { pilotName, useMission, useProfiles } from '../../../profiles/useProfiles';
import { missionName, shipName } from '../../../i18n/strings';
import { useAdmiral } from '../../../game/useAchievements';
import { colorForLevel } from '../../scene/palette';
import { ShipPicture } from '../../ShipPicture';
import Counter from '../../reactbits/Counter';
import StarBorder from '../../reactbits/StarBorder';

// The top left of the bank of screens on the left wall: who's flying, their
// mission and how far they've come, their ship turning slowly as a hologram
// with them at its window, and the way to the launch bay to switch pilot or
// change theirs (the pilots' own screens, opened by the top bar's pilot
// button: Profiles.tsx).

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
