import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { skyNames, useSkyStore } from '../../game/useSkyStore';
import { MAX_MISSES, type Side, type SkyStage } from '../../game/splitSky';
import { distractors } from '../../game/distractors';
import { useT } from '../../i18n/useLang';
import { sfx } from '../../audio/sfx';
import { haptics } from '../../audio/haptics';
import { NumPad } from '../NumPad';
import { SkyGrid } from './SkyGrid';
import GradientText from '../reactbits/GradientText';
import './sky.css';

const CODE_LENGTH = 4;
const other = (s: Side): Side => (s === 'left' ? 'right' : 'left');

function shuffled<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- lobby ----------

function Players() {
  const t = useT();
  const players = useSkyStore((s) => s.state.players);
  const mySide = useSkyStore((s) => s.mySide);
  return (
    <div className="sky-phones" dir="ltr" aria-label={t.sky.placePhones}>
      {(['left', 'right'] as const).map((side) => {
        const p = players[side];
        return (
          <div key={side} className={`sky-phone ${side === mySide ? 'is-me' : ''} ${p ? '' : 'is-empty'}`}>
            <span className="sky-phone-avatar">{p?.avatar ?? '…'}</span>
            <span className="sky-phone-name" dir="auto">
              {p?.name ?? ''}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function StatusLine() {
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

function HostLobby() {
  const t = useT();
  const code = useSkyStore((s) => s.code);
  const status = useSkyStore((s) => s.status);
  const players = useSkyStore((s) => s.state.players);
  const mySide = useSkyStore((s) => s.mySide);
  const swapSides = useSkyStore((s) => s.swapSides);
  const startGame = useSkyStore((s) => s.startGame);
  const both = !!players.left && !!players.right;
  return (
    <div className="sky-lobby">
      {code && (
        <>
          <div className="settings-label">{t.sky.yourCode}</div>
          <div className="sky-code" dir="ltr">
            {code.split('').map((d, i) => (
              <span key={i}>{d}</span>
            ))}
          </div>
          {!both && <div className="sky-hint">{t.sky.tellCode}</div>}
        </>
      )}
      {status === 'waiting' && !both && <div className="sky-status is-pulse">{t.sky.waiting}</div>}
      <StatusLine />
      {both && (
        <>
          <div className="sky-hint">{t.sky.placePhones}</div>
          <Players />
          <div className="sky-side-row">
            <span>{t.sky.myPhoneIs}</span>
            <strong>{mySide === 'left' ? t.sky.left : t.sky.right}</strong>
            <button type="button" className="profile-secondary sky-swap" onClick={swapSides}>
              {t.sky.swap}
            </button>
          </div>
          <button type="button" className="profile-primary" onClick={startGame}>
            {t.sky.start}
          </button>
        </>
      )}
    </div>
  );
}

function GuestLobby() {
  const t = useT();
  const status = useSkyStore((s) => s.status);
  const join = useSkyStore((s) => s.join);
  const players = useSkyStore((s) => s.state.players);
  const [code, setCode] = useState('');
  const connected = status === 'connected';
  const busy = status === 'connecting';

  const typeDigit = (d: string) => setCode((c) => (c.length < CODE_LENGTH ? c + d : c));
  useEffect(() => {
    if (connected) return;
    const handler = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) setCode((c) => (c.length < CODE_LENGTH ? c + e.key : c));
      else if (e.key === 'Backspace') setCode((c) => c.slice(0, -1));
      else if (e.key === 'Enter' && code.length === CODE_LENGTH) join(code);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [connected, code, join]);

  if (connected || status === 'lost') {
    return (
      <div className="sky-lobby">
        {players.left && players.right && <Players />}
        <StatusLine />
        {connected && <div className="sky-status is-pulse">{t.sky.waitHost}</div>}
      </div>
    );
  }
  return (
    <div className="sky-lobby">
      <div className="sky-hint">{t.sky.enterCode}</div>
      <div className="sky-code is-entry" dir="ltr" aria-live="polite">
        {Array.from({ length: CODE_LENGTH }, (_, i) => (
          <span key={i}>{code[i] ?? ''}</span>
        ))}
      </div>
      <StatusLine />
      <NumPad onDigit={typeDigit} onBackspace={() => setCode((c) => c.slice(0, -1))} disabled={busy} />
      <button type="button" className="profile-primary" disabled={code.length < CODE_LENGTH || busy} onClick={() => join(code)}>
        {t.sky.joinButton}
      </button>
    </div>
  );
}

function Lobby() {
  const t = useT();
  const role = useSkyStore((s) => s.role);
  const host = useSkyStore((s) => s.host);
  const leave = useSkyStore((s) => s.leave);
  const closeSky = useSkyStore((s) => s.closeSky);
  return (
    <div className="sky-panel">
      <GradientText className="sky-title" colors={['#6ad7ff', '#c9a4de', '#ffd77a', '#6ad7ff']} animationSpeed={4}>
        📱📱 {t.sky.title}
      </GradientText>
      {role === null && (
        <>
          <p className="sky-intro">{t.sky.intro}</p>
          <div className="settings-segment">
            <button type="button" className="settings-option" onClick={host}>
              <span className="settings-option-name">{t.sky.host}</span>
              <span className="settings-option-hint">{t.sky.hostHint}</span>
            </button>
            <button type="button" className="settings-option" onClick={() => useSkyStore.setState({ role: 'guest', status: null, error: null })}>
              <span className="settings-option-name">{t.sky.join}</span>
              <span className="settings-option-hint">{t.sky.joinHint}</span>
            </button>
          </div>
        </>
      )}
      {role === 'host' && <HostLobby />}
      {role === 'guest' && <GuestLobby />}
      <button type="button" className="profile-secondary sky-close" onClick={role ? leave : closeSky}>
        {role ? t.sky.back : t.sky.close}
      </button>
    </div>
  );
}

// ---------- playing ----------

function Chip({ label, rows, cols, mine }: { label: string; rows: number; cols: number; mine?: boolean }) {
  return (
    <div className={`sky-chip ${mine ? 'is-mine' : ''}`}>
      <span className="sky-chip-label" dir="auto">
        {label}
      </span>
      <bdi dir="ltr" className="sky-chip-math">
        {rows} × {cols} = {rows * cols}
      </bdi>
    </div>
  );
}

function Choices({ choices, onPick, misses }: { choices: number[]; onPick: (v: number) => void; misses: number }) {
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

function Play() {
  const t = useT();
  const state = useSkyStore((s) => s.state);
  const mySide = useSkyStore((s) => s.mySide);
  const role = useSkyStore((s) => s.role);
  const answer = useSkyStore((s) => s.answer);
  const nextRound = useSkyStore((s) => s.nextRound);
  const round = state.rounds[state.roundIndex];
  const partner = state.players[other(mySide)];
  const partnerName = partner?.name ?? skyNames.fallback;
  const stage: SkyStage | null = state.phase === 'count' || state.phase === 'join' ? state.phase : null;
  const mine = stage ? state[stage][mySide] : null;
  const whole = round ? round.cols.left + round.cols.right : 0;
  const myCols = round?.cols[mySide] ?? 0;
  const partnerCols = round?.cols[other(mySide)] ?? 0;

  // choices stay put for the whole question (a miss doesn't reshuffle them)
  const choices = useMemo(() => {
    if (!round || !stage) return [];
    const cols = stage === 'count' ? myCols : whole;
    const answerValue = round.rows * cols;
    const near = distractors(round.rows, cols, 3);
    // in the whole-sky question, "just my half" is a tempting slip
    const half = round.rows * myCols;
    if (stage === 'join' && !near.includes(half)) near[2] = half;
    return shuffled([answerValue, ...near]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.roundIndex, stage]);

  // sounds for this phone's own results, and the lit wave for everyone
  const prev = useRef(state);
  useEffect(() => {
    const before = prev.current;
    prev.current = state;
    if (before.roundIndex !== state.roundIndex) return;
    for (const s of ['count', 'join'] as const) {
      const a = before[s][mySide];
      const b = state[s][mySide];
      if (b.misses > a.misses) {
        sfx.wrong();
        haptics.thump();
      } else if (b.done && !a.done && b.misses < MAX_MISSES) {
        sfx.correct(1, false);
        haptics.correct(1);
      }
    }
    if (state.phase === 'lit' && before.phase !== 'lit') {
      sfx.constellation();
      haptics.correct(5);
    }
  }, [state, mySide]);

  if (!round) return null;
  const lit = state.phase === 'lit';

  return (
    <div className="sky-play">
      <div className="sky-round">{t.sky.round(state.roundIndex + 1, state.rounds.length)}</div>
      <SkyGrid
        key={state.roundIndex}
        rows={round.rows}
        cols={myCols}
        sizeCols={Math.max(round.cols.left, round.cols.right)}
        side={mySide}
        lit={lit}
      />

      <div className="sky-card">
        {state.phase === 'count' && mine && (
          <>
            {!mine.done ? (
              <>
                <div className="sky-prompt">{t.sky.yourHalf(round.rows, myCols)}</div>
                <Choices key={`c${state.roundIndex}-${mine.misses}`} choices={choices} misses={mine.misses} onPick={(v) => answer('count', v)} />
              </>
            ) : (
              <>
                <Chip label={t.sky.myHalf} rows={round.rows} cols={myCols} mine />
                <div className="sky-status is-pulse">{t.sky.waitPartner(partnerName)}</div>
              </>
            )}
          </>
        )}

        {(state.phase === 'join' || lit) && (
          <div className="sky-chips" dir="ltr">
            {/* in the order the phones sit, so the sum reads like the sky */}
            {(['left', 'right'] as const).map((side) =>
              side === mySide ? (
                <Chip key={side} label={t.sky.myHalf} rows={round.rows} cols={myCols} mine />
              ) : (
                <Chip key={side} label={t.sky.partnerHalf(partnerName)} rows={round.rows} cols={partnerCols} />
              ),
            )}
          </div>
        )}

        {state.phase === 'join' && mine && (
          <>
            {!mine.done ? (
              <>
                <div className="sky-prompt">{t.sky.wholeSky}</div>
                <div className="equation-row sky-equation" dir="ltr">
                  <span className="equation-operand">{round.rows}</span>
                  <span className="equation-op">&times;</span>
                  <span className="equation-operand">{whole}</span>
                  <span className="equation-op">=</span>
                  <span className="equation-operand">?</span>
                </div>
                {mine.misses > 0 && (
                  <div className="sky-hint" dir="auto">
                    {t.sky.hintAdd(round.rows * round.cols.left, round.rows * round.cols.right)}
                  </div>
                )}
                <Choices key={`j${state.roundIndex}-${mine.misses}`} choices={choices} misses={mine.misses} onPick={(v) => answer('join', v)} />
              </>
            ) : (
              <div className="sky-status is-pulse">{t.sky.waitPartner(partnerName)}</div>
            )}
          </>
        )}

        {lit && (
          <motion.div className="sky-lit" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
            <div className="sky-lit-title">{t.sky.litTitle}</div>
            <bdi dir="ltr" className="sky-lit-math">
              {round.rows} × {round.cols.left} + {round.rows} × {round.cols.right} = {round.rows} × {whole} = {round.rows * whole}
            </bdi>
            {role === 'host' ? (
              <button type="button" className="profile-primary" onClick={nextRound} autoFocus>
                {t.sky.nextSky}
              </button>
            ) : (
              <div className="sky-status">{t.sky.waitHost}</div>
            )}
          </motion.div>
        )}

      </div>
      <StatusLine />
    </div>
  );
}

function Summary() {
  const t = useT();
  const state = useSkyStore((s) => s.state);
  const role = useSkyStore((s) => s.role);
  const startGame = useSkyStore((s) => s.startGame);
  const closeSky = useSkyStore((s) => s.closeSky);
  return (
    <div className="sky-panel">
      <GradientText className="sky-title" colors={['#6ad7ff', '#c9a4de', '#ffd77a', '#6ad7ff']} animationSpeed={4}>
        {t.sky.summaryTitle}
      </GradientText>
      <Players />
      <div className="sky-summary">
        <span>✨ {t.sky.summaryLit(state.lit)}</span>
        <span>💎 {t.sky.summaryPerfect(state.perfect)}</span>
      </div>
      {role === 'host' ? (
        <button type="button" className="profile-primary" onClick={startGame}>
          {t.sky.playAgain}
        </button>
      ) : (
        <div className="sky-status">{t.sky.waitHost}</div>
      )}
      <button type="button" className="profile-secondary sky-close" onClick={closeSky}>
        {t.sky.close}
      </button>
    </div>
  );
}

export function SplitSky() {
  const t = useT();
  const open = useSkyStore((s) => s.open);
  const phase = useSkyStore((s) => s.state.phase);
  skyNames.fallback = t.defaultPilotName;
  if (!open) return null;
  return createPortal(
    <motion.div className="sky-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      {phase === 'lobby' ? <Lobby /> : phase === 'summary' ? <Summary /> : <Play />}
    </motion.div>,
    document.body,
  );
}
