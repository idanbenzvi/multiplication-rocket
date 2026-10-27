import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import Orb from '../reactbits/Orb';
import { SpaceTimesLogo } from '../logo/SpaceTimesLogo';
import { calmMotion } from '../arrival/dropOut';
import { useSplash } from '../splash/useSplash';
import { pauseGame, resumeGame, usePause } from '../../game/gameClock';
import { useLang, useT } from '../../i18n/useLang';
import { useBack } from '../../native/back';
import { sfx } from '../../audio/sfx';
import { OpeningScene } from './openingScene';
import { LaunchScene } from './launchScene';
import { StoryClock, beatAt, LAUNCH, OPENING_END } from './timeline';
import { hush, narrate, primeVoice, speaking } from './narrate';
import { endLaunch, endOpening, endTitle, setStoryVoice, useStory } from './useStory';
import './story.css';

// The story's acts (useStory.ts), over everything but the studio's opening,
// the game paused under them: the opening (its first frame waiting under
// ▶ Start, whose tap lets the voice speak), the launch and the title. Each is
// letterboxed, like a film, its words in the bar along the bottom (read
// aloud, unless 🔇), with Skip in the top one (and Esc, and Back).

export function Story() {
  const act = useStory((s) => s.act);
  const replay = useStory((s) => s.replay);
  const splash = useSplash((s) => s.showing);
  const on = !!act;
  useEffect(() => {
    if (!on) return;
    pauseGame('story');
    return () => {
      resumeGame('story');
      hush();
    };
  }, [on]);
  // (the first time, after the studio's opening)
  const show = act && !(splash && !replay);
  return createPortal(
    <AnimatePresence>
      {show && act === 'opening' && <StoryOpening key="opening" />}
      {show && act === 'launch' && <StoryLaunch key="launch" />}
      {show && act === 'title' && <StoryTitle key="title" />}
    </AnimatePresence>,
    document.body,
  );
}

/** a full-screen canvas drawn every frame (while the player's here), at the device's pixel ratio */
function useCanvasLoop(frame: (ctx: CanvasRenderingContext2D, w: number, h: number, dt: number) => void) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const latest = useRef(frame);
  useLayoutEffect(() => {
    latest.current = frame;
  });
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (usePause.getState().away) return;
      const w = window.innerWidth;
      const h = window.innerHeight;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      latest.current(ctx, w, h, dt);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      canvas.width = canvas.height = 0;
    };
  }, []);
  return ref;
}

