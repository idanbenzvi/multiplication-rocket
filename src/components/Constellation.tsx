import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { gameTimeout } from '../game/gameClock';
import { useGameStore } from '../game/useGameStore';
import { getLevelConfig } from '../game/levels';
import { buildConstellationTargets, GRID_COLS, GRID_ROWS } from '../game/bonusRounds';
import { kick } from '../game/flight';
import { sfx } from '../audio/sfx';
import { haptics } from '../audio/haptics';
import { useT } from '../i18n/useLang';
import GradientText from './reactbits/GradientText';

interface Props {
  onDone: (result: { fuelGain: number; answers: Array<{ factKey: string; correct: boolean }> }) => void;
  onBurst: (x: number, y: number, color: string) => void;
}

interface Rect {
  r0: number;
  c0: number;
  r1: number;
  c1: number;
}

type Phase = 'intro' | 'building' | 'solved' | 'summary';

const INTRO_MS = 1800;
const SOLVED_MS = 1500;
const SUMMARY_MS = 2000;
const MISSES_BEFORE_HINT = 2;
const FUEL_PER_TARGET = 1.5; // × the fuel of one normal correct answer

function norm(r: Rect) {
  const top = Math.min(r.r0, r.r1);
  const left = Math.min(r.c0, r.c1);
  const rows = Math.abs(r.r1 - r.r0) + 1;
  const cols = Math.abs(r.c1 - r.c0) + 1;
  return { top, left, rows, cols, product: rows * cols };
}

