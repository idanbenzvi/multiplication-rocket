import { useEffect, useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { useSkyStore } from '../../game/useSkyStore';
import { useT } from '../../i18n/useLang';
import { NumPad } from '../NumPad';
import type { LinkError, LinkStatus } from '../../net/peerLink';

// Pieces the multi-phone games share.

interface LinkStatusProps {
  status: LinkStatus | null;
  error: LinkError | null;
  role: 'host' | 'guest' | null;
  reconnect: () => void;
}

/** connecting / can't connect / dropped (with Reconnect on a joining phone) */
export function LinkStatusLine({ status, error, role, reconnect }: LinkStatusProps) {
  const t = useT();
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

/** the two-phone games' status line */
export function StatusLine() {
  const status = useSkyStore((s) => s.status);
  const error = useSkyStore((s) => s.error);
  const role = useSkyStore((s) => s.role);
  const reconnect = useSkyStore((s) => s.reconnect);
  return <LinkStatusLine status={status} error={error} role={role} reconnect={reconnect} />;
}

const CODE_LENGTH = 4;

/** typing the host's code: on screen or with the keyboard */
export function CodeEntry({ hint, busy, onJoin, children }: { hint: string; busy: boolean; onJoin: (code: string) => void; children?: ReactNode }) {
  const t = useT();
  const [code, setCode] = useState('');
  const typeDigit = (d: string) => setCode((c) => (c.length < CODE_LENGTH ? c + d : c));
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) setCode((c) => (c.length < CODE_LENGTH ? c + e.key : c));
      else if (e.key === 'Backspace') setCode((c) => c.slice(0, -1));
      else if (e.key === 'Enter' && code.length === CODE_LENGTH) onJoin(code);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [code, onJoin]);
  return (
    <div className="sky-lobby">
      <div className="sky-hint">{hint}</div>
      <div className="sky-code is-entry" dir="ltr" aria-live="polite">
        {Array.from({ length: CODE_LENGTH }, (_, i) => (
          <span key={i}>{code[i] ?? ''}</span>
        ))}
      </div>
      {children}
      <NumPad onDigit={typeDigit} onBackspace={() => setCode((c) => c.slice(0, -1))} disabled={busy} />
      <button type="button" className="profile-primary" disabled={code.length < CODE_LENGTH || busy} onClick={() => onJoin(code)}>
        {t.sky.joinButton}
      </button>
    </div>
  );
}

/** the host's code, big */
export function CodeDisplay({ code }: { code: string }) {
  return (
    <div className="sky-code" dir="ltr">
      {code.split('').map((d, i) => (
        <span key={i}>{d}</span>
      ))}
    </div>
  );
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