/** Skip, Esc and Back all do `skip` */
function useSkip(skip: () => void) {
  useBack(skip);
  const latest = useRef(skip);
  useLayoutEffect(() => {
    latest.current = skip;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && latest.current();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
}

/** the film's bars, its words along the bottom, and 🔊 and Skip along the top */
function Letterbox({ caption, captionKey, started, onSkip }: { caption: string | null; captionKey: string | number; started: boolean; onSkip: () => void }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const voice = useStory((s) => s.voice);
  return (
    <>
      <div className={`story-bar is-top ${started ? 'is-in' : ''}`} dir={lang === 'he' ? 'rtl' : 'ltr'}>
        <button
          type="button"
          className="story-chip"
          onClick={() => {
            if (voice) hush();
            setStoryVoice(!voice);
          }}
          aria-pressed={voice}
          aria-label={voice ? t.story.voiceOn : t.story.voiceOff}
          title={voice ? t.story.voiceOn : t.story.voiceOff}
        >
          {voice ? '🔊' : '🔇'}
        </button>
        <button type="button" className="story-chip story-skip" onClick={onSkip}>
          {t.story.skip} <span aria-hidden="true">{lang === 'he' ? '⏮' : '⏭'}</span>
        </button>
      </div>
      <div className={`story-bar is-bottom ${started ? 'is-in' : ''}`} dir={lang === 'he' ? 'rtl' : 'ltr'}>
        <AnimatePresence mode="wait">
          {caption && (
            <motion.p
              key={captionKey}
              className="story-caption"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.45 }}
              aria-live="polite"
            >
              {caption}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}

// ---------- the opening ----------

function StoryOpening() {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const replay = useStory((s) => s.replay);
  const [calm] = useState(calmMotion);
  const scene = useMemo(() => new OpeningScene(calm), [calm]);
  // (watching it again: the tap on About's ▶ started it)
  const [started, setStarted] = useState(replay);
  const [beat, setBeat] = useState(0);
  const orbie = useRef<HTMLDivElement | null>(null);
  const state = useRef({ started, clock: new StoryClock(), time: 0, beat: -1, ended: false });
  state.current.started = started;
  const words = useRef({ lines: t.story.lines, lang });
  words.current = { lines: t.story.lines, lang };

  const finish = () => {
    if (state.current.ended) return;
    state.current.ended = true;
    hush();
    endOpening();
  };
  useSkip(finish);

  // its sounds
  useEffect(() => {
    let swallows = 0;
    scene.onEvent = (what) => {
      if (what === 'turn') sfx.flareOut();
      else if (what === 'awaken') sfx.monsterRise();
      else if (what === 'sputter') sfx.rumble(0.6);
      else if (what === 'orbie') sfx.blip(6);
    };
    scene.sun.onSwallow = () => {
      swallows++;
      if (swallows % 3 === 1) sfx.swallow(false);
      if (swallows === 8) sfx.monsterLaugh();
    };
  }, [scene]);

  const canvas = useCanvasLoop((ctx, w, h, dt) => {
    const s = state.current;
    s.time += dt;
    const voice = useStory.getState().voice;
    const T = s.started ? s.clock.step(dt, voice && speaking()) : 0;
    if (s.started) {
      const b = beatAt(T);
      if (b !== s.beat) {
        s.beat = b;
        setBeat(b);
        if (voice) narrate(words.current.lines[b], words.current.lang);
      }
    }
    scene.update(T, s.time, dt);
    scene.draw(ctx, w, h, T, s.time);
    const o = scene.orbie(T);
    if (orbie.current) {
      const size = 160;
      orbie.current.style.transform = `translate(${o.x - size / 2}px, ${o.y - size / 2}px) scale(${((o.r * 2) / size) * (0.6 + 0.4 * o.on)})`;
      orbie.current.style.opacity = String(o.on);
    }
    if (T >= OPENING_END) finish();
  });

  const start = () => {
    // (from the tap: the browser lets the story speak from now on, and the music start)
    primeVoice();
    setStarted(true);
  };

  return (
    <motion.div
      className="story"
      role="dialog"
      aria-modal="true"
      aria-label={t.story.label}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.9 } }}
      transition={{ duration: 0.8 }}
    >
      <canvas ref={canvas} className="story-canvas" />
      {started && beat >= 3 && (
        <div ref={orbie} className="story-orbie" aria-hidden="true">
          <Orb hue={0} hoverIntensity={0.6} rotateOnHover forceHoverState backgroundColor="#000000" />
          <span className="story-orbie-face">?</span>
        </div>
      )}
      <Letterbox caption={started ? t.story.lines[beat] : null} captionKey={beat} started={started} onSkip={finish} />
      <AnimatePresence>
        {!started && (
          <motion.div key="start" className="story-start" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.4 } }} transition={{ delay: 0.4 }}>
            <button type="button" className="story-play" onClick={start} autoFocus>
              {t.story.start}
            </button>
            <button type="button" className="story-chip story-start-skip" onClick={finish}>
              {t.story.skip}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ---------- the launch ----------

function StoryLaunch() {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const pilot = useStory((s) => s.pilot);
  const [calm] = useState(calmMotion);
  const scene = useMemo(() => (pilot ? new LaunchScene(calm, pilot) : null), [calm, pilot]);
  const [caption, setCaption] = useState(false);
  const state = useRef({ ended: false, time: 0, cues: new Set<string>() });
  const line = pilot ? t.story.launch(pilot.name) : '';

  const finish = () => {
    if (state.current.ended) return;
    state.current.ended = true;
    hush();
    endLaunch();
  };
  useSkip(finish);

  const canvas = useCanvasLoop((ctx, w, h, dt) => {
    if (!scene) return finish();
    const s = state.current;
    s.time += dt;
    const cue = (id: string, at: number, fn: () => void) => {
      if (s.time >= at && !s.cues.has(id)) {
        s.cues.add(id);
        fn();
      }
    };
    cue('words', 0.6, () => {
      setCaption(true);
      if (useStory.getState().voice) narrate(line, lang);
    });
    cue('ignite', LAUNCH.ignite, () => sfx.blastOff());
    cue('away', LAUNCH.away[0] + 0.6, () => sfx.hyperdrive());
    cue('glint', LAUNCH.glint, () => sfx.flareOut());
    cue('quiet', LAUNCH.white[0], () => setCaption(false));
    scene.update(dt);
    scene.draw(ctx, w, h);
    if (scene.done) finish();
  });

  return (
    <motion.div className="story" role="dialog" aria-modal="true" aria-label={t.story.label} initial={{ opacity: 1 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.2 } }}>
      <canvas ref={canvas} className="story-canvas" />
      <Letterbox caption={caption ? line : null} captionKey="launch" started onSkip={finish} />
    </motion.div>
  );
}

