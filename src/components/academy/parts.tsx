import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useT, useLang } from '../../i18n/useLang';
import type { Strings } from '../../i18n/strings';
import { pauseGame, resumeGame } from '../../game/gameClock';
import { sfx } from '../../audio/sfx';
import { speak } from '../../audio/speech';
import { useAchievements } from '../../game/useAchievements';
import { useGameStore } from '../../game/useGameStore';
import { haptics } from '../../audio/haptics';
import { useWarpCanvas } from '../useWarpCanvas';
import { useBack } from '../../native/back';

// What both Academies share: the screen (warp in, a panel of steps with
// Back / Read to me / Next, a celebration on the last one), and the pieces
// the lessons are built from.

export type A = Strings['academy'];

export interface StepProps {
  t: A;
  setReady: (r: boolean) => void;
  say: (s: string) => void;
}

export interface CourseStep {
  lesson: number;
  id: string;
}

export interface CourseSpec {
  id: string;
  /** shown under the title on a step that's past the last lesson (the "done" screen) */
  subtitle: string;
  lessons: string[];
  steps: CourseStep[];
  components: Record<string, (p: StepProps) => React.ReactElement>;
  /** the text a step is about right now, for "read to me" */
  stepText: (id: string) => string;
  /** the last screen was reached */
  onFinish?: () => void;
}

// ---------- pieces ----------

/** text with {math} spans: the math is always shown left-to-right (inside Hebrew too) */
export function Rich({ text }: { text: string }) {
  const parts = text.split(/\{([^}]+)\}/);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <bdi key={i} dir="ltr" className="ac-math">
            {p}
          </bdi>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

export function Alien({ n, lit, onTap }: { n?: number; lit?: boolean; onTap?: () => void }) {
  return (
    <motion.button
      type="button"
      className={`ac-alien ${lit ? 'is-lit' : ''}`}
      onClick={onTap}
      disabled={!onTap}
      initial={{ scale: 0, rotate: -30 }}
      animate={{ scale: 1, rotate: 0 }}
      transition={{ type: 'spring', stiffness: 400, damping: 15 }}
    >
      <span className="ac-alien-face">👽</span>
      {n !== undefined && <span className="ac-alien-n">{n}</span>}
    </motion.button>
  );
}

export function Bus({ children, highlight, label, delay = 0 }: { children: React.ReactNode; highlight?: boolean; label?: string; delay?: number }) {
  return (
    <motion.div
      className={`ac-bus ${highlight ? 'is-highlight' : ''}`}
      initial={{ x: 200, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 120, damping: 16, delay }}
    >
      <div className="ac-bus-seats">{children}</div>
      {label && <div className="ac-bus-label">{label}</div>}
    </motion.div>
  );
}

/** big multiple-choice buttons with gentle feedback */
export function Choices({ options, answer, onCorrect, t }: { options: Array<string | number>; answer: string | number; onCorrect: () => void; t: A }) {
  const [wrong, setWrong] = useState<string | number | null>(null);
  const [done, setDone] = useState(false);
  return (
    <div className="ac-choices-wrap">
      <div className="ac-choices" dir="ltr">
        {options.map((o) => (
          <motion.button
            key={o}
            type="button"
            className={`ac-choice ${done && o === answer ? 'is-right' : ''} ${wrong === o ? 'is-wrong' : ''}`}
            disabled={done}
            animate={wrong === o ? { x: [0, -8, 8, -5, 5, 0] } : {}}
            onClick={() => {
              if (o === answer) {
                setDone(true);
                setWrong(null);
                sfx.correct(3, false);
                haptics.correct(2);
                onCorrect();
              } else {
                setWrong(o);
                sfx.wrong();
                haptics.thump();
              }
            }}
          >
            {o}
          </motion.button>
        ))}
      </div>
      {wrong !== null && !done && <div className="ac-wrong">{t.wrong}</div>}
    </div>
  );
}

// ---------- the screen ----------

interface ScreenProps {
  /** the course being taken; null shows `menu` instead (the addition Academy's courses) */
  course: CourseSpec | null;
  menu?: React.ReactNode;
  /** the menu's line under the title */
  menuSubtitle?: string;
  /** Back on a course's first step: the addition Academy goes back to its menu */
  onBackFromStart?: () => void;
  onClose: () => void;
  onBurst: (x: number, y: number, color: string) => void;
}

