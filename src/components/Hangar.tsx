import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { useT } from '../i18n/useLang';
import { shipHint, shipName } from '../i18n/strings';
import { profileStats, useProfileGateOpen, useProfiles, type Profile } from '../profiles/useProfiles';
import { useHangar } from '../profiles/useHangar';
import { useCrewStore } from '../game/useCrewStore';
import { useAdmiral } from '../game/useAchievements';
import { pauseGame, resumeGame } from '../game/gameClock';
import { sfx } from '../audio/sfx';
import { haptics } from '../audio/haptics';
import { colorForLevel } from './scene/palette';
import { SHIPS, type ShipId } from './scene/ships';
import { ShipPicture } from './ShipPicture';

// The hangar: where a pilot picks the ship they fly (ships.ts): the classic
// rocket, the Explorer or Nova. It opens by itself once, when the game starts
// for a pilot who has never picked one (a new pilot, or one from before there
// was a choice); after that their choice is kept, and the hangar opens only
// from their ✏️, to change ships (where a ship they haven't seen yet is marked
// new).

export function Hangar() {
  const gateOpen = useProfileGateOpen();
  const asked = useHangar((s) => s.pilotId);
  const activeId = useProfiles((s) => s.activeId);
  const profiles = useProfiles((s) => s.profiles);
  const crew = useCrewStore((s) => s.active);
  const pilot = profiles.find((p) => p.id === (asked ?? activeId));
  // when the game starts, only for a pilot who has never chosen
  const first = !asked && !!pilot && !pilot.ship && !gateOpen && !crew;
  if (!pilot || !(asked || first)) return null;
  return <HangarView key={pilot.id} pilot={pilot} first={first} />;
}

function HangarView({ pilot, first }: { pilot: Profile; first: boolean }) {
  const t = useT();
  const h = t.hangar;
  const update = useProfiles((s) => s.update);
  const close = useHangar((s) => s.close);
  const isActive = useProfiles((s) => s.activeId === pilot.id);
  const admiral = useAdmiral() && isActive;
  const [picked, setPicked] = useState<ShipId | null>(pilot.ship ?? null);
  const [stats] = useState(() => profileStats(pilot.id));
  // a pilot who's flown before is told there's something new, and which
  const returning = first && stats.correct > 0;
  const seen = pilot.ship ? (pilot.shipsSeen ?? 2) : stats.correct > 0 ? 1 : SHIPS.length;

  useEffect(() => {
    pauseGame('hangar');
    return () => resumeGame('hangar');
  }, []);

  const choose = (ship: ShipId) => {
    setPicked(ship);
    sfx.pick(ship === 'explorer' ? 3 : 2);
    haptics.tick();
  };
  const fly = () => {
    if (!picked) return;
    update(pilot.id, { ship: picked, shipsSeen: SHIPS.length });
    sfx.blastOff();
    close();
  };

  return createPortal(
    <motion.div className="hangar" role="dialog" aria-modal="true" aria-label={h.title} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}>
      <div className="hangar-card">
        {!first && (
          <button type="button" className="academy-close hangar-close" onClick={close} aria-label={h.close}>
            ✕
          </button>
        )}
        {returning && <div className="hangar-kicker">{h.newShip}</div>}
        <h2 className="hangar-title">{h.title}</h2>
        <div className="hangar-ships" role="radiogroup" aria-label={h.title}>
          {SHIPS.map((ship, i) => (
            <motion.button
              key={ship}
              type="button"
              role="radio"
              aria-checked={picked === ship}
              className={`hangar-ship is-${ship} ${picked === ship ? 'is-on' : ''}`}
              onClick={() => choose(ship)}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 + i * 0.12, type: 'spring', stiffness: 260, damping: 22 }}
            >
              <span className="hangar-bay" aria-hidden>
                {i >= seen && <span className="hangar-new">{h.newBadge}</span>}
                <span className="hangar-glow" />
                <ShipPicture ship={ship} accent={colorForLevel(stats.level)} admiral={admiral} avatar={pilot.avatar} fit className="hangar-picture" />
              </span>
              <span className="hangar-name">{shipName(t, ship)}</span>
              <span className="hangar-hint">{shipHint(t, ship)}</span>
            </motion.button>
          ))}
        </div>
        <button type="button" className="profile-primary hangar-go" onClick={fly} disabled={!picked}>
          {h.go}
        </button>
        <p className="hangar-note">{h.hint}</p>
      </div>
    </motion.div>,
    document.body,
  );
}
