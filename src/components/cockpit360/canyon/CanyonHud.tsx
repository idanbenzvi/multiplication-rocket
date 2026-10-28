import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useLang, useT } from '../../../i18n/useLang';
import { isTouchDevice } from '../../../settings/useSettings';
import { sfx } from '../../../audio/sfx';
import { OP_SYMBOL } from '../../../game/mission';
import CountUp from '../../reactbits/CountUp';
import Counter from '../../reactbits/Counter';
import DecryptedText from '../../reactbits/DecryptedText';
import ElectricBorder from '../../reactbits/ElectricBorder';
import GradientText from '../../reactbits/GradientText';
import ParticleText from '../../reactbits/ParticleText';
import ShinyText from '../../reactbits/ShinyText';
import StarBorder from '../../reactbits/StarBorder';
import { dirOfLook, pointOnQuad } from '../geometry';
import { NOSE_PITCH } from '../drive';
import { WINDSCREEN_PX, WINDSCREEN_QUAD } from '../screens';
import { GATE_GAP, LANE, RULER, SPAN, valueAt, type Gate, type GateResult } from './gates';
import { live, useCanyon } from './useCanyon';
import './canyon.css';

// What a Canyon Run shows the pilot. On the windscreen's glass, in the HUD's
// amber: the gate coming up and its fact, how far to it, the speed, the
// number the ship's aiming at (rolling up and down as it's steered, as the
// HUD's numbers do), a pip for each gate (gold a bullseye, cyan close, dim a
// miss), and, through a gate, what it was: BULLSEYE (and how many in a
// row), or how close, with a little number line from the number flown
// through to the answer, the gap between them being the difference. Over
// the view: the countdown before diving in (or, arriving, the canyon's name
// as the white clears), the way to steer (keys, the mouse across the
// screen, or a finger), End run, and the run's results at its end. Along
// the bottom while it flies, the steering rail: the next gate's numbers
// across the screen as the mouse steers by them, the ship's place on it,
// where it's going, and between them how many numbers it has still to go
// (taps add up, the count popping with each); with a mouse, the reticle
// stands for the pointer, the number under it in it and how far that is.

/** the nose on the windscreen's page (the flight's heading) */
const NOSE = (() => {
  const p = pointOnQuad(WINDSCREEN_QUAD, dirOfLook({ yaw: 0, pitch: NOSE_PITCH })) ?? [0.5, 0.5];
  return { x: p[0] * WINDSCREEN_PX[0], y: p[1] * WINDSCREEN_PX[1] };
})();
const SHOUT_MS = 2600;
/** the screen's edges the mouse steers short of (a share of its width, either side) */
const MOUSE_MARGIN = 0.1;

/** where a place across the canyon is across the screen (a share of its width): the ruler from one side to the other, short of the edges, as the mouse steers by it */
const railAt = (u: number) => MOUSE_MARGIN + ((Math.max(-RULER - LANE, Math.min(RULER + LANE, u)) + RULER) / (2 * RULER)) * (1 - 2 * MOUSE_MARGIN);
const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');

/** re-render every `ms` (the live numbers) */
function useTicker(ms: number) {
  const [, setN] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => !document.hidden && setN((n) => n + 1), ms);
    return () => window.clearInterval(id);
  }, [ms]);
}

const factOf = (g: Gate) => `${g.x} ${OP_SYMBOL[g.op]} ${g.y}`;

