import type { CSSProperties } from 'react';
import { motion } from 'motion/react';
import { useT } from '../../../i18n/useLang';
import { useGameModes } from '../../useGameModes';
import SpotlightCard from '../../reactbits/SpotlightCard';
import { useCockpit } from '../store';

// The tall screen on the right wall: the game modes (the same as the top
// bar's 🎮 sheet, useGameModes.tsx), each on a card the light follows the finger or mouse
// across. Picking one leaves the cockpit and starts it, as the sheet does:
// the rocket blasts off and the warp follows it.

const GLOWS: Record<string, string> = {
  crew: 'rgba(92, 242, 255, 0.28)',
  sky: 'rgba(125, 255, 176, 0.26)',
  sun: 'rgba(255, 92, 224, 0.3)',
  boss: 'rgba(255, 140, 60, 0.32)',
};

export function ModesPage() {
  const t = useT();
  const { modes, boss } = useGameModes();
  const start = (run: (card: Element) => void, card: Element) => {
    // (out of the cockpit first: the music back, the game running, and then the mode's own start)
    useCockpit.getState().dismiss();
    run(card);
  };
  return (
    <div className="ck3-page ck3-modes">
      <p className="ck3-page-lead">{t.deck.modesHint}</p>
      <div className="ck3-modes-list">
        {modes.map((m, i) => (
          <motion.div key={m.key} initial={{ opacity: 0, x: 24 }} animate={{ opacity: m.disabled ? 0.5 : 1, x: 0 }} transition={{ delay: 0.12 + i * 0.07, type: 'spring', stiffness: 320, damping: 26 }}>
            <SpotlightCard
              className={`ck3-mode is-${m.key} ${m.disabled ? 'is-off' : ''}`}
              spotlightColor={GLOWS[m.key]}
              theme="dark"
              role="button"
              tabIndex={m.disabled ? -1 : 0}
              aria-disabled={m.disabled}
              onClick={(e) => !m.disabled && start(m.run, e.currentTarget)}
              onKeyDown={(e) => !m.disabled && (e.key === 'Enter' || e.key === ' ') && start(m.run, e.currentTarget)}
              style={{ '--i': i } as CSSProperties}
            >
              <span className="ck3-mode-icon" aria-hidden>
                {m.icon}
              </span>
              <span className="ck3-mode-text">
                <b>{m.name}</b>
                <small>{m.hint}</small>
              </span>
              {m.key === 'boss' && boss.isNew && <span className="ck3-new">{t.badges.isNew}</span>}
              <span className="ck3-mode-go" aria-hidden>
                {m.disabled ? '🔒' : '▶'}
              </span>
            </SpotlightCard>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
