import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { gameNow, gameTimeout, usePause } from '../../game/gameClock';
import { roundOp, useGameStore } from '../../game/useGameStore';
import { getLevelConfig } from '../../game/levels';
import { buildTraffic, TRAFFIC_DIRS, TRAFFIC_PASSES, type TrafficDir } from '../../game/bonusRounds';
import { STAGE_MAX_SUM } from '../../game/addition';
import { opStage } from '../../game/stages';
import { drillLabel } from '../../i18n/strings';
import { OP_SYMBOL, type Mission } from '../../game/mission';
import { kick } from '../../game/flight';
import { sfx } from '../../audio/sfx';
import { haptics } from '../../audio/haptics';
import { useT } from '../../i18n/useLang';
import { isTouchDevice } from '../../settings/useSettings';
import { activeShip, useProfiles } from '../../profiles/useProfiles';
import { colorForLevel } from '../scene/palette';
import GradientText from '../reactbits/GradientText';
import { DEV_SOLVE_EVENT } from '../../dev/devMode';
import { BRAKE_S, DODGE_S, lensFor, TrafficScene } from './trafficScene';
import { TrafficPlume } from './trafficPlume';
import { isAdmiral } from '../../game/useAchievements';
import { warmTraffic } from './trafficArt';
import { viewport } from '../viewport';
import './traffic.css';
import { pixelRatio } from '../../settings/quality';

interface Props {
  onDone: (result: { fuelGain: number; answers: Array<{ factKey: string; correct: boolean }> }) => void;
  onBurst: (x: number, y: number, color: string) => void;
}

// Space Traffic, seen from just behind the ship: lanes of slower traffic
// stretch ahead, ion engines glowing. Five times a slow ship pulls into the
// pilot's lane with a number on its back, and the D-pad has a drill on each
// side: the one that makes the number is the way round. Tap it (or press
// that arrow) and the ship barrel-rolls into that lane and races past, so a
// run swerves left, right, up and down. A wrong drill brakes the ship behind
// the slow one, shows what that drill makes, and the right one glows. After
// the fifth the road is clear and the ship races off to the vanishing point.
// On the addition mission the numbers are sums, and the drills sums too.
type Phase = 'intro' | 'ask' | 'brake' | 'dodge' | 'finale' | 'summary';

const INTRO_MS = 3000;
/** from the right drill to the next slow ship pulling in */
const PASS_MS = 1500;
const FINALE_MS = 2300;
const SUMMARY_MS = 4200;
/** blips as the slow ship closes in */
const BLIPS_MS = [450, 1050, 1550, 1950];
const ARROWS: Record<TrafficDir, string> = { up: '▲', left: '◀', right: '▶', down: '▼' };
const KEYS: Record<string, TrafficDir> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  w: 'up',
  s: 'down',
  a: 'left',
  d: 'right',
};

/** what the rest of the traffic has painted on: answers from the same table, or sums or differences within the stage */
function trafficNumbers(mission: Mission, stage: 1 | 2 | 3): number[] {
  if (mission === 'sub') return stage < 3 ? Array.from({ length: 10 }, (_, i) => i + 1) : Array.from({ length: 70 }, (_, i) => i + 11);
  if (mission === 'add') {
    const max = STAGE_MAX_SUM[stage - 1];
    return Array.from({ length: max - 1 }, (_, i) => i + 2).filter((n) => stage < 3 || n > 20);
  }
  const products = new Set<number>();
  for (let a = 2; a <= 10; a++) for (let b = a; b <= 10; b++) products.add(a * b);
  return [...products];
}

