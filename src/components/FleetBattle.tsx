import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { DEV_COLLECT_EVENT, DEV_SOLVE_EVENT } from '../dev/devMode';
import { CannonPickup, RearShip, Saucer } from './spaceArt';
import { useWarpCanvas } from './useWarpCanvas';
import GradientText from './reactbits/GradientText';

interface Props {
  onDone: (result: { fuelGain: number; answers: Array<{ factKey: string; correct: boolean }> }) => void;
  onBurst: (x: number, y: number, color: string) => void;
}

// Warp in → collect the cannons → "how many ships?" → the fleet forms up and
// fires → win, or see why the count was off and try again.
type Phase = 'warp' | 'collect' | 'question' | 'attack' | 'result' | 'summary';

const WARP_MS = 2200;
const ARRIVE_MS = 1100; // reinforcements flying in to the orbit ring
const ORBIT_MS = 2600; // circling the player's ship, faster and faster
const BLAST_MS = 1300; // the big beam
const SCATTER_MS = 2600; // enemies flung away (one at the viewer)
const VIEWER_S = 1.5; // how long the one flying at the screen takes
const RESULT_MS = 2600;
const HUB = { x: 0.5, y: 0.72 }; // where the player's ship sits for the finale
const SUMMARY_MS = 2200;
const SHIP_SPEED = 0.62; // fraction of min(viewport) per second
const FUEL_FIRST_TRY = 2.5; // × one normal correct answer
const FUEL_LATER = 1;

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
  const [attackStep, setAttackStep] = useState<'arrive' | 'orbit' | 'blast' | 'fizzle' | 'done'>('arrive');
  const attackStart = useRef(0);
  const blastStart = useRef(0);
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

  // dev mode: Shift+K grabs every cannon at once
  useEffect(() => {
    const grab = () => {
      if (phase !== 'collect') return;
      cannons.forEach((_, i) => takenRef.current.add(i));
      setCannons((cs) => cs.map((c) => ({ ...c, taken: true })));
      later(() => {
        setPhase('question');
        ship.current = { x: 0.5, y: 0.82 };
      }, 300);
    };
    window.addEventListener(DEV_COLLECT_EVENT, grab);
    return () => window.removeEventListener(DEV_COLLECT_EVENT, grab);
  }, [phase, cannons, later]);

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

  // dev mode: Shift+G answers correctly (once the question is up)
  useEffect(() => {
    const solve = () => sendShips(battle.ships);
    window.addEventListener(DEV_SOLVE_EVENT, solve);
    return () => window.removeEventListener(DEV_SOLVE_EVENT, solve);
  }, [sendShips, battle.ships]);

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
  // Reinforcements fly in and circle the player's ship faster and faster
  // while a power meter charges to ships × cannons. The exact count unleashes
  // one huge beam that flings every enemy away (one straight at the viewer);
  // any other count fizzles, showing why.
  const launchAttack = (n: number, attempt: number, isDemo: boolean) => {
    setFleet(n);
    setDestroyed(0);
    setMessage(null);
    setAttackStep('arrive');
    setPhase('attack');
    attackStart.current = performance.now();
    blastStart.current = 0;
    warpSpeed.current = 0.6;
    later(() => {
      setAttackStep('orbit');
      sfx.wormhole(); // the rising whoosh of the spin-up
    }, ARRIVE_MS);
    later(() => {
      const shots = n * battle.cannons;
      const exact = n === battle.ships;
      if (exact) {
        setAttackStep('blast');
        blastStart.current = performance.now();
        warpSpeed.current = 1.6;
        sfx.boom(10);
        haptics.correct(8);
        kick(1.1);
        onBurst(HUB.x * w, HUB.y * h - 40, '#ffffff');
        later(() => {
          setDestroyed(battle.enemies);
          sfx.milestone(15);
        }, 350);
        later(() => {
          setAttackStep('done');
          warpSpeed.current = 0.5;
          setMessage({ text: isDemo ? t.battleShowAnswer(battle.ships, battle.cannons, battle.enemies) : t.battleWin, good: true });
          setPhase('result');
          later(() => {
            setPhase('summary');
            later(() => {
              const fuel = isDemo ? 0 : firstTryCorrect.current ? base * FUEL_FIRST_TRY : base * FUEL_LATER;
              onDone({ fuelGain: fuel, answers: answers.current });
            }, SUMMARY_MS);
          }, RESULT_MS);
        }, BLAST_MS + SCATTER_MS);
        return;
      }
      // Not the right fleet: the charge fizzles.
      setAttackStep('fizzle');
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
          setTyped('');
          setFleet(0);
          setPhase('question');
        }
      }, RESULT_MS + 400);
    }, ARRIVE_MS + ORBIT_MS);
  };

  // How each enemy gets flung when the beam hits: a random direction and
  // spin, and one of them comes straight at the viewer.
  const scatter = useMemo(
    () =>
      enemies.map(() => {
        const a = Math.random() * Math.PI * 2;
        const speed = 0.9 + Math.random() * 1.4;
        return { vx: Math.cos(a) * speed, vy: Math.sin(a) * speed - 0.3, spin: (Math.random() - 0.5) * 1440 };
      }),
    [enemies],
  );
  const viewerEnemy = useMemo(() => Math.floor(enemies.length / 2), [enemies.length]);

  // multiple-choice options for "how many ships?"
  const choices = useMemo(() => {
    const near = [battle.ships - 2, battle.ships - 1, battle.ships + 1, battle.ships + 2].filter((v) => v >= 1 && v <= 12);
    return shuffled([battle.ships, ...shuffled(near).slice(0, 3)]);
  }, [battle.ships]);

  // ---- render ----
  const now = performance.now() / 1000;
  const shipPx = { x: ship.current.x * w, y: ship.current.y * h };
  const shipSize = Math.min(96, unit * 0.16);

  // the orbit: ships fly in to a ring around the hub, then circle it with
  // an exponentially rising angular speed
  const fleetSize = Math.min(58, unit * 0.1);
  const tAttack = (performance.now() - attackStart.current) / 1000;
  const orbitT = Math.max(0, tAttack - ARRIVE_MS / 1000);
  const spinning = attackStep === 'orbit' || attackStep === 'fizzle' || attackStep === 'blast';
  // angle(t) = ∫ ω, with ω = ω0·e^(k t): fast and then *really* fast
  const OMEGA0 = 1.2;
  const OMEGA_K = 1.25;
  const orbitAngle = spinning ? (OMEGA0 / OMEGA_K) * (Math.exp(OMEGA_K * Math.min(orbitT, 3.2)) - 1) : 0;
  const ringR = { x: unit * 0.24, y: unit * 0.11 }; // an ellipse: a ring seen at an angle
  const fleetPos = Array.from({ length: fleet }, (_, i) => {
    const a = orbitAngle + (i / Math.max(1, fleet)) * Math.PI * 2;
    const ring = { x: HUB.x * w + Math.cos(a) * ringR.x, y: HUB.y * h + Math.sin(a) * ringR.y };
    if (attackStep !== 'arrive') return { ...ring, depth: Math.sin(a) };
    const k = Math.min(1, tAttack / (ARRIVE_MS / 1000));
    const e = 1 - Math.pow(1 - k, 3);
    const startX = w * (0.15 + (0.7 * (i + 0.5)) / Math.max(1, fleet));
    return { x: startX + (ring.x - startX) * e, y: h + 80 + (ring.y - h - 80) * e, depth: Math.sin(a) };
  });
  const charge = fleet * battle.cannons;
  const chargeShown = attackStep === 'arrive' ? 0 : Math.min(1, orbitT / (ORBIT_MS / 1000)) * charge;
  const shake = spinning && attackStep !== 'fizzle' ? Math.min(6, orbitT * orbitT * 0.9) : 0;
  const tBlast = blastStart.current ? (performance.now() - blastStart.current) / 1000 : 0;
  // Halo + orbit ring brightness, 0..1: builds with the spin, white-hot at the
  // blast, flickering dimly on a fizzle.
  const glow =
    attackStep === 'blast'
      ? Math.max(0.5, 1 - tBlast / 1.6)
      : attackStep === 'fizzle'
        ? 0.25 + Math.random() * 0.15
        : attackStep === 'orbit'
          ? Math.pow(Math.min(1, orbitT / (ORBIT_MS / 1000)), 1.4)
          : 0;

  return (
    <div
      className="battle"
      onPointerDown={onPointer}
      onPointerMove={onPointer}
      onPointerUp={() => (pointerTarget.current = null)}
      style={shake ? { translate: `${(Math.random() - 0.5) * shake}px ${(Math.random() - 0.5) * shake}px` } : undefined}
    >
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
        const baseX = e.x * w;
        const baseY = (enemyTop + e.r * rowGap) * h;
        // flung away once the beam hits
        const flung = Math.max(0, tBlast - 0.25);
        if (blastStart.current && flung > 0) {
          if (flung > SCATTER_MS / 1000 + 0.2) return null;
          if (i === viewerEnemy) {
            // this one comes straight at the screen
            const k = Math.min(1, flung / VIEWER_S);
            const ease = k * k;
            return (
              <div
                key={i}
                className="enemy enemy-at-viewer"
                style={{
                  left: baseX + (w / 2 - baseX) * ease,
                  top: baseY + (h * 0.5 - baseY) * ease,
                  scale: 1 + ease * 28,
                  rotate: `${ease * 40}deg`,
                  opacity: k < 0.85 ? 1 : Math.max(0, 1 - (k - 0.85) / 0.15),
                }}
              >
                <Saucer size={enemySize} />
              </div>
            );
          }
          const sc = scatter[i];
          const dist = flung * unit;
          return (
            <div
              key={i}
              className="enemy enemy-flung"
              style={{
                left: baseX + sc.vx * dist,
                top: baseY + sc.vy * dist + flung * flung * unit * 0.2,
                rotate: `${sc.spin * flung}deg`,
                scale: 1 + flung * 0.6,
                opacity: Math.max(0, 1 - flung / (SCATTER_MS / 1000)),
              }}
            >
              <Saucer size={enemySize} />
            </div>
          );
        }
        const fizzling = attackStep === 'fizzle';
        const arriving = phase === 'warp' || phase === 'collect';
        return (
          <div
            key={i}
            className={`enemy ${arriving ? 'is-arriving' : ''} ${fizzling ? 'is-leftover' : ''}`}
            style={{
              left: baseX,
              top: baseY + Math.sin(now * 1.4 + e.jitter) * 3,
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

      {/* the finale: hub ship, the fleet orbiting it, the power meter, the beam */}
      {(phase === 'attack' || phase === 'result') && fleet > 0 && (
        <>
          {attackStep === 'blast' && (
            <div className="mega-beam" style={{ left: HUB.x * w, height: HUB.y * h }}>
              <div className="mega-beam-core" />
              {Array.from({ length: 34 }, (_, i) => (
                <span
                  key={i}
                  className="rising-line"
                  style={{
                    left: `${50 + (((i * 37) % 100) - 50) * 0.9}%`,
                    width: 2 + (i % 4),
                    animationDuration: `${0.22 + ((i * 13) % 10) * 0.035}s`,
                    animationDelay: `${((i * 7) % 10) * 0.03}s`,
                    background: `linear-gradient(to top, transparent, ${['#ffffff', '#ff6ad5', '#6ad7ff', '#ffd77a'][i % 4]} 40%, transparent)`,
                  }}
                />
              ))}
            </div>
          )}
          {attackStep === 'blast' && tBlast < 0.5 && <div className="blast-flash" style={{ opacity: 1 - tBlast / 0.5 }} />}

          {/* the halo and the blazing orbit ring — brighter the faster they spin */}
          {glow > 0 && (
            <>
              <div
                className="hub-halo"
                style={{
                  left: HUB.x * w,
                  top: HUB.y * h,
                  width: unit * (0.25 + glow * 0.75),
                  height: unit * (0.25 + glow * 0.75),
                  opacity: 0.35 + glow * 0.65,
                }}
              />
              <svg className="orbit-ring" width={w} height={h} style={{ opacity: 0.3 + glow * 0.7 }}>
                <ellipse cx={HUB.x * w} cy={HUB.y * h} rx={ringR.x} ry={ringR.y} className="orbit-ring-glow" strokeWidth={10 + glow * 30} />
                <ellipse cx={HUB.x * w} cy={HUB.y * h} rx={ringR.x} ry={ringR.y} className="orbit-ring-mid" strokeWidth={4 + glow * 10} />
                <ellipse cx={HUB.x * w} cy={HUB.y * h} rx={ringR.x} ry={ringR.y} className="orbit-ring-core" strokeWidth={1.5 + glow * 3} />
              </svg>
            </>
          )}

          {/* orbiting fleet: those "behind" the hub (upper half of the ring) draw under it */}
          {fleetPos.map((p, i) =>
            p.depth < 0 ? (
              <div key={i} className={`fleet-ship ${orbitT > 1.2 ? 'is-streaking' : ''}`} style={{ left: p.x, top: p.y, zIndex: 1, scale: 0.85 }}>
                <RearShip size={fleetSize} color="#7ec4b0" />
                <span className="fleet-ship-cannons">{'⚡'.repeat(battle.cannons)}</span>
              </div>
            ) : null,
          )}
          <div className={`player-ship hub-ship ${spinning ? 'is-charging' : ''}`} style={{ left: HUB.x * w, top: HUB.y * h, zIndex: 2 }}>
            <RearShip size={Math.min(110, unit * 0.18)} />
            {avatar && <span className="player-ship-avatar" style={{ fontSize: Math.min(110, unit * 0.18) * 0.2 }}>{avatar}</span>}
          </div>
          {fleetPos.map((p, i) =>
            p.depth >= 0 ? (
              <div key={i} className={`fleet-ship ${orbitT > 1.2 ? 'is-streaking' : ''}`} style={{ left: p.x, top: p.y, zIndex: 3 }}>
                <RearShip size={fleetSize} color="#7ec4b0" />
                <span className="fleet-ship-cannons">{'⚡'.repeat(battle.cannons)}</span>
              </div>
            ) : null,
          )}

          {attackStep !== 'arrive' && attackStep !== 'done' && (
            <div className={`power-meter ${attackStep === 'fizzle' ? 'is-fizzle' : ''}`}>
              <div
                className="power-meter-fill"
                style={{ width: `${Math.min(100, (chargeShown / battle.enemies) * 100)}%` }}
              />
              <span className="power-meter-text">
                ⚡ <bdi dir="ltr">{Math.round(chargeShown)} / {battle.enemies}</bdi>
              </span>
            </div>
          )}
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
