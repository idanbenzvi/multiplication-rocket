import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { nextQuestion, sunNames, useSunStore, type SunQuestion } from '../../game/useSunStore';
import { MAX_PLAYERS, SUN_MONSTERS, type SunPlayer, type SunState } from '../../game/sun';
import { distractors } from '../../game/distractors';
import { useWarpCanvas } from '../useWarpCanvas';
import { CodeDisplay, CodeEntry, LinkStatusLine } from '../sky/parts';
import { MonsterCanvas } from './MonsterCanvas';
import { useT } from '../../i18n/useLang';
import { sfx } from '../../audio/sfx';
import { haptics } from '../../audio/haptics';
import GradientText from '../reactbits/GradientText';
import '../sky/sky.css';
import './sun.css';

const RIGHT_PAUSE_MS = 700;
const WRONG_PAUSE_MS = 1800;
const TIP_MS = 4500;

function shuffled<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const nameOf = (state: SunState, id: string) => state.players.find((p) => p.id === id)?.name ?? sunNames.fallback;
const avatarOf = (state: SunState, id: string) => state.players.find((p) => p.id === id)?.avatar ?? '🙂';

function Status() {
  const status = useSunStore((s) => s.status);
  const error = useSunStore((s) => s.error);
  const role = useSunStore((s) => s.role);
  const reconnect = useSunStore((s) => s.reconnect);
  return <LinkStatusLine status={status} error={error} role={role} reconnect={reconnect} />;
}

function Roster({ players, showHits }: { players: SunPlayer[]; showHits?: boolean }) {
  const t = useT();
  const myId = useSunStore((s) => s.myId);
  return (
    <div className="sun-roster">
      {players.map((p) => (
        <div key={p.id} className={`sun-pilot ${p.id === myId ? 'is-me' : ''} ${p.online ? '' : 'is-offline'}`} title={p.online ? undefined : t.sun.offline}>
          <span className="sun-pilot-avatar">{p.avatar}</span>
          <span className="sun-pilot-name" dir="auto">
            {p.name}
          </span>
          {showHits && <span className="sun-pilot-hits">💥 {p.hits}</span>}
        </div>
      ))}
    </div>
  );
}

// ---------- lobby ----------

function Lobby() {
  const t = useT();
  const role = useSunStore((s) => s.role);
  const code = useSunStore((s) => s.code);
  const status = useSunStore((s) => s.status);
  const state = useSunStore((s) => s.state);
  const myId = useSunStore((s) => s.myId);
  const host = useSunStore((s) => s.host);
  const join = useSunStore((s) => s.join);
  const start = useSunStore((s) => s.start);
  const leave = useSunStore((s) => s.leave);
  const closeSun = useSunStore((s) => s.closeSun);
  const online = state.players.filter((p) => p.online).length;
  const seated = state.players.some((p) => p.id === myId);

  return (
    <div className="sky-panel sun-panel">
      <div className="sky-title-row">
        <span aria-hidden>👾</span>
        <GradientText className="sky-title" colors={['#ffd77a', '#ff9d4a', '#ff5c8a', '#ffd77a']} animationSpeed={4}>
          {t.sun.title}
        </GradientText>
      </div>

      {role === null && (
        <>
          <p className="sky-intro">{t.sun.intro}</p>
          <div className="settings-segment">
            <button type="button" className="settings-option" onClick={host}>
              <span className="settings-option-name">{t.sun.host}</span>
              <span className="settings-option-hint">{t.sun.hostHint}</span>
            </button>
            <button type="button" className="settings-option" onClick={() => useSunStore.setState({ role: 'guest', status: null, error: null })}>
              <span className="settings-option-name">{t.sun.join}</span>
              <span className="settings-option-hint">{t.sun.joinHint}</span>
            </button>
          </div>
        </>
      )}

      {role === 'host' && (
        <div className="sky-lobby">
          {code && (
            <>
              <div className="settings-label">{t.sun.yourCode}</div>
              <CodeDisplay code={code} />
              <div className="sky-hint">{t.sun.tellCode}</div>
            </>
          )}
          <Status />
          <div className="settings-label">{t.sun.pilots(state.players.length, MAX_PLAYERS)}</div>
          <Roster players={state.players} />
          {code && online < 2 && <div className="sky-status is-pulse">{t.sun.waiting}</div>}
          <button type="button" className="profile-primary" disabled={online < 2} onClick={start}>
            {online < 2 ? t.sun.needTwo : t.sun.start}
          </button>
        </div>
      )}

      {role === 'guest' &&
        (status === 'connected' || status === 'lost' ? (
          <div className="sky-lobby">
            <div className="settings-label">{t.sun.pilots(state.players.length, MAX_PLAYERS)}</div>
            <Roster players={state.players} />
            <Status />
            {status === 'connected' &&
              (seated || state.players.length === 0 ? (
                <div className="sky-status is-pulse">{t.sun.waitHost}</div>
              ) : (
                <div className="sky-status is-error">{t.sun.full}</div>
              ))}
          </div>
        ) : (
          <CodeEntry hint={t.sun.enterCode} busy={status === 'connecting'} onJoin={join}>
            <Status />
          </CodeEntry>
        ))}

      <button type="button" className="profile-secondary sky-close" onClick={role ? leave : closeSun}>
        {role ? t.sky.back : t.sky.close}
      </button>
    </div>
  );
}