// Drag across the stars to frame a rectangle; a rectangle of exactly the
// target's size lights up as a constellation. Shows multiplication as what
// it is — rows times columns — and that one number can be built different
// ways (12 = 3 × 4 = 2 × 6).
export function Constellation({ onDone, onBurst }: Props) {
  const t = useT();
  const targets = useMemo(() => buildConstellationTargets(useGameStore.getState().progress), []);
  const fuelPerTarget = useMemo(
    () => (100 / getLevelConfig(useGameStore.getState().progress.level).streakToLaunch) * FUEL_PER_TARGET,
    [],
  );

  const [phase, setPhase] = useState<Phase>('intro');
  const [index, setIndex] = useState(0);
  const [drag, setDragState] = useState<Rect | null>(null);
  // Mirror of `drag` that's current immediately: pointer events can arrive
  // faster than React re-renders, and handlers reading the render-time value
  // would miss the start of a quick swipe.
  const dragRef = useRef<Rect | null>(null);
  const setDrag = (r: Rect | null) => {
    dragRef.current = r;
    setDragState(r);
  };
  const [lit, setLit] = useState<Rect | null>(null);
  const [misses, setMisses] = useState(0);
  const [wrong, setWrong] = useState<{ product: number; rows: number; cols: number } | null>(null);
  const [solvedCount, setSolvedCount] = useState(0);
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  const gridRef = useRef<HTMLDivElement>(null);
  const answers = useRef<Array<{ factKey: string; correct: boolean }>>([]);
  const timers = useRef<Array<() => void>>([]);
  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(gameTimeout(fn, ms));
  }, []);
  useEffect(() => () => timers.current.forEach((cancel) => cancel()), []);

  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    const cancel = gameTimeout(() => setPhase('building'), INTRO_MS);
    return cancel;
  }, []);

  const target = targets[index];
  // Cells big enough to hit with a finger, but the whole grid on screen.
  const cell = Math.max(30, Math.min(64, (size.w - 32) / GRID_COLS, (size.h * 0.5) / GRID_ROWS));

  const cellAt = (clientX: number, clientY: number) => {
    const g = gridRef.current?.getBoundingClientRect();
    if (!g) return null;
    const c = Math.floor((clientX - g.left) / cell);
    const r = Math.floor((clientY - g.top) / cell);
    return {
      r: Math.max(0, Math.min(GRID_ROWS - 1, r)),
      c: Math.max(0, Math.min(GRID_COLS - 1, c)),
    };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (phase !== 'building') return;
    const at = cellAt(e.clientX, e.clientY);
    if (!at) return;
    try {
      // Keep receiving moves even if the finger slides off the grid.
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // pointer no longer active (e.g. an interrupted touch) — dragging still works inside the grid
    }
    setWrong(null);
    setDrag({ r0: at.r, c0: at.c, r1: at.r, c1: at.c });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const current = dragRef.current;
    if (!current) return;
    const at = cellAt(e.clientX, e.clientY);
    if (at && (at.r !== current.r1 || at.c !== current.c1)) setDrag({ ...current, r1: at.r, c1: at.c });
  };

  const onPointerUp = () => {
    const finished = dragRef.current;
    if (!finished || !target) return;
    const n = norm(finished);
    setDrag(null);
    if (n.product === 1) return; // a tap, not a rectangle — don't count it
    if (n.product === target.target) {
      setLit(finished);
      setPhase('solved');
      const solvedNow = solvedCount + 1;
      setSolvedCount(solvedNow);
      const a = Math.min(n.rows, n.cols);
      const b = Math.max(n.rows, n.cols);
      answers.current.push({ factKey: `${a}x${b}`, correct: true });
      sfx.constellation();
      haptics.correct(3);
      kick(0.3);
      const g = gridRef.current?.getBoundingClientRect();
      if (g) {
        const cx = g.left + (n.left + n.cols / 2) * cell;
        const cy = g.top + (n.top + n.rows / 2) * cell;
        onBurst(cx, cy, '#ffd77a');
        later(() => onBurst(cx, cy, '#6ad7ff'), 100);
      }
      later(() => {
        setLit(null);
        setMisses(0);
        if (index + 1 < targets.length) {
          setIndex(index + 1);
          setPhase('building');
        } else {
          setPhase('summary');
          sfx.milestone(10);
          later(() => onDone({ fuelGain: solvedNow * fuelPerTarget, answers: answers.current }), SUMMARY_MS);
        }
      }, SOLVED_MS);
    } else {
      setWrong({ product: n.product, rows: n.rows, cols: n.cols });
      setMisses((m) => m + 1);
      sfx.wrong();
      haptics.thump();
    }
  };

  const skip = () => {
    setMisses(0);
    setWrong(null);
    if (index + 1 < targets.length) setIndex(index + 1);
    else {
      setPhase('summary');
      later(() => onDone({ fuelGain: solvedCount * fuelPerTarget, answers: answers.current }), SUMMARY_MS);
    }
  };

  const shown = drag ?? lit;
  const live = shown ? norm(shown) : null;
  const showHint = misses >= MISSES_BEFORE_HINT && phase === 'building' && target;

  return (
    <div className="constellation-round">
      <div className="constellation-header" dir="auto">
        <span className="constellation-title">✨ {t.constellationTitle}</span>
        <span className="meteor-pips">
          {targets.map((_, i) => (
            <span key={i} className={`meteor-pip ${i < solvedCount ? 'is-done' : ''} ${i === index && phase !== 'summary' ? 'is-now' : ''}`} />
          ))}
        </span>
      </div>

      {phase === 'intro' && (
        <div className="round-card">
          <GradientText className="round-card-title" colors={['#6ad7ff', '#b18cff', '#ffd77a', '#6ad7ff']} animationSpeed={3}>
            ✨ {t.constellationTitle}
          </GradientText>
          <div className="round-card-text">{t.constellationIntro}</div>
        </div>
      )}

      {phase === 'summary' && (
        <div className="round-card">
          <GradientText className="round-card-title" colors={['#7ee08f', '#6ad7ff', '#ffd77a', '#7ee08f']} animationSpeed={2}>
            {t.constellationSummary(solvedCount, targets.length)}
          </GradientText>
        </div>
      )}

      {(phase === 'building' || phase === 'solved') && target && (
        <div className="constellation-play">
          <div className="constellation-target">
            {t.constellationMake}{' '}
            <GradientText className="constellation-number" colors={['#ffd77a', '#ff9d76', '#ffd77a']} animationSpeed={3}>
              {target.target}
            </GradientText>
          </div>

          <div
            ref={gridRef}
            className={`star-grid ${phase === 'solved' ? 'is-solved' : ''}`}
            dir="ltr"
            style={{ width: cell * GRID_COLS, height: cell * GRID_ROWS }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={() => setDrag(null)}
          >
            {showHint && (
              <div
                className="star-hint"
                style={{ left: 0, top: 0, width: target.hint.cols * cell, height: target.hint.rows * cell }}
              />
            )}
            {live && (
              <div
                className={`star-frame ${phase === 'solved' ? 'is-lit' : live.product === target.target ? 'is-match' : ''}`}
                style={{ left: live.left * cell, top: live.top * cell, width: live.cols * cell, height: live.rows * cell }}
              />
            )}
            {/* constellation lines once solved: a lattice joining every lit star */}
            {phase === 'solved' && live && (
              <svg className="star-lines" width={cell * GRID_COLS} height={cell * GRID_ROWS}>
                {Array.from({ length: live.rows }, (_, r) => (
                  <line
                    key={`h${r}`}
                    x1={(live.left + 0.5) * cell}
                    y1={(live.top + r + 0.5) * cell}
                    x2={(live.left + live.cols - 0.5) * cell}
                    y2={(live.top + r + 0.5) * cell}
                  />
                ))}
                {Array.from({ length: live.cols }, (_, c) => (
                  <line
                    key={`v${c}`}
                    x1={(live.left + c + 0.5) * cell}
                    y1={(live.top + 0.5) * cell}
                    x2={(live.left + c + 0.5) * cell}
                    y2={(live.top + live.rows - 0.5) * cell}
                  />
                ))}
              </svg>
            )}
            {Array.from({ length: GRID_ROWS * GRID_COLS }, (_, i) => {
              const r = Math.floor(i / GRID_COLS);
              const c = i % GRID_COLS;
              const inside = live && r >= live.top && r < live.top + live.rows && c >= live.left && c < live.left + live.cols;
              return (
                <span
                  key={i}
                  className={`star ${inside ? (phase === 'solved' ? 'is-lit' : 'is-on') : ''}`}
                  style={{ left: (c + 0.5) * cell, top: (r + 0.5) * cell, animationDelay: `${(i % 7) * 0.4}s` }}
                />
              );
            })}
          </div>

          <div className={`constellation-readout ${live && live.product === target.target ? 'is-match' : ''} ${wrong && !drag ? 'is-wrong' : ''}`}>
            <bdi dir="ltr">
              {live
                ? `${live.rows} × ${live.cols} = ${live.product}`
                : wrong
                  ? `${wrong.rows} × ${wrong.cols} = ${wrong.product}`
                  : ' '}
            </bdi>
            {wrong && !drag && <span className="constellation-need"> · {t.constellationNeed(target.target)}</span>}
          </div>
          <div className="constellation-help">
            {showHint ? t.constellationHint : t.constellationDrag}
            {showHint && (
              <button type="button" className="constellation-skip" onClick={skip}>
                {t.skip}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
