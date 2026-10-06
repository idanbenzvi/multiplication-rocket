import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useGameStore } from '../game/useGameStore';
import { getLevelConfig } from '../game/levels';
import { buildMeteorDrills, METEOR_DRILLS, type MeteorDrill } from '../game/bonusRounds';
import { bump, kick } from '../game/flight';
import { sfx } from '../audio/sfx';
import { haptics } from '../audio/haptics';
import { useT } from '../i18n/useLang';
import GradientText from './reactbits/GradientText';

interface Props {
  onDone: (result: { fuelGain: number; answers: Array<{ factKey: string; correct: boolean }> }) => void;
  onBurst: (x: number, y: number, color: string) => void;
}

type Phase = 'intro' | 'falling' | 'resolved' | 'summary';

interface Meteor {
  value: number;
  /** horizontal start, as a fraction of the viewport width */
  x0: number;
  /** sideways drift over the whole fall, as a fraction of width */
  drift: number;
  delayMs: number;
  durationMs: number;
  state: 'falling' | 'hit' | 'cracked';
}

const INTRO_MS = 1800;
const AFTER_HIT_MS = 900;
const AFTER_BURN_MS = 1500;
const SUMMARY_MS = 2000;
const BASE_FALL_MS = 7500;
const FASTEST_FALL_MS = 4500;
const SPEEDUP_PER_HIT_MS = 600;
const BOTTOM = 1.08; // meteors burn up just past the bottom edge

// Columns spread across the screen so meteors don't stack on each other.
function layoutMeteors(drill: MeteorDrill, consecutive: number): Meteor[] {
  const base = Math.max(FASTEST_FALL_MS, BASE_FALL_MS - consecutive * SPEEDUP_PER_HIT_MS);
  const columns = drill.values.map((_, i) => 0.12 + (0.76 * (i + 0.5)) / drill.values.length);
  return drill.values.map((value, i) => ({
    value,
    x0: columns[i] + (Math.random() - 0.5) * 0.05,
    drift: (Math.random() - 0.5) * 0.12,
    // The right answer always arrives early enough to be catchable.
    delayMs: value === drill.answer ? Math.random() * 700 : Math.random() * 1800,
    durationMs: base * (0.85 + Math.random() * 0.3),
    state: 'falling',
  }));
}

function rockPath(seed: number): string {
  let s = seed * 9301 + 49297;
  const rand = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const r = 0.8 + rand() * 0.2;
    pts.push(`${(Math.cos(a) * r).toFixed(3)},${(Math.sin(a) * r).toFixed(3)}`);
  }
  return `M${pts.join('L')}Z`;
}

