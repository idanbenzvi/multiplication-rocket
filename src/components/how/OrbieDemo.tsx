import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import Orb from '../reactbits/Orb';
import { ThinkVisual } from '../computer/ThinkVisual';
import { stepText } from '../computer/stepText';
import { stuckAfterMs, thinkSteps } from '../../game/thinkThrough';
import { useGameStore } from '../../game/useGameStore';
import { useMission } from '../../profiles/useProfiles';
import { useLang, useT } from '../../i18n/useLang';
import { speak } from '../../audio/speech';
import { sfx } from '../../audio/sfx';
import '../computer/computer.css';

// Orbie, the ship's computer (computer/ShipComputer.tsx), on a question of
// its own: the clock it waits by (game/thinkThrough.ts's stuckAfterMs, at a
// pilot's usual pace), its orb lighting up when that's run out, and tapped,
// its window going through the ways to think the question through, the same
// ones it would give this pilot (one starting from a fact they know, if they
// know one next to it).

/** a usual pilot's pace (ms): the clock runs the least it ever does, 7 s */
const PACE_MS = 4000;

type Phase = 'waiting' | 'lit' | 'open';

export function OrbieDemo() {
  const all = useT();
  const t = all.how.orbie;
  const c = all.computer;
  const lang = useLang((s) => s.lang);
  const mission = useMission();
  const mastery = useGameStore((s) => s.progress.mastery);
  const q = mission === 'add' ? { x: 8, y: 7, mission: 'add' as const } : { x: 6, y: 7, mission: 'mul' as const };
  const steps = useMemo(() => thinkSteps(q.x, q.y, q.mission, mastery), [q.x, q.y, q.mission, mastery]);
  const waitMs = stuckAfterMs(PACE_MS, false);

  const [run, setRun] = useState(0);
  const [phase, setPhase] = useState<Phase>('waiting');
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const id = window.setTimeout(() => {
      setPhase('lit');
      sfx.blip(3);
    }, waitMs);
    return () => window.clearTimeout(id);
  }, [run, waitMs]);

  const step = steps[index];
  const words = stepText(step, c, all, q);
  const go = (d: number) => {
    setIndex((i) => Math.max(0, Math.min(steps.length - 1, i + d)));
    sfx.blip(5 + d);
  };
  const read = () => speak([words.title, words.text, words.math?.replace(/→/g, ',')].filter(Boolean).join('. '), lang, all.academy.speakWords);
  const op = q.mission === 'add' ? '+' : '×';

  return (
    <>
      <div className="how-stage how-orbie">
        <div className="how-orbie-side">
          <bdi dir="ltr" className="how-question">
            {q.x} {op} {q.y} = ?
          </bdi>
          <div className={`how-orbie-orb is-${phase}`}>
            <button
              type="button"
              className="ship-computer-orb-button"
              onClick={() => {
                if (phase === 'waiting') return;
                setPhase(phase === 'open' ? 'lit' : 'open');
                sfx.blip(4);
              }}
              aria-label={c.open}
              aria-expanded={phase === 'open'}
            >
              <Orb hue={0} hoverIntensity={0.6} rotateOnHover forceHoverState={phase === 'open'} backgroundColor="#000000" />
              <span className="ship-computer-orb-face" aria-hidden>
                ?
              </span>
            </button>
          </div>
          {phase === 'waiting' ? (
            <div className="how-timer" aria-hidden="true">
              <span key={run} className="how-timer-fill" style={{ animationDuration: `${waitMs}ms` }} />
              <span className="how-timer-label">{t.thinking}</span>
            </div>
          ) : (
            phase === 'lit' && (
              <motion.button
                type="button"
                className="how-orbie-bubble"
                onClick={() => setPhase('open')}
                initial={{ opacity: 0, scale: 0.7, y: 6 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 380, damping: 22 }}
              >
                {c.stuck}
              </motion.button>
            )
          )}
        </div>
        <AnimatePresence>
          {phase === 'open' && (
            <motion.div
              className="how-orbie-window"
              role="group"
              aria-label={c.name}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.85 }}
              transition={{ type: 'spring', stiffness: 320, damping: 24 }}
            >
              <header className="ship-computer-head">
                <span className="ship-computer-glyph" aria-hidden />
                <span className="ship-computer-name">{c.name}</span>
              </header>
              <div className="ship-computer-body">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={index}
                    className="ship-computer-step"
                    initial={{ opacity: 0, x: 18 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -18 }}
                    transition={{ duration: 0.18 }}
                  >
                    <h3 className="ship-computer-step-title">{words.title}</h3>
                    {'visual' in step && step.visual && (
                      <div className="ship-computer-visual">
                        <ThinkVisual visual={step.visual} />
                      </div>
                    )}
                    <p className="ship-computer-text">{words.text}</p>
                    {words.math && (
                      <bdi dir="ltr" className="ship-computer-math">
                        {words.math}
                      </bdi>
                    )}
                    {index === steps.length - 1 && <p className="ship-computer-try">{c.tryIt}</p>}
                  </motion.div>
                </AnimatePresence>
              </div>
              <footer className="ship-computer-foot">
                <button type="button" className="ship-computer-nav" onClick={() => go(-1)} disabled={index === 0} aria-label={c.prev}>
                  ‹
                </button>
                <span className="ship-computer-dots" aria-hidden>
                  {steps.map((_, i) => (
                    <i key={i} className={i === index ? 'is-on' : ''} />
                  ))}
                </span>
                <button type="button" className="ship-computer-nav" onClick={() => go(1)} disabled={index === steps.length - 1} aria-label={c.next}>
                  ›
                </button>
                <button type="button" className="ship-computer-read" onClick={read} aria-label={c.read} title={c.read}>
                  🔊
                </button>
              </footer>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <div className="how-controls">
        <button
          type="button"
          className="how-button"
          onClick={() => {
            setRun((r) => r + 1);
            setPhase('waiting');
            setIndex(0);
          }}
        >
          <span aria-hidden="true">⏱</span> {t.again}
        </button>
      </div>
    </>
  );
}