/** from the number flown through to the answer, on a little number line */
function Gap({ result, gate }: { result: GateResult; gate: Gate }) {
  const t = useT().canyon;
  const lo = Math.min(result.value, result.answer) - 2;
  const hi = Math.max(result.value, result.answer) + 2;
  const W = 560;
  const x = (n: number) => 20 + ((n - lo) / (hi - lo)) * (W - 40);
  const off = result.answer - result.value;
  const arc = Math.min(70, 18 + Math.abs(x(result.answer) - x(result.value)) * 0.25);
  return (
    <div className="cn-gap">
      <svg viewBox={`0 0 ${W} 150`} width={W} height={150} aria-hidden>
        <line x1={10} y1={110} x2={W - 10} y2={110} className="cn-gap-line" />
        {Array.from({ length: hi - lo + 1 }, (_, i) => lo + i).map((n) => (
          <line key={n} x1={x(n)} x2={x(n)} y1={n % 5 === 0 ? 96 : 102} y2={n % 5 === 0 ? 124 : 118} className="cn-gap-tick" />
        ))}
        <path d={`M ${x(result.value)} 100 Q ${(x(result.value) + x(result.answer)) / 2} ${100 - arc * 2} ${x(result.answer)} 100`} className="cn-gap-arc" />
        <text x={(x(result.value) + x(result.answer)) / 2} y={92 - arc} className="cn-gap-off">
          {off > 0 ? `+${off}` : off}
        </text>
        <g className="cn-gap-you">
          <path d={`M ${x(result.value)} 110 l -9 18 h 18 z`} />
          <text x={x(result.value)} y={146}>
            {result.value}
          </text>
        </g>
        <g className="cn-gap-answer">
          <circle cx={x(result.answer)} cy={110} r={8} />
          <text x={x(result.answer)} y={146}>
            {result.answer}
          </text>
        </g>
      </svg>
      <p>
        {t.youFlew(result.value)} · {t.wasHere(factOf(gate), result.answer)} · {t.gap(off)}
      </p>
    </div>
  );
}

