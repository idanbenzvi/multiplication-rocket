import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import Orb from '../reactbits/Orb';
import { ThinkVisual } from './ThinkVisual';
import { stepText } from './stepText';
import { stuckAfterMs, thinkSteps } from '../../game/thinkThrough';
import { missionOfKey } from '../../game/mission';
import { rocketScreen } from '../../game/flight';
import { placeOrb, type Point, type Rect } from './orbPlace';
import { gameTimeout } from '../../game/gameClock';
import { useGameStore, type Question } from '../../game/useGameStore';
import { useLang, useT } from '../../i18n/useLang';
import { speak } from '../../audio/speech';
import { sfx } from '../../audio/sfx';
import { useBack } from '../../native/back';
import './computer.css';

// The ship's computer (docs/plans/2026-10-22-ship-computer.md). When a
// pilot has been on a question a while without answering, an orb lights up
// beside the rocket: "Stuck? I can help!" Tapped, it opens a little floating
// window that thinks the question through with them, a way at a time, each
// with a picture (game/thinkThrough.ts), and stops a step short of the
// answer for them to finish. Asking for help takes the answer off the clock
// (useGameStore's helpedAt).

interface Props {
  question: Question;
  /** the pilot's pace (ms): a quick pilot is helped sooner, a slow one given more time first */
  paceMs: number;
  /** the pilot keeps missing this fact: help comes sooner */
  struggling: boolean;
}

/** how big the orb is (px): smaller on a phone, where the rocket fills most of the width */
const orbSize = () => (window.innerWidth < 520 ? 70 : 92);
/** how far it keeps from the rocket (px) */
const ORB_MARGIN = 22;
/** how long its "Stuck?" bubble stays */
const BUBBLE_MS = 5000;

type Phase = 'waiting' | 'orb' | 'open';

/** the screen's own furniture the orb keeps off, and the room it has (re-read every half second, not every frame) */
function readScreen(): { area: Rect; avoid: Rect[] } {
  const rect = (sel: string) => document.querySelector(sel)?.getBoundingClientRect();
  const bar = rect('.hud-topbar');
  const question = rect('.hud-question-zone');
  const gauge = rect('.fuel-gauge');
  return {
    area: {
      left: 8,
      top: Math.max(8, (bar?.bottom ?? 0) + 6),
      right: window.innerWidth - 8,
      bottom: Math.min(window.innerHeight - 8, (question?.top ?? window.innerHeight) - 6),
    },
    avoid: gauge && gauge.width > 0 ? [gauge] : [],
  };
}

/**
 * Where the orb floats, beside the rocket and clear of it (orbPlace.ts),
 * keeping to the side it last chose while that's clear; if there's no room
 * anywhere at its full margin, a smaller one; and else where it was.
 */
function orbSpot(size: number, screen: { area: Rect; avoid: Rect[] }, last: { angle?: number; at?: Point }) {
  const quad = rocketScreen.quad;
  const r = size / 2;
  const spot = placeOrb(quad, r, ORB_MARGIN, screen.area, screen.avoid, last.angle) ?? placeOrb(quad, r, ORB_MARGIN / 2, screen.area, screen.avoid, last.angle);
  if (spot) {
    last.angle = spot.angle;
    last.at = spot.at;
  }
  return last.at ?? null;
}

