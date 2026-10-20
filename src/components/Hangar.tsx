import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { useT } from '../i18n/useLang';
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

// The hangar: where a pilot picks the ship they fly (ships.ts), the classic
// rocket or the Explorer. It opens by itself when the game starts for a
// pilot who hasn't picked one yet (a new pilot, or one from before there was
// a choice), and from a pilot's ✏️ to change ships.

export function Hangar() {
  const gateOpen = useProfileGateOpen();
  const asked = useHangar((s) => s.pilotId);
  const activeId = useProfiles((s) => s.activeId);
  const profiles = useProfiles((s) => s.profiles);
  const crew = useCrewStore((s) => s.active);
  const pilot = profiles.find((p) => p.id === (asked ?? activeId));
  // a pilot who hasn't chosen yet: when the game starts
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
  // a pilot who's flown before is told there's something new
  const returning = first && stats.correct > 0;

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
    update(pilot.id, { ship: picked });
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
                <span className="hangar-glow" />
                <ShipPicture ship={ship} accent={colorForLevel(stats.level)} admiral={admiral} avatar={pilot.avatar} fit className="hangar-picture" />
              </span>
              <span className="hangar-name">{ship === 'explorer' ? h.explorer : h.classic}</span>
              <span className="hangar-hint">{ship === 'explorer' ? h.explorerHint : h.classicHint}</span>
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
