import { useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '../../i18n/useLang';
import { CycleScene, type CycleClock } from '../about/CycleScene';
import { loadScene, type Scene } from '../about/sceneData';
import { Toggle } from './parts';

// The About page's canyon, colour cycling (about/CycleScene.tsx), with its
// clock in the page's hands: the colours stopped or turning, and the dots
// that never change dimmed. Beside it, three of its palette's cycling ranges
// as strips of colour, turning with it: each swatch is the colour one of
// its palette's entries shows right now, so the colours are seen passing
// along from swatch to swatch as the water flows.

const SRC = './about/canyon.json';
/** the ranges shown as strips (scripts/canyon-cycle.py's names) */
const STRIPS = [
  ['water', 'ripples0'],
  ['sparkles', 'sparkles0'],
  ['engine', 'engine0'],
] as const;

const calm = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

function Strips({ clock, labels }: { clock: CycleClock; labels: Record<(typeof STRIPS)[number][0], string> }) {
  const [scene, setScene] = useState<Scene | null>(null);
  const swatches = useRef<Array<HTMLSpanElement | null>>([]);
  useEffect(() => {
    let alive = true;
    loadScene(SRC)
      .then((s) => alive && setScene(s))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  const ranges = useMemo(() => (scene ? STRIPS.map(([, name]) => scene.ranges.find((r) => r.name === name)) : []), [scene]);

  // each frame, every swatch the colour its entry shows now (as the shader turns it)
  useEffect(() => {
    if (!scene) return;
    const pal = (i: number) => [scene.palette[i * 3], scene.palette[i * 3 + 1], scene.palette[i * 3 + 2]];
    let raf = 0;
    const frame = () => {
      ranges.forEach((r, row) => {
        if (!r) return;
        for (let i = 0; i < r.length; i++) {
          const el = swatches.current[row * 16 + i];
          if (!el) continue;
          const q = (((i - clock.t * r.rate) % r.length) + r.length) % r.length;
          const i0 = Math.floor(q);
          const a = pal(r.start + i0);
          const b = pal(r.start + ((i0 + 1) % r.length));
          const k = r.blend ? q - i0 : 0;
          el.style.background = `rgb(${a.map((v, c) => Math.round(v + (b[c] - v) * k)).join(' ')})`;
        }
      });
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [scene, ranges, clock]);

  return (
    <div className="how-strips" aria-hidden="true">
      {STRIPS.map(([key], row) => (
        <div key={key} className="how-strip">
          <span className="how-strip-label">{labels[key]}</span>
          <span className="how-strip-swatches" dir="ltr">
            {Array.from({ length: ranges[row]?.length ?? 8 }, (_, i) => (
              <span key={i} ref={(el) => void (swatches.current[row * 16 + i] = el)} className="how-swatch" />
            ))}
          </span>
        </div>
      ))}
    </div>
  );
}

export function CycleDemo() {
  const t = useT().how.cycle;
  // (with reduced motion, still until asked)
  const clock = useMemo<CycleClock>(() => ({ t: 0, speed: calm() ? 0 : 1, mark: false }), []);
  const [going, setGoing] = useState(clock.speed > 0);
  const [mark, setMark] = useState(false);
  useEffect(() => {
    clock.speed = going ? 1 : 0;
    clock.mark = mark;
  }, [clock, going, mark]);
  return (
    <>
      <div className="how-stage how-canyon">
        <CycleScene src={SRC} clock={clock} className="how-canyon-scene" />
        <Strips clock={clock} labels={t.strips} />
      </div>
      <div className="how-controls">
        <button type="button" className="how-button" onClick={() => setGoing((g) => !g)}>
          <span aria-hidden="true">{going ? '⏸' : '▶'}</span> {going ? t.stop : t.go}
        </button>
        <Toggle label={t.mark} on={mark} onChange={setMark} />
      </div>
    </>
  );
}