// Opened by tapping the rocket's window three times: the game pauses, the
// view warps into the Academy, and leaving warps back out.
export function AcademyScreen({ course, menu, menuSubtitle, onBackFromStart, onClose, onBurst }: ScreenProps) {
  const t = useT().academy;
  const [phase, setPhase] = useState<'warp' | 'learn' | 'leaving'>('warp');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const warpSpeed = useRef(2.8);
  useWarpCanvas(canvasRef, 0.45, warpSpeed);

  // the game waits while the Academy is open
  useEffect(() => {
    pauseGame('academy');
    sfx.wormhole();
    const id = window.setTimeout(() => {
      warpSpeed.current = 0.08; // calm drift
      setPhase('learn');
    }, 1400);
    return () => {
      window.clearTimeout(id);
      try {
        window.speechSynthesis?.cancel();
      } catch {
        // ignore
      }
      resumeGame('academy');
    };
  }, []);

  const leave = useCallback(() => {
    setPhase('leaving');
    warpSpeed.current = 3;
    sfx.launch();
    window.setTimeout(onClose, 700);
  }, [onClose]);

  // Esc (and Back) leaves from the menu too (a course handles its own keys)
  useBack(!course && phase === 'learn' && leave);
  useEffect(() => {
    if (course || phase !== 'learn') return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && leave();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [course, phase, leave]);

  return (
    <div className={`academy is-${phase}`}>
      <canvas ref={canvasRef} className="academy-warp" />
      {phase === 'warp' && <div className="academy-flash" />}

      {phase !== 'warp' && (
        <div className="academy-panel">
          {course ? (
            <CourseRunner key={course.id} course={course} active={phase === 'learn'} leave={leave} onBackFromStart={onBackFromStart} onBurst={onBurst} />
          ) : (
            <>
              <header className="academy-header">
                <div>
                  <div className="academy-title">🪐 {t.title}</div>
                  {menuSubtitle && <div className="academy-sub">{menuSubtitle}</div>}
                </div>
                <button type="button" className="academy-close" onClick={leave} aria-label={t.close}>
                  ✕
                </button>
              </header>
              <main className="academy-body" dir="auto">
                {menu}
              </main>
              <footer className="academy-footer">
                <span />
                <button type="button" className="ac-next" onClick={leave}>
                  🚀 {t.close}
                </button>
              </footer>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function CourseRunner({
  course,
  active,
  leave,
  onBackFromStart,
  onBurst,
}: {
  course: CourseSpec;
  active: boolean;
  leave: () => void;
  onBackFromStart?: () => void;
  onBurst: (x: number, y: number, color: string) => void;
}) {
  const t = useT().academy;
  const lang = useLang((s) => s.lang);
  const [step, setStep] = useState(0);
  const [ready, setReady] = useState(false);
  const { steps, lessons } = course;
  const current = steps[step];
  const Step = course.components[current.id];
  const markReady = useCallback((r: boolean) => setReady(r), []);
  const say = useCallback((s: string) => speak(s, lang, t.speakWords), [lang, t.speakWords]);
  const last = step === steps.length - 1;

  const go = useCallback(
    (dir: 1 | -1) => {
      try {
        window.speechSynthesis?.cancel();
      } catch {
        // ignore
      }
      if (dir === -1 && step === 0) {
        onBackFromStart?.();
        return;
      }
      setReady(false);
      setStep((s) => Math.max(0, Math.min(steps.length - 1, s + dir)));
    },
    [step, steps.length, onBackFromStart],
  );

  // a little celebration on the last screen
  const { onFinish } = course;
  useEffect(() => {
    if (current.id !== 'done') return;
    useAchievements.getState().track({ type: 'academy' }, useGameStore.getState().progress);
    onFinish?.();
    sfx.milestone(10);
    for (let i = 0; i < 8; i++) {
      window.setTimeout(
        () => onBurst(window.innerWidth * (0.2 + Math.random() * 0.6), window.innerHeight * (0.2 + Math.random() * 0.4), ['#ffd77a', '#6ad7ff', '#ff6ad5'][i % 3]),
        i * 140,
      );
    }
  }, [current.id, onBurst, onFinish]);

  // Back: the step before (from the first, back to the courses, if there are any), or leave
  useBack(active && (() => (step > 0 || onBackFromStart ? go(-1) : leave())));

  // keyboard: ← → to move, Esc to leave
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!active) return;
      if (e.key === 'Escape') leave();
      else if (e.key === 'ArrowRight' && ready && !last) go(1);
      else if (e.key === 'ArrowLeft' && (step > 0 || onBackFromStart)) go(-1);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [active, ready, step, last, go, leave, onBackFromStart]);

  const stepTextNow = useMemo(() => course.stepText(current.id), [course, current.id]);

  return (
    <>
      <header className="academy-header">
        <div>
          <div className="academy-title">🪐 {t.title}</div>
          <div className="academy-sub">
            {current.lesson < lessons.length ? `${t.lessonOf(current.lesson + 1, lessons.length)} · ${lessons[current.lesson]}` : course.subtitle}
          </div>
        </div>
        <button type="button" className="academy-close" onClick={leave} aria-label={t.close}>
          ✕
        </button>
      </header>
      <div className="academy-steps" aria-hidden="true">
        {steps.map((_, i) => (
          <span key={i} className={`academy-step-dot ${i < step ? 'is-done' : ''} ${i === step ? 'is-now' : ''}`} />
        ))}
      </div>

      <main className="academy-body" dir="auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            className="academy-step"
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ duration: 0.25 }}
          >
            <Step t={t} setReady={markReady} say={say} />
          </motion.div>
        </AnimatePresence>
      </main>

      <footer className="academy-footer">
        <button type="button" className="ac-secondary" onClick={() => go(-1)} disabled={step === 0 && !onBackFromStart}>
          {t.back}
        </button>
        <button type="button" className="ac-secondary" onClick={() => say(stepTextNow)}>
          {t.readAloud}
        </button>
        {!last ? (
          <button type="button" className="ac-next" onClick={() => go(1)} disabled={!ready}>
            {t.next} {lang === 'he' ? '‹' : '›'}
          </button>
        ) : (
          <button type="button" className="ac-next" onClick={leave}>
            🚀 {t.close}
          </button>
        )}
      </footer>
    </>
  );
}
