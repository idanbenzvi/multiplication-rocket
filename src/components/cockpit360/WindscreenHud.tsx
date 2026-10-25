import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useLang, useT } from '../../i18n/useLang';
import { useGameStore } from '../../game/useGameStore';
import { useCrewStore } from '../../game/useCrewStore';
import { getLevelConfig } from '../../game/levels';
import { flight } from '../../game/flight';
import { pickOp } from '../../game/mission';
import { activeMission } from '../../profiles/useProfiles';
import { destinationName } from '../../i18n/strings';
import Counter from '../reactbits/Counter';
import Radar from '../reactbits/Radar';
import SloshGauge from '../reactbits/SloshGauge';
import SplitFlapText from '../reactbits/SplitFlapText';
import { dirOfLook, pointOnQuad } from './geometry';
import { NOSE_PITCH, planetAngle, surge } from './drive';
import { WINDSCREEN_PX, WINDSCREEN_QUAD } from './screens';

// The flight's HUD, projected on the windscreen's glass in glowing amber:
// the destination dead ahead locked in a turning reticle, its name flipping
// in on a departures board, how far it is and how long till we're there
// (counting down as you watch), how fast we're going on a scrolling tape,
// the fuel sloshing in its gauge, a radar sweeping for contacts, the level,
// the streak and the right answers, and a telemetry log ticking over (the
// ship's computer working through the pilot's own facts). It's laid on the
// glass with the screens (css3d.ts), so it stays on the windscreen as the
// head turns. The numbers are made up from the real ones: the tank says how
// near the destination is, and the flight's speed (the streak, the tank)
// and the drive's surges how fast.

/** px on the HUD's page for a degree of view, near its middle */
const PX_PER_DEG = WINDSCREEN_PX[0] / 62.8;
/** where the ship's nose (the destination) is on the page */
const NOSE = (() => {
  const p = pointOnQuad(WINDSCREEN_QUAD, dirOfLook({ yaw: 0, pitch: NOSE_PITCH })) ?? [0.5, 0.5];
  return { x: p[0] * WINDSCREEN_PX[0], y: p[1] * WINDSCREEN_PX[1] };
})();
/** the made-up distance at an empty tank (km), and how much faster than the speed the range counts down */
const FAR_KM = 384_400;
const COUNTDOWN = 6;

const rand = (n: number) => Math.floor(Math.random() * n);
const pad = (n: number) => String(Math.floor(n)).padStart(2, '0');

/** a line of the telemetry log: the ship's systems ticking over, and its computer checking the pilot's facts */
function telemetryLine(): string {
  const r = Math.random();
  if (r < 0.34) {
    const op = pickOp(activeMission());
    const a = 1 + rand(10);
    const b = 1 + rand(10);
    return op === 'add' ? `CALC  ${a}+${b}=${a + b}  ✓` : `CALC  ${a}×${b}=${a * b}  ✓`;
  }
  const lines = [
    () => `NAV   HDG ${String(rand(360)).padStart(3, '0')}°  Δv +0.0${rand(90) + 10}`,
    () => `CELL  ${1 + rand(4)}  ${(92 + Math.random() * 8).toFixed(1)}%`,
    () => `COMMS LINK -${40 + rand(20)}dB  OK`,
    () => `GYRO  X${(Math.random() * 0.06 - 0.03).toFixed(3)} Y${(Math.random() * 0.06 - 0.03).toFixed(3)}`,
    () => `THRM  ${270 + rand(30)}K  NOMINAL`,
    () => `SCAN  ${rand(9) + 1} CONTACTS  CLEAR`,
    () => `PWR   ${(0.8 + Math.random() * 0.2).toFixed(2)} GW`,
  ];
  return lines[rand(lines.length)]();
}

/** re-render every `ms` (the live numbers) */
function useTicker(ms: number) {
  const [, setN] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => !document.hidden && setN((n) => n + 1), ms);
    return () => window.clearInterval(id);
  }, [ms]);
}

function Telemetry() {
  const [lines, setLines] = useState(() => Array.from({ length: 6 }, telemetryLine));
  useEffect(() => {
    const id = window.setInterval(() => !document.hidden && setLines((l) => [...l.slice(1), telemetryLine()]), 900);
    return () => window.clearInterval(id);
  }, []);
  return (
    <ol className="ck3-hud-log" dir="ltr" aria-hidden>
      {lines.map((line, i) => (
        // (keyed by where it came in, so each new one slides up from the bottom)
        <li key={`${line}-${i}`}>{line}</li>
      ))}
    </ol>
  );
}

