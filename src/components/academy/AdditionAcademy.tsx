import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import { useT } from '../../i18n/useLang';
import type { Strings } from '../../i18n/strings';
import { sfx } from '../../audio/sfx';
import GradientText from '../reactbits/GradientText';
import { useGameStore } from '../../game/useGameStore';
import { clampStage } from '../../game/addition';
import { useProfiles } from '../../profiles/useProfiles';
import { AcademyScreen, Alien, Bus, Choices, Rich, type CourseSpec, type CourseStep, type StepProps } from './parts';

// The Academy on the addition mission: three courses, one for each stage,
// picked from a menu (the pilot's own stage is marked "You are here").
//
//   1. Sums to 10: putting together and counting all → the + sign →
//      counting on from the bigger number → order doesn't matter → filling
//      a ten-frame and the pairs that make 10.
//   2. Over 10: teen numbers as "ten and some more" → make a ten first
//      (8 + 5 = 8 + 2 + 3), on two ten-frames → doubles and near doubles.
//   3. 20 and up: tens and ones as rods and dots → adding tens → tens with
//      tens, ones with ones → ten ones make a new ten (carrying).
//
// Each course ends with practice that fades the support, as the
// multiplication Academy does: a picture first, then symbols only, with
// "Show me" bringing the picture back. Everything can be read aloud.

type AA = Strings['addAcademy'];
const useAA = () => useT().addAcademy;

interface Props {
  onClose: () => void;
  onBurst: (x: number, y: number, color: string) => void;
}

// ---------- pictures ----------

