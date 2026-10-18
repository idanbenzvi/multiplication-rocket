import { useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { pilotName, profileStats, useProfiles } from '../../profiles/useProfiles';
import { useCrewStore } from '../../game/useCrewStore';
import { suggestSeats, type Seat } from '../../game/crew';
import { useT } from '../../i18n/useLang';
import { SEAT_COLORS } from './seatColors';
import { playTrack } from '../../audio/useAudio';
import { BACKDROP_VARIANTS, flyOffTo, SHEET_VARIANTS, useModeWarp } from '../warpTransition';
import { flyHome } from '../../game/flight';

// Pick two pilots (the first tapped takes the left seat), then check their
// seats: the one further along is suggested as Pilot, the other as
// Navigator, and either can switch.
function SetupSheet() {
  const t = useT();
  const profiles = useProfiles((s) => s.profiles);
  const closeSetup = useCrewStore((s) => s.closeSetup);
  const start = useCrewStore((s) => s.start);
  const [chosen, setChosen] = useState<string[]>([]);
  const [seats, setSeats] = useState<Record<string, Seat>>({});

  const toggle = (id: string) => {
    let next: string[];
    if (chosen.includes(id)) next = chosen.filter((c) => c !== id);
    else if (chosen.length < 2) next = [...chosen, id];
    else return;
    setChosen(next);
    if (next.length === 2) {
      const [a, b] = suggestSeats(profileStats(next[0]).level, profileStats(next[1]).level);
      setSeats({ [next[0]]: a, [next[1]]: b });
    }
  };

  const ready = chosen.length === 2;
  // the sheet dissolves into a warp, and the crew flight begins on the other side
  const launch = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!ready) return;
    const members: Parameters<typeof start>[0] = [
      { profileId: chosen[0], seat: seats[chosen[0]] ?? 'pilot' },
      { profileId: chosen[1], seat: seats[chosen[1]] ?? 'pilot' },
    ];
    // the crew's own soundtrack starts with the warp, from the tap (browsers only start music from one)
    playTrack('crew');
    // the rocket blasts off, and comes back with both pilots aboard
    flyOffTo(() => {
      start(members);
      flyHome();
    }, e.currentTarget);
    closeSetup();
  };

  return (
    <div className="crew-setup">
      <h2 className="settings-title">👩‍🚀👨‍🚀 {t.crew.title}</h2>
      <p className="crew-intro">{t.crew.intro}</p>
      <div className="settings-label">{t.crew.pickTwo}</div>
      <div className="crew-pick">
        {profiles.map((p) => {
          const index = chosen.indexOf(p.id);
          const on = index >= 0;
          return (
            <button
              key={p.id}
              type="button"
              className={`crew-pick-card ${on ? 'is-on' : ''}`}
              style={on ? ({ '--seat': SEAT_COLORS[index] } as React.CSSProperties) : undefined}
              aria-pressed={on}
              onClick={() => toggle(p.id)}
              disabled={!on && chosen.length >= 2}
            >
              <span className="pilot-card-avatar">{p.avatar}</span>
              <span className="pilot-card-name" dir="auto">
                {pilotName(p, t.defaultPilotName)}
              </span>
              <span className="pilot-card-stats">{t.level(profileStats(p.id).level)}</span>
            </button>
          );
        })}
      </div>

      {ready &&
        chosen.map((id, i) => {
          const p = profiles.find((x) => x.id === id);
          const seat = seats[id] ?? 'pilot';
          const adding = p?.mission === 'add';
          return (
            <div key={id} className="settings-section crew-seat-row" style={{ '--seat': SEAT_COLORS[i] } as React.CSSProperties}>
              <div className="settings-label">
                {p?.avatar} {pilotName(p, t.defaultPilotName)} · {t.crew.seat}
              </div>
              <div className="settings-segment settings-segment-row">
                {(['pilot', 'navigator'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={`settings-option ${seat === s ? 'is-on' : ''}`}
                    aria-pressed={seat === s}
                    onClick={() => setSeats((prev) => ({ ...prev, [id]: s }))}
                  >
                    <span className="settings-option-name">{s === 'pilot' ? t.crew.seatPilot : t.crew.seatNavigator}</span>
                    <span className="settings-option-hint">
                      {s === 'pilot'
                        ? adding
                          ? t.crew.seatPilotHintAdd
                          : t.crew.seatPilotHint
                        : adding
                          ? t.crew.seatNavigatorHintAdd
                          : t.crew.seatNavigatorHint}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}

      <button type="button" className="profile-primary crew-launch" onClick={launch} disabled={!ready}>
        {t.crew.launchTogether}
      </button>
      <button type="button" className="profile-secondary crew-cancel" onClick={closeSetup}>
        {t.cancel}
      </button>
    </div>
  );
}

export function CrewSetup() {
  const open = useCrewStore((s) => s.setupOpen);
  const closeSetup = useCrewStore((s) => s.closeSetup);
  const leave = useModeWarp((s) => (s.run || s.due ? 'warp' : null));
  return createPortal(
    <AnimatePresence custom={leave}>
      {open && (
        <motion.div
          className="settings-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          variants={BACKDROP_VARIANTS}
          custom={leave}
          exit="exit"
          onClick={closeSetup}
        >
          <motion.div
            className="settings-sheet crew-sheet"
            role="dialog"
            aria-modal="true"
            initial={{ y: 40, opacity: 0, scale: 0.96 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            variants={SHEET_VARIANTS}
            custom={leave}
            exit="exit"
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
          >
            <SetupSheet />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