// ---------- the title ----------

/** how long the title holds before it flies to the top bar (ms) */
const TITLE_HOLD_MS = 2600;

function StoryTitle() {
  const replay = useStory((s) => s.replay);
  const t = useT();
  const [calm] = useState(calmMotion);
  const [phase, setPhase] = useState<'show' | 'go'>('show');
  const logo = useRef<HTMLDivElement | null>(null);
  const [to, setTo] = useState<{ x: number; y: number; scale: number } | null>(null);
  const [height] = useState(() => Math.round(Math.min(window.innerHeight * 0.44, (window.innerWidth * 0.82 * 729) / 860, 380)));
  const done = useRef(false);
  const finish = () => {
    if (done.current) return;
    done.current = true;
    endTitle();
  };
  useSkip(finish);

  useEffect(() => {
    const id = window.setTimeout(() => {
      // where it goes: the logo's place in the top bar (hidden till it's there; watching it again, About's over it, and it just fades)
      const target = replay || calm ? null : document.querySelector('.hud-logo .st-logo')?.getBoundingClientRect();
      const here = logo.current?.getBoundingClientRect();
      if (target && here && target.height > 0) {
        setTo({ x: target.left + target.width / 2 - (here.left + here.width / 2), y: target.top + target.height / 2 - (here.top + here.height / 2), scale: target.height / here.height });
      }
      setPhase('go');
    }, TITLE_HOLD_MS);
    return () => window.clearTimeout(id);
  }, [replay, calm]);

  return (
    <motion.div
      className="story-title"
      role="img"
      aria-label={t.story.label}
      initial={{ backgroundColor: 'rgba(255, 252, 246, 1)' }}
      animate={{ backgroundColor: phase === 'go' ? 'rgba(5, 3, 15, 0)' : 'rgba(5, 3, 15, 1)' }}
      transition={phase === 'go' ? { duration: 0.8, delay: 0.3, ease: 'easeInOut' } : { duration: 1.1, ease: 'easeOut' }}
    >
      <motion.div
        ref={logo}
        className="story-title-logo"
        initial={calm ? { opacity: 0 } : { opacity: 0, scale: 1.5, filter: 'blur(14px) brightness(3)' }}
        animate={
          phase === 'show'
            ? { opacity: 1, scale: 1, filter: 'blur(0px) brightness(1)' }
            : to
              ? { x: to.x, y: to.y, scale: to.scale, opacity: 1, filter: 'blur(0px) brightness(1)' }
              : { opacity: 0, scale: calm ? 1 : 0.9 }
        }
        transition={phase === 'show' ? { duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: 0.15 } : { duration: 1, ease: [0.45, 0, 0.2, 1] }}
        onAnimationComplete={() => phase === 'go' && finish()}
      >
        <SpaceTimesLogo height={height} />
      </motion.div>
    </motion.div>
  );
}