/** the run on the windscreen's glass */
export function CanyonGlass() {
  const t = useT().canyon;
  const d = useT().deck;
  const rtl = useLang((s) => s.lang) === 'he';
  const phase = useCanyon((s) => s.phase);
  const shout = useCanyon((s) => s.shout);
  const titled = useCanyon((s) => s.titled);
  const [shown, setShown] = useState<typeof shout>(null);
  useTicker(110);
  useEffect(() => {
    if (!shout) return;
    setShown(shout);
    const id = window.setTimeout(() => setShown(null), SHOUT_MS);
    return () => window.clearTimeout(id);
  }, [shout]);

  const run = live.run;
  if (phase !== 'flight' || !run) {
    return <div className="ck3-hud-glass cn-glass" dir="ltr" />;
  }
  const gate = run.ahead();
  const to = run.toGate();
  const near = gate && to < 700;
  const aimed = gate && run.phase === 'fly' ? run.aimed() : null;
  const speed = run.forward() * 0.55;
  const shoutGate = shown ? run.gates[shown.result.gate] : null;

  return (
    <div className="ck3-hud-glass cn-glass" dir="ltr">
      {/* the gate coming up, and its fact (making way for what the last one was, or the canyon's name) */}
      <div className={`cn-fact ${shown || titled ? 'is-away' : ''}`}>
        {gate ? (
          <>
            <em>{t.gate(run.next + 1, run.gates.length)}</em>
            <AnimatePresence mode="wait">
              {near ? (
                <motion.b key={`f${run.next}`} className="cn-fact-big" initial={{ opacity: 0, scale: 1.4, filter: 'blur(8px)' }} animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }}>
                  {factOf(gate)} <span>= ?</span>
                </motion.b>
              ) : (
                <motion.b key={`w${run.next}`} className="cn-fact-wait" initial={{ opacity: 0 }} animate={{ opacity: 0.8 }} exit={{ opacity: 0 }}>
                  · · ·
                </motion.b>
              )}
            </AnimatePresence>
            <span className="cn-to">
              <em>{t.toGate}</em>
              <i style={{ '--k': Math.max(0, Math.min(1, 1 - to / GATE_GAP)) } as CSSProperties} />
              <b>{Math.max(0, Math.round(to * 1.8))}</b>
              <small>m</small>
            </span>
          </>
        ) : (
          <b className="cn-fact-wait">▲ ▲ ▲</b>
        )}
      </div>

      {/* the flight path marker, at the nose */}
      <svg className="cn-fpm" style={{ left: NOSE.x, top: NOSE.y }} viewBox="-60 -30 120 60" aria-hidden>
        <circle r="9" />
        <path d="M -9 0 H -34 M 9 0 H 34 M 0 -9 V -20" />
      </svg>

      {/* the number it's aiming at, under the nose */}
      {aimed !== null && (
        <div className="cn-aim" style={{ left: NOSE.x, top: NOSE.y + 44 }}>
          <em>{t.aim}</em>
          <span className="cn-aim-box">
            <Counter value={aimed} fontSize={58} textColor="currentColor" intro={false} />
          </span>
        </div>
      )}

      {/* the speed */}
      <div className="cn-speed">
        <em>{t.speed}</em>
        <b>{speed.toFixed(1)}</b>
        <small>{d.kms}</small>
        <i style={{ '--k': Math.min(1, run.ship.boost / 30) } as CSSProperties} />
      </div>

      {/* a pip for each gate */}
      <ol className="cn-pips">
        {run.gates.map((g, i) => {
          const r = run.results[i];
          return <li key={g.d} className={r ? `is-${r.verdict}` : i === run.next ? 'is-next' : ''} />;
        })}
      </ol>

      {/* through a gate: what it was */}
      <AnimatePresence>
        {shown && shoutGate && (
          <motion.div
            key={shown.id}
            className={`cn-shout is-${shown.result.verdict}`}
            dir={rtl ? 'rtl' : 'ltr'}
            initial={{ opacity: 0, scale: 0.6, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 1.15, filter: 'blur(6px)' }}
            transition={{ type: 'spring', stiffness: 420, damping: 22 }}
          >
            {shown.result.verdict === 'bullseye' ? (
              <>
                <ShinyText text={t.bullseye} className="cn-shout-word" color="#ffd36b" shineColor="#ffffff" speed={1.2} />
                {shown.combo >= 2 && (
                  <GradientText className="cn-shout-row" colors={['#ffd36b', '#ff9d4d', '#5cf2ff', '#ffd36b']} animationSpeed={1.6}>
                    {t.inARow(shown.combo)}
                  </GradientText>
                )}
                <span className="cn-shout-fact">{t.wasHere(factOf(shoutGate), shown.result.answer)}</span>
              </>
            ) : (
              <>
                <span className="cn-shout-word">{shown.result.verdict === 'close' ? t.close : t.miss}</span>
                <Gap result={shown.result} gate={shoutGate} />
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---- over the view ----

/** steering: keys (← → and A D), and on a touch screen a tap either side, a hold, or a finger slid across */
function useSteering(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const dirOf = (e: KeyboardEvent): -1 | 1 | 0 => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') return -1;
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') return 1;
      return 0;
    };
    const down = (e: KeyboardEvent) => {
      const dir = dirOf(e);
      if (!dir) return;
      e.preventDefault();
      e.stopPropagation();
      if (!e.repeat) live.run?.press(dir, e.timeStamp / 1000);
    };
    const up = (e: KeyboardEvent) => {
      const dir = dirOf(e);
      if (!dir) return;
      e.stopPropagation();
      live.run?.release(dir);
    };
    window.addEventListener('keydown', down, true);
    window.addEventListener('keyup', up, true);
    return () => {
      window.removeEventListener('keydown', down, true);
      window.removeEventListener('keyup', up, true);
    };
  }, [enabled]);
}

/** the mouse across the screen: the ruler ahead from one side to the other, the ship aiming at the number under it */
function useMouseSteering(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const move = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      // (a margin either side, so the ends are easy to reach)
      const k = (e.clientX / window.innerWidth - MOUSE_MARGIN) / (1 - 2 * MOUSE_MARGIN);
      live.run?.aimAt(-RULER + Math.max(0, Math.min(1, k)) * RULER * 2);
    };
    window.addEventListener('pointermove', move);
    return () => window.removeEventListener('pointermove', move);
  }, [enabled]);
}

