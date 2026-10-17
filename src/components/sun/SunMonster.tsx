import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { nextQuestion, sunNames, useSunStore, type SunQuestion } from '../../game/useSunStore';
import { factAnswer, MAX_PLAYERS, monsterKind, SUN_MONSTERS, sunAwards, type SunEvent, type SunPlayer, type SunState } from '../../game/sun';
import { distractors } from '../../game/distractors';
import { missionOfKey, OP_SYMBOL, parsePair } from '../../game/mission';
import { useWarpCanvas } from '../useWarpCanvas';
import { CodeDisplay, CodeEntry, LinkStatusLine } from '../sky/parts';
import { MonsterCanvas, type MonsterFx } from './MonsterCanvas';
import { NumberField, type NumberFieldFx } from './NumberField';
import { pilotColor } from './pilotColors';
import { RearShip } from '../spaceArt';
import { useT } from '../../i18n/useLang';
import { sfx } from '../../audio/sfx';
import { haptics } from '../../audio/haptics';
import GradientText from '../reactbits/GradientText';
import { playTrack } from '../../audio/useAudio';
import { warpTo } from '../warpTransition';
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
  const p = parsePair(fact);
  if (!p) return null;
  return (
    <bdi dir="ltr" className="sun-math">
      {p.a} {OP_SYMBOL[p.mission]} {p.b} = {factAnswer(fact)}
    </bdi>
  );
}

