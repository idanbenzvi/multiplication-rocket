import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { nextQuestion, sunNames, useSunStore, type SunQuestion } from '../../game/useSunStore';
import { MAX_PLAYERS, SUN_MONSTERS, sunAwards, type SunEvent, type SunPlayer, type SunState } from '../../game/sun';
import { distractors } from '../../game/distractors';
import { useWarpCanvas } from '../useWarpCanvas';
import { CodeDisplay, CodeEntry, LinkStatusLine } from '../sky/parts';
import { MonsterCanvas, type MonsterFx } from './MonsterCanvas';
import { pilotColor } from './pilotColors';
import { useT } from '../../i18n/useLang';
import { sfx } from '../../audio/sfx';
import { haptics } from '../../audio/haptics';
import GradientText from '../reactbits/GradientText';
import '../sky/sky.css';
import './sun.css';

const RIGHT_PAUSE_MS = 700;
const WRONG_PAUSE_MS = 2000;
const TOAST_MS = 3800;
const COMBO_EVERY = 5;
const GOLD = '#ffd77a';
const TITLE_COLORS = ['#ffd77a', '#ff9d4a', '#ff5c8a', '#ffd77a'];

function shuffled<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const pilot = (state: SunState, id: string) => state.players.find((p) => p.id === id);
const nameOf = (state: SunState, id: string) => pilot(state, id)?.name ?? sunNames.fallback;
const avatarOf = (state: SunState, id: string) => pilot(state, id)?.avatar ?? '🙂';
const seatOf = (state: SunState, id: string) => Math.max(0, state.players.findIndex((p) => p.id === id));
const helpWaiting = (p: SunPlayer) => p.inbox.some((c) => c.kind === 'help');

function Math2({ fact }: { fact: string }) {
  const [a, b] = fact.split('x').map(Number);
  return (
    <bdi dir="ltr" className="sun-math">
      {a} × {b} = {a * b}
    </bdi>
  );
}

/** calls back once for each event this phone hasn't played yet */
function useNewEvents(events: SunEvent[], onEvent: (e: SunEvent) => void) {
  // not the ones from before this screen opened (or this phone rejoined)
  const seen = useRef(events.length ? events[events.length - 1].id : 0);
  const handler = useRef(onEvent);
  useEffect(() => {
    handler.current = onEvent;
  });
  useEffect(() => {
    for (const e of events) {
      if (e.id <= seen.current) continue;
      seen.current = e.id;
      handler.current(e);
    }
  }, [events]);
}

// ---------- the starfield behind everything: it surges with the fight ----------

let warpBoost = 0;
function warpKick(amount: number) {
  warpBoost = Math.max(warpBoost, amount);
}

function Warp() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const speed = useRef(0.12);
  useWarpCanvas(canvasRef, 0.4, speed);
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.max(0, Math.min(0.1, (now - last) / 1000));
      last = now;
      warpBoost *= Math.exp(-dt * 1.8);
      speed.current = 0.12 + warpBoost;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={canvasRef} className="sun-warp" aria-hidden />;
}

function Status() {
  const status = useSunStore((s) => s.status);
  const error = useSunStore((s) => s.error);
  const role = useSunStore((s) => s.role);
  const reconnect = useSunStore((s) => s.reconnect);
  return <LinkStatusLine status={status} error={error} role={role} reconnect={reconnect} />;
}