/** the steering rail along the bottom, and the mouse's reticle (moved each frame, outside React) */
function SteerRail({ mouse }: { mouse: boolean }) {
  const t = useT().canyon;
  const root = useRef<HTMLDivElement>(null);
  const ship = useRef<HTMLDivElement>(null);
  const span = useRef<HTMLDivElement>(null);
  const target = useRef<HTMLDivElement>(null);
  const targetNum = useRef<HTMLElement>(null);
  const count = useRef<HTMLElement>(null);
  const reticle = useRef<HTMLDivElement>(null);
  const reticleNum = useRef<HTMLElement>(null);
  const reticleBy = useRef<HTMLElement>(null);
  const [lo, setLo] = useState<number | null>(() => live.run?.ruler()?.lo ?? null);

  useEffect(() => {
    let raf = 0;
    let mx = -1;
    let my = -1;
    const shown = { lo: Number.NaN, pending: 0, target: Number.NaN, under: Number.NaN, by: Number.NaN, on: false };
    const move = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      mx = e.clientX;
      my = e.clientY;
    };
    const pop = (el: HTMLElement | null) => {
      if (!el) return;
      el.classList.remove('is-pop');
      void el.offsetWidth;
      el.classList.add('is-pop');
    };
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const run = live.run;
      const g = run?.ruler();
      const on = !!run && !!g && run.phase === 'fly';
      if (on !== shown.on) {
        root.current?.classList.toggle('is-on', on);
        shown.on = on;
      }
      if (!run || !g) return;
      if (g.lo !== shown.lo) {
        shown.lo = g.lo;
        setLo(g.lo);
      }
      const W = window.innerWidth;
      const xs = railAt(run.ship.u) * W;
      const goal = run.steer.target ?? run.ship.u;
      const xt = railAt(goal) * W;
      if (ship.current) ship.current.style.transform = `translateX(${xs}px)`;
      if (target.current) target.current.style.transform = `translateX(${xt}px)`;
      if (span.current) span.current.style.transform = `translateX(${Math.min(xs, xt)}px) scaleX(${Math.abs(xt - xs)})`;
      // how many numbers still to go, popping as taps add up
      const pending = run.pending();
      if (pending !== shown.pending) {
        // (arrived, it keeps its last count as it fades)
        if (count.current && pending !== 0) {
          count.current.textContent = signed(pending);
          if (Math.abs(pending) > Math.abs(shown.pending)) pop(count.current);
        }
        root.current?.classList.toggle('is-going', pending !== 0);
        shown.pending = pending;
      }
      const aimed = valueAt(g, goal);
      if (aimed !== shown.target && targetNum.current) {
        targetNum.current.textContent = String(aimed);
        shown.target = aimed;
      }
      // the reticle, for the pointer: the number under it, and how far that is from the ship's
      if (mouse && reticle.current && mx >= 0) {
        reticle.current.style.transform = `translate(${mx}px, ${my}px)`;
        reticle.current.classList.add('is-on');
        const pointer = run.steer.pointer ?? goal;
        const under = valueAt(g, pointer);
        const by = under - valueAt(g, run.ship.u);
        if (under !== shown.under && reticleNum.current) {
          reticleNum.current.textContent = String(under);
          shown.under = under;
        }
        if (by !== shown.by && reticleBy.current) {
          reticleBy.current.textContent = by === 0 ? '●' : `${signed(by)} ${by > 0 ? '▶' : '◀'}`;
          reticle.current.classList.toggle('is-here', by === 0);
          shown.by = by;
        }
      }
    };
    raf = requestAnimationFrame(frame);
    window.addEventListener('pointermove', move);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', move);
    };
  }, [mouse]);

  return (
    <>
      <div ref={root} className="cn-rail" dir="ltr" style={{ '--m': `${MOUSE_MARGIN * 100}%` } as CSSProperties} aria-hidden>
        <div className="cn-rail-track">
          {lo !== null &&
            Array.from({ length: SPAN + 1 }, (_, i) => lo + i).map((n, i) => (
              <span key={n} className={`cn-rail-tick ${n % 5 === 0 ? 'is-five' : ''}`} style={{ left: `${(MOUSE_MARGIN + (i / SPAN) * (1 - 2 * MOUSE_MARGIN)) * 100}%` }}>
                {n % 5 === 0 && <b>{n}</b>}
              </span>
            ))}
        </div>
        <div ref={span} className="cn-rail-span" />
        <div ref={target} className="cn-rail-target">
          <b ref={targetNum} />
          <i />
          <em ref={count} className="cn-rail-count" />
        </div>
        <div ref={ship} className="cn-rail-ship">
          <svg viewBox="-12 -10 24 20">
            <path d="M 0 -9 L 10 8 L 0 3 L -10 8 Z" />
          </svg>
        </div>
        <em className="cn-rail-label">{t.aim}</em>
      </div>
      {mouse && (
        <div ref={reticle} className="cn-reticle" aria-hidden>
          <svg viewBox="-40 -40 80 80">
            <circle r="22" className="cn-reticle-ring" />
            <circle r="30" className="cn-reticle-sweep" />
            <path d="M -38 0 H -26 M 26 0 H 38 M 0 -38 V -26 M 0 26 V 38" />
          </svg>
          <b ref={reticleNum} />
          <em ref={reticleBy} />
        </div>
      )}
    </>
  );
}