// ---------- the fight ----------

/** the tip from a teammate who solved one of my misses */
function Tip({ state }: { state: SunState }) {
  const t = useT();
  const myId = useSunStore((s) => s.myId);
  const tip = state.players.find((p) => p.id === myId)?.tip ?? null;
  const [shownId, setShownId] = useState<number | null>(null);
  const seen = useRef(tip?.id ?? null); // not one from before this phone (re)joined

  useEffect(() => {
    if (!tip || tip.id === seen.current) return;
    seen.current = tip.id;
    setShownId(tip.id);
    sfx.pick(2);
    const timer = window.setTimeout(() => setShownId(null), TIP_MS);
    return () => window.clearTimeout(timer);
  }, [tip]);

  const [a, b] = tip ? tip.fact.split('x').map(Number) : [0, 0];
  return (
    <AnimatePresence>
      {tip && shownId === tip.id && (
        <motion.div key={tip.id} className="sun-tip" initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}>
          <span>
            {avatarOf(state, tip.from)} {t.sun.tip(nameOf(state, tip.from))}
          </span>{' '}
          <bdi dir="ltr" className="sun-tip-math">
            {a} × {b} = {a * b}
          </bdi>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Question({ state }: { state: SunState }) {
  const t = useT();
  const answer = useSunStore((s) => s.answer);
  const myId = useSunStore((s) => s.myId);
  const [q, setQ] = useState<SunQuestion>(() => nextQuestion());
  const [choices, setChoices] = useState<number[]>(() => shuffled([q.x * q.y, ...distractors(q.x, q.y, 3)]));
  const [picked, setPicked] = useState<number | null>(null);
  const product = q.x * q.y;
  const mates = state.players.some((p) => p.online && p.id !== myId);

  const ask = useCallback((next: SunQuestion) => {
    setQ(next);
    setChoices(shuffled([next.x * next.y, ...distractors(next.x, next.y, 3)]));
    setPicked(null);
  }, []);

  useEffect(() => {
    if (picked === null) return;
    const timer = window.setTimeout(() => ask(nextQuestion(q.fact)), picked === product ? RIGHT_PAUSE_MS : WRONG_PAUSE_MS);
    return () => window.clearTimeout(timer);
  }, [picked, product, q.fact, ask]);

  const pick = (v: number) => {
    if (picked !== null) return;
    setPicked(v);
    answer(q, v);
    if (v === product) {
      sfx.correct(1, false);
      haptics.tick();
    } else {
      sfx.wrong();
      haptics.thump();
    }
  };

  const right = picked === product;
  return (
    <div className="sky-card sun-card">
      {q.card && (
        <div className={`sun-card-tag is-${q.card.kind}`}>
          {q.card.kind === 'help' ? (
            <>
              {avatarOf(state, q.card.from)} {t.sun.help(nameOf(state, q.card.from))}
            </>
          ) : (
            <>🔁 {t.sun.retry}</>
          )}
        </div>
      )}
      <div className="equation-row sky-equation" dir="ltr">
        <span className="equation-operand">{q.x}</span>
        <span className="equation-op">&times;</span>
        <span className="equation-operand">{q.y}</span>
        <span className="equation-op">=</span>
        <span className="equation-operand">{picked === null ? '?' : product}</span>
      </div>
      <motion.div
        key={`${q.fact}-${q.card?.id ?? ''}-${q.x}`}
        className="choice-grid sky-choices"
        dir="ltr"
        animate={picked !== null && !right ? { x: [0, -8, 8, -4, 4, 0] } : undefined}
      >
        {choices.map((c) => (
          <button
            key={c}
            type="button"
            className={`choice-btn ${picked !== null && c === product ? 'is-right' : ''} ${picked === c && !right ? 'is-wrong' : ''}`}
            disabled={picked !== null}
            onClick={() => pick(c)}
          >
            {c}
          </button>
        ))}
      </motion.div>
      <div className="sun-feedback" aria-live="polite">
        {picked !== null &&
          (right ? (
            <span className="is-hit">{t.sun.hit}</span>
          ) : (
            <span>
              {t.sun.oops}{' '}
              <bdi dir="ltr" className="sun-tip-math">
                {q.x} × {q.y} = {product}
              </bdi>
              {!q.card && mates && <span className="sun-shared">{t.sun.shared}</span>}
            </span>
          ))}
      </div>
    </div>
  );
}

function Defeated({ state }: { state: SunState }) {
  const t = useT();
  const role = useSunStore((s) => s.role);
  const next = useSunStore((s) => s.next);
  const last = state.monster + 1 >= SUN_MONSTERS;
  return (
    <motion.div className="sky-card sun-card" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.8 }}>
      <div className="sky-lit-title">{t.sun.defeated}</div>
      <div className="sky-hint">{t.sun.burst(t.sun.names[state.monster % t.sun.names.length])}</div>
      {role === 'host' ? (
        <button type="button" className="profile-primary" onClick={next} autoFocus>
          {last ? t.sun.nextLast : t.sun.nextMonster}
        </button>
      ) : (
        <div className="sky-status is-pulse">{t.sun.waitNext}</div>
      )}
    </motion.div>
  );
}

function Fight({ state }: { state: SunState }) {
  const t = useT();
  const closeSun = useSunStore((s) => s.closeSun);
  const prevPhase = useRef(state.phase);
  useEffect(() => {
    if (state.phase === 'defeated' && prevPhase.current === 'fight') {
      sfx.wormhole();
      haptics.correct(5);
    }
    prevPhase.current = state.phase;
  }, [state.phase]);

  const strength = state.maxHp > 0 ? state.hp / state.maxHp : 0;
  return (
    <div className="sun-fight">
      <div className="sun-top">
        <button type="button" className="sun-quit" onClick={closeSun} aria-label={t.sky.close}>
          ✕
        </button>
        <div className="sky-round">
          {t.sun.monster(state.monster + 1, SUN_MONSTERS)} · {t.sun.names[state.monster % t.sun.names.length]}
        </div>
      </div>
      <div className="sun-hp" role="meter" aria-valuemin={0} aria-valuemax={state.maxHp} aria-valuenow={state.hp}>
        <div className="sun-hp-fill" style={{ width: `${strength * 100}%` }} />
        <span className="sun-hp-text">{state.phase === 'fight' ? t.sun.hpLeft(state.hp) : t.sun.defeated}</span>
      </div>
      <div className="sun-stage">
        <MonsterCanvas monster={state.monster} hp={state.hp} maxHp={state.maxHp} blows={state.blows} heals={state.heals} />
        <Tip state={state} />
      </div>
      <Roster players={state.players} showHits />
      {state.phase === 'fight' ? <Question key={state.monster} state={state} /> : <Defeated state={state} />}
      <Status />
    </div>
  );
}

function Summary({ state }: { state: SunState }) {
  const t = useT();
  const role = useSunStore((s) => s.role);
  const start = useSunStore((s) => s.start);
  const closeSun = useSunStore((s) => s.closeSun);
  const online = state.players.filter((p) => p.online).length;
  return (
    <div className="sky-panel sun-panel">
      <GradientText className="sky-title" colors={['#ffd77a', '#ff9d4a', '#ff5c8a', '#ffd77a']} animationSpeed={4}>
        {t.sun.summaryTitle}
      </GradientText>
      <div className="sun-score">
        {[...state.players]
          .sort((a, b) => b.hits + b.helped - (a.hits + a.helped))
          .map((p) => (
            <div key={p.id} className="sun-score-row">
              <span className="sun-pilot-avatar">{p.avatar}</span>
              <span className="sun-pilot-name" dir="auto">
                {p.name}
              </span>
              <span>💥 {t.sun.summaryHits(p.hits)}</span>
              <span>🆘 {t.sun.summaryHelped(p.helped)}</span>
            </div>
          ))}
      </div>
      {role === 'host' ? (
        <button type="button" className="profile-primary" disabled={online < 2} onClick={start}>
          {t.sky.playAgain}
        </button>
      ) : (
        <div className="sky-status">{t.sun.waitHost}</div>
      )}
      <Status />
      <button type="button" className="profile-secondary sky-close" onClick={closeSun}>
        {t.sky.close}
      </button>
    </div>
  );
}

function Warp() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const speed = useRef(0.12);
  useWarpCanvas(canvasRef, 0.4, speed);
  return <canvas ref={canvasRef} className="sun-warp" aria-hidden />;
}

export function SunMonster() {
  const t = useT();
  const open = useSunStore((s) => s.open);
  const state = useSunStore((s) => s.state);
  sunNames.fallback = t.defaultPilotName;
  if (!open) return null;
  return createPortal(
    <motion.div className="sun-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <Warp />
      <div className="sun-content">
        {state.phase === 'lobby' ? <Lobby /> : state.phase === 'summary' ? <Summary state={state} /> : <Fight state={state} />}
      </div>
    </motion.div>,
    document.body,
  );
}