export function SpaceTraffic({ onDone, onBurst }: Props) {
  const t = useT();
  const avatar = useProfiles((s) => s.profiles.find((p) => p.id === s.activeId)?.avatar);
  const run = useMemo(() => buildTraffic(useGameStore.getState().progress, roundOp()), []);
  const adding = run.mission === 'add';
  const taking = run.mission === 'sub';
  const sym = OP_SYMBOL[run.mission];
  const base = useMemo(() => 100 / getLevelConfig(useGameStore.getState().progress.level).streakToLaunch, []);
  const scene = useMemo(() => {
    const { progress } = useGameStore.getState();
    const asked = new Set(run.passes.map((p) => p.number));
    return new TrafficScene({
      now: gameNow() / 1000,
      accent: colorForLevel(progress.level),
      avatar,
      numbers: trafficNumbers(run.mission, opStage(run.mission, progress)).filter((n) => !asked.has(n)),
      calm: !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
      admiral: isAdmiral(),
      ship: activeShip(),
    });
    // one scene a round (the pilot's animal is in it from the start)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run]);

  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const horizon = lensFor(size.w, size.h).horizon / size.h;

  const [phase, setPhase] = useState<Phase>('intro');
  const [index, setIndex] = useState(0);
  const [wrong, setWrong] = useState<TrafficDir[]>([]);
  /** the side the ship swerved to: the right drill was picked */
  const [swerved, setSwerved] = useState<TrafficDir | null>(null);
  /** each pass made so far: cleanly (the first drill picked) or not */
  const [passed, setPassed] = useState<boolean[]>([]);
  const [flash, setFlash] = useState(false);
  const answers = useRef<Array<{ factKey: string; correct: boolean }>>([]);
  const clean = useRef(0);
  const timers = useRef<Array<() => void>>([]);
  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(gameTimeout(fn, ms));
  }, []);
  useEffect(() => () => timers.current.forEach((cancel) => cancel()), []);
  const blips = useRef<Array<() => void>>([]);
  /** an answer is being played out: nothing else counts until the next ship (or the brakes let go) */
  const busy = useRef(false);

  // every frame: move and draw the sky and the traffic (nothing in React re-renders for it)
  const sceneRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = sceneRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    warmTraffic();
    // the ship's engines: the rocket's plume from the main game, on a little WebGL canvas of its own
    const plume = TrafficPlume.create(isAdmiral());
    scene.plume = plume;
    let raf = 0;
    let last = performance.now();
    const loop = (nowMs: number) => {
      raf = requestAnimationFrame(loop);
      if (usePause.getState().paused) {
        last = nowMs;
        return;
      }
      const dt = Math.min(0.08, (nowMs - last) / 1000);
      last = nowMs;
      const W = viewport.w;
      const H = viewport.h;
      const dpr = pixelRatio(2, 1);
      if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const now = gameNow() / 1000;
      scene.update(dt, now);
      scene.draw(ctx, lensFor(W, H), now);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      scene.plume = null;
      plume?.dispose();
      // its pixels back at once (some phones only free a canvas's memory when it's collected, and blank canvases past a limit)
      canvas.width = canvas.height = 0;
    };
  }, [scene]);

  const startPass = useCallback(
    (i: number) => {
      setIndex(i);
      setWrong([]);
      setSwerved(null);
      setPhase('ask');
      busy.current = false;
      scene.spawnBlocker(run.passes[i].number, gameNow() / 1000);
      blips.current = BLIPS_MS.map((ms, k) => gameTimeout(() => sfx.blip(k), ms));
    },
    [scene, run.passes],
  );

  // the round opens with a whoosh out of hyperspace; the first slow ship pulls in once the ship is in its lane
  useEffect(() => {
    const cancels = [gameTimeout(() => {
        sfx.warp();
        haptics.warp();
      }, 0), gameTimeout(() => startPass(0), INTRO_MS)];
    return () => {
      cancels.forEach((cancel) => cancel());
      blips.current.forEach((cancel) => cancel());
    };
  }, [startPass]);

  const finish = useCallback(() => {
    setPhase('finale');
    scene.finale(gameNow() / 1000);
    sfx.launch();
    haptics.correct(10);
    kick(1.1);
    later(() => setFlash(true), 1250);
    later(() => {
      setPhase('summary');
      if (clean.current >= TRAFFIC_PASSES - 1) sfx.milestone(10);
      later(() => onDone({ fuelGain: clean.current * base, answers: answers.current }), SUMMARY_MS);
    }, FINALE_MS);
  }, [scene, later, onDone, base]);

  const steer = useCallback(
    (dir: TrafficDir) => {
      if (phase !== 'ask' || busy.current || wrong.includes(dir)) return;
      busy.current = true;
      const pass = run.passes[index];
      const first = wrong.length === 0;
      const now = gameNow() / 1000;
      // only the first drill picked counts towards the practice map
      if (first) answers.current.push({ factKey: pass.factKey, correct: dir === pass.dir });
      if (dir !== pass.dir) {
        sfx.wrong();
        haptics.thump();
        setWrong((ws) => [...ws, dir]);
        setPhase('brake');
        scene.brake(dir, now);
        later(() => {
          busy.current = false;
          setPhase('ask');
        }, BRAKE_S * 750);
        return;
      }
      blips.current.forEach((cancel) => cancel());
      if (first) clean.current += 1;
      setSwerved(dir);
      setPhase('dodge');
      scene.dodge(dir, now);
      sfx.correct(index + 2, first);
      haptics.correct(index + 1);
      kick(0.35);
      later(() => sfx.whoosh(), DODGE_S * 350);
      later(() => onBurst(scene.shipScreen.x, scene.shipScreen.y, first ? '#7ee08f' : '#ffd77a'), DODGE_S * 1000);
      later(() => {
        setPassed((ps) => [...ps, first]);
        if (index + 1 < run.passes.length) startPass(index + 1);
        else finish();
      }, PASS_MS);
    },
    [phase, wrong, run.passes, index, scene, later, onBurst, startPass, finish],
  );

  // The key and dev handlers stay put and call the latest steer: a key pressed
  // the moment a new ship's D-pad shows isn't lost while they'd re-subscribe.
  const steerRef = useRef(steer);
  steerRef.current = steer;
  const wayRef = useRef<TrafficDir>(run.passes[0].dir);
  wayRef.current = run.passes[index].dir;

  // keyboards: the arrows (or WASD) pick the drill on that side
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const dir = KEYS[e.key];
      if (!dir) return;
      e.preventDefault();
      steerRef.current(dir);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // dev mode: Shift+G picks the right drill
  useEffect(() => {
    const solve = () => steerRef.current(wayRef.current);
    window.addEventListener(DEV_SOLVE_EVENT, solve);
    return () => window.removeEventListener(DEV_SOLVE_EVENT, solve);
  }, []);

  // ---- render ----
  const pass = run.passes[index];
  const playing = phase === 'ask' || phase === 'brake' || phase === 'dodge';
  const lastWrong = wrong.length ? pass.drills[wrong[wrong.length - 1]] : null;
  const cleanCount = passed.filter(Boolean).length;

  return (
    <div className={`traffic is-${phase}`}>
      <canvas ref={sceneRef} className="traffic-canvas" />
      {flash && <div className="traffic-flash" style={{ '--vy': `${horizon * 100}%` } as React.CSSProperties} />}

      <div className="battle-header">
        <span className="battle-title traffic-title">🚦 {t.trafficTitle}</span>
        <span className="meteor-pips">
          {run.passes.map((_, i) => (
            <span
              key={i}
              className={`meteor-pip ${i < passed.length ? (passed[i] ? 'is-done' : 'is-saved') : i === index && playing ? 'is-now' : ''}`}
            />
          ))}
        </span>
        <span className="battle-cannons-text">{t.trafficPasses(Math.min(TRAFFIC_PASSES, passed.length + 1), TRAFFIC_PASSES)}</span>
      </div>

      {phase === 'intro' && (
        <div className="round-card is-after-drop">
          {/* (the emoji outside the gradient, which would paint over it) */}
          <div className="traffic-card-title">
            <span aria-hidden>🚦</span>
            <GradientText className="round-card-title" colors={['#ff6b6b', '#ffd77a', '#7ee08f', '#6ad7ff', '#ff6b6b']} animationSpeed={3}>
              {t.trafficTitle}
            </GradientText>
          </div>
          <div className="round-card-text">{taking ? t.trafficIntroSub : adding ? t.trafficIntroAdd : t.trafficIntro}</div>
        </div>
      )}

      {playing && (
        <div className="traffic-panel" key={index}>
          <div className="traffic-ask" dir="auto" aria-live="polite">
            {taking ? t.trafficAskSub(pass.number) : adding ? t.trafficAskAdd(pass.number) : t.trafficAsk(pass.number)}
          </div>
          <div className="traffic-pad" dir="ltr">
            {TRAFFIC_DIRS.map((d) => {
              const drill = pass.drills[d];
              const isWrong = wrong.includes(d);
              const hint = wrong.length > 0 && d === pass.dir && swerved === null;
              return (
                <button
                  key={d}
                  type="button"
                  data-dir={d}
                  className={`traffic-drill ${isWrong ? 'is-wrong' : ''} ${swerved === d ? 'is-correct' : ''} ${hint ? 'is-hint' : ''}`}
                  disabled={phase !== 'ask' || isWrong}
                  onClick={() => steer(d)}
                  aria-label={`${t.trafficDirs[d]}: ${drillLabel(t, run.mission, drill.x, drill.y)}`}
                >
                  <span className="traffic-arrow" aria-hidden>
                    {ARROWS[d]}
                  </span>
                  {drill.x} {sym} {drill.y}
                </button>
              );
            })}
            <div className="traffic-target" aria-hidden>
              {pass.number}
            </div>
          </div>
          <div className={`sd-hint ${lastWrong ? 'is-on' : ''}`} dir="auto">
            {lastWrong ? t.trafficWrong(`${lastWrong.x} ${sym} ${lastWrong.y} = ${lastWrong.value}`, pass.number) : ' '}
          </div>
          {!isTouchDevice && <div className="traffic-keys">{t.trafficSteer}</div>}
        </div>
      )}

      {phase === 'summary' && (
        <div className="round-card">
          <div className="traffic-card-title">
            <GradientText className="round-card-title" colors={['#7ee08f', '#6ad7ff', '#ffd77a', '#7ee08f']} animationSpeed={2}>
              {t.trafficWin}
            </GradientText>
            <span aria-hidden>🚦</span>
          </div>
          <div className="round-card-stars">{'⭐'.repeat(Math.max(1, Math.round((cleanCount / TRAFFIC_PASSES) * 3)))}</div>
          <div className="round-card-text">{t.trafficSummary(cleanCount, TRAFFIC_PASSES)}</div>
          <div className="traffic-recap" dir="ltr">
            {run.passes.map((p, i) => (
              <span key={i} className={passed[i] ? 'is-clean' : ''}>
                {p.drills[p.dir].x} {sym} {p.drills[p.dir].y} = {p.number}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