function SteerPad() {
  const touch = useRef<{ id: number; x: number; side: -1 | 1; from: number; dragging: boolean } | null>(null);
  const onDown = (e: React.PointerEvent) => {
    const run = live.run;
    if (!run || touch.current) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const side = e.clientX < window.innerWidth / 2 ? -1 : 1;
    touch.current = { id: e.pointerId, x: e.clientX, side, from: run.steer.target ?? run.ship.u, dragging: false };
    run.press(side, e.timeStamp / 1000);
  };
  const onMove = (e: React.PointerEvent) => {
    const t = touch.current;
    const run = live.run;
    if (!t || !run || t.id !== e.pointerId) return;
    const dx = e.clientX - t.x;
    if (!t.dragging && Math.abs(dx) > 14) {
      t.dragging = true;
      run.release();
    }
    // (a number for every so many pixels slid)
    if (t.dragging) run.dragTo(t.from + (dx / Math.max(24, window.innerWidth / 22)) * LANE);
  };
  const onUp = (e: React.PointerEvent) => {
    const t = touch.current;
    const run = live.run;
    if (!t || t.id !== e.pointerId) return;
    touch.current = null;
    if (!run) return;
    if (t.dragging) run.endDrag();
    else run.release(t.side);
  };
  return <div className="cn-pad" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} />;
}

function Countdown() {
  const t = useT().canyon;
  const [step, setStep] = useState(-1);
  useEffect(() => {
    // 3, 2, 1, GO, the white-out on its heels
    const at = [0.55, 1.3, 2.05, 2.8];
    const ids = at.map((s, i) =>
      window.setTimeout(() => {
        setStep(i);
        sfx.blip(i === 3 ? 6 : i);
      }, s * 1000),
    );
    return () => ids.forEach((id) => window.clearTimeout(id));
  }, []);
  const label = step < 0 ? null : step < 3 ? String(3 - step) : t.go;
  return (
    <AnimatePresence>
      {label && (
        <motion.b key={label} className="cn-count" initial={{ opacity: 0, scale: 2.2 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.6 }} transition={{ duration: 0.28 }}>
          {label}
        </motion.b>
      )}
    </AnimatePresence>
  );
}

