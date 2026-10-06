import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { useGameStore } from '../game/useGameStore';
import { getLevelConfig } from '../game/levels';
import { buildBattle, MAX_BATTLE_TRIES } from '../game/bonusRounds';
import { kick } from '../game/flight';
import { sfx } from '../audio/sfx';
import { haptics } from '../audio/haptics';
import { useT } from '../i18n/useLang';
import { useSettings, isTouchDevice } from '../settings/useSettings';
import { useProfiles } from '../profiles/useProfiles';
import { NumPad } from './NumPad';
import GradientText from './reactbits/GradientText';

interface Props {
  onDone: (result: { fuelGain: number; answers: Array<{ factKey: string; correct: boolean }> }) => void;
  onBurst: (x: number, y: number, color: string) => void;
}

// Warp in → collect the cannons → "how many ships?" → the fleet forms up and
// fires → win, or see why the count was off and try again.
type Phase = 'warp' | 'collect' | 'question' | 'attack' | 'result' | 'summary';

const WARP_MS = 2200;
const ARRIVE_MS = 1100; // reinforcements flying in
const LINK_MS = 600; // beams joining the fleet
const FIRE_MS = 500; // lasers in flight
const RESULT_MS = 2600;
const SUMMARY_MS = 2200;
const SHIP_SPEED = 0.62; // fraction of min(viewport) per second
const FUEL_FIRST_TRY = 2.5; // × one normal correct answer
const FUEL_LATER = 1;

// ---------- small illustrations ----------

function RearShip({ color = '#ff9d76', size }: { color?: string; size: number }) {
  return (
    <svg width={size} height={size} viewBox="-50 -50 100 100" className="rear-ship">
      <path d="M-46 14 L-14 -4 L-14 22 Z M46 14 L14 -4 L14 22 Z" fill={color} stroke="#2b2033" strokeWidth="4" strokeLinejoin="round" />
      <ellipse cx="0" cy="4" rx="22" ry="30" fill="#faf3e6" stroke="#2b2033" strokeWidth="5" />
      <circle cx="0" cy="-6" r="13" fill="#bfe6f5" stroke="#2b2033" strokeWidth="4" />
      <circle cx="-11" cy="28" r="7" fill="#6ad7ff" stroke="#2b2033" strokeWidth="3" />
      <circle cx="11" cy="28" r="7" fill="#6ad7ff" stroke="#2b2033" strokeWidth="3" />
    </svg>
  );
}

function Saucer({ size }: { size: number }) {
  return (
    <svg width={size} height={size * 0.7} viewBox="-50 -35 100 70" className="saucer">
      <ellipse cx="0" cy="-8" rx="20" ry="16" fill="#9fe0a8" stroke="#2b2033" strokeWidth="4" />
      <circle cx="-7" cy="-10" r="4" fill="#2b2033" />
      <circle cx="7" cy="-10" r="4" fill="#2b2033" />
      <ellipse cx="0" cy="8" rx="44" ry="13" fill="#c9a4de" stroke="#2b2033" strokeWidth="4" />
      <circle cx="-24" cy="9" r="3.5" fill="#ffd77a" />
      <circle cx="0" cy="12" r="3.5" fill="#ffd77a" />
      <circle cx="24" cy="9" r="3.5" fill="#ffd77a" />
    </svg>
  );
}

function CannonPickup({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="-50 -50 100 100" className="cannon-pickup">
      <circle r="44" fill="rgba(255, 106, 213, 0.18)" stroke="#ff6ad5" strokeWidth="4" />
      <rect x="-9" y="-34" width="18" height="44" rx="6" fill="#ffd77a" stroke="#2b2033" strokeWidth="4" />
      <rect x="-20" y="6" width="40" height="22" rx="8" fill="#ff9d76" stroke="#2b2033" strokeWidth="4" />
      <circle cx="0" cy="-36" r="7" fill="#fff" />
    </svg>
  );
}

// ---------- forward-warp starfield (2D canvas) ----------

interface Star {
  x: number;
  y: number;
  z: number;
  color: string;
}
const STAR_COLORS = ['#ffffff', '#cfe9ff', '#ffd6f4', '#fff2c4'];

