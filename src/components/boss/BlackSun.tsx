import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { useBossStore } from '../../game/useBossStore';
import { isAdmiral } from '../../game/useAchievements';
import { CHECKPOINT_EVERY, fireballFlightMs, RUN_TO_WIN, type BossQuestion } from '../../game/blackSun';
import { distractors } from '../../game/distractors';
import { missionOfKey, OP_SYMBOL, type PilotMission } from '../../game/mission';
import { activeProfile, pilotName, useMission, useProfiles } from '../../profiles/useProfiles';
import { isTouchDevice } from '../../settings/useSettings';
import { usePause } from '../../game/gameClock';
import { flyHome } from '../../game/flight';
import { useT } from '../../i18n/useLang';
import { sfx } from '../../audio/sfx';
import { haptics } from '../../audio/haptics';
import { playTrack } from '../../audio/useAudio';
import { DEV_ALMOST_EVENT, DEV_MISS_EVENT, DEV_SOLVE_EVENT } from '../../dev/devMode';
import { warpTo } from '../warpTransition';
import { useWarpCanvas } from '../useWarpCanvas';
import { useArrivalCanvas } from '../arrival/useArrivalCanvas';
import { ARRIVAL_MS, useCardEntrance, type ArrivalCard } from '../arrival/arrivalCard';
import { calmMotion } from '../arrival/dropOut';
import { viewport } from '../viewport';
import { ARROW_DIRS, ARROW_GLYPHS, arrowChoice } from '../arrowChoices';
import GradientText from '../reactbits/GradientText';
import ShinyText from '../reactbits/ShinyText';
import { BlackSunScene } from './blackSunScene';
import { AdmiralBadge } from './AdmiralBadge';
import '../sky/sky.css';
import './boss.css';

// The Black Sun, the final boss (game/blackSun.ts has the rules, and
// blackSunScene.ts draws it). It opens through the warp like Monster Sun,
// with the same arrival: the ship flies in at the eclipsed monster sun,
// which opens its eyes, and the rules card comes in. "Fight!" turns the sun
// into a black hole, and the questions come one at a time, the answers in
// the same cross (computer) or 2 × 2 grid (touch) as the game's. Everything
// that happens is played out on the scene and timed by its clock, so it all
// stops while the player is away. Curing it plays the finale, then the
// admiral's card: the badge, the new rank and the pilot's name.

const TITLE_COLORS = ['#ffd77a', '#ff5c8a', '#b45cff', '#ffd77a'];
const ADMIRAL_COLORS = ['#fff1b0', '#ffd77a', '#ff9d4a', '#ff6ad5', '#6ad7ff', '#fff1b0'];

type Banner = { id: number; kind: 'awakens' | 'checkpoint' | 'fireball' | 'dodged' | 'burned' | 'swallowed' | 'lastOne'; text: string; hint?: string };
/** the bottom (or side) of the screen: what's there now */
type Step = 'intro' | 'waking' | 'ask' | 'answered' | 'dodge' | 'dodged' | 'cured';

function shuffled<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const centre = (el: Element | null | undefined) => {
  const r = el?.getBoundingClientRect();
  return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: viewport.w / 2, y: viewport.h * 0.8 };
};

// Back to the game through the warp; the theme comes back from the tap (browsers only start music from one).
function warpHome(e: React.MouseEvent<HTMLElement>) {
  playTrack('theme');
  warpTo(() => {
    useBossStore.getState().closeBoss();
    // the rocket flies home as the warp clears
    flyHome();
  }, e.currentTarget);
}

// ---------- the starfield behind it all: it surges with the fight ----------

let warpBoost = 0;
function warpKick(amount: number) {
  warpBoost = Math.max(warpBoost, amount);
}

function Stars() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const speed = useRef(0.1);
  useWarpCanvas(canvasRef, 0.32, speed);
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.max(0, Math.min(0.1, (now - last) / 1000));
      last = now;
      warpBoost *= Math.exp(-dt * 1.6);
      speed.current = 0.1 + warpBoost;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={canvasRef} className="boss-stars" aria-hidden />;
}