/** the team, in seat order (left to right on every phone, like the beams) */
function Roster({ players, pops, fight }: { players: SunPlayer[]; pops?: Record<string, number[]>; fight?: boolean }) {
  const t = useT();
  const myId = useSunStore((s) => s.myId);
  return (
    <div className="sun-roster" dir="ltr">
      <AnimatePresence>
        {players.map((p, seat) => (
          <motion.div
            key={p.id}
            layout
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: p.online ? 1 : 0.4 }}
            exit={{ scale: 0, opacity: 0 }}
            className={`sun-pilot ${p.id === myId ? 'is-me' : ''} ${p.online ? '' : 'is-offline'}`}
            style={{ '--pilot': pilotColor(seat) } as React.CSSProperties}
            title={p.online ? undefined : t.sun.offline}
          >
            <span className="sun-pilot-avatar">{p.avatar}</span>
            <span className="sun-pilot-name" dir="auto">
              {p.name}
            </span>
            {fight && (
              <motion.span key={p.hits} className="sun-pilot-hits" initial={{ scale: 1.6 }} animate={{ scale: 1 }}>
                💥{p.hits}
              </motion.span>
            )}
            {fight && helpWaiting(p) && <span className="sun-pilot-sos">🆘</span>}
            {pops?.[p.id]?.map((id) => (
              <motion.span
                key={id}
                className="sun-pilot-pop"
                initial={{ y: 0, opacity: 1, scale: 0.6 }}
                animate={{ y: -34, opacity: 0, scale: 1.2 }}
                transition={{ duration: 0.9, ease: 'easeOut' }}
              >
                +1
              </motion.span>
            ))}
          </motion.div>
        ))}
      </AnimatePresence>
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

  // a chime for every pilot who joins the team
  const count = useRef(state.players.length);
  useEffect(() => {
    if (state.players.length > count.current) {
      sfx.pick(Math.min(3, state.players.length - 1));
      haptics.tick();
    }
    count.current = state.players.length;
  }, [state.players.length]);

  return (
    <div className="sky-panel sun-panel">
      <div className="sun-lurk">
        <MonsterCanvas monster={0} hp={1} maxHp={1} lurk />
      </div>
      <GradientText className="sky-title" colors={TITLE_COLORS} animationSpeed={4}>
        {t.sun.title}
      </GradientText>

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
          <button type="button" className="profile-primary sun-go" disabled={online < 2} onClick={start}>
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

interface Toast {
  id: number;
  kind: 'ask' | 'tip' | 'helped' | 'team';
  body: React.ReactNode;
}

function Question({ state }: { state: SunState }) {
  const t = useT();
  const answer = useSunStore((s) => s.answer);
  const myId = useSunStore((s) => s.myId);
  const [q, setQ] = useState<SunQuestion>(() => nextQuestion());
  const [choices, setChoices] = useState<number[]>(() => shuffled([q.x * q.y, ...distractors(q.x, q.y, 3)]));
  const [picked, setPicked] = useState<number | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const product = q.x * q.y;

  // where my miss went
  useNewEvents(state.events, (e) => {
    if (e.kind === 'sent' && e.by === myId && e.fact === q.fact) setSentTo(e.to);
  });

  const ask = useCallback((next: SunQuestion) => {
    setQ(next);
    setChoices(shuffled([next.x * next.y, ...distractors(next.x, next.y, 3)]));
    setPicked(null);
    setSentTo(null);
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
      sfx.correct(q.card?.kind === 'help' ? 4 : 1, false);
      haptics.tick();
    } else {
      sfx.wrong();
      haptics.thump();
    }
  };

  const right = picked === product;
  const rescue = q.card?.kind === 'help';
  return (
    <motion.div
      key={`${q.fact}-${q.card?.id ?? 'own'}-${q.x}`}
      className={`sky-card sun-card ${rescue ? 'is-rescue' : ''} ${q.card?.kind === 'retry' ? 'is-retry' : ''}`}
      initial={{ opacity: 0.4, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      {q.card && (
        <motion.div
          className={`sun-card-tag is-${q.card.kind}`}
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 400, damping: 14 }}
        >
          {avatarOf(state, q.card.from)}{' '}
          {q.card.kind === 'help' ? t.sun.help(nameOf(state, q.card.from)) : `🔁 ${t.sun.retryFrom(nameOf(state, q.card.from))}`}
        </motion.div>
      )}
      <div className="equation-row sky-equation" dir="ltr">
        <span className="equation-operand">{q.x}</span>
        <span className="equation-op">&times;</span>
        <span className="equation-operand">{q.y}</span>
        <span className="equation-op">=</span>
        <span className={`equation-operand ${picked !== null ? 'sun-answer' : ''}`}>{picked === null ? '?' : product}</span>
      </div>
      <motion.div className="choice-grid sky-choices" dir="ltr" animate={picked !== null && !right ? { x: [0, -8, 8, -4, 4, 0] } : undefined}>
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
            <motion.span className="is-hit" initial={{ scale: 0.6 }} animate={{ scale: 1 }}>
              {rescue && q.card ? t.sun.youHelped(nameOf(state, q.card.from)) : t.sun.hit}
            </motion.span>
          ) : (
            <span>
              {t.sun.oops} <Math2 fact={q.fact} />
              {sentTo && (
                <motion.span className="sun-shared" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
                  {t.sun.sentTo(nameOf(state, sentTo))}
                </motion.span>
              )}
            </span>
          ))}
      </div>
    </motion.div>
  );
}

