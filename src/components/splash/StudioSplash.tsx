import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { pauseGame, resumeGame } from '../../game/gameClock';
import { DEV_MODE } from '../../dev/devMode';
import ElectricLogo from '../reactbits/ElectricLogo';
import ParticleText from '../reactbits/ParticleText';
import './splash.css';

// The studio's opening, Flying Deer Games: an empty starry sky; the winged
// deer constellation traced into it by cyan lightning (React Bits'
// ElectricLogo, running along the deer's silhouette) as the constellation
// itself glows in; then the studio's name gathering out of drifting
// particles (React Bits' ParticleText). The game loads underneath, paused,
// and a tap or a key skips ahead to it.

const SKY = './splash/space.webp';
// the deer's light on transparency, cut from the constellation picture
const DEER = './splash/deer.webp';
// the deer's silhouette, for the lightning to trace (same frame as DEER)
const DEER_SHAPE = './splash/deer-shape.png';

const STUDIO = 'Flying Deer Games';

// the lightning and its haze reach well past the deer: its canvas is this much
// bigger (splash.css: .splash-lightning's inset), and the deer fills the middle
const LIGHTNING_ROOM = 1.7;

/** what's on screen: each step adds to the ones before */
type Step = 'loading' | 'sky' | 'lightning' | 'deer' | 'name';
const ORDER: Step[] = ['loading', 'sky', 'lightning', 'deer', 'name'];

// when each step starts, and when the splash leaves, in ms after the pictures have loaded
const TIMELINE: [Step | 'leave', number][] = [
  ['sky', 0],
  ['lightning', 600],
  ['deer', 1900],
  ['name', 2900],
  ['leave', 6800],
];
// with reduced motion: the same steps, sooner, and no lightning
const CALM_TIMELINE: [Step | 'leave', number][] = [
  ['sky', 0],
  ['deer', 300],
  ['name', 700],
  ['leave', 3200],
];
const LEAVE_MS = 800;
/** dev mode: ?devmode=1&splash=hold keeps the splash up (a tap still closes it), to look at it */
const HOLD = DEV_MODE && new URLSearchParams(window.location.search).get('splash') === 'hold';
/** don't wait for the pictures longer than this (a slow connection still gets the game) */
const LOAD_WAIT_MS = 2500;

function loaded(src: string): Promise<void> {
  const img = new Image();
  img.src = src;
  return img.decode().catch(() => undefined);
}

export function StudioSplash() {
  const [step, setStep] = useState<Step>('loading');
  const [isLeaving, setIsLeaving] = useState(false);
  const [done, setDone] = useState(false);
  const [calm] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  const leaving = useRef(false);

  // the game waits underneath until the splash is gone
  useEffect(() => {
    pauseGame('splash');
    return () => resumeGame('splash');
  }, []);

  const leave = () => {
    if (leaving.current) return;
    leaving.current = true;
    setIsLeaving(true);
    window.setTimeout(() => {
      setDone(true);
      resumeGame('splash');
    }, LEAVE_MS);
  };

  useEffect(() => {
    let cancelled = false;
    const timers: number[] = [];
    const ready = Promise.all([loaded(SKY), loaded(DEER), loaded(DEER_SHAPE)]);
    const wait = new Promise<void>((resolve) => timers.push(window.setTimeout(resolve, LOAD_WAIT_MS)));
    Promise.race([ready, wait]).then(() => {
      if (cancelled) return;
      for (const [s, at] of calm ? CALM_TIMELINE : TIMELINE) {
        timers.push(
          window.setTimeout(() => {
            if (s === 'leave') {
              if (!HOLD) leave();
            } else if (!leaving.current) setStep(s);
          }, at),
        );
      }
    });
    // any key skips ahead
    const onKey = () => leave();
    window.addEventListener('keydown', onKey);
    return () => {
      cancelled = true;
      timers.forEach((t) => window.clearTimeout(t));
      window.removeEventListener('keydown', onKey);
    };
    // runs once: the timeline starts when the splash opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (done) return null;
  const reached = (s: Step) => ORDER.indexOf(step) >= ORDER.indexOf(s);

  return createPortal(
    <div
      className={`splash ${isLeaving ? 'is-leaving' : ''} ${reached('deer') ? 'has-deer' : ''}`}
      role="img"
      aria-label={STUDIO}
      onPointerDown={leave}
    >
      {reached('sky') && <img className="splash-sky" src={SKY} alt="" draggable={false} />}
      <div className="splash-stage">
        <div className="splash-deer-box">
          {reached('deer') && <div className="splash-flare" aria-hidden />}
          {reached('deer') && <img className="splash-deer" src={DEER} alt="" draggable={false} />}
          {!calm && reached('lightning') && (
            <div className="splash-lightning" aria-hidden>
              <ElectricLogo
                src={DEER_SHAPE}
                color="#cadcff"
                glowColor="#528aff"
                scale={1 / LIGHTNING_ROOM}
                intensity={1.7}
                glow={1.5}
                thickness={2.4}
                strands={4}
                bend={0.6}
                crackle={1.6}
                arcs={1.5}
                flicker={0.5}
                speed={2.4}
                interactive={false}
              />
            </div>
          )}
        </div>
        <div className="splash-name">
          {reached('name') && (
            <ParticleText
              text={STUDIO}
              fontFamily="'Unbounded', 'Fredoka', sans-serif"
              fontWeight={700}
              fontSize="clamp(1.7rem, 6.8vw, 4.4rem)"
              color="#f2f8ff"
              highlightColor="#7fe0ff"
              particleSize={1.9}
              density={2}
              maxParticles={6000}
              // the glow is one CSS drop-shadow on the canvas (splash.css), cheaper than one per particle
              glow={false}
              scatter={220}
              gatherDuration={1700}
              stagger={500}
              pointerRepel={30}
              style={{ minHeight: 0 }}
            />
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
