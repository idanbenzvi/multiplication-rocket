import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { pauseGame, resumeGame } from '../../game/gameClock';
import { flyHome } from '../../game/flight';
import { DEV_MODE } from '../../dev/devMode';
import ElectricLogo from '../reactbits/ElectricLogo';
import ParticleText from '../reactbits/ParticleText';
import { SplashShip } from './SplashShip';
import './splash.css';

// The studio's opening, Flying Deer Games: an empty starry sky; the winged
// deer constellation traced into it by cyan lightning (React Bits'
// ElectricLogo, running along the deer's silhouette) as the constellation
// itself glows in; then the studio's name gathering out of drifting
// particles (React Bits' ParticleText); and with a whoosh, the game's rocket
// loops the loop through the deer and zooms away in a trail of sparkles
// (SplashShip). The game loads underneath, paused, and a tap or a key skips
// ahead to it.

const SKY = './splash/space.webp';
// the deer's light on transparency, cut from the constellation picture
const DEER = './splash/deer.webp';
// the deer's silhouette, for the lightning to trace (same frame as DEER)
const DEER_SHAPE = './splash/deer-shape.png';

const STUDIO = 'Flying Deer Games';
const NAME_FONT = "'Unbounded', 'Fredoka', sans-serif";

// the lightning and its haze reach well past the deer: its canvas is this much
// bigger (splash.css: .splash-lightning's inset), and the deer fills the middle
const LIGHTNING_ROOM = 1.7;

/** what's on screen: each step adds to the ones before */
type Step = 'loading' | 'sky' | 'lightning' | 'deer' | 'name' | 'ship';
const ORDER: Step[] = ['loading', 'sky', 'lightning', 'deer', 'name', 'ship'];

// when each step starts, and when the splash leaves, in ms after the pictures have loaded
const TIMELINE: [Step | 'leave', number][] = [
  ['sky', 0],
  ['lightning', 600],
  ['deer', 1900],
  ['name', 2900],
  ['ship', 5600],
  ['leave', 8800],
];
// with reduced motion: the same steps, sooner, and no lightning or flying rocket
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

interface Spot {
  /** the middle, and the size, in screen px */
  x: number;
  y: number;
  w: number;
  h: number;
}

/** where an element is on screen, kept up to date as the window changes */
function useSpot(ref: React.RefObject<HTMLElement | null>): Spot | null {
  const [spot, setSpot] = useState<Spot | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      const next = { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), w: Math.round(r.width), h: Math.round(r.height) };
      setSpot((prev) => (prev && prev.x === next.x && prev.y === next.y && prev.w === next.w && prev.h === next.h ? prev : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [ref]);
  return spot;
}

export function StudioSplash() {
  const [step, setStep] = useState<Step>('loading');
  const [isLeaving, setIsLeaving] = useState(false);
  const [done, setDone] = useState(false);
  const [calm] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  const leaving = useRef(false);
  // where the deer and the name's spot under it are, in screen px (the particles and the rocket are placed by them)
  const deerRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLDivElement>(null);
  const deerSpot = useSpot(deerRef);
  const nameSpot = useSpot(nameRef);

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
      // and the rocket flies in to its place
      flyHome();
    }, LEAVE_MS);
  };

  useEffect(() => {
    let cancelled = false;
    const timers: number[] = [];
    // (the name's font too, so it's ready before the particles need it)
    const font = document.fonts?.load(`700 32px ${NAME_FONT.split(',')[0]}`).catch(() => undefined);
    const ready = Promise.all([loaded(SKY), loaded(DEER), loaded(DEER_SHAPE), font]);
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
        <div className="splash-deer-box" ref={deerRef}>
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
        {/* where the name goes: the particles themselves fly in over the whole screen (below) */}
        <div className="splash-name" ref={nameRef} />
      </div>
      {reached('name') && nameSpot && (
        // The particles' canvas covers the whole screen, so they gather out of open space from all
        // around (and no box edge cuts them off); the name forms at its spot under the deer.
        <div className="splash-particles">
          <ParticleText
            text={STUDIO}
            centerX={nameSpot.x}
            centerY={nameSpot.y}
            fitWidth={nameSpot.w}
            fontFamily={NAME_FONT}
            fontWeight={700}
            fontSize="clamp(1.7rem, 6.8vw, 4.4rem)"
            color="#f2f8ff"
            highlightColor="#7fe0ff"
            particleSize={1.9}
            density={2}
            maxParticles={6000}
            // the glow is one CSS drop-shadow on the canvas (splash.css), cheaper than one per particle
            glow={false}
            scatter={Math.max(360, nameSpot.w * 0.45)}
            gatherDuration={2000}
            stagger={800}
            pointerRepel={30}
            style={{ minHeight: 0 }}
          />
        </div>
      )}
      {!calm && reached('ship') && deerSpot && <SplashShip deer={deerSpot} />}
    </div>,
    document.body,
  );
}