function Defeated({ state }: { state: SunState }) {
  const t = useT();
  const role = useSunStore((s) => s.role);
  const next = useSunStore((s) => s.next);
  const last = state.monster + 1 >= SUN_MONSTERS;
  return (
    <motion.div className="sky-card sun-card sun-victory" initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.9, type: 'spring', stiffness: 260, damping: 16 }}>
      <div className="sky-lit-title">{t.sun.defeated}</div>
      <div className="sky-hint">{t.sun.burst(t.sun.names[state.monster % t.sun.names.length])}</div>
      <div className="sun-team-line">
        <span>💥 {t.sun.teamHits(state.blows)}</span>
        {state.bestCombo >= 3 && <span>🔥 {t.sun.bestCombo(state.bestCombo)}</span>}
      </div>
      {role === 'host' ? (
        <button type="button" className="profile-primary sun-go" onClick={next} autoFocus>
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
  const myId = useSunStore((s) => s.myId);
  const closeSun = useSunStore((s) => s.closeSun);
  const fx = useRef<MonsterFx | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [pops, setPops] = useState<Record<string, number[]>>({});
  const [blast, setBlast] = useState<number | null>(null);
  const [coming, setComing] = useState(false);
  const name = t.sun.names[state.monster % t.sun.names.length];

  const toast = useCallback((kind: Toast['kind'], body: React.ReactNode, id: number) => {
    setToasts((ts) => [...ts.slice(-1), { id, kind, body }]);
    window.setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), TOAST_MS);
  }, []);

  // everything the team does shows on every phone
  useNewEvents(state.events, (e) => {
    const seat = seatOf(state, e.by);
    if (e.kind === 'hit') {
      fx.current?.beam(pilotColor(seat), (seat + 0.5) / Math.max(1, state.players.length));
      if (e.by !== myId) sfx.zap(seat);
      warpKick(0.35);
      setPops((ps) => ({ ...ps, [e.by]: [...(ps[e.by] ?? []).slice(-2), e.id] }));
    } else if (e.kind === 'miss') {
      fx.current?.gloat(t.sun.taunts[Math.floor(Math.random() * t.sun.taunts.length)]);
      sfx.monsterLaugh();
    } else if (e.kind === 'sent' && e.to === myId) {
      toast('ask', <>{avatarOf(state, e.by)} 🆘 {t.sun.needsHelp(nameOf(state, e.by))}</>, e.id);
      sfx.pick(1);
      haptics.tick();
    } else if (e.kind === 'helped') {
      if (e.to === myId) {
        toast('tip', <>{avatarOf(state, e.by)} {t.sun.tip(nameOf(state, e.by))} <Math2 fact={e.fact} /></>, e.id);
        sfx.constellation();
      } else if (e.by !== myId) {
        toast('team', <>{avatarOf(state, e.by)} 🤝 {avatarOf(state, e.to)} {t.sun.helpedOther(nameOf(state, e.by), nameOf(state, e.to))}</>, e.id);
      } else {
        sfx.constellation();
      }
      warpKick(0.8);
    }
  });

  // a team combo: every 5 right answers in a row, by anyone
  const prevCombo = useRef(state.combo);
  useEffect(() => {
    const before = prevCombo.current;
    prevCombo.current = state.combo;
    if (state.combo <= before || state.combo % COMBO_EVERY !== 0) return;
    fx.current?.ring(GOLD);
    sfx.milestone(state.combo);
    warpKick(1.6);
    setBlast(state.combo);
    const timer = window.setTimeout(() => setBlast(null), 1700);
    return () => window.clearTimeout(timer);
  }, [state.combo]);

  // each monster arrives with a warning
  useEffect(() => {
    if (state.phase !== 'fight') return;
    setComing(true);
    sfx.monsterRise();
    const timer = window.setTimeout(() => setComing(false), 1900);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.monster]);

  // the bar jolts as each beam lands
  const hpRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (state.blows === 0) return;
    hpRef.current?.animate(
      [{ transform: 'none' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }, { transform: 'translateX(-2px)' }, { transform: 'none' }],
      { duration: 280, delay: 330 },
    );
  }, [state.blows]);

  const onBurst = useCallback(() => {
    sfx.monsterBurst();
    haptics.correct(5);
    warpKick(3);
  }, []);

  const strength = state.maxHp > 0 ? state.hp / state.maxHp : 0;
  const low = state.phase === 'fight' && strength < 0.25;
  return (
    <div className="sun-fight">
      <div className="sun-top">
        <button type="button" className="sun-quit" onClick={closeSun} aria-label={t.sky.close}>
          ✕
        </button>
        <div className="sky-round">
          {t.sun.monster(state.monster + 1, SUN_MONSTERS)} · {name}
        </div>
      </div>
      <div ref={hpRef} className={`sun-hp ${low ? 'is-low' : ''}`} role="meter" aria-valuemin={0} aria-valuemax={state.maxHp} aria-valuenow={state.hp}>
        <div className="sun-hp-lag" style={{ width: `${strength * 100}%` }} />
        <div className="sun-hp-fill" style={{ width: `${strength * 100}%` }} />
        <span className="sun-hp-text">{state.phase === 'fight' ? `👾 ${t.sun.hpLeft(state.hp)}` : t.sun.defeated}</span>
      </div>

      <div className="sun-stage">
        <MonsterCanvas monster={state.monster} hp={state.hp} maxHp={state.maxHp} fx={fx} onBurst={onBurst} />

        <div className="sun-toasts">
          <AnimatePresence>
            {toasts.map((x) => (
              <motion.div
                key={x.id}
                layout
                className={`sun-toast is-${x.kind}`}
                initial={{ opacity: 0, y: -14, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10 }}
              >
                {x.body}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        <AnimatePresence>
          {state.combo >= 2 && state.phase === 'fight' && (
            <motion.div key="combo" className="sun-combo" initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.5 }}>
              <motion.span key={state.combo} className="sun-combo-n" dir="ltr" initial={{ scale: 1.8 }} animate={{ scale: 1 }}>
                🔥×{state.combo}
              </motion.span>
              <span className="sun-combo-label">{t.sun.comboLabel}</span>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {blast !== null && (
            <motion.div key={blast} className="sun-banner is-combo" initial={{ opacity: 0, scale: 2.2 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}>
              {t.sun.comboBlast(blast)}
            </motion.div>
          )}
          {coming && (
            <motion.div key={`coming-${state.monster}`} className="sun-banner is-warning" initial={{ opacity: 0, scale: 1.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}>
              ⚠️ {t.sun.coming(name)}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <Roster players={state.players} pops={pops} fight />
      {state.phase === 'fight' ? <Question key={`q-${state.monster}`} state={state} /> : <Defeated state={state} />}
      <Status />
    </div>
  );
}

function Summary({ state }: { state: SunState }) {
  const t = useT();
  const role = useSunStore((s) => s.role);
  const myId = useSunStore((s) => s.myId);
  const start = useSunStore((s) => s.start);
  const closeSun = useSunStore((s) => s.closeSun);
  const online = state.players.filter((p) => p.online).length;
  const awards = sunAwards(state.players);
  useEffect(() => {
    sfx.launch();
  }, []);
  return (
    <div className="sky-panel sun-panel sun-summary">
      <GradientText className="sky-title" colors={TITLE_COLORS} animationSpeed={4}>
        {t.sun.summaryTitle}
      </GradientText>
      <div className="sun-team-line">
        <span>💥 {t.sun.teamHits(state.blows)}</span>
        {state.bestCombo >= 2 && <span>🔥 {t.sun.bestCombo(state.bestCombo)}</span>}
      </div>
      <div className="sun-score">
        {state.players.map((p, seat) => (
          <motion.div
            key={p.id}
            className={`sun-score-row ${p.id === myId ? 'is-me' : ''}`}
            style={{ '--pilot': pilotColor(seat) } as React.CSSProperties}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.25 + seat * 0.18 }}
          >
            <span className="sun-score-avatar">{p.avatar}</span>
            <span className="sun-score-who">
              <span className="sun-pilot-name" dir="auto">
                {p.name}
              </span>
              <span className="sun-award">{t.sun.awards[awards[p.id]]}</span>
            </span>
            <span className="sun-score-nums">
              <span>💥 {t.sun.summaryHits(p.hits)}</span>
              <span>🆘 {t.sun.summaryHelped(p.helped)}</span>
            </span>
          </motion.div>
        ))}
      </div>
      {state.rescues.length > 0 && (
        <div className="sun-learned">
          <div className="settings-label">🤝 {t.sun.learned}</div>
          <div className="sun-learned-list">
            {state.rescues.map((r, i) => (
              <span key={i} className="sun-learned-chip" dir="ltr">
                {avatarOf(state, r.by)}→{avatarOf(state, r.to)} <Math2 fact={r.fact} />
              </span>
            ))}
          </div>
        </div>
      )}
      {role === 'host' ? (
        <button type="button" className="profile-primary sun-go" disabled={online < 2} onClick={start}>
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