function useWarpCanvas(canvasRef: React.RefObject<HTMLCanvasElement | null>, horizonY: number, speedRef: React.RefObject<number>) {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const stars: Star[] = Array.from({ length: 260 }, () => ({
      x: (Math.random() - 0.5) * 2,
      y: (Math.random() - 0.5) * 2,
      z: Math.random(),
      color: STAR_COLORS[Math.floor(Math.random() * STAR_COLORS.length)],
    }));
    let raf = 0;
    let last = performance.now();
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);
    const draw = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const w = canvas.width;
      const h = canvas.height;
      const cx = w / 2;
      const cy = h * horizonY;
      // deep-space backdrop: dark at the edges, a faint glow at the vanishing point
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.8);
      g.addColorStop(0, '#2a1d55');
      g.addColorStop(0.5, '#140e2c');
      g.addColorStop(1, '#07050f');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      const speed = speedRef.current ?? 0.35;
      const scale = Math.max(w, h) * 0.5;
      for (const s of stars) {
        const z0 = s.z;
        s.z -= dt * speed;
        if (s.z <= 0.02) {
          s.x = (Math.random() - 0.5) * 2;
          s.y = (Math.random() - 0.5) * 2;
          s.z = 1;
          continue;
        }
        const x1 = cx + (s.x / z0) * scale * 0.25;
        const y1 = cy + (s.y / z0) * scale * 0.25;
        const x2 = cx + (s.x / s.z) * scale * 0.25;
        const y2 = cy + (s.y / s.z) * scale * 0.25;
        const near = 1 - s.z;
        ctx.strokeStyle = s.color;
        ctx.globalAlpha = 0.25 + near * 0.75;
        ctx.lineWidth = 0.6 + near * 2.4;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [canvasRef, horizonY, speedRef]);
}

// ---------- the round ----------

interface Cannon {
  x: number; // fractions of the viewport
  y: number;
  taken: boolean;
}