/** ten-frames (two rows of five): gold stars first, then blue; tapping an empty spot calls onTapEmpty */
function TenFrames({ frames = 1, gold, blue, onTapEmpty, idPrefix }: { frames?: number; gold: number; blue: number; onTapEmpty?: () => void; idPrefix?: string }) {
  return (
    <div className="ac-frames" dir="ltr">
      {Array.from({ length: frames }, (_, f) => (
        <div key={f} className="ac-frame">
          {Array.from({ length: 10 }, (_, k) => {
            const i = f * 10 + k;
            const kind = i < gold ? 'gold' : i < gold + blue ? 'blue' : null;
            return (
              <button key={k} type="button" className="ac-frame-cell" disabled={kind !== null || !onTapEmpty} onClick={onTapEmpty} aria-label={kind ?? '+'}>
                {kind && (
                  <motion.span
                    // blue stars that arrive from the waiting row fly in (shared layout)
                    layoutId={kind === 'blue' && idPrefix ? `${idPrefix}${i - gold}` : undefined}
                    className={`ac-star is-${kind}`}
                    transition={{ type: 'spring', stiffness: 220, damping: 22 }}
                  />
                )}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/** blue stars waiting to be added (they fly into the frames: same layoutIds) */
function Waiting({ n, idPrefix }: { n: number; idPrefix: string }) {
  return (
    <div className="ac-waiting" dir="ltr">
      {Array.from({ length: n }, (_, k) => (
        <motion.span key={k} layoutId={`${idPrefix}${k}`} className="ac-star is-blue" transition={{ type: 'spring', stiffness: 220, damping: 22 }} />
      ))}
    </div>
  );
}

/** a number line from min to max with the rocket hopping from `from`, `shown` of the jumps made */
function HopLine({ min, max, from, jumps, shown }: { min: number; max: number; from: number; jumps: number[]; shown: number }) {
  const W = 560;
  const x = (n: number) => 20 + ((n - min) / (max - min)) * (W - 40);
  const stops = jumps.reduce((acc, j) => [...acc, acc[acc.length - 1] + j], [from]);
  const reached = stops.slice(0, shown + 1);
  return (
    <svg className="ac-numberline" viewBox={`0 0 ${W} 130`}>
      <line x1={x(min)} y1={100} x2={x(max)} y2={100} className="ac-nl-axis" />
      {Array.from({ length: max - min + 1 }, (_, k) => {
        const n = min + k;
        const hit = reached.includes(n);
        return (
          <g key={n}>
            <line x1={x(n)} y1={92} x2={x(n)} y2={108} className={`ac-nl-tick ${hit ? 'is-hit' : ''}`} />
            <text x={x(n)} y={126} className={`ac-nl-num ${hit ? 'is-hit' : ''}`}>
              {n}
            </text>
          </g>
        );
      })}
      {jumps.slice(0, shown).map((j, k) => (
        <g key={k}>
          <motion.path
            d={`M ${x(stops[k])} 96 Q ${(x(stops[k]) + x(stops[k + 1])) / 2} 30 ${x(stops[k + 1])} 96`}
            className="ac-nl-hop"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.45 }}
          />
          <text x={(x(stops[k]) + x(stops[k + 1])) / 2} y={48} className="ac-nl-label">
            +{j}
          </text>
        </g>
      ))}
      <motion.text className="ac-nl-rocket" animate={{ x: x(stops[Math.min(shown, jumps.length)]) - 14, y: 84 }} transition={{ type: 'spring', stiffness: 160, damping: 14 }} x={0} y={0}>
        🚀
      </motion.text>
    </svg>
  );
}

/** the hops played by themselves (for "Show me") */
function AutoHops(props: { min: number; max: number; from: number; jumps: number[] }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const ids = props.jumps.map((_, k) => window.setTimeout(() => setShown(k + 1), 500 + k * 650));
    return () => ids.forEach(window.clearTimeout);
  }, [props.jumps]);
  return <HopLine {...props} shown={shown} />;
}

/** ten stars in a row: a gold, the rest blue (a pair that makes 10) */
function TenStrip({ a }: { a: number }) {
  return (
    <div className="ac-strip" dir="ltr">
      {Array.from({ length: 10 }, (_, i) => (
        <span key={i} className={`ac-star is-${i < a ? 'gold' : 'blue'}`} />
      ))}
    </div>
  );
}

/** rows of stars, one row per number (doubles: two equal rows) */
function StarRows({ rows, extraFrom }: { rows: number[]; extraFrom?: number }) {
  return (
    <div className="ac-rows" dir="ltr">
      {rows.map((n, r) => (
        <div key={r} className="ac-row">
          {Array.from({ length: n }, (_, i) => (
            <motion.span
              key={i}
              className={`ac-star is-${r === 0 ? 'gold' : extraFrom !== undefined && i >= extraFrom ? 'new' : 'blue'}`}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: r * 0.4 + i * 0.06, type: 'spring', stiffness: 400, damping: 16 }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

interface Piece {
  id: string;
  color: 'gold' | 'blue' | 'new';
}
const pieces = (prefix: string, n: number, color: Piece['color']): Piece[] => Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}`, color }));

/** a number as tens (rods of ten) and ones (dots); pieces with the same id move between rows */
function PlaceRow({ rods, ones }: { rods: Piece[]; ones: Piece[] }) {
  return (
    <div className="ac-pv" dir="ltr">
      <div className="ac-pv-rods">
        {rods.map((p) => (
          <motion.span key={p.id} layoutId={p.id} className={`ac-rod is-${p.color}`} transition={{ type: 'spring', stiffness: 200, damping: 22 }} />
        ))}
      </div>
      <div className="ac-pv-ones">
        <AnimatePresence>
          {ones.map((p) => (
            <motion.span
              key={p.id}
              layoutId={p.id}
              className={`ac-one is-${p.color}`}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 200, damping: 22 }}
            />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

/** the big question, with the answer filled in once it's found */
function Big({ expr, answer, done }: { expr: string; answer: number; done: boolean }) {
  return (
    <div className="ac-big ac-big-small" dir="ltr">
      {expr} = {done ? <span className="ac-sum">{answer}</span> : '?'}
    </div>
  );
}

// ---------- course 1: sums to 10 ----------

function StepA1({ t, setReady }: StepProps) {
  const tt = useAA();
  const [order, setOrder] = useState<number[]>([]);
  const done = order.length === 5;
  useEffect(() => setReady(done), [done, setReady]);
  const tap = (id: number) => {
    if (order.includes(id)) return;
    setOrder((o) => [...o, id]);
    sfx.pick(1);
  };
  const countForMe = () => {
    const rest = [0, 1, 2, 3, 4].filter((i) => !order.includes(i));
    rest.forEach((id, k) => window.setTimeout(() => setOrder((o) => (o.includes(id) ? o : [...o, id])), k * 260));
  };
  return (
    <>
      <p className="ac-text">
        <Rich text={done ? tt.a1done : tt.a1} />
      </p>
      <div className="ac-stage ac-buses" dir="ltr">
        {[3, 2].map((n, g) => (
          <Bus key={g} highlight={done} label={done ? String(n) : undefined} delay={g * 0.35}>
            {Array.from({ length: n }, (_, k) => {
              const id = g * 3 + k;
              const at = order.indexOf(id);
              return <Alien key={id} n={at >= 0 ? at + 1 : undefined} lit={at >= 0} onTap={() => tap(id)} />;
            })}
          </Bus>
        ))}
      </div>
      {!done && (
        <button type="button" className="ac-secondary" onClick={countForMe}>
          {t.countForMe}
        </button>
      )}
    </>
  );
}

function StepA2({ setReady }: StepProps) {
  const tt = useAA();
  const [stage, setStage] = useState(0); // 0: 3 and 2, 1: the +, 2: = 5
  useEffect(() => {
    const a = window.setTimeout(() => setStage(1), 1200);
    const b = window.setTimeout(() => setStage(2), 2400);
    const c = window.setTimeout(() => setReady(true), 2600);
    return () => [a, b, c].forEach(window.clearTimeout);
  }, [setReady]);
  return (
    <>
      <p className="ac-text">
        <Rich text={tt.a2} />
      </p>
      <div className="ac-stage ac-symbol" dir="ltr">
        <div className="ac-big">
          <span className="ac-groups">3</span>
          <motion.span initial={{ opacity: 0, scale: 0.3 }} animate={stage >= 1 ? { opacity: 1, scale: 1 } : {}}>
            {' + '}
          </motion.span>
          <span className="ac-each">2</span>
          <motion.span initial={{ opacity: 0 }} animate={stage >= 2 ? { opacity: 1 } : {}}>
            {' = '}
            <span className="ac-sum">5</span>
          </motion.span>
        </div>
      </div>
      {stage === 2 && (
        <p className="ac-text ac-text-small">
          <Rich text={tt.a2b} />
        </p>
      )}
    </>
  );
}

function StepA3({ t, setReady }: StepProps) {
  const tt = useAA();
  const [hops, setHops] = useState(0);
  useEffect(() => setReady(hops >= 3), [hops, setReady]);
  return (
    <>
      <p className="ac-text">
        <Rich text={hops >= 3 ? tt.a3done : tt.a3} />
      </p>
      <div className="ac-stage" dir="ltr">
        <HopLine min={0} max={10} from={5} jumps={[1, 1, 1]} shown={hops} />
      </div>
      <div className="ac-expr" dir="ltr">
        {hops ? `5 → ${[6, 7, 8].slice(0, hops).join(', ')}` : ' '}
      </div>
      {hops < 3 && (
        <button
          type="button"
          className="ac-action"
          onClick={() => {
            setHops((h) => h + 1);
            sfx.pick(Math.min(3, hops + 1));
          }}
        >
          {t.hop}
        </button>
      )}
    </>
  );
}

/** a question with four choices and a "Show me" picture */
function Practice({ t, setReady, text, doneText, expr, answer, options, hint }: StepProps & { text: string; doneText: string; expr: string; answer: number; options: number[]; hint: React.ReactNode }) {
  const [shown, setShown] = useState(false);
  const [done, setDone] = useState(false);
  useEffect(() => setReady(done), [done, setReady]);
  return (
    <>
      <p className="ac-text">
        <Rich text={done ? doneText : text} />
      </p>
      <div className="ac-stage ac-symbol" dir="ltr">
        <Big expr={expr} answer={answer} done={done} />
        {(shown || done) && (
          <motion.div className="ac-hint" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            {hint}
          </motion.div>
        )}
      </div>
      {!done && (
        <>
          <Choices options={options} answer={answer} onCorrect={() => setDone(true)} t={t} />
          {!shown && (
            <button type="button" className="ac-secondary" onClick={() => setShown(true)}>
              {t.showMe}
            </button>
          )}
        </>
      )}
    </>
  );
}

function StepA4(p: StepProps) {
  const tt = useAA();
  return <Practice {...p} text={tt.a4} doneText={tt.a4done} expr="6 + 2" answer={8} options={[7, 8, 9, 62]} hint={<AutoHops min={0} max={10} from={6} jumps={[1, 1]} />} />;
}

function StepA5({ setReady }: StepProps) {
  const tt = useAA();
  const [swapped, setSwapped] = useState(false);
  useEffect(() => setReady(swapped), [swapped, setReady]);
  return (
    <>
      <p className="ac-text">
        <Rich text={swapped ? tt.a5b : tt.a5} />
      </p>
      <LayoutGroup>
        <div className="ac-stage ac-buses" dir="ltr">
          {(swapped ? [6, 2] : [2, 6]).map((n) => (
            <motion.div key={n} layout transition={{ type: 'spring', stiffness: 150, damping: 18 }}>
              <Bus label={String(n)} highlight={swapped && n === 6}>
                {Array.from({ length: n }, (_, k) => (
                  <Alien key={k} />
                ))}
              </Bus>
            </motion.div>
          ))}
        </div>
      </LayoutGroup>
      <div className="ac-expr" dir="ltr">
        {swapped ? '6 + 2 = 8' : '2 + 6'}
      </div>
      {!swapped && (
        <button
          type="button"
          className="ac-action"
          onClick={() => {
            setSwapped(true);
            sfx.pick(2);
          }}
        >
          {tt.swap}
        </button>
      )}
    </>
  );
}

function StepA6({ setReady }: StepProps) {
  const tt = useAA();
  const [blue, setBlue] = useState(0);
  const done = blue >= 3;
  useEffect(() => setReady(done), [done, setReady]);
  return (
    <>
      <p className="ac-text">
        <Rich text={done ? tt.a6done : tt.a6} />
      </p>
      <div className="ac-stage">
        <TenFrames
          gold={7}
          blue={blue}
          onTapEmpty={
            done
              ? undefined
              : () => {
                  setBlue((b) => Math.min(3, b + 1));
                  sfx.pick(Math.min(3, blue + 1));
                }
          }
        />
      </div>
      <div className="ac-expr" dir="ltr">
        {blue ? `7 + ${blue} = ${7 + blue}` : ' '}
      </div>
    </>
  );
}

function StepA7({ setReady }: StepProps) {
  const tt = useAA();
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const ids = [1, 2, 3, 4, 5].map((k) => window.setTimeout(() => setShown(k), k * 650));
    const r = window.setTimeout(() => setReady(true), 5 * 650 + 200);
    return () => [...ids, r].forEach(window.clearTimeout);
  }, [setReady]);
  return (
    <>
      <p className="ac-text">
        <Rich text={tt.a7} />
      </p>
      <div className="ac-pairs">
        {[1, 2, 3, 4, 5].slice(0, shown).map((a) => (
          <motion.div key={a} className="ac-pair" dir="ltr" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
            <TenStrip a={a} />
            <span className="ac-pair-math">
              {a} + {10 - a}
            </span>
          </motion.div>
        ))}
      </div>
    </>
  );
}

function StepA8({ t, setReady }: StepProps) {
  const tt = useAA();
  const [q, setQ] = useState(0);
  useEffect(() => setReady(q === 2), [q, setReady]);
  return (
    <>
      <p className="ac-text">
        <Rich text={q === 0 ? tt.a8q1 : q === 1 ? tt.a8q2 : tt.a8done} />
      </p>
      <div className="ac-stage">
        <TenFrames gold={4} blue={3} />
      </div>
      {q === 0 && <Choices key="a" options={['4 + 3', '4 + 4', '3 + 3', '7 + 3']} answer="4 + 3" onCorrect={() => setQ(1)} t={t} />}
      {q === 1 && <Choices key="b" options={[6, 7, 8, 43]} answer={7} onCorrect={() => setQ(2)} t={t} />}
    </>
  );
}

function StepA9(p: StepProps) {
  const tt = useAA();
  return <Practice {...p} text={tt.a9} doneText={tt.a9done} expr="5 + 4" answer={9} options={[9, 8, 54, 10]} hint={<AutoHops min={0} max={10} from={5} jumps={[1, 1, 1, 1]} />} />;
}

// ---------- course 2: over 10 ----------

function StepB1({ setReady }: StepProps) {
  const tt = useAA();
  const [n, setN] = useState(0);
  useEffect(() => {
    const ids = Array.from({ length: 13 }, (_, k) => window.setTimeout(() => setN(k + 1), 400 + k * 170 + (k >= 10 ? 500 : 0)));
    const r = window.setTimeout(() => setReady(true), 400 + 13 * 170 + 700);
    return () => [...ids, r].forEach(window.clearTimeout);
  }, [setReady]);
  return (
    <>
      <p className="ac-text">
        <Rich text={tt.b1} />
      </p>
      <div className="ac-stage">
        <TenFrames frames={2} gold={Math.min(10, n)} blue={Math.max(0, n - 10)} />
      </div>
      <div className="ac-expr" dir="ltr">
        {n >= 13 ? '10 + 3 = 13' : n > 10 ? `10 + ${n - 10}` : n || ' '}
      </div>
    </>
  );
}

function StepB2({ t, setReady }: StepProps) {
  const tt = useAA();
  const [done, setDone] = useState(false);
  useEffect(() => setReady(done), [done, setReady]);
  return (
    <>
      <p className="ac-text">
        <Rich text={done ? tt.b2done : tt.b2} />
      </p>
      <div className="ac-stage">
        <TenFrames frames={2} gold={10} blue={6} />
      </div>
      {!done && <Choices options={[16, 60, 106, 61]} answer={16} onCorrect={() => setDone(true)} t={t} />}
    </>
  );
}

/** a frame of gold stars, blue ones waiting below, flying in to fill the ten (and spill into the next frame) */
function MakeTen({ gold, more, filled, idPrefix }: { gold: number; more: number; filled: boolean; idPrefix: string }) {
  return (
    <LayoutGroup id={idPrefix}>
      <div className="ac-maketen">
        <TenFrames frames={2} gold={gold} blue={filled ? more : 0} idPrefix={idPrefix} />
        <Waiting n={filled ? 0 : more} idPrefix={idPrefix} />
      </div>
    </LayoutGroup>
  );
}

function StepB3({ setReady }: StepProps) {
  const tt = useAA();
  const [filled, setFilled] = useState(false);
  useEffect(() => setReady(filled), [filled, setReady]);
  return (
    <>
      <p className="ac-text">
        <Rich text={filled ? tt.b3b : tt.b3} />
      </p>
      <div className="ac-stage">
        <MakeTen gold={8} more={5} filled={filled} idPrefix="b3-" />
      </div>
      <div className="ac-expr" dir="ltr">
        {filled ? '8 + 2 + 3 = 10 + 3 = 13' : '8 + 5'}
      </div>
      {!filled && (
        <button
          type="button"
          className="ac-action"
          onClick={() => {
            setFilled(true);
            sfx.pick(3);
          }}
        >
          {tt.fillTen}
        </button>
      )}
    </>
  );
}

function StepB4({ t, setReady }: StepProps) {
  const tt = useAA();
  const [q, setQ] = useState(0);
  useEffect(() => setReady(q === 3), [q, setReady]);
  return (
    <>
      <p className="ac-text">
        <Rich text={[tt.b4q1, tt.b4q2, tt.b4q3, tt.b4done][q]} />
      </p>
      <div className="ac-stage">
        <MakeTen gold={9} more={4} filled={q >= 1} idPrefix="b4-" />
      </div>
      {q === 0 && <Choices key="a" options={[1, 2, 3, 4]} answer={1} onCorrect={() => setQ(1)} t={t} />}
      {q === 1 && <Choices key="b" options={[3, 4, 5, 13]} answer={3} onCorrect={() => setQ(2)} t={t} />}
      {q === 2 && <Choices key="c" options={[12, 13, 14, 94]} answer={13} onCorrect={() => setQ(3)} t={t} />}
    </>
  );
}

function StepB5({ setReady }: StepProps) {
  const tt = useAA();
  useEffect(() => {
    const r = window.setTimeout(() => setReady(true), 1400);
    return () => window.clearTimeout(r);
  }, [setReady]);
  return (
    <>
      <p className="ac-text">
        <Rich text={tt.b5} />
      </p>
      <div className="ac-stage">
        <StarRows rows={[6, 6]} />
      </div>
      <div className="ac-expr" dir="ltr">
        6 + 6 = 12
      </div>
    </>
  );
}

function StepB6({ t, setReady }: StepProps) {
  const tt = useAA();
  const [done, setDone] = useState(false);
  useEffect(() => setReady(done), [done, setReady]);
  return (
    <>
      <p className="ac-text">
        <Rich text={done ? tt.b6done : tt.b6} />
      </p>
      <div className="ac-stage">
        <StarRows rows={[6, 7]} extraFrom={6} />
      </div>
      <div className="ac-expr" dir="ltr">
        {done ? '6 + 7 = 6 + 6 + 1 = 13' : '6 + 7'}
      </div>
      {!done && <Choices options={[12, 13, 14, 67]} answer={13} onCorrect={() => setDone(true)} t={t} />}
    </>
  );
}

function StepB7({ t, setReady }: StepProps) {
  const tt = useAA();
  const [filled, setFilled] = useState(false);
  const [done, setDone] = useState(false);
  useEffect(() => setReady(done), [done, setReady]);
  return (
    <>
      <p className="ac-text">
        <Rich text={done ? tt.b7done : tt.b7} />
      </p>
      <div className="ac-stage">
        <MakeTen gold={7} more={5} filled={filled || done} idPrefix="b7-" />
      </div>
      {!done && (
        <>
          <Choices options={[12, 11, 13, 75]} answer={12} onCorrect={() => setDone(true)} t={t} />
          {!filled && (
            <button type="button" className="ac-secondary" onClick={() => setFilled(true)}>
              {t.showMe}
            </button>
          )}
        </>
      )}
    </>
  );
}

function StepB8(p: StepProps) {
  const tt = useAA();
  return (
    <Practice
      {...p}
      text={tt.b8}
      doneText={tt.b8done}
      expr="8 + 6"
      answer={14}
      options={[14, 13, 15, 86]}
      hint={
        <>
          <TenFrames frames={2} gold={8} blue={6} />
          <div className="ac-expr">8 + 2 + 4 = 10 + 4</div>
        </>
      }
    />
  );
}

// ---------- course 3: 20 and up ----------

function StepC1({ setReady }: StepProps) {
  const tt = useAA();
  useEffect(() => {
    const r = window.setTimeout(() => setReady(true), 1500);
    return () => window.clearTimeout(r);
  }, [setReady]);
  return (
    <>
      <p className="ac-text">
        <Rich text={tt.c1} />
      </p>
      <div className="ac-stage">
        <PlaceRow rods={pieces('c1r', 3, 'gold')} ones={pieces('c1o', 4, 'blue')} />
      </div>
      <div className="ac-expr" dir="ltr">
        30 + 4 = 34
      </div>
    </>
  );
}

function StepC2({ setReady }: StepProps) {
  const tt = useAA();
  const [tens, setTens] = useState(0);
  const [ones, setOnes] = useState(0);
  const done = tens === 2 && ones === 5;
  useEffect(() => setReady(done), [done, setReady]);
  const change = (fn: () => void) => {
    fn();
    sfx.pick(1);
  };
  return (
    <>
      <p className="ac-text">
        <Rich text={done ? tt.c2done : tt.c2} />
      </p>
      <div className="ac-stage">
        <PlaceRow rods={pieces('c2r', tens, 'gold')} ones={pieces('c2o', ones, 'blue')} />
      </div>
      <div className="ac-caption" dir="auto">
        {tt.c2now(tens, ones)}
      </div>
      {!done && (
        <div className="ac-build-buttons">
          <button type="button" className="ac-secondary" onClick={() => setTens((n) => Math.max(0, n - 1))}>
            {tt.removeTen}
          </button>
          <button type="button" className="ac-action" onClick={() => change(() => setTens((n) => Math.min(9, n + 1)))}>
            {tt.addTen}
          </button>
          <button type="button" className="ac-secondary" onClick={() => setOnes((n) => Math.max(0, n - 1))}>
            {tt.removeOne}
          </button>
          <button type="button" className="ac-action" onClick={() => change(() => setOnes((n) => Math.min(9, n + 1)))}>
            {tt.addOne}
          </button>
        </div>
      )}
    </>
  );
}

function StepC3({ t, setReady }: StepProps) {
  const tt = useAA();
  const [counted, setCounted] = useState(0);
  const [done, setDone] = useState(false);
  useEffect(() => {
    const ids = [1, 2, 3, 4, 5].map((k) => window.setTimeout(() => setCounted(k), 600 + k * 500));
    return () => ids.forEach(window.clearTimeout);
  }, []);
  useEffect(() => setReady(done), [done, setReady]);
  return (
    <>
      <p className="ac-text">
        <Rich text={done ? tt.c3done : counted >= 5 ? tt.c3q : tt.c3} />
      </p>
      <div className="ac-stage ac-symbol">
        <PlaceRow rods={[...pieces('c3a', 3, 'gold'), ...pieces('c3b', 2, 'blue')]} ones={[]} />
        <div className="ac-pv-counts" dir="ltr">
          {[10, 20, 30, 40, 50].map((n, i) => (
            <span key={n} className={i < counted ? 'is-on' : ''}>
              {i < counted ? n : ''}
            </span>
          ))}
        </div>
      </div>
      {counted >= 5 && !done && <Choices options={[70, 7, 43, 80]} answer={70} onCorrect={() => setDone(true)} t={t} />}
    </>
  );
}

function StepC4({ setReady }: StepProps) {
  const tt = useAA();
  const [joined, setJoined] = useState(false);
  useEffect(() => setReady(joined), [joined, setReady]);
  const a = { rods: pieces('c4ra', 3, 'gold'), ones: pieces('c4oa', 4, 'gold') };
  const b = { rods: pieces('c4rb', 2, 'blue'), ones: pieces('c4ob', 5, 'blue') };
  return (
    <>
      <p className="ac-text">
        <Rich text={joined ? tt.c4b : tt.c4} />
      </p>
      <LayoutGroup id="c4">
        <div className="ac-stage ac-symbol">
          {joined ? (
            <PlaceRow rods={[...a.rods, ...b.rods]} ones={[...a.ones, ...b.ones]} />
          ) : (
            <>
              <PlaceRow {...a} />
              <PlaceRow {...b} />
            </>
          )}
        </div>
      </LayoutGroup>
      <div className="ac-expr" dir="ltr">
        {joined ? '50 + 9 = 59' : '34 + 25'}
      </div>
      {!joined && (
        <button
          type="button"
          className="ac-action"
          onClick={() => {
            setJoined(true);
            sfx.pick(3);
          }}
        >
          {tt.putTogether}
        </button>
      )}
    </>
  );
}

function StepC5({ t, setReady }: StepProps) {
  const tt = useAA();
  const [q, setQ] = useState(0);
  useEffect(() => setReady(q === 3), [q, setReady]);
  return (
    <>
      <p className="ac-text">
        <Rich text={[tt.c5q1, tt.c5q2, tt.c5q3, tt.c5done][q]} />
      </p>
      <div className="ac-stage">
        <PlaceRow
          rods={[...pieces('c5ra', 4, 'gold'), ...pieces('c5rb', 3, 'blue')]}
          ones={[...pieces('c5oa', 2, 'gold'), ...pieces('c5ob', 5, 'blue')]}
        />
      </div>
      {q === 0 && <Choices key="a" options={[70, 7, 77, 60]} answer={70} onCorrect={() => setQ(1)} t={t} />}
      {q === 1 && <Choices key="b" options={[7, 6, 8, 25]} answer={7} onCorrect={() => setQ(2)} t={t} />}
      {q === 2 && <Choices key="c" options={[77, 75, 67, 87]} answer={77} onCorrect={() => setQ(3)} t={t} />}
    </>
  );
}

function StepC6({ setReady }: StepProps) {
  const tt = useAA();
  const [bundled, setBundled] = useState(false);
  useEffect(() => setReady(bundled), [bundled, setReady]);
  const ones = [...pieces('c6oa', 7, 'gold'), ...pieces('c6ob', 5, 'blue')];
  const rods = [...pieces('c6ra', 3, 'gold'), ...pieces('c6rb', 2, 'blue'), ...(bundled ? pieces('c6new', 1, 'new') : [])];
  return (
    <>
      <p className="ac-text">
        <Rich text={bundled ? tt.c6done : tt.c6} />
      </p>
      {!bundled && (
        <p className="ac-text ac-text-small">
          <Rich text={tt.c6b} />
        </p>
      )}
      <div className="ac-stage">
        <PlaceRow rods={rods} ones={bundled ? ones.slice(10) : ones} />
      </div>
      <div className="ac-expr" dir="ltr">
        {bundled ? '50 + 12 = 60 + 2 = 62' : '37 + 25 = 50 + 12'}
      </div>
      {!bundled && (
        <button
          type="button"
          className="ac-action"
          onClick={() => {
            setBundled(true);
            sfx.pick(3);
          }}
        >
          {tt.bundle}
        </button>
      )}
    </>
  );
}

function StepC7(p: StepProps) {
  const tt = useAA();
  return (
    <Practice
      {...p}
      text={tt.c7}
      doneText={tt.c7done}
      expr="26 + 18"
      answer={44}
      options={[44, 34, 314, 43]}
      hint={
        <>
          <PlaceRow rods={[...pieces('c7ra', 2, 'gold'), ...pieces('c7rb', 1, 'blue')]} ones={[...pieces('c7oa', 6, 'gold'), ...pieces('c7ob', 8, 'blue')]} />
          <div className="ac-expr">30 + 14</div>
        </>
      }
    />
  );
}

function StepC8(p: StepProps) {
  const tt = useAA();
  return <Practice {...p} text={tt.c8} doneText={tt.c8done} expr="48 + 7" answer={55} options={[55, 45, 54, 415]} hint={<AutoHops min={45} max={56} from={48} jumps={[2, 5]} />} />;
}

// ---------- the end of a course ----------

function doneStep(course: number) {
  return function StepDone({ setReady }: StepProps) {
    const tt = useAA();
    useEffect(() => setReady(true), [setReady]);
    return (
      <div className="ac-done">
        <motion.div className="ac-badge" initial={{ scale: 0, rotate: -180 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 180, damping: 12 }}>
          🎓
        </motion.div>
        <GradientText className="ac-done-title" colors={['#ffd77a', '#ff9d76', '#c9a4de', '#6ad7ff', '#ffd77a']} animationSpeed={3}>
          {tt.doneTitles[course]}
        </GradientText>
        <p className="ac-text">
          <Rich text={tt.doneTexts[course]} />
        </p>
      </div>
    );
  };
}

const step = (lesson: number, id: string): CourseStep => ({ lesson, id });

const COURSES: Array<{ steps: CourseStep[]; components: CourseSpec['components'] }> = [
  {
    steps: [step(0, 'a1'), step(0, 'a2'), step(1, 'a3'), step(1, 'a4'), step(2, 'a5'), step(3, 'a6'), step(3, 'a7'), step(4, 'a8'), step(4, 'a9'), step(5, 'done')],
    components: { a1: StepA1, a2: StepA2, a3: StepA3, a4: StepA4, a5: StepA5, a6: StepA6, a7: StepA7, a8: StepA8, a9: StepA9, done: doneStep(0) },
  },
  {
    steps: [step(0, 'b1'), step(0, 'b2'), step(1, 'b3'), step(1, 'b4'), step(2, 'b5'), step(2, 'b6'), step(3, 'b7'), step(3, 'b8'), step(4, 'done')],
    components: { b1: StepB1, b2: StepB2, b3: StepB3, b4: StepB4, b5: StepB5, b6: StepB6, b7: StepB7, b8: StepB8, done: doneStep(1) },
  },
  {
    steps: [step(0, 'c1'), step(0, 'c2'), step(1, 'c3'), step(2, 'c4'), step(2, 'c5'), step(3, 'c6'), step(4, 'c7'), step(4, 'c8'), step(5, 'done')],
    components: { c1: StepC1, c2: StepC2, c3: StepC3, c4: StepC4, c5: StepC5, c6: StepC6, c7: StepC7, c8: StepC8, done: doneStep(2) },
  },
];

/** the text a step is about, for "read to me" */
function stepText(id: string, tt: AA, course: number): string {
  const texts: Record<string, string> = {
    a2: `${tt.a2} ${tt.a2b}`,
    a5: `${tt.a5} ${tt.a5b}`,
    a8: tt.a8q1,
    b3: `${tt.b3} ${tt.b3b}`,
    b4: tt.b4q1,
    c3: `${tt.c3} ${tt.c3q}`,
    c4: `${tt.c4} ${tt.c4b}`,
    c5: tt.c5q1,
    c6: `${tt.c6} ${tt.c6b}`,
    done: `${tt.doneTitles[course]} ${tt.doneTexts[course]}`,
  };
  return texts[id] ?? ((tt as unknown as Record<string, unknown>)[id] as string | undefined) ?? '';
}

// ---------- the menu and the screen ----------

const COURSE_ICONS = ['🔢', '🔟', '💯'];

function CourseMenu({ stage, done, onPick }: { stage: number; done: string[]; onPick: (i: number) => void }) {
  const tt = useAA();
  return (
    <div className="academy-step">
      <p className="ac-text">{tt.pick}</p>
      <div className="ac-courses">
        {tt.courses.map((c, i) => (
          <motion.button
            key={i}
            type="button"
            className={`ac-course ${stage === i + 1 ? 'is-here' : ''}`}
            onClick={() => onPick(i)}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
          >
            <span className="ac-course-icon">{COURSE_ICONS[i]}</span>
            <span className="ac-course-name">{c.name}</span>
            <span className="ac-course-hint">{c.hint}</span>
            {stage === i + 1 && <span className="ac-course-tag">📍 {tt.youAreHere}</span>}
            {done.includes(`add${i + 1}`) && <span className="ac-course-done">{tt.finished}</span>}
          </motion.button>
        ))}
      </div>
    </div>
  );
}

export function AdditionAcademy({ onClose, onBurst }: Props) {
  const tt = useAA();
  const [course, setCourse] = useState<number | null>(null);
  const stage = clampStage(useGameStore((s) => s.progress.stage));
  const activeId = useProfiles((s) => s.activeId);
  const finished = useProfiles((s) => s.profiles.find((p) => p.id === s.activeId)?.academyDone) ?? [];

  const specs: CourseSpec[] = useMemo(
    () =>
      COURSES.map((c, i) => ({
        id: `add${i + 1}`,
        subtitle: tt.courses[i].name,
        lessons: tt.lessons[i],
        steps: c.steps,
        components: c.components,
        stepText: (id: string) => stepText(id, tt, i),
        onFinish: () => {
          if (!activeId) return;
          const { profiles, update } = useProfiles.getState();
          const before = profiles.find((p) => p.id === activeId)?.academyDone ?? [];
          if (!before.includes(`add${i + 1}`)) update(activeId, { academyDone: [...before, `add${i + 1}`] });
        },
      })),
    [tt, activeId],
  );

  return (
    <AcademyScreen
      course={course === null ? null : specs[course]}
      menu={<CourseMenu stage={stage} done={finished} onPick={setCourse} />}
      menuSubtitle={tt.subtitle}
      onBackFromStart={() => setCourse(null)}
      onClose={onClose}
      onBurst={onBurst}
    />
  );
}
