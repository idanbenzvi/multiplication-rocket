import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useLang, useT } from '../i18n/useLang';
import { shipHint, shipName } from '../i18n/strings';
import { profileStats, useProfileGateOpen, useProfiles, type Profile } from '../profiles/useProfiles';
import { useHangar } from '../profiles/useHangar';
import { useCrewStore } from '../game/useCrewStore';
import { useAdmiral } from '../game/useAchievements';
import { sfx } from '../audio/sfx';
import { flyHome } from '../game/flight';
import { haptics } from '../audio/haptics';
import { colorForLevel } from './scene/palette';
import { SHIPS, type ShipId } from './scene/ships';
import { useBack } from '../native/back';
import { BayScreen } from './bay/BayScreen';
import { launchShip, primeBayExit, useBay } from './bay/useBay';
import { SHIP_HEIGHT } from './bay/layout';
import BorderGlow from './reactbits/BorderGlow';

// The hangar: where a pilot picks the ship they fly (ships.ts): the classic
// rocket, the Explorer or Venus. It opens by itself once, when the game starts
// for a pilot who has never picked one (a new pilot, or one from before there
// was a choice); after that their choice is kept, and the hangar opens only
// from their ✏️, to change ships (where a ship they haven't seen yet is marked
// new).
//
// It's the launch bay's pad (bay/): the ships take turns standing on it, ‹ ›
// (or a swipe, or a ship's name) flaring one away and beaming the next down,
// and the one they choose takes off.

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

/** how far a swipe across the pad must go to change ships (px) */
const SWIPE = 40;
/** the panel's least margin from the screen's top and bottom (px, and clear of the notch and the home bar) */
const MARGIN = 12;
/** the buttons' border glow (React Bits' BorderGlow): the bay's cyan, its edge in the game's colours */
const GLOW = { glowColor: '190 100 78', colors: ['#8fe6ff', '#c9a4de', '#ff9de2'] };
const LAUNCH_GLOW = { glowColor: '190 100 80', colors: ['#ffd77a', '#ff9de2', '#8fe6ff'] };
const stayPut = () => {};

