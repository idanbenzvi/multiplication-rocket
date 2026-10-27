import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { calmMotion } from '../arrival/dropOut';
import { usePause } from '../../game/gameClock';
import { useLang, useT } from '../../i18n/useLang';
import { sfx } from '../../audio/sfx';
import { hush } from './narrate';
import { typedAt } from './timeline';
import { setStoryVoice, useStory } from './useStory';

// The film round the story's pictures: its bars, with its words along the
// bottom and 🔊 and Skip along the top, and the where and when typed in
// before a scene.

/** the film's bars, its words along the bottom, and 🔊 and Skip along the top */
export function Letterbox({ caption, captionKey, started, onSkip }: { caption: string | null; captionKey: string | number; started: boolean; onSkip: () => void }) {
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

/**
 * The where and when, as a film puts it before a scene: `lines` typed in at
 * the bottom left (the right, in Hebrew) in a terminal's glowing green, a
 * character at a time with a key's click, a pause between lines, starting
 * `delay` seconds in. With reduced motion, they're just there.
 */
export function Slate({ lines, delay = 0 }: { lines: readonly string[]; delay?: number }) {
  const lang = useLang((s) => s.lang);
  const [calm] = useState(calmMotion);
  const rows = useRef<Array<HTMLDivElement | null>>([]);

  useEffect(() => {
    const total = lines.reduce((n, l) => n + l.length, 0);
    let raf = 0;
    let last = performance.now();
    let time = -delay;
    let shown = -1;
    const show = (n: number) => {
      let left = n;
      // (the caret's on the line being typed, and stays at the end)
      let at = -1;
      lines.forEach((line, i) => {
        if (at < 0 && left < line.length) at = i;
        const text = rows.current[i]?.firstElementChild;
        if (text) text.textContent = line.slice(0, Math.max(0, Math.min(line.length, left)));
        left -= line.length;
      });
      if (at < 0) at = lines.length - 1;
      rows.current.forEach((row, i) => row?.classList.toggle('is-typing', i === at));
    };
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (usePause.getState().away) return;
      time += dt;
      const n = calm ? total : typedAt(lines, time);
      if (n === shown) return;
      if (n > shown && shown >= 0) sfx.type();
      shown = n;
      show(n);
      if (n >= total) cancelAnimationFrame(raf);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [lines, delay, calm]);

  return (
    <motion.div className="story-slate" dir={lang === 'he' ? 'rtl' : 'ltr'} role="note" aria-label={lines.join(', ')} initial={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.8 } }}>
      {lines.map((_, i) => (
        <div
          key={i}
          ref={(el) => {
            rows.current[i] = el;
          }}
          className={i === 0 ? 'story-slate-line is-typing' : 'story-slate-line'}
          aria-hidden="true"
        >
          <span className="story-slate-text" />
          <span className="story-slate-caret" />
        </div>
      ))}
    </motion.div>
  );
}