function shuffled<T>(a: T[]): T[] {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

export function FleetBattle({ onDone, onBurst }: Props) {
  const t = useT();
  const answerMode = useSettings((s) => s.answerMode);
  const avatar = useProfiles((s) => s.profiles.find((p) => p.id === s.activeId)?.avatar);
  const battle = useMemo(() => buildBattle(useGameStore.getState().progress), []);
  const base = useMemo(() => 100 / getLevelConfig(useGameStore.getState().progress.level).streakToLaunch, []);

  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const { w, h } = size;
  const unit = Math.min(w, h);

  const [phase, setPhase] = useState<Phase>('warp');
  const [cannons, setCannons] = useState<Cannon[]>([]);
  const [typed, setTyped] = useState('');
  const [tries, setTries] = useState(0);
  const [fleet, setFleet] = useState(0); // ships sent this attempt
  const [message, setMessage] = useState<{ text: string; good: boolean } | null>(null);
  const [destroyed, setDestroyed] = useState(0);
  const [attackStep, setAttackStep] = useState<'arrive' | 'link' | 'fire' | 'done'>('arrive');
  const [, setFrame] = useState(0);
  const answers = useRef<Array<{ factKey: string; correct: boolean }>>([]);
  const firstTryCorrect = useRef(false);
  const timers = useRef<number[]>([]);
  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  }, []);
  useEffect(() => () => timers.current.forEach(window.clearTimeout), []);

  // ---- layout ----
  const headerRef = useRef<HTMLDivElement>(null);
  const [headerBottom, setHeaderBottom] = useState(0.16);
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const apply = () => setHeaderBottom(el.getBoundingClientRect().bottom / window.innerHeight);
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const perRow = w < 600 ? 8 : 10;
  const enemyRows = Math.ceil(battle.enemies / perRow);
  const enemySize = Math.min(46, (w * 0.8) / perRow);
  const enemyTop = headerBottom + 0.03;
  const rowGap = (enemySize * 0.75) / h;
  const enemyBottom = enemyTop + enemyRows * rowGap;
  const horizonY = Math.min(0.45, enemyTop + (enemyRows * rowGap) / 2);
  // A loose, slightly jittered formation (not k × n, which would give the
  // answer away).
  const enemies = useMemo(
    () =>
      Array.from({ length: battle.enemies }, (_, i) => {
        const r = Math.floor(i / perRow);
        const inRow = Math.min(perRow, battle.enemies - r * perRow);
        const c = i % perRow;
        return { r, x: 0.5 + (c - (inRow - 1) / 2) * (0.8 / perRow) + (Math.random() - 0.5) * 0.012, jitter: Math.random() * Math.PI * 2 };
      }),
    [battle.enemies, perRow],
  );
  const playTop = Math.max(enemyBottom + 0.06, 0.42);
  const playBottom = 0.9;

  // ---- warp background ----
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const warpSpeed = useRef(0.9);
  useWarpCanvas(canvasRef, horizonY, warpSpeed);

  // ---- the player's ship ----
  const ship = useRef({ x: 0.5, y: 0.82 });
  const keys = useRef(new Set<string>());
  const pointerTarget = useRef<{ x: number; y: number } | null>(null);
  // Pickups recorded immediately: the loop can run a frame or two on the old
  // `cannons` before React re-renders, and must not count a cannon twice.
  const takenRef = useRef(new Set<number>());

  // warp in → place cannons → collect
  useEffect(() => {
    const id = window.setTimeout(() => {
      warpSpeed.current = 0.35;
      const placed: Cannon[] = [];
      for (let i = 0; i < battle.cannons; i++) {
        for (let tries = 0; tries < 40; tries++) {
          const c = { x: 0.1 + Math.random() * 0.8, y: playTop + 0.04 + Math.random() * (playBottom - playTop - 0.14), taken: false };
          const far = placed.every((p) => Math.hypot((p.x - c.x) * w, (p.y - c.y) * h) > unit * 0.16);
          const awayFromShip = Math.hypot((c.x - ship.current.x) * w, (c.y - ship.current.y) * h) > unit * 0.2;
          if ((far && awayFromShip) || tries === 39) {
            placed.push(c);
            break;
          }
        }
      }
      setCannons(placed);
      setPhase('collect');
    }, WARP_MS);
    return () => window.clearTimeout(id);
    // once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const collected = cannons.filter((c) => c.taken).length;

  // frame loop: move the ship, pick up cannons
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (phase === 'collect') {
        const s = ship.current;
        let dx = 0;
        let dy = 0;
        const k = keys.current;
        if (k.has('ArrowLeft') || k.has('a')) dx -= 1;
        if (k.has('ArrowRight') || k.has('d')) dx += 1;
        if (k.has('ArrowUp') || k.has('w')) dy -= 1;
        if (k.has('ArrowDown') || k.has('s')) dy += 1;
        const step = SHIP_SPEED * unit * dt;
        if (dx || dy) {
          const len = Math.hypot(dx, dy);
          s.x += ((dx / len) * step) / w;
          s.y += ((dy / len) * step) / h;
        } else if (pointerTarget.current) {
          const tx = (pointerTarget.current.x - s.x) * w;
          const ty = (pointerTarget.current.y - s.y) * h;
          const dist = Math.hypot(tx, ty);
          if (dist > 1) {
            const move = Math.min(dist, step * 1.4);
            s.x += ((tx / dist) * move) / w;
            s.y += ((ty / dist) * move) / h;
          }
        }
        s.x = Math.max(0.05, Math.min(0.95, s.x));
        s.y = Math.max(playTop, Math.min(playBottom, s.y));
        // pickups
        const reach = unit * 0.075;
        let picked = -1;
        cannons.forEach((c, i) => {
          if (!c.taken && !takenRef.current.has(i) && picked < 0 && Math.hypot((c.x - s.x) * w, (c.y - s.y) * h) < reach) picked = i;
        });
        if (picked >= 0) {
          const c = cannons[picked];
          takenRef.current.add(picked);
          const now2 = takenRef.current.size;
          setCannons((cs) => cs.map((x, i) => (i === picked ? { ...x, taken: true } : x)));
          sfx.pick(Math.min(3, now2));
          haptics.tick();
          onBurst(c.x * w, c.y * h, '#ff6ad5');
          if (now2 >= battle.cannons) {
            pointerTarget.current = null;
            later(() => {
              setPhase('question');
              ship.current = { x: 0.5, y: 0.82 };
            }, 700);
          }
        }
      }
      setFrame((f) => (f + 1) % 1_000_000);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase, cannons, battle.cannons, playTop, unit, w, h, onBurst, later]);

  // keyboard: steering, and typing the answer
  const sendShips = useCallback(
    (n: number) => {
      if (phase !== 'question' || !(n > 0)) return;
      const attempt = tries + 1;
      setTries(attempt);
      if (attempt === 1) {
        firstTryCorrect.current = n === battle.ships;
        answers.current.push({ factKey: battle.factKey, correct: n === battle.ships });
      }
      launchAttack(Math.min(n, 12), attempt, false);
    },
    // launchAttack is defined below and only uses refs/setters
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [phase, tries, battle],
  );

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (phase === 'collect' && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'a', 'd', 'w', 's'].includes(e.key)) {
        keys.current.add(e.key);
        e.preventDefault();
      } else if (phase === 'question' && answerMode === 'type') {
        if (/^[0-9]$/.test(e.key)) setTyped((v) => (v.length >= 2 ? v : v + e.key));
        else if (e.key === 'Backspace') setTyped((v) => v.slice(0, -1));
        else if (e.key === 'Enter' && typed) sendShips(Number(typed));
      }
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.key);
    document.addEventListener('keydown', down);
    document.addEventListener('keyup', up);
    return () => {
      document.removeEventListener('keydown', down);
      document.removeEventListener('keyup', up);
    };
  }, [phase, answerMode, typed, sendShips]);

  // pointer: the ship follows a finger (held a little above it, so the
  // finger doesn't hide the ship) or the mouse while pressed
  const onPointer = (e: React.PointerEvent) => {
    if (phase !== 'collect') return;
    if (e.type === 'pointermove' && e.buttons === 0 && e.pointerType === 'mouse') return;
    const lift = e.pointerType === 'touch' ? 70 : 0;
    pointerTarget.current = { x: e.clientX / w, y: (e.clientY - lift) / h };
  };

  // ---- the attack ----
  const launchAttack = (n: number, attempt: number, isDemo: boolean) => {
    setFleet(n);
    setDestroyed(0);
    setMessage(null);
    setAttackStep('arrive');
    setPhase('attack');
    warpSpeed.current = 0.6;
    later(() => setAttackStep('link'), ARRIVE_MS);
    later(() => {
      setAttackStep('fire');
      sfx.boom(4);
    }, ARRIVE_MS + LINK_MS);
    later(() => {
      const shots = n * battle.cannons;
      const exact = n === battle.ships;
      // Only the exact fleet wins. Too few destroys what it can (and the rest
      // stand there, highlighted); too many overloads the linked beam and
      // fizzles — otherwise it would look like a win.
      const hit = exact ? battle.enemies : shots < battle.enemies ? shots : 0;
      setDestroyed(hit);
      setAttackStep('done');
      // a few bursts across the fleet
      for (let i = 0; i < Math.min(6, hit); i++) {
        const e = enemies[Math.floor((i / 6) * hit)];
        onBurst(e.x * w, (enemyTop + e.r * rowGap) * h, ['#ffd77a', '#ff6ad5', '#6ad7ff'][i % 3]);
      }
      if (exact) {
        sfx.milestone(15);
        haptics.correct(6);
        kick(1);
        setMessage({ text: isDemo ? t.battleShowAnswer(battle.ships, battle.cannons, battle.enemies) : t.battleWin, good: true });
        setPhase('result');
        later(() => {
          setPhase('summary');
          later(() => {
            const fuel = isDemo ? 0 : firstTryCorrect.current ? base * FUEL_FIRST_TRY : base * FUEL_LATER;
            onDone({ fuelGain: fuel, answers: answers.current });
          }, SUMMARY_MS);
        }, RESULT_MS);
        return;
      }
      sfx.wrong();
      haptics.thump();
      const text =
        shots < battle.enemies
          ? t.battleTooFew(n, battle.cannons, battle.enemies - shots)
          : t.battleTooMany(n, battle.cannons, shots - battle.enemies);
      setMessage({ text, good: false });
      setPhase('result');
      later(() => {
        if (attempt >= MAX_BATTLE_TRIES) {
          // Out of tries: show the right fleet doing it, so the round still
          // ends by demonstrating the answer.
          launchAttack(battle.ships, attempt, true);
        } else {
          setDestroyed(0);
          setTyped('');
          setFleet(0);
          setPhase('question');
        }
      }, RESULT_MS + 400);
    }, ARRIVE_MS + LINK_MS + FIRE_MS);
  };

  // multiple-choice options for "how many ships?"
  const choices = useMemo(() => {
    const near = [battle.ships - 2, battle.ships - 1, battle.ships + 1, battle.ships + 2].filter((v) => v >= 1 && v <= 12);
    return shuffled([battle.ships, ...shuffled(near).slice(0, 3)]);
  }, [battle.ships]);

  // ---- render ----
  const now = performance.now() / 1000;
  const shipPx = { x: ship.current.x * w, y: ship.current.y * h };
  const shipSize = Math.min(96, unit * 0.16);

  // fleet formation: up to 5 per row, from the bottom
  const fleetSize = Math.min(64, (w * 0.7) / Math.min(5, Math.max(1, fleet)));
  const formation = Array.from({ length: fleet }, (_, i) => {
    const row = Math.floor(i / 5);
    const inRow = Math.min(5, fleet - row * 5);
    const col = i % 5;
    return { x: 0.5 + (col - (inRow - 1) / 2) * Math.min(0.17, 0.8 / inRow), y: 0.86 - row * 0.12 };
  });

  return (
    <div className="battle" onPointerDown={onPointer} onPointerMove={onPointer} onPointerUp={() => (pointerTarget.current = null)}>
      <canvas ref={canvasRef} className="battle-warp" />

      <div className="battle-header" ref={headerRef}>
        <span className="battle-title">⚔️ {t.battleTitle}</span>
        <span className="battle-enemies">
          👾 <bdi dir="ltr">{Math.max(0, battle.enemies - destroyed)}</bdi>
        </span>
        {(phase === 'collect' || phase === 'question' || phase === 'attack' || phase === 'result') && (
          <span className="battle-cannons">
            {Array.from({ length: battle.cannons }, (_, i) => (
              <span key={i} className={`battle-cannon-pip ${i < collected ? 'is-on' : ''}`} />
            ))}
            <span className="battle-cannons-text">{t.battleCannons(collected, battle.cannons)}</span>
          </span>
        )}
      </div>

      {/* the enemy fleet on the horizon */}
      {enemies.map((e, i) => {
        const gone = i < destroyed;
        const targeted = attackStep === 'fire' && i < fleet * battle.cannons;
        const leftover = phase === 'result' && !message?.good && i >= destroyed;
        return (
          <div
            key={i}
            className={`enemy ${gone ? 'is-gone' : ''} ${leftover ? 'is-leftover' : ''} ${targeted ? 'is-targeted' : ''}`}
            style={{
              left: e.x * w,
              top: (enemyTop + e.r * rowGap) * h + Math.sin(now * 1.4 + e.jitter) * 3,
              animationDelay: `${(i % 7) * 40}ms`,
            }}
          >
            <Saucer size={enemySize} />
          </div>
        );
      })}

      {phase === 'warp' && (
        <div className="round-card">
          <GradientText className="round-card-title" colors={['#ff6ad5', '#6ad7ff', '#ffd77a', '#ff6ad5']} animationSpeed={3}>
            ⚔️ {t.battleTitle}
          </GradientText>
          <div className="round-card-text">{t.battleIntro(battle.enemies)}</div>
        </div>
      )}

      {/* cannons to collect */}
      {phase === 'collect' &&
        cannons.map((c, i) =>
          c.taken ? null : (
            <div key={i} className="cannon" style={{ left: c.x * w, top: c.y * h + Math.sin(now * 2 + i) * 6 }}>
              <CannonPickup size={unit * 0.09} />
            </div>
          ),
        )}
      {phase === 'collect' && <div className="battle-steer">{t.battleSteer}</div>}

      {/* the player's ship while collecting */}
      {(phase === 'warp' || phase === 'collect' || phase === 'question') && (
        <div className="player-ship" style={{ left: shipPx.x, top: shipPx.y }}>
          <RearShip size={shipSize} />
          {avatar && <span className="player-ship-avatar" style={{ fontSize: shipSize * 0.2 }}>{avatar}</span>}
          {collected > 0 && <span className="player-ship-cannons">{'⚡'.repeat(collected)}</span>}
        </div>
      )}

      {/* "how many ships?" */}
      {phase === 'question' && (
        <div className="battle-question">
          <div className="battle-question-text" dir="auto">
            {t.battleQuestion(battle.cannons, battle.enemies)}
          </div>
          {answerMode === 'choice' ? (
            <div className="choice-grid" dir="ltr">
              {choices.map((c) => (
                <button key={c} type="button" className="choice-btn" onClick={() => sendShips(c)}>
                  {c}
                </button>
              ))}
            </div>
          ) : (
            <>
              <div className="answer-input answer-display battle-answer">{typed || '?'}</div>
              {isTouchDevice && (
                <NumPad
                  onDigit={(d) => setTyped((v) => (v.length >= 2 ? v : v + d))}
                  onBackspace={() => setTyped((v) => v.slice(0, -1))}
                  onConfirm={() => typed && sendShips(Number(typed))}
                  disabled={false}
                />
              )}
              {!isTouchDevice && (
                <button type="button" className="continue-button" disabled={!typed} onClick={() => sendShips(Number(typed))}>
                  🚀 {t.battleSend} <span className="continue-key">(Enter)</span>
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* reinforcements: fly in, link up, fire */}
      {(phase === 'attack' || phase === 'result') && fleet > 0 && (
        <>
          <svg className="battle-beams" width={w} height={h}>
            {(attackStep === 'link' || attackStep === 'fire') &&
              formation.slice(1).map((p, i) => (
                <line
                  key={`l${i}`}
                  className="fleet-link"
                  x1={formation[i].x * w}
                  y1={formation[i].y * h}
                  x2={p.x * w}
                  y2={p.y * h}
                />
              ))}
            {attackStep === 'fire' &&
              formation.flatMap((p, s) =>
                Array.from({ length: battle.cannons }, (_, c) => {
                  const shot = s * battle.cannons + c;
                  const target = enemies[Math.min(shot, enemies.length - 1)];
                  // Overloaded (too many ships): every shot fizzles.
                  const wasted = shot >= battle.enemies || fleet * battle.cannons > battle.enemies;
                  return (
                    <line
                      key={`f${s}-${c}`}
                      className={`fleet-shot ${wasted ? 'is-wasted' : ''}`}
                      x1={p.x * w + (c - (battle.cannons - 1) / 2) * 6}
                      y1={p.y * h - fleetSize * 0.4}
                      x2={wasted ? p.x * w + (c - 2) * 30 : target.x * w}
                      y2={wasted ? h * enemyTop - 40 : (enemyTop + target.r * rowGap) * h}
                    />
                  );
                }),
              )}
          </svg>
          {formation.map((p, i) => (
            <motion.div
              key={i}
              className="fleet-ship"
              initial={{ left: p.x * w, top: h + 80 }}
              animate={{ left: p.x * w, top: p.y * h }}
              transition={{ type: 'spring', stiffness: 120, damping: 16, delay: i * 0.06 }}
            >
              <RearShip size={fleetSize} color={i === 0 ? '#ff9d76' : '#7ec4b0'} />
              {i === 0 && avatar && <span className="player-ship-avatar" style={{ fontSize: fleetSize * 0.2 }}>{avatar}</span>}
              <span className="fleet-ship-cannons">{'⚡'.repeat(battle.cannons)}</span>
            </motion.div>
          ))}
        </>
      )}

      {message && (
        <div className={`battle-message ${message.good ? 'is-good' : 'is-bad'}`} dir="auto">
          {message.text}
        </div>
      )}

      {phase === 'summary' && (
        <div className="round-card">
          <GradientText className="round-card-title" colors={['#7ee08f', '#6ad7ff', '#ffd77a', '#7ee08f']} animationSpeed={2}>
            {t.battleWin}
          </GradientText>
          <div className="round-card-text">
            <bdi dir="ltr">{t.battleShowAnswer(battle.ships, battle.cannons, battle.enemies)}</bdi>
          </div>
        </div>
      )}
    </div>
  );
}
