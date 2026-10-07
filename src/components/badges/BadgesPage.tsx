import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { pauseGame, resumeGame } from '../../game/gameClock';
import { useLang, useT } from '../../i18n/useLang';
import { useGameStore } from '../../game/useGameStore';
import { useAchievements, useRank } from '../../game/useAchievements';
import { BADGE_GROUPS, BADGES, RANK_ICONS, RANK_THRESHOLDS } from '../../game/achievements';
import { activeProfile, pilotName } from '../../profiles/useProfiles';
import { BadgeArt } from './BadgeArt';
import { badgeText } from '../../i18n/strings';
import GradientText from '../reactbits/GradientText';

// The pilot's rank, the ladder up to Honored Captain, and every badge:
// earned ones in color, locked ones dimmed with how close they are.
// The game is paused while it's open.
export function BadgesPage({ onClose }: { onClose: () => void }) {
  const t = useT();
  const tb = t.badges;
  const lang = useLang((s) => s.lang);
  const progress = useGameStore((s) => s.progress);
  const stats = useAchievements((s) => s.stats);
  const earned = useAchievements((s) => s.earned);
  // captured on open, so NEW tags stay up while the screen is showing
  const [unseen] = useState(() => new Set(useAchievements.getState().unseen));
  const rank = useRank();
  const earnedCount = Object.keys(earned).length;
  const nextAt = RANK_THRESHOLDS[rank + 1];
  const name = pilotName(activeProfile(), t.defaultPilotName);

  useEffect(() => {
    pauseGame('badges');
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      resumeGame('badges');
      useAchievements.getState().markAllSeen();
    };
  }, [onClose]);

  // progress through the current rank, towards the next one
  const rankStart = RANK_THRESHOLDS[rank];
  const rankFill = nextAt === undefined ? 1 : (earnedCount - rankStart) / (nextAt - rankStart);

  return createPortal(
    <motion.div className="badges-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div
        className="badges-card"
        dir={lang === 'he' ? 'rtl' : 'ltr'}
        role="dialog"
        aria-modal="true"
        aria-labelledby="badges-title"
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.05 }}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="about-close" onClick={onClose} aria-label={tb.close}>
          ✕
        </button>

        <div className="badges-rank">
          <BadgeArt name={`rank-${rank}`} icon={RANK_ICONS[rank]} size={84} />
          <div className="badges-rank-text">
            <h2 id="badges-title">
              <GradientText colors={['#ffd77a', '#ff9d76', '#ff6ad5', '#ffd77a']} animationSpeed={4}>
                {tb.pilotRank(tb.ranks[rank], name)}
              </GradientText>
            </h2>
            <div className="badges-rank-bar" aria-hidden="true">
              <span style={{ width: `${Math.round(rankFill * 100)}%` }} />
            </div>
            <div className="badges-rank-next">
              {nextAt === undefined ? tb.topRank : tb.toNextRank(nextAt - earnedCount, tb.ranks[rank + 1])}
              <span className="badges-count">{tb.earnedCount(earnedCount, BADGES.length)}</span>
            </div>
          </div>
        </div>

        <ol className="badges-ladder">
          {tb.ranks.map((r, i) => (
            <li key={r} className={i < rank ? 'is-past' : i === rank ? 'is-current' : 'is-future'} title={r}>
              <BadgeArt name={`rank-${i}`} icon={RANK_ICONS[i]} locked={i > rank} size={i === rank ? 40 : 30} />
              <span className="badges-ladder-label">{r}</span>
            </li>
          ))}
        </ol>

        {BADGE_GROUPS.map((group) => (
          <section key={group} className="badges-group">
            <h3>{tb.groups[group]}</h3>
            <div className="badges-grid">
              {BADGES.filter((b) => b.group === group).map((b) => {
                const text = badgeText(t, b.id);
                const isEarned = !!earned[b.id];
                const { have, need } = b.goal({ progress, stats });
                return (
                  <div key={b.id} className={`badge-tile ${isEarned ? 'is-earned' : 'is-locked'}`}>
                    {isEarned && unseen.has(b.id) && <span className="badge-new">{tb.isNew}</span>}
                    <BadgeArt name={b.id} icon={b.icon} group={b.group} locked={!isEarned} size={56} />
                    <div className="badge-tile-name">{text.name}</div>
                    <div className="badge-tile-desc">{text.desc}</div>
                    {!isEarned && need > 1 && (
                      <div className="badge-tile-progress" aria-label={`${have} / ${need}`}>
                        <span style={{ width: `${(have / need) * 100}%` }} />
                        <em dir="ltr">
                          {have} / {need}
                        </em>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </motion.div>
    </motion.div>,
    document.body,
  );
}

// The rank insignia in the top bar, with a dot while there are badges the
// pilot hasn't looked at yet.
export function BadgesButton() {
  const tb = useT().badges;
  const rank = useRank();
  const hasNew = useAchievements((s) => s.unseen.length > 0);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <button
        type="button"
        className={`badges-button ${hasNew ? 'has-new' : ''}`}
        onClick={() => setOpen(true)}
        aria-label={`${tb.open}: ${tb.ranks[rank]}`}
        title={`${tb.open}: ${tb.ranks[rank]}`}
      >
        <BadgeArt name={`rank-${rank}`} icon={RANK_ICONS[rank]} size={26} />
      </button>
      <AnimatePresence>{open && <BadgesPage onClose={close} />}</AnimatePresence>
    </>
  );
}
