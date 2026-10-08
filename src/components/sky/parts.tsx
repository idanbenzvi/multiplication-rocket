import { useState } from 'react';
import { motion } from 'motion/react';
import { useSkyStore } from '../../game/useSkyStore';
import { useT } from '../../i18n/useLang';

// Pieces both two-phone games use.

/** connecting / can't connect / dropped (with Reconnect on the joining phone) */
export function StatusLine() {
  const t = useT();
  const status = useSkyStore((s) => s.status);
  const error = useSkyStore((s) => s.error);
  const role = useSkyStore((s) => s.role);
  const reconnect = useSkyStore((s) => s.reconnect);
  if (status === 'connecting') return <div className="sky-status">{t.sky.connecting}</div>;
  if (status === 'error') return <div className="sky-status is-error">{error === 'bad-code' ? t.sky.badCode : t.sky.networkError}</div>;
  if (status === 'lost') {
    return role === 'guest' ? (
      <div className="sky-status is-error">
        {t.sky.lost}
        <button type="button" className="profile-primary" onClick={reconnect}>
          {t.sky.reconnect}
        </button>
      </div>
    ) : (
      <div className="sky-status is-error">{t.sky.waitingReconnect}</div>
    );
  }
  return null;
}

/** four answer buttons; one pick until the host has judged it (the parent remounts on a miss) */
export function Choices({ choices, onPick, misses }: { choices: number[]; onPick: (v: number) => void; misses: number }) {
  // one pick per state: unlocked again when the referee has judged it
  const [picked, setPicked] = useState<number | null>(null);
  return (
    <motion.div className="choice-grid sky-choices" dir="ltr" animate={misses > 0 ? { x: [0, -8, 8, -4, 4, 0] } : undefined}>
      {choices.map((c) => (
        <button
          key={c}
          type="button"
          className="choice-btn"
          disabled={picked !== null}
          onClick={() => {
            setPicked(c);
            onPick(c);
          }}
        >
          {c}
        </button>
      ))}
    </motion.div>
  );
}