export function ShipComputer({ question, paceMs, struggling }: Props) {
  const all = useT();
  const c = all.computer;
  const lang = useLang((s) => s.lang);
  const mastery = useGameStore((s) => s.progress.mastery);
  const markHelped = useGameStore((s) => s.markHelped);
  const [phase, setPhase] = useState<Phase>('waiting');
  const [bubble, setBubble] = useState(false);
  const [index, setIndex] = useState(0);
  const orbRef = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [size] = useState(orbSize);
  // where it is, and on which side of the rocket (kept while clear)
  const last = useRef<{ angle?: number; at?: Point }>({});

  // the ways to think it through, for what this pilot already knows (worked out once per question)
  const [steps] = useState(() => thinkSteps(question.x, question.y, missionOfKey(question.fact.key), mastery));

  // a while without an answer (in game time: not while paused), and the orb lights up
  useEffect(
    () =>
      gameTimeout(() => {
        setPhase('orb');
        setBubble(true);
        sfx.blip(3);
      }, stuckAfterMs(paceMs, struggling)),
    [paceMs, struggling],
  );
  useEffect(() => {
    if (!bubble) return;
    return gameTimeout(() => setBubble(false), BUBBLE_MS);
  }, [bubble]);

  // the orb keeps to the rocket as it floats and turns
  useLayoutEffect(() => {
    if (phase === 'waiting') return;
    let raf = 0;
    let screen = readScreen();
    const reread = window.setInterval(() => (screen = readScreen()), 500);
    const follow = () => {
      const spot = orbSpot(size, screen, last.current);
      const el = orbRef.current;
      if (spot && el) el.style.transform = `translate(${spot.x - size / 2}px, ${spot.y - size / 2}px)`;
      raf = requestAnimationFrame(follow);
    };
    follow();
    return () => {
      cancelAnimationFrame(raf);
      window.clearInterval(reread);
    };
  }, [phase, size]);

  const open = () => {
    const { at, angle = 0 } = last.current;
    setAnchor(at ? { ...at, outward: Math.cos((angle * Math.PI) / 180) >= 0 ? 1 : -1 } : null);
    setPhase('open');
    setBubble(false);
    markHelped();
    sfx.blip(4);
  };
  const close = () => setPhase('orb');
  useBack(phase === 'open' && close);

  const go = (d: number) => {
    setIndex((i) => Math.max(0, Math.min(steps.length - 1, i + d)));
    sfx.blip(5 + d);
  };
  const step = steps[index];
  const words = useMemo(() => stepText(step, c, all, { x: question.x, y: question.y, mission: missionOfKey(question.fact.key) }), [step, c, all, question]);
  const read = () => speak([words.title, words.text, words.math?.replace(/→/g, ',')].filter(Boolean).join('. '), lang, all.academy.speakWords);

  if (phase === 'waiting') return null;
  return (
    <>
      <div ref={orbRef} className={`ship-computer-orb ${phase === 'open' ? 'is-open' : ''}`} style={{ width: size, height: size }}>
        <button type="button" className="ship-computer-orb-button" onClick={phase === 'open' ? close : open} aria-label={c.open} aria-expanded={phase === 'open'}>
          <Orb hue={0} hoverIntensity={0.6} rotateOnHover forceHoverState={phase === 'open'} backgroundColor="#000000" />
          <span className="ship-computer-orb-face" aria-hidden>
            ?
          </span>
        </button>
        <AnimatePresence>
          {bubble && phase === 'orb' && (
            <motion.button
              type="button"
              className="ship-computer-bubble"
              onClick={open}
              initial={{ opacity: 0, scale: 0.7, y: 6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ type: 'spring', stiffness: 380, damping: 22 }}
            >
              {c.stuck}
            </motion.button>
          )}
        </AnimatePresence>
      </div>
      <AnimatePresence>
        {phase === 'open' && anchor && (
          <ComputerWindow
            key="window"
            anchor={anchor}
            orbSize={size}
            title={c.name}
            closeLabel={c.close}
            onClose={close}
            dir={lang === 'he' ? 'rtl' : 'ltr'}
            footer={
              <>
                <button type="button" className="ship-computer-nav" onClick={() => go(-1)} disabled={index === 0} aria-label={c.prev}>
                  {/* (mirrored in Hebrew by the browser, like any ‹ › in right-to-left text) */}
                  ‹
                </button>
                <span className="ship-computer-dots" aria-hidden>
                  {steps.map((_, i) => (
                    <i key={i} className={i === index ? 'is-on' : ''} />
                  ))}
                </span>
                <button type="button" className="ship-computer-nav" onClick={() => go(1)} disabled={index === steps.length - 1} aria-label={c.next}>
                  ›
                </button>
                <button type="button" className="ship-computer-read" onClick={read} aria-label={c.read} title={c.read}>
                  🔊
                </button>
              </>
            }
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={index}
                className="ship-computer-step"
                initial={{ opacity: 0, x: 18 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -18 }}
                transition={{ duration: 0.18 }}
              >
                <h3 className="ship-computer-step-title">{words.title}</h3>
                {'visual' in step && step.visual && (
                  <div className="ship-computer-visual">
                    <ThinkVisual visual={step.visual} />
                  </div>
                )}
                <p className="ship-computer-text">{words.text}</p>
                {words.math && (
                  <bdi dir="ltr" className="ship-computer-math">
                    {words.math}
                  </bdi>
                )}
                {index === steps.length - 1 && <p className="ship-computer-try">{c.tryIt}</p>}
              </motion.div>
            </AnimatePresence>
          </ComputerWindow>
        )}
      </AnimatePresence>
    </>
  );
}

