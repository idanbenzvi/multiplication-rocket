import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import Orb from '../reactbits/Orb';
import { calmMotion } from '../arrival/dropOut';
import { useLang, useT } from '../../i18n/useLang';
import { sfx } from '../../audio/sfx';
import { haptics } from '../../audio/haptics';
import { Letterbox, Slate } from './film';
import { SLATE, today, useCanvasLoop, useSkip } from './filmHooks';
import { OpeningScene } from './openingScene';
import { clamp01 } from './storyMath';
import { StoryClock, beatAt, OPENING_END, typeTime } from './timeline';
import { hush, narrate, primeVoice, speaking } from './narrate';
import { endOpening, useStory } from './useStory';

// The opening (openingScene.ts): its first frame waiting under ▶ Start,
// whose tap lets the voice speak; then the lights go down, the where and
// when is typed in on the dark, and the pictures come up, a line of words
// with each beat, read aloud (unless 🔇).

export function StoryOpening() {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const replay = useStory((s) => s.replay);
  const [calm] = useState(calmMotion);
  const scene = useMemo(() => new OpeningScene(calm), [calm]);
  // (watching it again: the tap on About's ▶ started it)
  const [started, setStarted] = useState(replay);
  const [slate] = useState(() => t.story.slate(today(lang)));
  /** how long the dark lasts, the where and when typed in on it (seconds) */
  const prelude = calm ? 2.4 : SLATE.delay + typeTime(slate) + SLATE.after;
  /** past it: the pictures, and the words */
  const [rolling, setRolling] = useState(false);
  const [slateOn, setSlateOn] = useState(true);
  const [beat, setBeat] = useState(0);
  const orbie = useRef<HTMLDivElement | null>(null);
  const state = useRef({ started, pre: 0, clock: new StoryClock(), time: 0, beat: -1, rolled: false, slateGone: false, ended: false });
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
    let spawns = 0;
    scene.onEvent = (what) => {
      if (what === 'turn') sfx.flareOut();
      else if (what === 'spawn') {
        sfx.spawn(spawns++);
        haptics.bump(0.4);
      }
      else if (what === 'awaken') {
        sfx.monsterRise();
        haptics.monster();
      } else if (what === 'sputter') {
        sfx.rumble(0.6);
        haptics.bump(0.6);
      } else if (what === 'orbie') sfx.blip(6);
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
    if (s.started) s.pre += dt;
    const rolled = s.started && s.pre >= prelude;
    if (rolled && !s.rolled) {
      s.rolled = true;
      setRolling(true);
    }
    if (rolled && !s.slateGone && s.pre >= prelude + SLATE.hold) {
      s.slateGone = true;
      setSlateOn(false);
    }
    const voice = useStory.getState().voice;
    const T = rolled ? s.clock.step(dt, voice && speaking()) : 0;
    if (rolled) {
      const b = beatAt(T);
      if (b !== s.beat) {
        s.beat = b;
        setBeat(b);
        if (voice) narrate(words.current.lines[b], words.current.lang);
      }
      scene.update(T, s.time, dt);
    }
    scene.draw(ctx, w, h, T, s.time);
    // the lights going down as it starts, dark while the where and when's typed in, and up on the pictures
    const dark = !s.started ? 0 : s.pre < prelude ? Math.min(1, s.pre / 0.35) : 1 - clamp01((s.pre - prelude) / 1.4);
    if (dark > 0) {
      ctx.fillStyle = `rgba(0, 0, 0, ${dark})`;
      ctx.fillRect(0, 0, w, h);
    }
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
      {rolling && beat >= 3 && (
        <div ref={orbie} className="story-orbie" aria-hidden="true">
          <Orb hue={0} hoverIntensity={0.6} rotateOnHover forceHoverState backgroundColor="#000000" />
          <span className="story-orbie-face">?</span>
        </div>
      )}
      <AnimatePresence>{started && slateOn && <Slate key="slate" lines={slate} delay={SLATE.delay} />}</AnimatePresence>
      <Letterbox caption={rolling ? t.story.lines[beat] : null} captionKey={beat} started={started} onSkip={finish} />
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
