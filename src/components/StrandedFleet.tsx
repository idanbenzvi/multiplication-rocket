import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useGameStore } from '../game/useGameStore';
import { getLevelConfig } from '../game/levels';
import { buildStranded, MAX_STRANDED_GUESSES, STRANDED_SHIPS, strandedMultiplier } from '../game/bonusRounds';
import { kick } from '../game/flight';
import { sfx } from '../audio/sfx';
import { haptics } from '../audio/haptics';
import { useT } from '../i18n/useLang';
import { isTouchDevice, useSettings } from '../settings/useSettings';
import { useProfiles } from '../profiles/useProfiles';
import { NumPad } from './NumPad';
import { RearShip } from './spaceArt';
import { useWarpCanvas } from './useWarpCanvas';
import GradientText from './reactbits/GradientText';

interface Props {
  onDone: (result: { fuelGain: number; answers: Array<{ factKey: string; correct: boolean }> }) => void;
  onBurst: (x: number, y: number, color: string) => void;
}

// Lightspeed in → stranded ships drift in one by one, each projecting a drill
// that shares one hidden number ([ ] × 4 = 28, [ ] × 9 = 63, …) → guess it
// (the earlier, the bigger the fuel bonus) → fuel lines power every ship →
// the whole fleet jumps to lightspeed.
type Phase = 'warp' | 'reveal' | 'checking' | 'fuel' | 'jump' | 'summary';

const WARP_MS = 2400;
const SHIP_EVERY_MS = 1600; // a new stranded ship flies in
const CHECK_MS = 2000; // showing why a wrong guess fails
const FUEL_MS = 1800;
const JUMP_MS = 1700;
const SUMMARY_MS = 2200;

// Where the five stranded ships hang: a shallow arc across the middle on
// wide screens, two columns on phones (an arc of five would overlap there).
const SLOTS_NARROW = [
  { x: 0.27, y: 0.27 },
  { x: 0.73, y: 0.27 },
  { x: 0.27, y: 0.37 },
  { x: 0.73, y: 0.37 },
  { x: 0.5, y: 0.46 },
];
const SLOTS_WIDE = [
  { x: 0.16, y: 0.47 },
  { x: 0.33, y: 0.4 },
  { x: 0.5, y: 0.37 },
  { x: 0.67, y: 0.4 },
  { x: 0.84, y: 0.47 },
];