export function CanyonVisor() {
  const t = useT().canyon;
  const lang = useLang((s) => s.lang);
  const phase = useCanyon((s) => s.phase);
  const summary = useCanyon((s) => s.summary);
  const land = useCanyon((s) => s.land);
  const close = useCanyon((s) => s.close);
  const start = useCanyon((s) => s.start);
  const rtl = lang === 'he';
  const entry = useCanyon((s) => s.entry);
  const veil = useCanyon((s) => s.veil);
  // arriving: the canyon's name, once the white's clearing
  const titled = useCanyon((s) => s.titled && s.phase === 'flight');
  useSteering(phase === 'flight');
  useMouseSteering(phase === 'flight' && !isTouchDevice);
  const place = useT();
  const world = live.place.world;
  const [title, setTitle] = useState({ w: 0, h: 0 });
  useEffect(() => setTitle({ w: Math.min(window.innerWidth * 0.86, 720), h: Math.min(170, window.innerWidth * 0.2) }), []);

  return (
    <div className={`cn-visor is-${phase}`} dir={rtl ? 'rtl' : 'ltr'}>
      {phase === 'flight' && isTouchDevice && <SteerPad />}

      {phase === 'intro' && (
        <div className="cn-intro">
          <DecryptedText text={t.manual} className="cn-intro-manual" animateOn="view" speed={40} maxIterations={10} sequential revealDirection="start" characters="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*" />
          {title.w > 0 && (
            <div className="cn-intro-title" style={{ width: title.w, height: title.h }}>
              <ParticleText text={t.title} fontFamily="'Orbitron', 'Secular One', 'Fredoka', sans-serif" fontWeight={800} fontSize={Math.round(title.h * 0.5)} color="#ffe2bd" highlightColor="#ffb35c" particleSize={1.7} density={2} maxParticles={3200} glow={false} scatter={title.w * 0.5} gatherDuration={1100} trigger="mount" />
            </div>
          )}
          <p className="cn-intro-brief">{t.brief}</p>
          <Countdown />
        </div>
      )}

      <AnimatePresence>
        {titled && (
          <motion.div key="arrival" className="cn-arrival" initial={{ opacity: 0, y: 24, filter: 'blur(10px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} exit={{ opacity: 0, scale: 1.08, filter: 'blur(8px)' }} transition={{ duration: 0.6 }}>
            <GradientText className="cn-arrival-title" colors={['#ffd36b', '#ff9d4d', '#ff6a3d', '#ffd36b']} animationSpeed={2.4}>
              {t.title}
            </GradientText>
            <ShinyText text={t.on(place.destinations[world])} className="cn-arrival-on" color="#ffe2bd" shineColor="#ffffff" speed={2} />
            <p className="cn-intro-brief">{t.brief}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {phase === 'flight' && !veil && (
        <>
          <SteerRail mouse={!isTouchDevice} />
          <button type="button" className="cn-end ck3-hud-ui" onClick={() => land(false)}>
            ✕ {t.end}
          </button>
          <p className="cn-hint">{isTouchDevice ? t.steerTouch : t.steerMouse}</p>
        </>
      )}

      <AnimatePresence>
        {phase === 'results' && summary && (
          <motion.div key="results" className="cn-results" initial={{ opacity: 0, y: 30, scale: 0.94 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ delay: 0.5, type: 'spring', stiffness: 200, damping: 22 }}>
            <ElectricBorder color="#ffb35c" speed={0.8} chaos={0.07} borderRadius={22} className="cn-results-border">
              <div className="cn-results-card">
                <GradientText className="cn-results-title" colors={['#ffd36b', '#ff9d4d', '#5cf2ff', '#ffd36b']} animationSpeed={3}>
                  {t.complete}
                </GradientText>
                {summary.best && <ShinyText text={t.newBest} className="cn-results-best" color="#ffd36b" shineColor="#ffffff" speed={1.6} />}
                <ul className="cn-results-stats">
                  <li>
                    <b>
                      <CountUp to={summary.bullseyes} duration={1} delay={0.7} />
                      <small>/{summary.gates.length}</small>
                    </b>
                    <em>🎯 {t.bullseyes}</em>
                  </li>
                  <li>
                    <b>{summary.close}</b>
                    <em>✨ {t.close2}</em>
                  </li>
                  <li>
                    <b>{summary.bestCombo}</b>
                    <em>🔥 {t.bestRow}</em>
                  </li>
                </ul>
                <ol className="cn-results-gates" dir="ltr">
                  {summary.results.map((r) => {
                    const g = summary.gates[r.gate];
                    return (
                      <li key={r.gate} className={`is-${r.verdict}`}>
                        <span>{factOf(g)}</span>
                        <b>{r.value}</b>
                        {r.verdict !== 'bullseye' && <small>{g.answer}</small>}
                      </li>
                    );
                  })}
                </ol>
                {summary.forFun ? (
                  <p className="cn-results-fun">{t.forFun}</p>
                ) : (
                  <p className="cn-results-fuel">
                    ⛽ {t.fuel} +<CountUp to={Math.round(summary.fuel)} duration={1.2} delay={1} />%
                  </p>
                )}
                <div className="cn-results-actions">
                  <StarBorder type="button" className="cn-results-again" color="#ffb35c" speed="4s" thickness={2} backgroundColor="#3d1c06" textColor="#ffe2bd" borderColor="rgba(255, 179, 92, 0.5)" onClick={() => start(live.quality, live.calm)}>
                    🏜️ {t.again}
                  </StarBorder>
                  <button type="button" className="cn-results-back" onClick={close}>
                    {entry === 'arrival' ? t.onward : t.back}
                  </button>
                </div>
              </div>
            </ElectricBorder>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