/** where the window opens from: the orb, and which way is away from the rocket (1 right, -1 left) */
type Anchor = { x: number; y: number; outward: 1 | -1 };

/**
 * Where the floating window goes, clear of the question and its answers (a
 * child reads it and answers): beside the orb if there's room (a computer, a
 * tablet), else above it, or (a phone) in the space above the question. Above,
 * it's held by its bottom edge, so a taller step grows up into the free sky
 * rather than down over the question; it scrolls if even that's not enough.
 */
function placeWindow(anchor: Anchor, orbSize: number, w: number, h: number, vw: number, vh: number, floor: number) {
  const gap = orbSize / 2 + 10;
  // beside the orb, on its side away from the rocket
  const left = anchor.outward > 0 ? anchor.x + gap : anchor.x - gap - w;
  if (left >= 8 && left + w <= vw - 8) {
    const top = Math.max(8, Math.min(floor - 8 - h, anchor.y - h / 2));
    return { side: anchor.outward > 0 ? ('right' as const) : ('left' as const), style: { left, top, maxHeight: floor - 8 - top } };
  }
  const bottomEdge = Math.min(floor - 8, anchor.y - gap >= h + 8 ? anchor.y - gap : floor - 8);
  return { side: 'above' as const, style: { left: Math.min(vw - w - 8, Math.max(8, anchor.x - w * 0.6)), bottom: vh - bottomEdge, maxHeight: bottomEdge - 8 } };
}

function ComputerWindow({
  anchor,
  orbSize,
  title,
  closeLabel,
  onClose,
  dir,
  footer,
  children,
}: {
  anchor: Anchor;
  orbSize: number;
  title: string;
  closeLabel: string;
  onClose: () => void;
  dir: 'ltr' | 'rtl';
  footer: React.ReactNode;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<ReturnType<typeof placeWindow> | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // (the question's top, with its hint chip: the window stays above it)
    const floor = document.querySelector('.hud-question-zone')?.getBoundingClientRect().top ?? window.innerHeight;
    setPlace(placeWindow(anchor, orbSize, el.offsetWidth, el.offsetHeight, window.innerWidth, window.innerHeight, Math.min(floor, window.innerHeight)));
  }, [anchor, orbSize]);
  return (
    <motion.div
      ref={ref}
      className={`ship-computer-window is-${place?.side ?? 'above'}`}
      role="dialog"
      aria-label={title}
      dir={dir}
      style={place?.style ?? { left: -9999, top: 0 }}
      initial={{ opacity: 0, scale: 0.6 }}
      animate={{ opacity: place ? 1 : 0, scale: place ? 1 : 0.6 }}
      exit={{ opacity: 0, scale: 0.7 }}
      transition={{ type: 'spring', stiffness: 320, damping: 24 }}
    >
      <header className="ship-computer-head">
        <span className="ship-computer-glyph" aria-hidden />
        <span className="ship-computer-name">{title}</span>
        <button type="button" className="ship-computer-close" onClick={onClose} aria-label={closeLabel}>
          ✕
        </button>
      </header>
      <div className="ship-computer-body">{children}</div>
      <footer className="ship-computer-foot">{footer}</footer>
    </motion.div>
  );
}
