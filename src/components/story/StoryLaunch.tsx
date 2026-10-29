import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { calmMotion } from '../arrival/dropOut';
import { useLang, useT } from '../../i18n/useLang';
import { sfx } from '../../audio/sfx';
import { haptics } from '../../audio/haptics';
import { Letterbox, Slate } from './film';
import { SLATE, useCanvasLoop, useSkip } from './filmHooks';
import { LaunchScene } from './launchScene';
import { LAUNCH, typeTime } from './timeline';
import { hush, narrate } from './narrate';
import { endLaunch, useStory } from './useStory';

// The launch (launchScene.ts): the where and when typed in on the dark (the
// launch pad, the pilot, the mission), then the pilot's own ship lifting off
// for the Black Sun, its line of words read aloud.

export function StoryLaunch() {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const pilot = useStory((s) => s.pilot);
  const [calm] = useState(calmMotion);
  const scene = useMemo(() => (pilot ? new LaunchScene(calm, pilot) : null), [calm, pilot]);
  // (the Sun's face is WebGL: given back as it goes)
  useEffect(() => () => scene?.dispose(), [scene]);
  const [slate] = useState(() => (pilot ? t.story.slateLaunch(pilot.name) : []));
  /** how long the dark lasts, the where and when typed in on it (seconds) */
  const prelude = calm ? 2.2 : SLATE.delay + typeTime(slate) + SLATE.after;
  const [slateOn, setSlateOn] = useState(true);
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
    // (the scene's own time, once the where and when's typed in)
    const k = s.time - prelude;
    if (k < 0) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);
      return;
    }
    const cue = (id: string, at: number, fn: () => void) => {
      if (k >= at && !s.cues.has(id)) {
        s.cues.add(id);
        fn();
      }
    };
    cue('words', 0.6, () => {
      setCaption(true);
      if (useStory.getState().voice) narrate(line, lang);
    });
    // (gone as the pictures come up: the ship lifts off where it is)
    cue('slate', 0.05, () => setSlateOn(false));
    cue('ignite', LAUNCH.ignite, () => {
      sfx.blastOff();
      haptics.launch();
    });
    cue('away', LAUNCH.away[0] + 0.6, () => {
      sfx.hyperdrive();
      haptics.warp();
    });
    cue('glint', LAUNCH.glint, () => sfx.flareOut());
    cue('quiet', LAUNCH.white[0], () => setCaption(false));
    scene.update(dt);
    scene.draw(ctx, w, h);
    if (scene.done) finish();
  });

  return (
    <motion.div className="story" role="dialog" aria-modal="true" aria-label={t.story.label} initial={{ opacity: 1 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.2 } }}>
      <canvas ref={canvas} className="story-canvas" />
      <AnimatePresence>{slateOn && <Slate key="slate" lines={slate} delay={SLATE.delay} />}</AnimatePresence>
      <Letterbox caption={caption ? line : null} captionKey="launch" started onSkip={finish} />
    </motion.div>
  );
}
