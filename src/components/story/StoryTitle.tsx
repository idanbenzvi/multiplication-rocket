import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { SpaceTimesLogo } from '../logo/SpaceTimesLogo';
import { calmMotion } from '../arrival/dropOut';
import { useT } from '../../i18n/useLang';
import { useSkip } from './filmHooks';
import { endTitle, useStory } from './useStory';

// The title: SPACE TIMES out of the launch's white, held, then flown to its
// place in the top bar as the game starts under it.

/** how long the title holds before it flies to the top bar (ms) */
const TITLE_HOLD_MS = 2600;

export function StoryTitle() {
  const replay = useStory((s) => s.replay);
  const t = useT();
  const [calm] = useState(calmMotion);
  const [phase, setPhase] = useState<'show' | 'go'>('show');
  const logo = useRef<HTMLDivElement | null>(null);
  const [to, setTo] = useState<{ x: number; y: number; scale: number } | null>(null);
  const [height] = useState(() => Math.round(Math.min(window.innerHeight * 0.44, (window.innerWidth * 0.82 * 729) / 860, 380)));
  const done = useRef(false);
  const finish = () => {
    if (done.current) return;
    done.current = true;
    endTitle();
  };
  useSkip(finish);

  useEffect(() => {
    const id = window.setTimeout(() => {
      // where it goes: the logo's place in the top bar (hidden till it's there; watching it again, About's over it, and it just fades)
      const target = replay || calm ? null : document.querySelector('.hud-logo .st-logo')?.getBoundingClientRect();
      const here = logo.current?.getBoundingClientRect();
      if (target && here && target.height > 0) {
        setTo({ x: target.left + target.width / 2 - (here.left + here.width / 2), y: target.top + target.height / 2 - (here.top + here.height / 2), scale: target.height / here.height });
      }
      setPhase('go');
    }, TITLE_HOLD_MS);
    return () => window.clearTimeout(id);
  }, [replay, calm]);

  return (
    <motion.div
      className="story-title"
      role="img"
      aria-label={t.story.label}
      initial={{ backgroundColor: 'rgba(255, 252, 246, 1)' }}
      animate={{ backgroundColor: phase === 'go' ? 'rgba(5, 3, 15, 0)' : 'rgba(5, 3, 15, 1)' }}
      transition={phase === 'go' ? { duration: 0.8, delay: 0.3, ease: 'easeInOut' } : { duration: 1.1, ease: 'easeOut' }}
    >
      <motion.div
        ref={logo}
        className="story-title-logo"
        initial={calm ? { opacity: 0 } : { opacity: 0, scale: 1.5, filter: 'blur(14px) brightness(3)' }}
        animate={
          phase === 'show'
            ? { opacity: 1, scale: 1, filter: 'blur(0px) brightness(1)' }
            : to
              ? { x: to.x, y: to.y, scale: to.scale, opacity: 1, filter: 'blur(0px) brightness(1)' }
              : { opacity: 0, scale: calm ? 1 : 0.9 }
        }
        transition={phase === 'show' ? { duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: 0.15 } : { duration: 1, ease: [0.45, 0, 0.2, 1] }}
        onAnimationComplete={() => phase === 'go' && finish()}
      >
        <SpaceTimesLogo height={height} />
      </motion.div>
    </motion.div>
  );
}
