import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence } from 'motion/react';
import { useSplash } from '../splash/useSplash';
import { pauseGame, resumeGame } from '../../game/gameClock';
import { hush } from './narrate';
import { StoryLaunch } from './StoryLaunch';
import { StoryOpening } from './StoryOpening';
import { StoryTitle } from './StoryTitle';
import { useStory } from './useStory';
import './story.css';

// The story's acts (useStory.ts), over everything but the studio's opening,
// the game paused under them: the opening (StoryOpening), the launch
// (StoryLaunch) and the title (StoryTitle). Each is letterboxed, like a film
// (film.tsx), its words in the bar along the bottom (read aloud, unless 🔇),
// with Skip in the top one (and Esc, and Back).

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
