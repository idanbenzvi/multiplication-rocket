import { useEffect, useRef, useState } from 'react';
import { gameTimeout } from '../game/gameClock';
import { motion } from 'motion/react';
import type { Challenge, Drill } from '../game/wormhole';
import { CORRECT_PICKS, WRONG_PICKS_ALLOWED } from '../game/wormhole';
import { sfx } from '../audio/sfx';
import { haptics } from '../audio/haptics';
import { useT } from '../i18n/useLang';
import GradientText from './reactbits/GradientText';

interface Props {
  challenge: Challenge;
  onSuccess: () => void;
  onCollapse: () => void;
  /** fire a spark burst at a screen point (App owns the spark canvas) */
  onBurst: (x: number, y: number, color: string) => void;
}

// Where the five drills float, as [left%, top%] of the viewport — around the
// rocket rather than on top of it, and clear of the header card.
const SLOTS: Array<[number, number]> = [
  [17, 42],
  [83, 40],
  [27, 68],
  [73, 70],
  [50, 85],
];

const SUCCESS_DELAY_MS = 650;
const COLLAPSE_DELAY_MS = 1600;

export function WormholeChallenge({ challenge, onSuccess, onCollapse, onBurst }: Props) {
  const t = useT();
  const [found, setFound] = useState<number[]>([]);
  const [missed, setMissed] = useState<number[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const done = found.length >= CORRECT_PICKS || collapsed;

  // Latest values for the keyboard handler without re-subscribing each pick.
  const pickRef = useRef<(d: Drill, el: Element | null) => void>(() => {});

  const pick = (drill: Drill, el: Element | null) => {
    if (done || found.includes(drill.id) || missed.includes(drill.id)) return;
    const rect = el?.getBoundingClientRect();
    if (drill.correct) {
      const next = [...found, drill.id];
      setFound(next);
      sfx.pick(next.length);
      if (next.length >= CORRECT_PICKS) haptics.correct(5);
      else haptics.tick();
      if (rect) onBurst(rect.left + rect.width / 2, rect.top + rect.height / 2, '#7ee08f');
      if (next.length >= CORRECT_PICKS) gameTimeout(onSuccess, SUCCESS_DELAY_MS);
    } else {
      const next = [...missed, drill.id];
      setMissed(next);
      sfx.wrong();
      haptics.thump();
      if (next.length > WRONG_PICKS_ALLOWED) {
        setCollapsed(true);
        gameTimeout(onCollapse, COLLAPSE_DELAY_MS);
      }
    }
  };
  pickRef.current = pick;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const n = Number(e.key);
      if (!Number.isInteger(n) || n < 1 || n > challenge.drills.length) return;
      const drill = challenge.drills[n - 1];
      pickRef.current(drill, document.querySelector(`[data-drill="${drill.id}"]`));
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [challenge]);

  const warn = missed.length === WRONG_PICKS_ALLOWED && !collapsed;

  return (
    <div className={`wormhole-challenge ${collapsed ? 'is-collapsed' : ''}`}>
      <motion.div
        className="wormhole-header"
        initial={{ opacity: 0, y: -30, scale: 0.8 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 18 }}
      >
        <div className="wormhole-ahead">🌀 {t.wormholeAhead}</div>
        <GradientText className="wormhole-target" colors={['#6ad7ff', '#b18cff', '#ff6ad5', '#6ad7ff']} animationSpeed={3}>
          {challenge.target}
        </GradientText>
        <div className="wormhole-instructions">
          {collapsed ? t.wormholeCollapsed : warn ? t.wormholeOneLeft : t.wormholeInstructions(challenge.target)}
        </div>
        <div className="wormhole-progress" aria-live="polite">
          {Array.from({ length: CORRECT_PICKS }, (_, i) => (
            <span key={i} className={`wormhole-dot ${i < found.length ? 'is-on' : ''}`} />
          ))}
          <span className="wormhole-progress-text">{t.wormholePicked(found.length)}</span>
        </div>
        <div className="wormhole-keys">{t.wormholeKeys}</div>
      </motion.div>

      {challenge.drills.map((drill, i) => {
        const [left, top] = SLOTS[i % SLOTS.length];
        const isFound = found.includes(drill.id);
        const isMissed = missed.includes(drill.id);
        const state = isFound ? 'is-found' : isMissed ? 'is-missed' : '';
        return (
          <div key={drill.id} className="drill-slot" style={{ left: `${left}%`, top: `${top}%` }}>
            <motion.div
              // Each bubble drifts on its own slow loop so the group never
              // moves in lockstep.
              animate={collapsed ? { scale: 0, opacity: 0, rotate: 180 } : { y: [0, -14, 0, 10, 0], x: [0, 8, 0, -8, 0] }}
              transition={
                collapsed
                  ? { duration: 0.6, delay: i * 0.06 }
                  : { duration: 4 + i * 0.7, repeat: Infinity, ease: 'easeInOut' }
              }
            >
              <motion.button
                type="button"
                data-drill={drill.id}
                className={`drill-bubble ${state}`}
                onClick={(e) => pick(drill, e.currentTarget)}
                disabled={done || isFound || isMissed}
                aria-label={`${i + 1}: ${t.drillLabel(drill.x, drill.y)}`}
                initial={{ scale: 0, opacity: 0 }}
                animate={
                  isMissed
                    ? { scale: 0.85, opacity: 0.55, x: [0, -10, 10, -6, 6, 0] }
                    : isFound
                      ? { scale: 1.12, opacity: 1 }
                      : { scale: 1, opacity: 1 }
                }
                transition={{ delay: isFound || isMissed ? 0 : 0.15 + i * 0.08, type: 'spring', stiffness: 380, damping: 16 }}
                whileHover={done ? undefined : { scale: 1.08 }}
                whileTap={done ? undefined : { scale: 0.92 }}
              >
                <span className="drill-key">{i + 1}</span>
                <bdi dir="ltr" className="drill-text">
                  {drill.x} × {drill.y}
                </bdi>
                {isFound && <span className="drill-mark">✓</span>}
                {isMissed && <span className="drill-mark">✗</span>}
              </motion.button>
            </motion.div>
          </div>
        );
      })}
    </div>
  );
}