export function WindscreenFace() {
  const t = useT();
  const d = t.deck;
  const lang = useLang((s) => s.lang);
  const level = useGameStore((s) => (s.justLaunched ? s.progress.level - 1 : s.progress.level));
  const fuel = useGameStore((s) => (s.justLaunched ? 100 : s.progress.fuel));
  const streak = useGameStore((s) => s.progress.currentStreak);
  const correct = useGameStore((s) => s.progress.totalCorrectAnswers);
  const crewing = useCrewStore((s) => s.active);
  const dest = getLevelConfig(level);
  const name = destinationName(t, dest);
  useTicker(450);
  const opened = useRef(performance.now());

  const elapsed = (performance.now() - opened.current) / 1000;
  const speed = 7.8 + Math.min(1.3, flight.effective) * 46 + surge.k * 180 + Math.sin(elapsed * 1.7) * 0.4;
  const range = Math.max(600, (1 - fuel / 100) * FAR_KM + 2800 - elapsed * speed * COUNTDOWN);
  const eta = range / (speed * COUNTDOWN);
  const reticle = planetAngle(fuel / 100) * (180 / Math.PI) * PX_PER_DEG * 1.35 + 26;
  const surging = surge.k > 0.35;

  return (
    <div className={`ck3-hud-glass ${surging ? 'is-surging' : ''}`} dir="ltr" style={{ '--speed': Math.min(1, speed / 120) } as CSSProperties}>
      {/* the destination, locked in the reticle */}
      {!crewing && (
        <div className="ck3-lock" style={{ left: NOSE.x, top: NOSE.y, '--r': `${reticle.toFixed(0)}px` } as CSSProperties}>
          <svg className="ck3-reticle" viewBox="-100 -100 200 200" aria-hidden>
            <g className="ck3-reticle-spin">
              <circle r="92" className="is-dash" />
              <path d="M -92 0 L -78 0 M 92 0 L 78 0 M 0 -92 L 0 -78 M 0 92 L 0 78" />
            </g>
            <g className="ck3-reticle-corners">
              <path d="M -70 -50 L -70 -70 L -50 -70 M 50 -70 L 70 -70 L 70 -50 M 70 50 L 70 70 L 50 70 M -50 70 L -70 70 L -70 50" />
            </g>
          </svg>
          <div className="ck3-lock-label">
            <span className="ck3-hud-tag">{d.target}</span>
            <SplitFlapText
              text={name.toUpperCase()}
              className="ck3-flap"
              dir={lang === 'he' ? 'rtl' : 'ltr'}
              charset={lang === 'he' ? 'אבגדהוזחטיכלמנסעפצקרשת' : 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'}
              padTo={Math.min(16, name.length)}
              fontSize={26}
              gap={3}
              tileRadius={4}
              tileColor="rgba(30, 14, 4, 0.72)"
              textColor="#ffcf8a"
              flipsPerChar={6}
              stagger={0.05}
              loop={false}
            />
          </div>
          <div className="ck3-lock-data">
            <span>
              <em>{d.range}</em>
              <Counter value={Math.round(range)} fontSize={24} textColor="currentColor" intro={false} />
              <small>{d.km}</small>
            </span>
            <span>
              <em>{d.eta}</em>
              <b>
                {pad(eta / 60)}:{pad(eta % 60)}
              </b>
            </span>
          </div>
        </div>
      )}

      {/* the flight path's ladder either side of the nose */}
      <div className="ck3-ladder" style={{ top: NOSE.y }} aria-hidden>
        {[-2, -1, 1, 2].map((k) => (
          <i key={k} style={{ '--k': k } as CSSProperties} />
        ))}
      </div>

      {/* the speed, on its scrolling tape */}
      <div className="ck3-tape is-speed" aria-hidden>
        <div className="ck3-tape-ticks" />
        <div className="ck3-tape-box">
          <em>{d.speed}</em>
          <Counter value={Math.round(speed * 10) / 10} decimals={1} fontSize={30} textColor="currentColor" intro={false} />
          <small>{d.kms}</small>
        </div>
      </div>

      {/* the fuel, sloshing */}
      <div className="ck3-fuel">
        <SloshGauge value={fuel} interactive={false} liquidColor="#ffb35c" glassColor="rgba(255, 179, 92, 0.1)" width={58} height={170} radius={14} ticks={4} ariaLabel={d.fuel} />
        <em>{d.fuel}</em>
      </div>

      {/* the pilot's flight, top left */}
      <ul className="ck3-hud-stats">
        <li>
          <em>{d.level}</em>
          <b>{level}</b>
        </li>
        <li>
          <em>{d.streak}</em>
          <b>{streak}</b>
        </li>
        <li>
          <em>{d.right}</em>
          <b>
            <Counter value={correct} fontSize={30} textColor="currentColor" intro={false} />
          </b>
        </li>
      </ul>

      {/* the ship's state, top right */}
      <div className={`ck3-hud-status ${surging ? 'is-surging' : ''}`}>
        <span className="ck3-hud-ok">
          <i /> {surging ? d.surge : d.allGo}
        </span>
        <span>
          {d.hull} 100% · {d.oxygen} {(97.5 + Math.sin(elapsed / 3) * 1.4).toFixed(1)}%
        </span>
      </div>

      <Telemetry />

      <div className="ck3-hud-radar">
        <Radar color="#ffa04d" mode="sweep" speed={0.8} ringCount={4} spokeCount={8} targets={5} clutter={0.25} scale={0.94} mouseInteraction={false} grain={0.02} dpr={1} />
      </div>

    </div>
  );
}
