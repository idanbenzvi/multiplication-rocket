import { AnimatePresence, motion } from 'motion/react';
import { useT } from '../i18n/useLang';
import { MILESTONE_EVERY } from '../game/streak';
import GradientText from './reactbits/GradientText';

interface Props {
  /** the streak that hit a milestone, or null when nothing is showing */
  streak: number | null;
}

// Big celebratory banner across the middle of the screen at every
// MILESTONE_EVERY correct answers in a row. Each milestone gets a
// different subtitle, and the later ones are bigger.
export function MilestoneBanner({ streak }: Props) {
  const t = useT();
  const level = streak ? Math.min(streak / MILESTONE_EVERY - 1, t.milestoneSubtitle.length - 1) : 0;

  return (
    <AnimatePresence>
      {streak && (
        <motion.div
          key={streak}
          className="milestone-banner"
          initial={{ opacity: 0, scale: 0.3, rotate: -6 }}
          animate={{ opacity: 1, scale: 1 + level * 0.1, rotate: 0 }}
          exit={{ opacity: 0, scale: 1.6, filter: 'blur(8px)' }}
          transition={{ type: 'spring', stiffness: 320, damping: 14 }}
        >
          <div className="milestone-flames">{'🔥'.repeat(Math.min(1 + level, 5))}</div>
          <GradientText
            className="milestone-title"
            colors={['#ffd77a', '#ff6ad5', '#6ad7ff', '#7ee08f', '#ffd77a']}
            animationSpeed={2}
          >
            {t.milestoneTitle(streak)}
          </GradientText>
          <div className="milestone-subtitle">{t.milestoneSubtitle[level]}</div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
