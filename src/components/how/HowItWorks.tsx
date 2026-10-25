import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { pauseGame, resumeGame } from '../../game/gameClock';
import { useLang, useT } from '../../i18n/useLang';
import { speak } from '../../audio/speech';
import { sfx } from '../../audio/sfx';
import { useBack } from '../../native/back';
import { useWarpCanvas } from '../useWarpCanvas';
import { CardDemo, PlumeDemo, SpeedDemo } from './FlightDemos';
import { CockpitDemo } from './CockpitDemo';
import { CycleDemo } from './CycleDemo';
import { MemoryDemo } from './MemoryDemo';
import { OrbieDemo } from './OrbieDemo';
import { SoundDemo } from './SoundDemo';
import './how.css';

// "How does it work?": a tour for curious kids of how the game works behind
// the scenes (docs/plans/2026-10-22-how-it-works.md), a page at a time, each
// with one of the game's own pieces running in it to play with: the rocket's
// card, the space dust, the engine's shader, the cockpit's 360° picture
// wrapped round them, the canyon's colour cycling, the spaced review's boxes,
// Orbie, and the sounds made from waves. It opens with what all of it runs
// on: the math they're practising. Opened from the About page; the game is
// paused while it's open.

const PAGES = [
  { id: 'card', Demo: CardDemo, math: true },
  { id: 'speed', Demo: SpeedDemo },
  { id: 'plume', Demo: PlumeDemo },
  { id: 'cockpit', Demo: CockpitDemo },
  { id: 'cycle', Demo: CycleDemo },
  { id: 'memory', Demo: MemoryDemo },
  { id: 'orbie', Demo: OrbieDemo },
  { id: 'sound', Demo: SoundDemo },
] as const;

/** `onClose`: back to the About page; `onDone`: back to the game, from the last page */
export function HowItWorks({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const t = useT();
  const how = t.how;
  const lang = useLang((s) => s.lang);
  const rtl = lang === 'he';
  const [page, setPage] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drift = useRef(0.08);
  useWarpCanvas(canvasRef, 0.45, drift);

  const { id, Demo } = PAGES[page];
  const math = 'math' in PAGES[page];
  const words = how[id];
  const last = page === PAGES.length - 1;

  const go = useCallback((d: 1 | -1) => {
    try {
      window.speechSynthesis?.cancel();
    } catch {
      // ignore
    }
    setDir(d);
    setPage((p) => Math.max(0, Math.min(PAGES.length - 1, p + d)));
    sfx.blip(5 + d);
  }, []);

  useBack(onClose);
  useEffect(() => {
    pauseGame('how');
    return () => {
      try {
        window.speechSynthesis?.cancel();
      } catch {
        // ignore
      }
      resumeGame('how');
    };
  }, []);

  // Esc closes; ← → turn the pages (the other way round in Hebrew), unless a slider has them
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return onClose();
      if ((e.target as HTMLElement | null)?.tagName === 'INPUT') return;
      const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!d) return;
      const step = (rtl ? -d : d) as 1 | -1;
      if ((step > 0 && !last) || (step < 0 && page > 0)) go(step);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, go, rtl, last, page]);

  const read = () => speak([...(math ? [how.math.title, how.math.text] : []), words.title, ...words.text].join(' '), lang, t.academy.speakWords);
  const slide = (rtl ? -1 : 1) * 40;

  return createPortal(
    <motion.div className="how" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <canvas ref={canvasRef} className="how-warp" aria-hidden="true" />
      <motion.div
        className="how-panel"
        dir={rtl ? 'rtl' : 'ltr'}
        role="dialog"
        aria-modal="true"
        aria-label={how.title}
        initial={{ y: 24, opacity: 0, scale: 0.96 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        transition={{ delay: 0.05, type: 'spring', stiffness: 260, damping: 24 }}
      >
        <header className="how-header">
          <div>
            <div className="how-title">🔧 {how.title}</div>
            <div className="how-sub">{how.pageOf(page + 1, PAGES.length)}</div>
          </div>
          <button type="button" className="how-close" onClick={onClose} aria-label={how.close}>
            ✕
          </button>
        </header>
        <div className="how-dots" aria-hidden="true">
          {PAGES.map((p, i) => (
            <span key={p.id} className={`how-dot ${i < page ? 'is-done' : ''} ${i === page ? 'is-now' : ''}`} />
          ))}
        </div>
        <div className="how-body">
          <AnimatePresence mode="wait" initial={false} custom={dir}>
            <motion.div
              key={id}
              className={`how-page is-${id}`}
              initial={{ opacity: 0, x: dir * slide }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -dir * slide }}
              transition={{ duration: 0.22 }}
            >
              <div className="how-show">
                <Demo />
              </div>
              <div className="how-words">
                {math && (
                  <aside className="how-math">
                    <h3>{how.math.title}</h3>
                    <p>{how.math.text}</p>
                  </aside>
                )}
                <h2>{words.title}</h2>
                {words.text.map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
        <footer className="how-footer">
          <button type="button" className="how-nav is-back" onClick={() => go(-1)} disabled={page === 0}>
            {how.back}
          </button>
          <button type="button" className="how-nav is-read" onClick={read} aria-label={how.read} title={how.read}>
            <span aria-hidden="true">🔊</span>
            <span className="how-nav-label">{how.read}</span>
          </button>
          {last ? (
            <button type="button" className="how-nav is-next" onClick={onDone}>
              {how.done}
            </button>
          ) : (
            <button type="button" className="how-nav is-next" onClick={() => go(1)}>
              {how.next}
            </button>
          )}
        </footer>
      </motion.div>
    </motion.div>,
    document.body,
  );
}