function HangarView({ pilot, first }: { pilot: Profile; first: boolean }) {
  const t = useT();
  const h = t.hangar;
  const rtl = useLang((s) => s.lang) === 'he';
  const update = useProfiles((s) => s.update);
  const close = useHangar((s) => s.close);
  const isActive = useProfiles((s) => s.activeId === pilot.id);
  const admiral = useAdmiral() && isActive;
  const [picked, setPicked] = useState<ShipId>(pilot.ship ?? 'classic');
  const [launching, setLaunching] = useState(false);
  // (the first time, there's a ship to choose: Back sends the app away rather than skipping it; taking off, it waits)
  useBack(launching ? stayPut : !first && close);
  const [stats] = useState(() => profileStats(pilot.id));
  // a pilot who's flown before is told there's something new, and which
  const returning = first && stats.correct > 0;
  const seen = pilot.ship ? (pilot.shipsSeen ?? 2) : stats.correct > 0 ? 1 : SHIPS.length;
  const accent = colorForLevel(stats.level);
  const ship = useMemo(() => ({ ship: picked, accent, admiral, avatar: pilot.avatar }), [picked, accent, admiral, pilot.avatar]);
  const layout = useBay((s) => s.layout);
  const swipe = useRef<number | null>(null);
  // the panel's height, to keep it all on the screen
  const [panelH, setPanelH] = useState(0);
  const watching = useRef<ResizeObserver | null>(null);
  const panelRef = useCallback((el: HTMLDivElement | null) => {
    watching.current?.disconnect();
    watching.current = null;
    if (!el) return;
    watching.current = new ResizeObserver(() => setPanelH(el.offsetHeight));
    watching.current.observe(el);
  }, []);

  // (each choice lights the chosen ship's button round its edge, and each tap on an arrow that arrow)
  const [choices, setChoices] = useState(0);
  const [taps, setTaps] = useState({ left: 0, right: 0 });
  const choose = (next: ShipId) => {
    if (launching || next === picked) return;
    setPicked(next);
    setChoices((n) => n + 1);
    haptics.tick();
  };
  // ‹ goes back along the ships, › on (the other way round in Hebrew), round and round
  const turn = (dir: 1 | -1) => choose(SHIPS[(SHIPS.indexOf(picked) + dir + SHIPS.length) % SHIPS.length]);
  const tapArrow = (side: 'left' | 'right') => {
    setTaps((t) => ({ ...t, [side]: t[side] + 1 }));
    turn((side === 'right') !== rtl ? 1 : -1);
  };
  const fly = () => {
    if (launching) return;
    setLaunching(true);
    // (the music changes back once it's gone, without a tap: this one lets it)
    primeBayExit();
    sfx.chargeUp(0.8);
    launchShip({
      onDone: () => {
        update(pilot.id, { ship: picked, shipsSeen: SHIPS.length });
        close();
        // (and in the game, it flies in, once the bay's gone)
        flyHome();
      },
    });
  };

  // ← → change ships too
  const tapRef = useRef(tapArrow);
  useEffect(() => {
    tapRef.current = tapArrow;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') tapRef.current('left');
      else if (e.key === 'ArrowRight') tapRef.current('right');
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rtl]);

  if (!layout) return <BayScreen sign={t.bay.ships} ship={ship}>{null}</BayScreen>;
  const { u, padX, padY, vw, vh, side } = layout;
  const shipMid = padY - (SHIP_HEIGHT / 2) * u;
  const clampY = (y: number) => Math.min(vh - 60, Math.max(60, y));
  const arrow = (dir: -1 | 1): CSSProperties => ({ left: Math.min(vw - 34, Math.max(34, padX + dir * (58 * u + 10))), top: clampY(shipMid) });
  const width = side ? Math.min(440, vw - layout.sideX - 24) : Math.min(520, vw - 24);
  // beside the ship, level with it, or under the pad; either way all on the screen (a phone on its side, Safari's toolbars taking some)
  const fit = (y: number) =>
    `clamp(calc(${MARGIN}px + env(safe-area-inset-top)), ${y}px, calc(100% - ${panelH + MARGIN}px - env(safe-area-inset-bottom)))`;
  const panel: CSSProperties = side
    ? { left: layout.sideX + 8, top: fit(shipMid - panelH / 2), width }
    : { left: Math.min(vw - width - 12, Math.max(12, padX - width / 2)), top: fit(padY + 34 * u), width };
  const nameTop: CSSProperties | undefined = side ? undefined : { left: panel.left, width: panel.width, top: 62 * u };

  const name = (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={picked}
        className="bay-ship-title"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.22 }}
      >
        {returning && <div className="hangar-kicker">{h.newShip}</div>}
        <h2 className="bay-ship-name">{shipName(t, picked)}</h2>
        <p className="bay-ship-hint">{shipHint(t, picked)}</p>
      </motion.div>
    </AnimatePresence>
  );

  return (
    <BayScreen sign={launching ? t.bay.launching : t.bay.ships} ship={ship}>
      <AnimatePresence>
        {!launching && (
          <motion.div
            key="chooser"
            className="bay-chooser"
            role="dialog"
            aria-modal="true"
            aria-label={h.title}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.25 } }}
            transition={{ duration: 0.4, delay: 0.2 }}
          >
            {/* a swipe across the ship changes it */}
            <div
              className="bay-swipe"
              style={{ left: padX - 90 * u, top: padY - (SHIP_HEIGHT + 10) * u, width: 180 * u, height: (SHIP_HEIGHT + 30) * u }}
              onPointerDown={(e) => {
                swipe.current = e.clientX;
              }}
              onPointerUp={(e) => {
                if (swipe.current === null) return;
                const dx = e.clientX - swipe.current;
                swipe.current = null;
                if (Math.abs(dx) >= SWIPE) turn((dx < 0) !== rtl ? 1 : -1);
              }}
              onPointerCancel={() => {
                swipe.current = null;
              }}
              aria-hidden="true"
            />
            {!first && (
              <button type="button" className="academy-close bay-close" onClick={close} aria-label={h.close}>
                ✕
              </button>
            )}
            {/* (on the left and the right of the pad whatever the language: in Hebrew, ‹ and › would otherwise be mirrored, pointing in) */}
            <BorderGlow className="bay-arrow-glow" style={arrow(-1)} borderRadius={29} glowRadius={28} sweep={taps.left || null} sweepMs={900} {...GLOW}>
              <button type="button" dir="ltr" className="bay-arrow" onClick={() => tapArrow('left')} aria-label={rtl ? t.bay.next : t.bay.previous}>
                ‹
              </button>
            </BorderGlow>
            <BorderGlow className="bay-arrow-glow" style={arrow(1)} borderRadius={29} glowRadius={28} sweep={taps.right || null} sweepMs={900} {...GLOW}>
              <button type="button" dir="ltr" className="bay-arrow" onClick={() => tapArrow('right')} aria-label={rtl ? t.bay.previous : t.bay.next}>
                ›
              </button>
            </BorderGlow>
            {nameTop && (
              <div className="bay-ship-top" style={nameTop}>
                {name}
              </div>
            )}
            <div ref={panelRef} className={`bay-panel ${side ? 'is-side' : 'is-under'}`} style={panel}>
              {side && name}
              <div className="bay-ship-pills" role="radiogroup" aria-label={h.title}>
                {SHIPS.map((s, i) => (
                  <BorderGlow key={s} borderRadius={999} glowRadius={24} sweep={picked === s ? choices : null} sweepMs={1100} {...GLOW}>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={picked === s}
                      className={`bay-ship-pill ${picked === s ? 'is-on' : ''}`}
                      onClick={() => choose(s)}
                    >
                      {i >= seen && <span className="hangar-new">{h.newBadge}</span>}
                      {shipName(t, s)}
                    </button>
                  </BorderGlow>
                ))}
              </div>
              {/* (its light going round all the time: this is the one to press) */}
              <BorderGlow className="bay-launch-glow" borderRadius={999} glowRadius={36} orbit={3600} glowIntensity={1.2} {...LAUNCH_GLOW}>
                <button type="button" className="profile-primary bay-launch" onClick={fly}>
                  {h.go}
                </button>
              </BorderGlow>
              <p className="hangar-note bay-note">{h.hint}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </BayScreen>
  );
}
