import { useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useAchievements } from '../../game/useAchievements';
import { BADGE_BY_ID, RANK_ICONS } from '../../game/achievements';
import { useT } from '../../i18n/useLang';
import { sfx } from '../../audio/sfx';
import { BadgeArt } from './BadgeArt';
import { badgeText } from '../../i18n/strings';
import ShinyText from '../reactbits/ShinyText';

const SHOW_MS = 3200;
const PROMOTION_MS = 4200;

// "New badge!" cards, one at a time from the queue, just below the top bar.
// They never take input, so play carries on underneath.
export function BadgeToast() {
  const t = useT();
  const unlock = useAchievements((s) => s.queue[0]);
  const shiftQueue = useAchievements((s) => s.shiftQueue);

  useEffect(() => {
    if (!unlock) return;
    sfx.milestone(unlock.promotedTo !== null ? 20 : 10);
    const id = window.setTimeout(shiftQueue, unlock.promotedTo !== null ? PROMOTION_MS : SHOW_MS);
    return () => window.clearTimeout(id);
  }, [unlock, shiftQueue]);

  const badge = unlock && BADGE_BY_ID[unlock.badgeId];
  const text = badge && badgeText(t, badge.id);

  return (
    <AnimatePresence>
      {badge && text && (
        <motion.div
          key={badge.id}
          className={`badge-toast ${unlock.promotedTo !== null ? 'is-promotion' : ''}`}
          role="status"
          initial={{ opacity: 0, y: -30, scale: 0.8 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.9 }}
          transition={{ type: 'spring', stiffness: 300, damping: 18 }}
        >
          <motion.span
            initial={{ rotate: -200, scale: 0 }}
            animate={{ rotate: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 12, delay: 0.1 }}
          >
            <BadgeArt name={badge.id} icon={badge.icon} group={badge.group} size={56} />
          </motion.span>
          <span className="badge-toast-text">
            <span className="badge-toast-kicker">{t.badges.newBadge}</span>
            <span className="badge-toast-name">{text.name}</span>
            <span className="badge-toast-desc">{text.desc}</span>
            {unlock.promotedTo !== null && (
              <span className="badge-toast-promo">
                {RANK_ICONS[unlock.promotedTo]}{' '}
                <ShinyText text={t.badges.promoted(t.badges.ranks[unlock.promotedTo])} color="#ffd77a" shineColor="#fff6e0" speed={2} />
              </span>
            )}
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
