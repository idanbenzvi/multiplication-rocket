import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { gameTimeout } from '../game/gameClock';
import { useGameStore } from '../game/useGameStore';
import { getLevelConfig } from '../game/levels';
import { buildSumTargets, starChartFor, type StarChart } from '../game/bonusRounds';
import { kick } from '../game/flight';
import { sfx } from '../audio/sfx';
import { haptics } from '../audio/haptics';
import { useT } from '../i18n/useLang';
import GradientText from './reactbits/GradientText';

interface Props {
  onDone: (result: { fuelGain: number; answers: Array<{ factKey: string; correct: boolean }> }) => void;
  onBurst: (x: number, y: number, color: string) => void;
}

type Phase = 'intro' | 'building' | 'solved' | 'summary';

const INTRO_MS = 1800;
const SOLVED_MS = 1700;
const SUMMARY_MS = 2000;
const MISSES_BEFORE_HINT = 2;
const FUEL_PER_TARGET = 1.5; // × the fuel of one normal correct answer

/** stars on each chart, and its size in cells (gaps included) */
const CHART: Record<StarChart, { stars: number; cols: number; rows: number }> = {
  frame: { stars: 10, cols: 5, rows: 2 },
  frames: { stars: 20, cols: 10.6, rows: 2 },
  hundred: { stars: 100, cols: 10.3, rows: 10 },
};

/** where the i-th star sits, in cells: ten-frames fill a row of five, then the next */
function starAt(chart: StarChart, i: number): { x: number; y: number } {
  if (chart === 'hundred') {
    const c = i % 10;
    return { x: c + (c >= 5 ? 0.3 : 0) + 0.5, y: Math.floor(i / 10) + 0.5 };
  }
  const frame = Math.floor(i / 10);
  const k = i % 10;
  return { x: frame * 5.6 + (k % 5) + 0.5, y: Math.floor(k / 5) + 0.5 };
}

