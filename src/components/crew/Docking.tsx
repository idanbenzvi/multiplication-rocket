import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { gameTimeout } from '../../game/gameClock';
import { dockMultiplier, MAX_DOCK_TRIES, type DockResult } from '../../game/crew';
import type { CrewDocking } from '../../game/useCrewStore';
import type { Profile } from '../../profiles/useProfiles';
import { pilotName } from '../../profiles/useProfiles';
import { kick, bump } from '../../game/flight';
import { sfx } from '../../audio/sfx';
import { haptics } from '../../audio/haptics';
import { useT } from '../../i18n/useLang';
import GradientText from '../reactbits/GradientText';
import { SEAT_COLORS } from './seatColors';

interface Props {
  turn: CrewDocking;
  /** the two crew members' profiles, left seat first */
  pilots: [Profile | undefined, Profile | undefined];
  onDock: (a: number, b: number) => DockResult;
  onFinish: () => void;
  onBurst: (x: number, y: number, color: string) => void;
}

const NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const REVEAL_DELAY_MS = 600;
const DOCKED_MS = 2200;

// Docking: the station shows a number, and each child secretly picks one
// factor on their own half of the screen. A pick shows as 🔒 so neither can
// copy the other: to dock reliably they have to agree out loud first.
export function Docking({ turn, pilots, onDock, onFinish, onBurst }: Props) {
  const t = useT();
  const [picks, setPicks] = useState<[number | null, number | null]>([null, null]);
  const [revealed, setRevealed] = useState<DockResult | null>(null);
  const { target, pairs } = turn.docking;
  const outOfTries = revealed !== null && revealed !== 'dock' && turn.tries >= MAX_DOCK_TRIES;
  // the reveal timer reads the latest callbacks, so a parent re-render doesn't restart it
  const callbacks = useRef({ onDock, onFinish, onBurst });
  callbacks.current = { onDock, onFinish, onBurst };

  // both locked in: reveal after a beat of suspense
  useEffect(() => {
    if (picks[0] === null || picks[1] === null || revealed) return;
    const [a, b] = picks;
    return gameTimeout(() => {
      const { onDock, onFinish, onBurst } = callbacks.current;
      const result = onDock(a, b);
      setRevealed(result);
      if (result === 'dock') {
        sfx.wormhole();
        haptics.correct(5);
        kick(0.6);
        for (let i = 0; i < 5; i++) {
          gameTimeout(
            () => onBurst(window.innerWidth * (0.25 + Math.random() * 0.5), window.innerHeight * (0.25 + Math.random() * 0.3), SEAT_COLORS[i % 2]),
            i * 120,
          );
        }
        gameTimeout(onFinish, DOCKED_MS);
      } else {
        sfx.wrong();
        haptics.thump();
        bump();
      }
    }, REVEAL_DELAY_MS);
  }, [picks, revealed]);

  const pick = (seat: 0 | 1, n: number | null) => {
    if (revealed) return;
    setPicks((p) => (seat === 0 ? [n, p[1]] : [p[0], n]));
    if (n !== null) sfx.pick(1);
  };

  const retry = () => {
    setPicks([null, null]);
    setRevealed(null);
  };

  const last = turn.last;
  const docked = revealed === 'dock';
  // the try being played (or, after a miss, the one coming up)
  const shownTry = docked || outOfTries ? turn.tries : turn.tries + 1;

  return (
    <div className="dock-zone">
      <motion.div
        className="dock-header"
        initial={{ opacity: 0, y: -24, scale: 0.85 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 18 }}
      >
        <div className="dock-title">🛰️ {t.crew.dockTitle}</div>
        <div className="dock-station" dir="ltr">
          <motion.span
            className="dock-rocket"
            animate={docked ? { x: 12, rotate: 90 } : { x: 0, rotate: 90 }}
            transition={{ type: 'spring', stiffness: 120, damping: 12 }}
          >
            🚀
          </motion.span>
          <GradientText className="dock-target" colors={['#6ad7ff', '#ffd77a', '#ff9d76', '#6ad7ff']} animationSpeed={3}>
            {target}
          </GradientText>
          <motion.span
            className="dock-rocket"
            animate={docked ? { x: -12, rotate: -90 } : { x: 0, rotate: -90 }}
            transition={{ type: 'spring', stiffness: 120, damping: 12 }}
          >
            🚀
          </motion.span>
        </div>
        <div className="dock-instructions" aria-live="polite">
          {revealed && last ? (
            <span className={`dock-result is-${last.result}`} dir="ltr">
              {last.result === 'dock'
                ? t.crew.dockDocked(last.a, last.b)
                : last.result === 'over'
                  ? t.crew.dockOver(last.a, last.b)
                  : t.crew.dockUnder(last.a, last.b)}
            </span>
          ) : (
            <>
              <div>{t.crew.dockIntro(target)}</div>
              <div className="dock-talk">{t.crew.dockTalk}</div>
            </>
          )}
        </div>
        <div className="dock-meta">
          <span>{t.crew.dockTries(shownTry, MAX_DOCK_TRIES)}</span>
          <span>{t.crew.dockBonus(dockMultiplier(shownTry))}</span>
        </div>

        <AnimatePresence>
          {revealed && !docked && !outOfTries && (
            <motion.button key="retry" type="button" className="continue-button" onClick={retry} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              {t.crew.tryAgain}
            </motion.button>
          )}
          {outOfTries && (
            <motion.div key="show" className="dock-show" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <div>{t.crew.dockShow(target)}</div>
              <div className="dock-pairs" dir="ltr">
                {pairs.map(([a, b]) => (
                  <span key={a} className="dock-pair">
                    {a} × {b}
                  </span>
                ))}
              </div>
              <button type="button" className="continue-button" onClick={onFinish}>
                {t.gotItContinue}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* physical left/right halves, also in Hebrew: each child takes the side nearer them */}
      <div className="dock-pads" dir="ltr">
        {([0, 1] as const).map((seat) => {
          const p = pilots[seat];
          const mine = picks[seat];
          const shown = revealed ? mine : null;
          return (
            <div key={seat} className="dock-pad" style={{ '--seat': SEAT_COLORS[seat] } as React.CSSProperties}>
              <div className="dock-pad-who" dir="auto">
                <span className="dock-pad-avatar">{p?.avatar}</span> {t.crew.dockPick(pilotName(p, t.defaultPilotName))}
              </div>
              {mine === null ? (
                <div className="dock-numbers">
                  {NUMBERS.map((n) => (
                    <button key={n} type="button" className="dock-number" onClick={() => pick(seat, n)} disabled={!!revealed}>
                      {n}
                    </button>
                  ))}
                </div>
              ) : (
                <button type="button" className="dock-locked" onClick={() => pick(seat, null)} disabled={!!revealed}>
                  {shown !== null ? <span className="dock-locked-n">{shown}</span> : t.crew.dockLocked}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