/** a wide screen (a computer, a tablet or phone on its side): the panel goes beside the sun, not under it */
function useWide() {
  const query = '(min-aspect-ratio: 11/10) and (min-width: 640px)';
  const [wide, setWide] = useState(() => window.matchMedia?.(query).matches ?? false);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const on = () => setWide(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return wide;
}

export function BlackSun() {
  const open = useBossStore((s) => s.open);
  if (!open) return null;
  // no fade of its own: it opens behind the warp (warpTransition.ts), which clears to show it
  return createPortal(<BossOverlay />, document.body);
}

function BossOverlay() {
  const t = useT();
  const mission = useMission();
  const avatar = useProfiles((s) => s.profiles.find((p) => p.id === s.activeId)?.avatar);
  const phase = useBossStore((s) => s.phase);
  const question = useBossStore((s) => s.question);
  const wide = useWide();
  const [calm] = useState(calmMotion);
  const [scene] = useState(() => new BlackSunScene(calm, mission, avatar, isAdmiral()));
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const bannerY = useRef(0);
  const hudRef = useRef<HTMLDivElement>(null);
  const slotRef = useRef<HTMLDivElement>(null);

  const [step, setStep] = useState<Step>('intro');
  // the run and checkpoint as shown: they change as the bolts land, not as the answers go in
  const [shown, setShown] = useState({ run: 0, checkpoint: 0 });
  // the pips the sun just got back (they flash as they light up again)
  const [healed, setHealed] = useState<{ id: number; from: number; to: number } | null>(null);
  // each question gets its own panel (and its own entrance)
  const [qid, setQid] = useState(0);
  const [pops, setPops] = useState<Array<{ id: number; n: number }>>([]);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [praise, setPraise] = useState<{ id: number; text: string } | null>(null);
  const [admiral, setAdmiral] = useState(false);
  const [card, setCard] = useState<ArrivalCard>(() => ({ at: performance.now() + (calm ? 0 : ARRIVAL_MS), arrived: calm }));
  const told = useRef({ checkpoint: false });

  // ---- the free part of the screen, for the scene to fit the sun into ----
  useEffect(() => {
    const measure = () => {
      const top = hudRef.current?.getBoundingClientRect().bottom ?? 0;
      const slot = slotRef.current?.getBoundingClientRect();
      if (!slot) return;
      scene.arena = wide ? { x: 0, y: top, w: slot.left, h: viewport.h - top } : { x: 0, y: top, w: viewport.w, h: slot.top - top };
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (hudRef.current) ro.observe(hudRef.current);
    if (slotRef.current) ro.observe(slotRef.current);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [scene, wide]);

  useArrivalCanvas(
    canvasRef,
    (ctx, W, H, _ms, dt) => {
      scene.update(dt);
      scene.draw(ctx, W, H);
      // the banners go between the sun and the ship, wherever the camera has them
      const y = Math.round(scene.bannerY());
      if (Math.abs(y - bannerY.current) > 2 && overlayRef.current) {
        bannerY.current = y;
        overlayRef.current.style.setProperty('--boss-banner-y', `${y}px`);
      }
    },
    true,
    'away',
  );

  // ---- the arrival: the rules card comes once the ship is there (a tap or a key skips to it) ----
  const arrive = useCallback(
    (skipped: boolean) => {
      setCard((c) => (c.arrived ? c : { at: skipped ? Math.min(c.at, performance.now()) : c.at, arrived: true }));
      scene.settle();
    },
    [scene],
  );
  useEffect(() => {
    if (calm) {
      arrive(false);
      return;
    }
    const done = () => {
      window.removeEventListener('pointerdown', skip, true);
      window.removeEventListener('keydown', skip, true);
    };
    const skip = (e: Event) => {
      if (e instanceof KeyboardEvent && e.repeat) return;
      scene.skipArrival();
      arrive(true);
      done();
    };
    scene.after(ARRIVAL_MS / 1000, () => {
      arrive(false);
      done();
    });
    window.addEventListener('pointerdown', skip, true);
    window.addEventListener('keydown', skip, true);
    return done;
  }, [scene, calm, arrive]);

  // ---- what the fight does ----
  const say = useCallback((kind: Banner['kind'], text: string, hint?: string, ms = 1800) => {
    const id = performance.now();
    setBanner({ id, kind, text, hint });
    scene.after(ms / 1000, () => setBanner((b) => (b?.id === id ? null : b)));
  }, [scene]);

  /** the sun got `n` life back, the run now `run` */
  const gained = useCallback(
    (n: number, run: number) => {
      if (n <= 0) return;
      const id = performance.now();
      setPops((ps) => [...ps.slice(-2), { id, n }]);
      setHealed({ id, from: RUN_TO_WIN - run - n, to: RUN_TO_WIN - run });
      scene.after(1.4, () => setPops((ps) => ps.filter((p) => p.id !== id)));
    },
    [scene],
  );

  // the answers it swallows are heard, and now and then one drifting in, softly
  useEffect(() => {
    let quietAt = -Infinity;
    scene.onSwallow = (loud) => {
      if (!loud && scene.t - quietAt < 3) return;
      if (!loud) quietAt = scene.t;
      sfx.swallow(loud);
    };
    return () => {
      scene.onSwallow = undefined;
    };
  }, [scene]);

  const next = useCallback(() => {
    useBossStore.getState().ask();
    setQid((n) => n + 1);
    setStep('ask');
  }, []);

  const fight = () => {
    if (step !== 'intro') return;
    useBossStore.getState().begin();
    setStep('waking');
    scene.awaken();
    sfx.monsterRise();
    haptics.thump();
    warpKick(1.4);
    say('awakens', `⚠️ ${t.boss.awakens}`, undefined, 1700);
    scene.after(calm ? 0.4 : 1.9, next);
  };

  const again = () => {
    useBossStore.getState().again();
    scene.clearJobs();
    scene.restart();
    setAdmiral(false);
    setShown({ run: 0, checkpoint: 0 });
    setStep('waking');
    sfx.monsterRise();
    warpKick(1.4);
    say('awakens', `⚠️ ${t.boss.awakens}`, undefined, 1700);
    scene.after(calm ? 0.4 : 2, next);
  };

  // the 15th bolt has landed: the cure, then the admiral
  const cure = useCallback(() => {
    setStep('cured');
    setBanner(null);
    haptics.correct(15);
    warpKick(2.4);
    scene.cure(() => {
      setAdmiral(true);
      sfx.admiral();
      // the ship wears the admiral's livery from now on (it already does if this isn't their first cure)
      scene.promote();
    });
    scene.after(0.45, () => sfx.shatter());
    scene.after(1.5, () => sfx.sunrise());
    scene.bloomTimes().forEach((s, i) => scene.after(s, () => sfx.bloom(i)));
  }, [scene]);

  // the four answers, fixed for the question
  const choices = useMemo(
    () => (question ? shuffled([question.answer, ...distractors(question.x, question.y, 3, missionOfKey(question.key))]) : []),
    [question],
  );
  // the question just answered stays up (with its feedback) till the next one
  const [lastPick, setLastPick] = useState<{ q: BossQuestion; value: number; choices: number[] } | null>(null);
  const shownQ = step === 'ask' ? question : lastPick?.q ?? null;
  const shownChoices = step === 'ask' ? choices : lastPick?.choices ?? [];

  /** the pilot's pick: `el` is the button it came from */
  const pick = (value: number, el: Element | null) => {
    if (step !== 'ask' || !question) return;
    const q = question;
    const r = useBossStore.getState().answer(value);
    if (!r) return;
    setStep('answered');
    setLastPick({ q, value, choices });
    const from = centre(el);
    const { run, checkpoint } = r.fight;
    if (r.correct) {
      sfx.bolt(run);
      haptics.tick();
      setPraise({ id: performance.now(), text: t.boss.hits[Math.floor(Math.random() * t.boss.hits.length)] });
      const lands = scene.fire(String(q.answer), from, run, () => {
        sfx.impact(run);
        warpKick(0.5);
        setShown({ run, checkpoint });
        if (r.outcome === 'checkpoint') {
          scene.checkpoint();
          sfx.checkpoint(run);
          haptics.correct(run);
          warpKick(1.6);
          say('checkpoint', t.boss.checkpoint(run), told.current.checkpoint ? undefined : t.boss.checkpointHint, told.current.checkpoint ? 1700 : 3000);
          told.current.checkpoint = true;
        } else if (run === RUN_TO_WIN - 1) {
          say('lastOne', t.boss.lastOne, undefined, 1500);
        }
        if (r.outcome === 'won') cure();
      });
      if (r.outcome !== 'won') scene.after(lands + (r.outcome === 'checkpoint' ? (told.current.checkpoint ? 1.5 : 2.6) : 0.5), next);
      return;
    }
    // a miss: the number is pulled into the hole, and the right answer is shown
    sfx.wrong();
    haptics.thump();
    scene.swallowFrom(String(value), from);
    scene.after(calm ? 0.5 : 1.15, () => sfx.monsterLaugh());
    if (r.outcome === 'swallowed') {
      scene.after(calm ? 0.6 : 1.3, () => {
        if (r.gained > 0) {
          scene.heal(0);
          sfx.sunHeal();
          gained(r.gained, 0);
          say('swallowed', t.boss.swallowed, undefined, 1700);
        }
        setShown({ run: 0, checkpoint: 0 });
      });
      scene.after(r.gained > 0 ? 3.1 : 2.4, next);
      return;
    }
    // past a checkpoint: a fireball instead
    scene.after(calm ? 1 : 1.7, () => {
      setStep('dodge');
      say('fireball', t.boss.fireball, undefined, 1600);
      sfx.fireballCharge();
      haptics.thump();
      const flight = fireballFlightMs(useBossStore.getState().fight.fireballs) / 1000;
      scene.after(calm ? 0.6 : 0.95, () => sfx.fireballLaunch());
      scene.chargeFireball(flight, (dodged) => {
        const back = useBossStore.getState().resolveFireball(dodged);
        const after = useBossStore.getState().fight;
        setStep('dodged');
        if (dodged) {
          sfx.dodge();
          haptics.correct(3);
          warpKick(0.8);
          say('dodged', t.boss.dodged, undefined, 1500);
        } else {
          sfx.burn();
          haptics.thump();
          scene.heal(after.run);
          if (back > 0) sfx.sunHeal();
          gained(back, after.run);
          setShown({ run: after.run, checkpoint: after.checkpoint });
          say('burned', t.boss.burned(after.checkpoint), undefined, 1800);
        }
        scene.after(dodged ? 1.4 : 2, next);
      });
    });
  };

  // ---- the keys: the arrows pick an answer, and dodge ----
  const dodge = useCallback(
    (dir: -1 | 1) => {
      if (scene.dodgeFireball(dir)) {
        sfx.whoosh();
        haptics.tick();
      }
    },
    [scene],
  );
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  // (the latest, for the one listener below: true if the key was used)
  const keyed = useRef<(e: KeyboardEvent) => boolean>(() => false);
  keyed.current = (e) => {
    if (usePause.getState().away) return false;
    if (step === 'dodge') {
      const dir = e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a' ? -1 : e.key === 'ArrowRight' || e.key.toLowerCase() === 'd' ? 1 : 0;
      if (dir) dodge(dir);
      return dir !== 0 || e.key === 'ArrowUp' || e.key === 'ArrowDown';
    }
    const i = arrowChoice(e.key);
    if (i < 0) return false;
    if (step === 'ask' && !isTouchDevice && i < choices.length) pick(choices[i], buttons.current[i]);
    return true;
  };
  // first in line, and kept from the game paused underneath (its own question would take the arrows too)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!keyed.current(e)) return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  // dev mode: answer right (⇧G) or wrong (⇧J)
  useEffect(() => {
    const solve = (right: boolean) => () => {
      if (step !== 'ask' || !question) return;
      const i = choices.findIndex((c) => (c === question.answer) === right);
      if (i >= 0) pick(choices[i], buttons.current[i]);
    };
    const yes = solve(true);
    const no = solve(false);
    // (or the run jumps to one short of the cure, ⇧Y)
    const almost = () => {
      useBossStore.getState().devAlmost();
      const { run, checkpoint } = useBossStore.getState().fight;
      setShown({ run, checkpoint });
    };
    window.addEventListener(DEV_SOLVE_EVENT, yes);
    window.addEventListener(DEV_MISS_EVENT, no);
    window.addEventListener(DEV_ALMOST_EVENT, almost);
    return () => {
      window.removeEventListener(DEV_SOLVE_EVENT, yes);
      window.removeEventListener(DEV_MISS_EVENT, no);
      window.removeEventListener(DEV_ALMOST_EVENT, almost);
    };
  });

  // swiping, or tapping either side of the ship, dodges too
  const swipe = useRef<{ x: number; id: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    if (step !== 'dodge') return;
    swipe.current = { x: e.clientX, id: e.pointerId };
    if (!(e.target as Element).closest('button')) dodge(e.clientX < scene.ship(viewport.w, viewport.h).x ? -1 : 1);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const s = swipe.current;
    swipe.current = null;
    if (step !== 'dodge' || !s || s.id !== e.pointerId) return;
    const dx = e.clientX - s.x;
    if (Math.abs(dx) > 40) dodge(dx < 0 ? -1 : 1);
  };

  const life = RUN_TO_WIN - shown.run;
  const heat = shown.run / RUN_TO_WIN;
  const fighting = step !== 'intro' && step !== 'cured';
  const name = pilotName(activeProfile(), t.defaultPilotName);
  return (
    <div
      ref={overlayRef}
      className={`boss-overlay ${wide ? 'is-wide' : 'is-tall'} ${step === 'dodge' ? 'is-dodging' : ''}`}
      style={{ '--heat': heat } as React.CSSProperties}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
    >
      <Stars />
      <canvas ref={canvasRef} className="boss-canvas" aria-hidden />

      {/* the top: quitting, the Black Sun's life in three shields of five, the run */}
      <div ref={hudRef} className={`boss-hud ${fighting ? '' : 'is-hidden'}`}>
        <button type="button" className="boss-quit" onClick={warpHome} aria-label={t.sky.close}>
          ✕
        </button>
        <div className="boss-life" role="meter" aria-label={t.boss.life} aria-valuemin={0} aria-valuemax={RUN_TO_WIN} aria-valuenow={life}>
          <div className="boss-life-label">🌑 {t.boss.life}</div>
          <div className="boss-life-bar" dir="ltr">
            {[0, 1, 2].map((g) => {
              // the right-hand shield goes first; one emptied at a checkpoint stays broken
              const broken = shown.checkpoint >= CHECKPOINT_EVERY * (3 - g);
              return (
                <div key={g} className={`boss-shield ${broken ? 'is-broken' : ''}`}>
                  {Array.from({ length: CHECKPOINT_EVERY }, (_, k) => {
                    const i = g * CHECKPOINT_EVERY + k;
                    const back = healed && i >= healed.from && i < healed.to && i < life;
                    return <span key={back ? `${i}-${healed.id}` : i} className={`boss-pip ${i < life ? 'is-lit' : ''} ${back ? 'is-healed' : ''}`} />;
                  })}
                  {broken && <span className="boss-shield-mark">🛡️</span>}
                </div>
              );
            })}
          </div>
          <AnimatePresence>
            {pops.map((p) => (
              <motion.span key={p.id} className="boss-life-pop" initial={{ opacity: 0, y: 6, scale: 0.6 }} animate={{ opacity: 1, y: -14, scale: 1.15 }} exit={{ opacity: 0, y: -26 }}>
                {t.boss.gained(p.n)}
              </motion.span>
            ))}
          </AnimatePresence>
        </div>
        <motion.div key={shown.run} className="boss-run" initial={{ scale: shown.run ? 1.35 : 1 }} animate={{ scale: 1 }}>
          {t.boss.run(shown.run)} <span className="boss-run-to-go">· {t.boss.toGo(RUN_TO_WIN - shown.run)}</span>
        </motion.div>
      </div>

      {/* the bottom (or the side): the rules, the questions, the dodge */}
      <div ref={slotRef} className="boss-slot">
        {step === 'intro' && <Intro card={card} onFight={fight} />}
        {(step === 'ask' || step === 'answered') && shownQ && (
          <motion.div
            key={qid}
            className={`boss-panel ${shownQ.retry ? 'is-retry' : ''}`}
            initial={step === 'ask' ? { opacity: 0.3, y: 14, scale: 0.97 } : false}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.22 }}
          >
            <AnimatePresence>
              {praise && step === 'answered' && lastPick?.value === shownQ.answer && (
                <motion.div key={praise.id} className="boss-praise" initial={{ opacity: 0, scale: 0.5, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0 }}>
                  {praise.text}
                </motion.div>
              )}
            </AnimatePresence>
            {shownQ.retry && <div className="boss-retry">{t.boss.again}</div>}
            <div className="equation-row boss-equation" dir="ltr">
              <span className="equation-operand">{shownQ.x}</span>
              <span className="equation-op">{OP_SYMBOL[missionOfKey(shownQ.key)]}</span>
              <span className="equation-operand">{shownQ.y}</span>
              <span className="equation-op">=</span>
              <span className={`equation-operand boss-answer ${step === 'answered' ? (lastPick?.value === shownQ.answer ? 'is-right' : 'is-wrong') : ''}`}>
                {step === 'answered' ? shownQ.answer : '?'}
              </span>
            </div>
            <motion.div
              className={`choice-grid boss-choices ${isTouchDevice ? '' : 'is-dpad'}`}
              dir="ltr"
              animate={step === 'answered' && lastPick && lastPick.value !== shownQ.answer ? { x: [0, -8, 8, -4, 4, 0] } : undefined}
            >
              {shownChoices.map((c, i) => {
                const answered = step === 'answered' && lastPick;
                const state = answered ? (c === shownQ.answer ? 'is-right' : c === lastPick.value ? 'is-wrong is-taken' : 'is-faded') : '';
                return (
                  <button
                    key={`${c}-${i}`}
                    ref={(el) => {
                      buttons.current[i] = el;
                    }}
                    type="button"
                    data-dir={ARROW_DIRS[i]}
                    className={`choice-btn ${state} ${answered && c === shownQ.answer && lastPick.value === c ? 'is-fired' : ''}`}
                    disabled={step !== 'ask'}
                    onClick={(e) => pick(c, e.currentTarget)}
                  >
                    {!isTouchDevice && <span className="choice-key">{ARROW_GLYPHS[i]}</span>}
                    {c}
                  </button>
                );
              })}
            </motion.div>
            <div className="boss-feedback" aria-live="polite">
              {step === 'answered' && lastPick && lastPick.value !== shownQ.answer && (
                <span>
                  {t.boss.itIs}{' '}
                  <bdi dir="ltr" className="boss-fact">
                    {shownQ.x} {OP_SYMBOL[missionOfKey(shownQ.key)]} {shownQ.y} = {shownQ.answer}
                  </bdi>
                </span>
              )}
            </div>
          </motion.div>
        )}
        {step === 'dodge' && (
          <motion.div className="boss-dodge" dir="ltr" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}>
            <button type="button" className="boss-dodge-btn is-left" onPointerDown={() => dodge(-1)} aria-label={t.boss.dodgeLeft}>
              ⬅
            </button>
            <div className="boss-dodge-word">{isTouchDevice ? t.boss.dodge : t.boss.dodgeKeys}</div>
            <button type="button" className="boss-dodge-btn is-right" onPointerDown={() => dodge(1)} aria-label={t.boss.dodgeRight}>
              ➡
            </button>
          </motion.div>
        )}
      </div>

      <AnimatePresence>
        {banner && (
          <motion.div
            key={banner.id}
            className={`boss-banner is-${banner.kind}`}
            initial={{ opacity: 0, scale: banner.kind === 'fireball' ? 2.4 : 1.7 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.25 } }}
            transition={{ type: 'spring', stiffness: 380, damping: 20 }}
            role="status"
          >
            <span className="boss-banner-text">{banner.text}</span>
            {banner.hint && <span className="boss-banner-hint">{banner.hint}</span>}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>{admiral && phase === 'cured' && <Admiral name={name} avatar={avatar} mission={mission} onAgain={again} />}</AnimatePresence>
    </div>
  );
}

// ---------- the rules, as the ship arrives ----------

function Intro({ card, onFight }: { card: ArrivalCard; onFight: () => void }) {
  const t = useT();
  const entrance = useCardEntrance(card);
  return (
    <div className={`sky-panel boss-intro ${entrance.className}`} style={entrance.style}>
      <div className="boss-kicker">{t.boss.kicker}</div>
      <GradientText className="sky-title boss-title" colors={TITLE_COLORS} animationSpeed={4}>
        {t.boss.title}
      </GradientText>
      <p className="sky-intro">{t.boss.intro}</p>
      <ul className="boss-rules">
        {t.boss.rules.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
      <div className="boss-intro-buttons">
        <button type="button" className="profile-primary boss-go" onClick={onFight}>
          {t.boss.fight}
        </button>
        <button type="button" className="profile-secondary" onClick={warpHome}>
          {t.boss.back}
        </button>
      </div>
    </div>
  );
}

// ---------- the finale's card ----------

function Admiral({ name, avatar, mission, onAgain }: { name: string; avatar?: string; mission: PilotMission; onAgain: () => void }) {
  const t = useT();
  const fight = useBossStore((s) => s.fight);
  return (
    <motion.div className="boss-admiral" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.5 }}>
      <div className="boss-admiral-card">
        <motion.div
          className="boss-admiral-badge"
          initial={{ scale: 0.2, rotateY: 540, opacity: 0 }}
          animate={{ scale: 1, rotateY: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 90, damping: 13, delay: 0.15 }}
        >
          <span className="boss-admiral-rays" aria-hidden />
          <AdmiralBadge size={190} live ribbon={t.boss.ribbon} />
        </motion.div>
        <motion.div className="boss-admiral-kicker" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9 }}>
          {t.boss.admiralKicker}
        </motion.div>
        <motion.h2 className="boss-admiral-title" initial={{ opacity: 0, scale: 1.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 1.1, type: 'spring', stiffness: 220, damping: 14 }}>
          <GradientText colors={ADMIRAL_COLORS} animationSpeed={3}>
            {t.boss.admiralTitle}
          </GradientText>
        </motion.h2>
        <motion.div className="boss-admiral-sub" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.6 }}>
          <ShinyText text={mission === 'add' ? t.boss.admiralSubAdd : mission === 'mix' ? t.boss.admiralSubMix : t.boss.admiralSub} color="#ffe6a0" shineColor="#ffffff" speed={2.4} />
        </motion.div>
        <motion.div className="boss-admiral-name" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2 }}>
          <span className="boss-admiral-avatar">{avatar}</span>
          <span dir="auto">{t.boss.admiralName(name)}</span>
        </motion.div>
        <motion.div className="boss-admiral-stats" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2.2 }}>
          <span>{t.boss.statRun(RUN_TO_WIN)}</span>
          <span>{t.boss.statAnswers(fight.answered)}</span>
          {fight.dodged > 0 && <span>{t.boss.statDodged(fight.dodged)}</span>}
        </motion.div>
        <motion.div className="boss-admiral-buttons" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 2.5 }}>
          <button type="button" className="profile-primary boss-go" onClick={warpHome} autoFocus>
            {t.boss.flyHome}
          </button>
          <button type="button" className="profile-secondary" onClick={onAgain}>
            {t.boss.fightAgain}
          </button>
        </motion.div>
      </div>
    </motion.div>
  );
}