// The addition Constellation: a star chart (a ten-frame within 10, two
// side by side within 20, a hundred chart beyond) with the first number
// already lit in gold. The child drags along the stars, or taps one, to
// where the sum lands: counting on, and seeing the ten fill up on the way
// (8 + 5: two more fill the frame, three spill into the next). On the
// hundred chart a jump of ten is one row down.
export function SumConstellation({ onDone, onBurst }: Props) {
  const t = useT();
  const targets = useMemo(() => buildSumTargets(useGameStore.getState().progress), []);
  const chart = useMemo(() => starChartFor(Math.max(...targets.map((x) => x.a + x.b))), [targets]);
  const fuelPerTarget = useMemo(
    () => (100 / getLevelConfig(useGameStore.getState().progress.level).streakToLaunch) * FUEL_PER_TARGET,
    [],
  );

  const [phase, setPhase] = useState<Phase>('intro');
  const [index, setIndex] = useState(0);
  // the last star reached (count of stars lit, gold ones included); null when not dragging
  const [end, setEndState] = useState<number | null>(null);
  const endRef = useRef<number | null>(null);
  const setEnd = (n: number | null) => {
    endRef.current = n;
    setEndState(n);
  };
  const [misses, setMisses] = useState(0);
  const [wrong, setWrong] = useState<number | null>(null);
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
  const spec = CHART[chart];
  // stars big enough to hit with a finger, the whole chart on screen
  const cell = Math.max(26, Math.min(64, (size.w - 32) / spec.cols, (size.h * 0.48) / spec.rows));
  const dot = chart === 'hundred' ? 9 : Math.round(cell * 0.32);

  // the star nearest the pointer (a drag past the last one keeps it)
  const starUnder = (clientX: number, clientY: number): number | null => {
    const g = gridRef.current?.getBoundingClientRect();
    if (!g) return null;
    const x = (clientX - g.left) / cell;
    const y = (clientY - g.top) / cell;
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < spec.stars; i++) {
      const p = starAt(chart, i);
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return bestD < 1.2 ? best : null;
  };

  const reach = (clientX: number, clientY: number) => {
    const i = starUnder(clientX, clientY);
    if (i === null || !target) return;
    const n = Math.max(target.a, i + 1);
    if (n !== endRef.current) {
      if (endRef.current !== null && n > target.a) sfx.pick(1);
      setEnd(n);
    }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (phase !== 'building') return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // the pointer went away (an interrupted touch): dragging still works inside the chart
    }
    setWrong(null);
    endRef.current = null;
    reach(e.clientX, e.clientY);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (endRef.current === null || phase !== 'building') return;
    reach(e.clientX, e.clientY);
  };

  const onPointerUp = () => {
    const finished = endRef.current;
    if (finished === null || !target) return;
    if (finished <= target.a) {
      setEnd(null); // still on the gold stars: nothing counted on yet
      return;
    }
    if (finished === target.a + target.b) {
      setPhase('solved');
      const solvedNow = solvedCount + 1;
      setSolvedCount(solvedNow);
      answers.current.push({ factKey: target.factKey, correct: true });
      sfx.constellation();
      haptics.correct(3);
      kick(0.3);
      const g = gridRef.current?.getBoundingClientRect();
      if (g) {
        const p = starAt(chart, finished - 1);
        onBurst(g.left + p.x * cell, g.top + p.y * cell, '#ffd77a');
        later(() => onBurst(g.left + p.x * cell, g.top + p.y * cell, '#6ad7ff'), 100);
      }
      later(() => {
        setEnd(null);
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
      setEnd(null);
      setWrong(finished);
      setMisses((m) => m + 1);
      sfx.wrong();
      haptics.thump();
    }
  };

  const skip = () => {
    setMisses(0);
    setWrong(null);
    setEnd(null);
    if (index + 1 < targets.length) setIndex(index + 1);
    else {
      setPhase('summary');
      later(() => onDone({ fuelGain: solvedCount * fuelPerTarget, answers: answers.current }), SUMMARY_MS);
    }
  };

  const shown = end ?? wrong;
  const showHint = misses >= MISSES_BEFORE_HINT && phase === 'building' && target;
  const solved = phase === 'solved';
  const sum = target ? target.a + target.b : 0;
  const frames = chart === 'hundred' ? 0 : chart === 'frames' ? 2 : 1;

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
          <div className="round-card-text">{t.constellationIntroAdd}</div>
        </div>
      )}

      {phase === 'summary' && (
        <div className="round-card">
          <GradientText className="round-card-title" colors={['#7ee08f', '#6ad7ff', '#ffd77a', '#7ee08f']} animationSpeed={2}>
            {t.constellationSummary(solvedCount, targets.length)}
          </GradientText>
        </div>
      )}

      {(phase === 'building' || solved) && target && (
        <div className="constellation-play">
          <div className="constellation-target">
            {t.constellationCountOn}{' '}
            <GradientText className="constellation-number" colors={['#ffd77a', '#ff9d76', '#ffd77a']} animationSpeed={3}>
              <bdi dir="ltr">
                {target.a} + {target.b}
              </bdi>
            </GradientText>
          </div>

          <div
            ref={gridRef}
            className={`star-grid star-chart is-${chart} ${solved ? 'is-solved' : ''}`}
            dir="ltr"
            style={{ width: cell * spec.cols, height: cell * spec.rows }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={() => setEnd(null)}
          >
            {Array.from({ length: frames }, (_, f) => (
              <div key={f} className="chart-frame" style={{ left: f * 5.6 * cell + 3, top: 3, width: 5 * cell - 6, height: 2 * cell - 6 }} />
            ))}
            {/* solved: a line joining the stars counted on, in order */}
            {solved && (
              <svg className="star-lines" width={cell * spec.cols} height={cell * spec.rows}>
                <polyline
                  className="star-snake"
                  pathLength={1}
                  points={Array.from({ length: target.b + 1 }, (_, k) => {
                    const p = starAt(chart, target.a - 1 + k);
                    return `${p.x * cell},${p.y * cell}`;
                  }).join(' ')}
                />
              </svg>
            )}
            {Array.from({ length: spec.stars }, (_, i) => {
              const p = starAt(chart, i);
              const given = i < target.a;
              const on = !given && shown !== null && i < shown;
              const state = solved && i < sum ? 'is-lit' : given ? 'is-given' : on ? 'is-on' : '';
              return (
                <Fragment key={i}>
                  {chart === 'hundred' && (
                    <span className="chart-num" style={{ left: p.x * cell, top: p.y * cell + cell * 0.32 }}>
                      {i + 1}
                    </span>
                  )}
                  <span
                    className={`star ${state} ${showHint && i === sum - 1 ? 'is-hint' : ''}`}
                    style={{ left: p.x * cell, top: p.y * cell, width: dot, height: dot, animationDelay: `${(i % 7) * 0.4}s` }}
                  />
                </Fragment>
              );
            })}
          </div>

          <div className={`constellation-readout ${shown === sum || solved ? 'is-match' : ''} ${wrong !== null && end === null ? 'is-wrong' : ''}`}>
            <bdi dir="ltr">{shown !== null && shown > target.a ? `${target.a} + ${shown - target.a} = ${shown}` : ' '}</bdi>
            {wrong !== null && end === null && <span className="constellation-need"> · {t.constellationNeed(sum)}</span>}
          </div>
          <div className="constellation-help">
            {showHint ? t.constellationHintAdd : t.constellationDragAdd}
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