export function MeteorShower({ onDone, onBurst }: Props) {
  const t = useT();
  const drills = useMemo(() => buildMeteorDrills(useGameStore.getState().progress), []);
  const fuelPerHit = useMemo(() => 100 / getLevelConfig(useGameStore.getState().progress.level).streakToLaunch, []);

  const [phase, setPhase] = useState<Phase>('intro');
  const [index, setIndex] = useState(0);
  const [meteors, setMeteors] = useState<Meteor[]>([]);
  const [hits, setHits] = useState(0);
  const [missedThis, setMissedThis] = useState(false);
  const [burned, setBurned] = useState(false);
  const [, setFrame] = useState(0);
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });

  const headerRef = useRef<HTMLDivElement>(null);
  // Where meteors appear: just under the round header, as a fraction of the
  // viewport height (the header's position depends on the top bar).
  const [top, setTop] = useState(0.12);
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const apply = () => setTop(Math.min(0.4, (el.getBoundingClientRect().bottom + 10) / window.innerHeight));
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const drillStart = useRef(0);
  const consecutive = useRef(0);
  const answers = useRef<Array<{ factKey: string; correct: boolean }>>([]);
  const timers = useRef<number[]>([]);
  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  }, []);
  useEffect(() => () => timers.current.forEach(window.clearTimeout), []);

  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const drill = drills[index];

  const startDrill = useCallback(
    (i: number) => {
      setIndex(i);
      setMeteors(layoutMeteors(drills[i], consecutive.current));
      setMissedThis(false);
      setBurned(false);
      drillStart.current = performance.now();
      setPhase('falling');
    },
    [drills],
  );

  const next = useCallback(
    (i: number, hitsSoFar: number) => {
      if (i + 1 < drills.length) {
        startDrill(i + 1);
        return;
      }
      setPhase('summary');
      if (hitsSoFar >= METEOR_DRILLS - 1) sfx.milestone(10);
      later(() => onDone({ fuelGain: hitsSoFar * fuelPerHit, answers: answers.current }), SUMMARY_MS);
    },
    [drills.length, startDrill, later, onDone, fuelPerHit],
  );

  useEffect(() => {
    const id = window.setTimeout(() => startDrill(0), INTRO_MS);
    return () => window.clearTimeout(id);
  }, [startDrill]);

  const progressOf = (m: Meteor, now: number) => (now - drillStart.current - m.delayMs) / m.durationMs;
  const posOf = (m: Meteor, p: number) => ({
    x: size.w * (m.x0 + m.drift * Math.max(0, p)),
    y: size.h * (top + (BOTTOM - top) * p),
  });

  // Frame loop: move meteors; the right one falling off the bottom = burned up.
  useEffect(() => {
    if (phase !== 'falling') return;
    let raf = 0;
    const loop = () => {
      const now = performance.now();
      const answerMeteor = meteors.find((m) => m.value === drill.answer);
      if (answerMeteor && answerMeteor.state === 'falling' && progressOf(answerMeteor, now) > 1) {
        setPhase('resolved');
        setBurned(true);
        if (!missedThis) answers.current.push({ factKey: drill.factKey, correct: false });
        consecutive.current = 0;
        sfx.wrong();
        haptics.thump();
        later(() => next(index, hits), AFTER_BURN_MS);
        return;
      }
      setFrame((f) => (f + 1) % 1_000_000);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase, meteors, drill, missedThis, index, hits, next, later]);

  const tap = (i: number, el: HTMLElement) => {
    if (phase !== 'falling') return;
    const m = meteors[i];
    if (m.state !== 'falling') return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    if (m.value === drill.answer) {
      setMeteors((ms) => ms.map((x, k) => (k === i ? { ...x, state: 'hit' } : x)));
      setPhase('resolved');
      const firstTry = !missedThis;
      const hitsNow = hits + (firstTry ? 1 : 0);
      setHits(hitsNow);
      if (firstTry) {
        answers.current.push({ factKey: drill.factKey, correct: true });
        consecutive.current += 1;
      }
      sfx.boom(consecutive.current);
      haptics.correct(consecutive.current);
      kick(0.35);
      onBurst(cx, cy, '#ffd77a');
      later(() => onBurst(cx, cy, '#ff6ad5'), 90);
      later(() => next(index, hitsNow), AFTER_HIT_MS);
    } else {
      setMeteors((ms) => ms.map((x, k) => (k === i ? { ...x, state: 'cracked' } : x)));
      if (!missedThis) answers.current.push({ factKey: drill.factKey, correct: false });
      setMissedThis(true);
      consecutive.current = 0;
      sfx.wrong();
      haptics.thump();
      bump();
    }
  };

  const now = performance.now();

  return (
    <div className="meteor-round">
      <div className="meteor-header" ref={headerRef}>
        <span className="meteor-title">☄️ {t.meteorTitle}</span>
        {drill && phase !== 'intro' && phase !== 'summary' && (
          <bdi dir="ltr" className="meteor-drill">
            {drill.x} × {drill.y} = {burned ? drill.answer : '?'}
          </bdi>
        )}
        <span className="meteor-pips">
          {drills.map((_, i) => (
            <span key={i} className={`meteor-pip ${i < index || phase === 'summary' ? 'is-done' : ''} ${i === index && phase !== 'summary' ? 'is-now' : ''}`} />
          ))}
        </span>
        {missedThis && phase === 'falling' && <span className="meteor-hint">{t.meteorFindGlow}</span>}
        {burned && <span className="meteor-hint">{t.meteorBurned}</span>}
      </div>

      {phase === 'intro' && (
        <div className="round-card">
          <GradientText className="round-card-title" colors={['#ffd77a', '#ff9d76', '#ff6ad5', '#ffd77a']} animationSpeed={3}>
            ☄️ {t.meteorTitle}
          </GradientText>
          <div className="round-card-text">{t.meteorIntro}</div>
        </div>
      )}

      {phase === 'summary' && (
        <div className="round-card">
          <GradientText className="round-card-title" colors={['#7ee08f', '#6ad7ff', '#ffd77a', '#7ee08f']} animationSpeed={2}>
            {t.meteorSummary(hits, drills.length)}
          </GradientText>
          <div className="round-card-stars">{'⭐'.repeat(Math.max(1, Math.round((hits / drills.length) * 3)))}</div>
        </div>
      )}

      {(phase === 'falling' || phase === 'resolved') &&
        meteors.map((m, i) => {
          const p = progressOf(m, now);
          if (p < 0 && m.state === 'falling') return null;
          const pos = posOf(m, Math.max(0, p));
          const isAnswer = m.value === drill.answer;
          const glow = isAnswer && (missedThis || burned);
          const sizePx = Math.min(size.w * 0.18, 112);
          // Tilt the tail along the direction of travel.
          const angle = Math.atan2(m.drift * size.w, (BOTTOM - top) * size.h) * (-180 / Math.PI);
          return (
            <button
              key={`${index}-${i}`}
              type="button"
              className={`meteor ${m.state !== 'falling' ? `is-${m.state}` : ''} ${glow ? 'is-answer' : ''}`}
              style={{ left: pos.x, top: pos.y, width: sizePx, height: sizePx }}
              onPointerDown={(e) => tap(i, e.currentTarget)}
              aria-label={String(m.value)}
            >
              <span className="meteor-tail" style={{ rotate: `${angle}deg` }} />
              <svg className="meteor-rock" viewBox="-1.1 -1.1 2.2 2.2">
                <path d={rockPath(index * 10 + i)} fill="#8d7766" stroke="#2b2033" strokeWidth="0.08" strokeLinejoin="round" />
                <circle cx="-0.3" cy="-0.2" r="0.15" fill="#00000030" />
                <circle cx="0.32" cy="0.3" r="0.11" fill="#00000030" />
              </svg>
              <span className="meteor-number" style={{ fontSize: sizePx * 0.34 }}>
                {m.value}
              </span>
            </button>
          );
        })}
    </div>
  );
}