function shuffled<T>(a: T[]): T[] {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

export function StrandedFleet({ onDone, onBurst }: Props) {
  const t = useT();
  const answerMode = useSettings((s) => s.answerMode);
  const avatar = useProfiles((s) => s.profiles.find((p) => p.id === s.activeId)?.avatar);
  const round = useMemo(() => buildStranded(useGameStore.getState().progress), []);
  const base = useMemo(() => 100 / getLevelConfig(useGameStore.getState().progress.level).streakToLaunch, []);

  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const { w, h } = size;
  const unit = Math.min(w, h);
  const SLOTS = w < 640 ? SLOTS_NARROW : SLOTS_WIDE;

  const [phase, setPhase] = useState<Phase>('warp');
  const [shown, setShown] = useState(0);
  const [typed, setTyped] = useState('');
  const [guesses, setGuesses] = useState(0);
  const [checking, setChecking] = useState<number | null>(null); // the wrong guess being checked
  const [message, setMessage] = useState<{ text: string; good: boolean } | null>(null);
  const [lit, setLit] = useState(0); // ships powered up so far
  const [, setFrame] = useState(0);
  const answers = useRef<Array<{ factKey: string; correct: boolean }>>([]);
  const firstGuessRight = useRef(false);
  const shownAtWin = useRef(STRANDED_SHIPS);
  const phaseStart = useRef(performance.now());
  const timers = useRef<number[]>([]);
  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  }, []);
  useEffect(() => () => timers.current.forEach(window.clearTimeout), []);

  const warpSpeed = useRef(1.4); // lightspeed on the way in
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useWarpCanvas(canvasRef, 0.33, warpSpeed);

  // re-render every frame (ship wobble, drifting fleet)
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      setFrame((f) => (f + 1) % 1_000_000);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // lightspeed in → drop to cruise → ships start drifting in
  useEffect(() => {
    const id = window.setTimeout(() => {
      warpSpeed.current = 0.3;
      setPhase('reveal');
      setShown(1);
    }, WARP_MS);
    return () => window.clearTimeout(id);
  }, []);

  // one more ship every few seconds while guessing is open
  useEffect(() => {
    if (phase !== 'reveal' || shown >= STRANDED_SHIPS) return;
    const id = window.setTimeout(() => setShown((n) => Math.min(STRANDED_SHIPS, n + 1)), SHIP_EVERY_MS);
    return () => window.clearTimeout(id);
  }, [phase, shown]);

  const powerUp = useCallback(
    (demo: boolean) => {
      setShown(STRANDED_SHIPS);
      setPhase('fuel');
      phaseStart.current = performance.now();
      setMessage({ text: t.strandedReveal(round.hidden), good: true });
      // fuel lines light the ships one by one
      for (let i = 0; i < STRANDED_SHIPS; i++) {
        later(() => {
          setLit(i + 1);
          sfx.pick(Math.min(3, i + 1));
          haptics.tick();
          const s = SLOTS[i];
          onBurst(s.x * w, s.y * h, '#6ad7ff');
        }, 250 + i * 260);
      }
      later(() => {
        setPhase('jump');
        phaseStart.current = performance.now();
        warpSpeed.current = 3.2;
        sfx.launch();
        haptics.correct(8);
        kick(1.1);
        setMessage({ text: demo ? t.strandedReveal(round.hidden) : t.strandedWin, good: true });
      }, FUEL_MS);
      later(() => {
        warpSpeed.current = 0.6;
        setPhase('summary');
        later(() => {
          const fuel = demo ? 0 : firstGuessRight.current ? base * strandedMultiplier(shownAtWin.current) : base;
          onDone({ fuelGain: fuel, answers: answers.current });
        }, SUMMARY_MS);
      }, FUEL_MS + JUMP_MS);
    },
    [round.hidden, t, later, onBurst, onDone, base, w, h],
  );

  const guess = useCallback(
    (g: number) => {
      if (phase !== 'reveal' || !(g > 0)) return;
      const n = guesses + 1;
      setGuesses(n);
      setTyped('');
      const right = g === round.hidden;
      if (n === 1) {
        firstGuessRight.current = right;
        answers.current.push({ factKey: round.factKey, correct: right });
      }
      if (right) {
        shownAtWin.current = shown;
        sfx.milestone(10);
        powerUp(false);
        return;
      }
      // Wrong: every visible ship checks the guess, so the child sees why.
      sfx.wrong();
      haptics.thump();
      setChecking(g);
      setMessage({ text: t.strandedWrong(g), good: false });
      setPhase('checking');
      later(() => {
        setChecking(null);
        setMessage(null);
        if (n >= MAX_STRANDED_GUESSES) powerUp(true);
        else setPhase('reveal');
      }, CHECK_MS);
    },
    [phase, guesses, round, shown, powerUp, later, t],
  );

  // keyboard typing (desktop / tablets with keyboards)
  useEffect(() => {
    if (answerMode !== 'type') return;
    const onKey = (e: KeyboardEvent) => {
      if (phase !== 'reveal') return;
      if (/^[0-9]$/.test(e.key)) setTyped((v) => (v.length >= 2 ? v : v + e.key));
      else if (e.key === 'Backspace') setTyped((v) => v.slice(0, -1));
      else if (e.key === 'Enter' && typed) guess(Number(typed));
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [answerMode, phase, typed, guess]);

  const choices = useMemo(() => {
    const near = [2, 3, 4, 5, 6, 7, 8, 9, 10].filter((v) => v !== round.hidden && Math.abs(v - round.hidden) <= 3);
    return shuffled([round.hidden, ...shuffled(near).slice(0, 3)]);
  }, [round.hidden]);

  // ---- render ----
  const now = performance.now() / 1000;
  const tPhase = (performance.now() - phaseStart.current) / 1000;
  const shipSize = Math.min(64, unit * 0.11);
  const strandedSize = Math.min(58, unit * 0.1);

  // Railed, but the pilot is wrestling with it: layered wobbles for a bank
  // and sway, plus a sharp little "correction" every few seconds.
  const correction = Math.max(0, Math.sin(now * 0.9) - 0.92) * 120;
  const bank = Math.sin(now * 1.3) * 14 + Math.sin(now * 3.1) * 4 + correction * Math.sign(Math.cos(now * 0.9));
  const sway = Math.sin(now * 0.8) * 0.06 + Math.sin(now * 2.3) * 0.012;
  const pilot = {
    x: (0.5 + sway) * w,
    y: (0.86 + Math.sin(now * 1.7) * 0.012) * h,
  };
  const roll = Math.sin(now * 0.6) * 2.5 + bank * 0.08; // the whole view tilts with the ship

  return (
    <div className="stranded">
      <div className="stranded-view" style={{ rotate: `${roll}deg` }}>
        <canvas ref={canvasRef} className="battle-warp" />
        {/* The view is drawn 6% bigger than the screen on every side, so its
            edges never show as it rolls; this layer is exactly screen-sized
            and placed back over the screen, so positions stay in screen pixels. */}
        <div className="stranded-screen" style={{ left: w * 0.06, top: h * 0.06, width: w, height: h }}>

          {/* fuel lines from the pilot to each stranded ship */}
          {(phase === 'fuel' || phase === 'jump') && (
            <svg className="battle-beams" width={w} height={h}>
              {SLOTS.slice(0, lit).map((s, i) => (
                <line key={i} className="fuel-line" x1={pilot.x} y1={pilot.y - shipSize * 0.3} x2={s.x * w} y2={s.y * h} />
              ))}
            </svg>
          )}

          {/* the stranded fleet */}
          {SLOTS.slice(0, shown).map((slot, i) => {
            const m = round.multipliers[i];
            const product = round.hidden * m;
            const powered = i < lit;
            const drift = Math.sin(now * 0.7 + i) * 6;
            const jumpY = phase === 'jump' ? -Math.pow(tPhase, 2) * h * 1.6 : 0;
            const jumpStretch = phase === 'jump' ? 1 + tPhase * 3 : 1;
            const check = checking !== null ? { value: checking * m, ok: checking * m === product } : null;
            return (
              <div
                key={i}
                className={`stranded-ship ${powered ? 'is-powered' : ''}`}
                style={{ left: slot.x * w, top: slot.y * h + drift + jumpY, scale: `1 ${jumpStretch}` }}
              >
                <div className={`holo-drill ${check ? (check.ok ? 'is-ok' : 'is-bad') : ''}`} dir="ltr">
                  {check ? (
                    <>
                      {checking} × {m} = {check.value} {check.ok ? '✓' : `✗ ${product}`}
                    </>
                  ) : powered || phase === 'summary' ? (
                    <>
                      <b>{round.hidden}</b> × {m} = {product}
                    </>
                  ) : (
                    <>
                      <span className="holo-blank">[ ]</span> × {m} = {product}
                    </>
                  )}
                </div>
                <RearShip size={strandedSize} color={powered ? '#7ec4b0' : '#5b5470'} />
              </div>
            );
          })}

          {/* the pilot's ship, fighting the controls */}
          {phase !== 'summary' && (
            <div className="player-ship pilot-ship" style={{ left: pilot.x, top: pilot.y, rotate: `${bank}deg` }}>
              <RearShip size={shipSize} />
              {avatar && <span className="player-ship-avatar" style={{ fontSize: shipSize * 0.2 }}>{avatar}</span>}
            </div>
          )}
        </div>
      </div>

      <div className="battle-header stranded-header">
        <span className="battle-title">🛸 {t.strandedTitle}</span>
        <span className="battle-cannons-text">{t.strandedShips(shown, STRANDED_SHIPS)}</span>
        {phase === 'reveal' && guesses === 0 && <span className="stranded-bonus">{t.strandedBonus(strandedMultiplier(shown))}</span>}
      </div>

      {phase === 'warp' && (
        <div className="round-card">
          <GradientText className="round-card-title" colors={['#6ad7ff', '#ffffff', '#b18cff', '#6ad7ff']} animationSpeed={3}>
            🛸 {t.strandedTitle}
          </GradientText>
          <div className="round-card-text">{t.strandedIntro}</div>
        </div>
      )}

      {phase === 'reveal' && (
        <div className="battle-question stranded-question">
          <div className="battle-question-text" dir="auto">
            {t.strandedFind}
          </div>
          {answerMode === 'choice' ? (
            <div className="choice-grid" dir="ltr">
              {choices.map((c) => (
                <button key={c} type="button" className="choice-btn" onClick={() => guess(c)}>
                  {c}
                </button>
              ))}
            </div>
          ) : (
            <>
              <div className="answer-input answer-display battle-answer">{typed || '?'}</div>
              {isTouchDevice ? (
                <NumPad
                  onDigit={(d) => setTyped((v) => (v.length >= 2 ? v : v + d))}
                  onBackspace={() => setTyped((v) => v.slice(0, -1))}
                  onConfirm={() => typed && guess(Number(typed))}
                  disabled={false}
                />
              ) : (
                <button type="button" className="continue-button" disabled={!typed} onClick={() => guess(Number(typed))}>
                  ⚡ {t.strandedGuess} <span className="continue-key">(Enter)</span>
                </button>
              )}
            </>
          )}
        </div>
      )}

      {message && phase !== 'reveal' && phase !== 'summary' && (
        <div className={`battle-message ${message.good ? 'is-good' : 'is-bad'}`} dir="auto">
          {message.text}
        </div>
      )}
      {phase === 'jump' && tPhase > JUMP_MS / 1000 - 0.5 && <div className="blast-flash" style={{ opacity: Math.min(1, (tPhase - (JUMP_MS / 1000 - 0.5)) * 2) }} />}

      {phase === 'summary' && (
        <div className="round-card">
          <GradientText className="round-card-title" colors={['#7ee08f', '#6ad7ff', '#ffd77a', '#7ee08f']} animationSpeed={2}>
            {t.strandedWin}
          </GradientText>
          <div className="round-card-text">
            <bdi dir="ltr">
              {round.hidden} × {round.multipliers.join(', ')}
            </bdi>
          </div>
        </div>
      )}
    </div>
  );
}