/** the four answer buttons: the answer and three near misses, in the question's mission */
function choicesFor(q: SunQuestion): number[] {
  return shuffled([factAnswer(q.fact) ?? 0, ...distractors(q.x, q.y, 3, missionOfKey(q.fact))]);
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

// The fight's monster, and the numbers drifting through space that it eats
// when nobody answers (NumberField hands them to it): shared, as the numbers
// are drawn behind the fight and the monster in it.
const monsterFx: React.RefObject<MonsterFx | null> = { current: null };
const numberField: React.RefObject<NumberFieldFx | null> = { current: null };
/** the fight shows a meal's strength once the number is crunched, or after this at the latest */
const FED_BY_MS = 4000;

// Back to the game through the warp; the theme music comes back from the tap
// (browsers only start music from one).
function warpHome(e: React.MouseEvent<HTMLElement>) {
  playTrack('theme');
  warpTo(useSunStore.getState().closeSun, e.currentTarget);
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

// ---------- the squadron ----------

/** how far out the ships sit, and how big they are, as fractions of the monster's square */
const SHIP_R = 0.47;
const SHIP_SIZE = 0.15;

/**
 * Where a pilot's ship sits: on an arc below the monster, in seat order from
 * left to right, each one turned so its nose points at the monster. The
 * beam leaves from the nose.
 */
function shipSpot(seat: number, n: number) {
  const arc = n > 1 ? Math.min(140, (n - 1) * 34) : 0;
  const phi = ((n > 1 ? -arc / 2 + (seat * arc) / (n - 1) : 0) * Math.PI) / 180;
  const at = (r: number) => ({ x: 0.5 + r * Math.sin(phi), y: 0.5 + r * Math.cos(phi) });
  return { ...at(SHIP_R), nose: at(SHIP_R - SHIP_SIZE * 0.45), turn: (-phi * 180) / Math.PI };
}

/** every pilot's ship and animal around the monster, on every phone; a ship kicks back when it fires */
function Squadron({ players, fired }: { players: SunPlayer[]; fired: Record<string, number> }) {
  const myId = useSunStore((s) => s.myId);
  return (
    <div className="sun-squadron" aria-hidden>
      {players.map((p, seat) => {
        const spot = shipSpot(seat, players.length);
        return (
          <div
            key={p.id}
            className={`sun-ship ${p.id === myId ? 'is-me' : ''} ${p.online ? '' : 'is-offline'}`}
            style={{ left: `${spot.x * 100}%`, top: `${spot.y * 100}%`, rotate: `${spot.turn}deg`, animationDelay: `${-seat * 0.7}s`, '--pilot': pilotColor(seat) } as React.CSSProperties}
          >
            <motion.div
              key={fired[p.id] ?? 0}
              className={`sun-ship-body ${fired[p.id] ? 'is-firing' : ''}`}
              initial={false}
              animate={fired[p.id] ? { y: [0, 10, 0] } : undefined}
              transition={{ duration: 0.4, ease: 'easeOut' }}
            >
              <span className="sun-ship-flame" />
              <RearShip size={64} color={pilotColor(seat)} />
              <span className="sun-ship-avatar">{p.avatar}</span>
            </motion.div>
          </div>
        );
      })}
    </div>
  );
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

      <button type="button" className="profile-secondary sky-close" onClick={role ? leave : warpHome}>
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
  const [choices, setChoices] = useState<number[]>(() => choicesFor(q));
  const [picked, setPicked] = useState<number | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const product = factAnswer(q.fact) ?? 0;

  // where my miss went
  useNewEvents(state.events, (e) => {
    if (e.kind === 'sent' && e.by === myId && e.fact === q.fact) setSentTo(e.to);
  });

  const ask = useCallback((next: SunQuestion) => {
    setQ(next);
    setChoices(choicesFor(next));
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
        <span className="equation-op">{OP_SYMBOL[missionOfKey(q.fact)]}</span>
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
    <motion.div className="sky-card sun-card sun-victory" initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 1.2, type: 'spring', stiffness: 260, damping: 16 }}>
      <div className="sky-lit-title">{t.sun.saved}</div>
      <div className="sky-hint">
        {t.sun.names[monsterKind(state)]} {t.sun.cured[monsterKind(state)]}
      </div>
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
  const [toasts, setToasts] = useState<Toast[]>([]);
  // strength the monster ate back but hasn't shown yet: it shows once the number is crunched
  const [owing, setOwing] = useState(0);
  const meals = useRef<number[]>([]);
  const toldHungry = useRef(false);
  const [pops, setPops] = useState<Record<string, number[]>>({});
  // how many shots each pilot's ship has fired here (each one replays the kick)
  const [fired, setFired] = useState<Record<string, number>>({});
  const [blast, setBlast] = useState<number | null>(null);
  const [coming, setComing] = useState(false);
  const kind = monsterKind(state);
  const name = t.sun.names[kind];

  const toast = useCallback((kind: Toast['kind'], body: React.ReactNode, id: number) => {
    setToasts((ts) => [...ts.slice(-1), { id, kind, body }]);
    window.setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), TOAST_MS);
  }, []);

  const fed = useCallback((id?: number) => {
    const i = id === undefined ? 0 : meals.current.indexOf(id);
    if (i < 0 || i >= meals.current.length) return;
    meals.current.splice(i, 1);
    setOwing((n) => Math.max(0, n - 1));
  }, []);

  // everything the team does shows on every phone
  useNewEvents(state.events, (e) => {
    if (e.kind === 'eat') {
      // too quiet: it eats a number from space, and is stronger once it's crunched it
      meals.current.push(e.id);
      setOwing((n) => n + 1);
      window.setTimeout(() => fed(e.id), FED_BY_MS);
      numberField.current?.feed(t.sun.crunch[Math.floor(Math.random() * t.sun.crunch.length)]);
      sfx.slurp();
      if (!toldHungry.current) {
        toldHungry.current = true;
        toast('team', <>👾 {t.sun.ate}</>, e.id);
      }
      return;
    }
    const seat = seatOf(state, e.by);
    if (e.kind === 'hit') {
      const { nose } = shipSpot(seat, state.players.length);
      monsterFx.current?.beam(pilotColor(seat), nose.x, nose.y);
      setFired((f) => ({ ...f, [e.by]: (f[e.by] ?? 0) + 1 }));
      if (e.by !== myId) sfx.zap(seat);
      warpKick(0.35);
      setPops((ps) => ({ ...ps, [e.by]: [...(ps[e.by] ?? []).slice(-2), e.id] }));
    } else if (e.kind === 'miss') {
      monsterFx.current?.gloat(t.sun.taunts[Math.floor(Math.random() * t.sun.taunts.length)]);
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
    // not on the hit that cures it: that moment belongs to the monster
    if (state.combo <= before || state.combo % COMBO_EVERY !== 0 || state.phase !== 'fight') return;
    monsterFx.current?.ring(GOLD);
    sfx.milestone(state.combo);
    warpKick(1.6);
    setBlast(state.combo);
    const timer = window.setTimeout(() => setBlast(null), 1700);
    return () => window.clearTimeout(timer);
  }, [state.combo, state.phase]);

  // a new monster (or the end of this one) owes nothing
  useEffect(() => {
    meals.current = [];
    setOwing(0);
  }, [state.monster, state.phase]);

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

  // cured: its letters swirl into a friend, who then shows off
  const onCured = useCallback(() => {
    sfx.monsterCured();
    haptics.correct(5);
    warpKick(2.2);
  }, []);
  const onCheer = useCallback(() => {
    sfx.constellation();
    haptics.tick();
    warpKick(1.2);
  }, []);
  const onCrunch = useCallback(() => {
    sfx.crunch();
    haptics.tick();
  }, []);
  const onFed = useCallback(() => fed(), [fed]);

  // what the bar and the monster show: a meal counts once it's crunched
  const hp = Math.max(0, state.hp - owing);
  const strength = state.maxHp > 0 ? hp / state.maxHp : 0;
  const low = state.phase === 'fight' && strength < 0.25;
  const saved = state.phase !== 'fight';
  return (
    <div className="sun-fight">
      <div className="sun-top">
        <button type="button" className="sun-quit" onClick={warpHome} aria-label={t.sky.close}>
          ✕
        </button>
        <div className="sky-round">
          {t.sun.monster(state.monster + 1, SUN_MONSTERS)} · {name}
        </div>
      </div>
      {/* once it's saved, the bar fills back up as a happy meter */}
      <div ref={hpRef} className={`sun-hp ${low ? 'is-low' : ''} ${saved ? 'is-saved' : ''}`} role="meter" aria-valuemin={0} aria-valuemax={state.maxHp} aria-valuenow={hp}>
        <div className="sun-hp-lag" style={{ width: `${strength * 100}%` }} />
        <div className="sun-hp-fill" style={{ width: `${saved ? 100 : strength * 100}%` }} />
        <span className="sun-hp-text">{saved ? t.sun.savedBar : `👾 ${t.sun.hpLeft(hp)}`}</span>
      </div>

      <div className="sun-stage">
        <div className="sun-arena">
          <MonsterCanvas
            monster={state.monster}
            kind={kind}
            hp={hp}
            maxHp={state.maxHp}
            fx={monsterFx}
            onCured={onCured}
            onCheer={onCheer}
            onCrunch={onCrunch}
            onFed={onFed}
          />
          <Squadron players={state.players} fired={fired} />
        </div>

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
          {blast !== null && state.phase === 'fight' && (
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
      <div className="sun-friends">
        <div className="settings-label">💛 {t.sun.friends}</div>
        <div className="sun-friends-row">
          {Array.from({ length: SUN_MONSTERS }, (_, k) => monsterKind({ ...state, monster: k })).map((kind, k) => (
            <div key={k} className="sun-friend">
              <MonsterCanvas monster={k} kind={kind} hp={0} maxHp={1} wait={0.2 + k * 0.5} />
              <span className="sun-friend-name">{t.sun.names[kind]}</span>
            </div>
          ))}
        </div>
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
      <button type="button" className="profile-secondary sky-close" onClick={warpHome}>
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
  // no fade of its own: it opens behind the warp (warpTransition.ts), which clears to show it
  return createPortal(
    <div className="sun-overlay">
      <Warp />
      {(state.phase === 'fight' || state.phase === 'defeated') && <NumberField fx={monsterFx} field={numberField} />}
      <div className="sun-content">
        {state.phase === 'lobby' ? <Lobby /> : state.phase === 'summary' ? <Summary state={state} /> : <Fight state={state} />}
      </div>
    </div>,
    document.body,
  );
}
