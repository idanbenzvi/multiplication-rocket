import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { useT } from '../../i18n/useLang';
import type { Strings } from '../../i18n/strings';
import { sfx } from '../../audio/sfx';
import GradientText from '../reactbits/GradientText';
import { useGameStore } from '../../game/useGameStore';
import { clampStage } from '../../game/addition';
import { useProfiles } from '../../profiles/useProfiles';
import { AcademyScreen, Choices, Rich, type CourseSpec, type CourseStep, type StepProps } from './parts';

// The Academy on the subtraction mission: three courses, one for each stage,
// picked from a menu (the pilot's own stage is marked "You are here"), as the
// addition one is (AdditionAcademy.tsx).
//
//   1. Take away within 10: taking away and counting what's left → the −
//      sign → counting back from the bigger number → thinking of the sum
//      (what goes with 5 to make 9?) → fact families (3 + 4, 4 + 3, 7 − 4,
//      7 − 3).
//   2. Back from 20: teen numbers as a ten and some more → back to ten
//      first (13 − 5 = 13 − 3 − 2) → the sum it's the other side of, and
//      doubles.
//   3. Within 100: tens and ones as rods and dots → taking tens → the
//      tens, then the ones → breaking a ten into ten ones (borrowing).
//
// Each course ends with practice that fades the support: a picture first,
// then symbols only, with "Show me" bringing the picture back. Everything
// can be read aloud.

type SA = Strings['subAcademy'];
const useSA = () => useT().subAcademy;

interface Props {
  onClose: () => void;
  onBurst: (x: number, y: number, color: string) => void;
}

// ---------- pictures ----------

/** ten-frames of `n` gold stars, the last `gone` taken away (faded, crossed out); tapping a star still there calls onTap */
function TakeFrames({ n, gone, onTap }: { n: number; gone: number; onTap?: () => void }) {
  const frames = Math.max(1, Math.ceil(n / 10));
  return (
    <div className="ac-frames" dir="ltr">
      {Array.from({ length: frames }, (_, f) => (
        <div key={f} className="ac-frame">
          {Array.from({ length: 10 }, (_, k) => {
            const i = f * 10 + k;
            const here = i < n;
            const out = here && i >= n - gone;
            return (
              <button key={k} type="button" className="ac-frame-cell" disabled={!here || out || !onTap} onClick={onTap} aria-label={here ? (out ? '−' : '★') : ''}>
                {here && (
                  <motion.span
                    className={`ac-star is-gold ${out ? 'is-gone' : ''}`}
                    animate={out ? { opacity: 0.25, scale: 0.75, y: -6 } : { opacity: 1, scale: 1, y: 0 }}
                    transition={{ duration: 0.35 }}
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

/** the take-away played by itself (for "Show me"): the stars go one at a time */
function AutoTake({ n, take }: { n: number; take: number }) {
  const [gone, setGone] = useState(0);
  useEffect(() => {
    const ids = Array.from({ length: take }, (_, k) => window.setTimeout(() => setGone(k + 1), 500 + k * 380));
    return () => ids.forEach(window.clearTimeout);
  }, [take]);
  return <TakeFrames n={n} gone={gone} />;
}

/** a number line from min to max with the rocket hopping from `from` (back, for a negative jump), `shown` of the jumps made */
function HopLine({ min, max, from, jumps, shown }: { min: number; max: number; from: number; jumps: number[]; shown: number }) {
  const W = 560;
  const x = (n: number) => 20 + ((n - min) / (max - min)) * (W - 40);
  const stops = jumps.reduce((acc, j) => [...acc, acc[acc.length - 1] + j], [from]);
  const reached = stops.slice(0, shown + 1);
  // name every number on a short line, every fifth on a long one
  const every = max - min > 20 ? 5 : 1;
  return (
    <svg className="ac-numberline" viewBox={`0 0 ${W} 130`}>
      <line x1={x(min)} y1={100} x2={x(max)} y2={100} className="ac-nl-axis" />
      {Array.from({ length: max - min + 1 }, (_, k) => {
        const n = min + k;
        const hit = reached.includes(n);
        return (
          <g key={n}>
            <line x1={x(n)} y1={92} x2={x(n)} y2={108} className={`ac-nl-tick ${hit ? 'is-hit' : ''}`} />
            {(hit || n % every === 0) && (
              <text x={x(n)} y={126} className={`ac-nl-num ${hit ? 'is-hit' : ''}`}>
                {n}
              </text>
            )}
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
            {j < 0 ? `−${-j}` : `+${j}`}
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

/** a number as tens (rods) and ones (dots): `brokenOnes` of the ones are a broken ten's (blue), the last `goneRods` rods and `goneOnes` ones taken away */
function Place({ rods, ones, brokenOnes = 0, goneRods = 0, goneOnes = 0 }: { rods: number; ones: number; brokenOnes?: number; goneRods?: number; goneOnes?: number }) {
  const gone = { opacity: 0.22, scale: 0.8 };
  const here = { opacity: 1, scale: 1 };
  const all = ones + brokenOnes;
  return (
    <div className="ac-pv" dir="ltr">
      <div className="ac-pv-rods">
        {Array.from({ length: rods }, (_, k) => (
          <motion.span key={`r${k}`} className="ac-rod" animate={k >= rods - goneRods ? gone : here} transition={{ duration: 0.35 }} />
        ))}
      </div>
      <div className="ac-pv-ones">
        {Array.from({ length: all }, (_, k) => (
          <motion.span
            key={`o${k}`}
            className={`ac-one ${k >= ones ? 'is-blue' : ''}`}
            initial={k >= ones ? { opacity: 0, scale: 0 } : false}
            animate={k >= all - goneOnes ? gone : here}
            transition={{ duration: 0.35, delay: k >= ones && goneOnes === 0 ? (k - ones) * 0.05 : 0 }}
          />
        ))}
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

/** questions one after another, each with its own text, the last one's done text after */
function Steps({ t, setReady, texts, doneText, picture, qs }: StepProps & { texts: string[]; doneText: string; picture?: React.ReactNode; qs: Array<{ options: Array<string | number>; answer: string | number }> }) {
  const [q, setQ] = useState(0);
  useEffect(() => setReady(q === qs.length), [q, qs.length, setReady]);
  return (
    <>
      <p className="ac-text">
        <Rich text={q < qs.length ? texts[q] : doneText} />
      </p>
      {picture && <div className="ac-stage">{picture}</div>}
      {q < qs.length && <Choices key={q} options={qs[q].options} answer={qs[q].answer} onCorrect={() => setQ(q + 1)} t={t} />}
    </>
  );
}

// ---------- course 1: take away within 10 ----------

function StepS1({ t, setReady }: StepProps) {
  const ts = useSA();
  const [gone, setGone] = useState(0);
  const flown = gone >= 3;
  const [counted, setCounted] = useState(false);
  useEffect(() => setReady(counted), [counted, setReady]);
  return (
    <>
      <p className="ac-text">
        <Rich text={counted ? ts.s1done : flown ? ts.s1q : ts.s1} />
      </p>
      <div className="ac-stage">
        <TakeFrames
          n={7}
          gone={gone}
          onTap={
            flown
              ? undefined
              : () => {
                  setGone((g) => Math.min(3, g + 1));
                  sfx.pick(Math.min(3, gone + 1));
                }
          }
        />
      </div>
      <div className="ac-expr" dir="ltr">
        {gone ? `7 → ${[6, 5, 4].slice(0, gone).join(', ')}` : ' '}
      </div>
      {flown && !counted && <Choices options={[4, 3, 5, 10]} answer={4} onCorrect={() => setCounted(true)} t={t} />}
    </>
  );
}

function StepS2({ setReady }: StepProps) {
  const ts = useSA();
  const [stage, setStage] = useState(0); // 0: 7 and 3, 1: the −, 2: = 4
  useEffect(() => {
    const a = window.setTimeout(() => setStage(1), 1200);
    const b = window.setTimeout(() => setStage(2), 2400);
    const c = window.setTimeout(() => setReady(true), 2600);
    return () => [a, b, c].forEach(window.clearTimeout);
  }, [setReady]);
  return (
    <>
      <p className="ac-text">
        <Rich text={ts.s2} />
      </p>
      <div className="ac-stage ac-symbol" dir="ltr">
        <div className="ac-big">
          <span className="ac-groups">7</span>
          <motion.span initial={{ opacity: 0, scale: 0.3 }} animate={stage >= 1 ? { opacity: 1, scale: 1 } : {}}>
            {' − '}
          </motion.span>
          <span className="ac-each">3</span>
          <motion.span initial={{ opacity: 0 }} animate={stage >= 2 ? { opacity: 1 } : {}}>
            {' = '}
            <span className="ac-sum">4</span>
          </motion.span>
        </div>
      </div>
      {stage === 2 && (
        <p className="ac-text ac-text-small">
          <Rich text={ts.s2b} />
        </p>
      )}
    </>
  );
}

function StepS3({ t, setReady }: StepProps) {
  const ts = useSA();
  const [hops, setHops] = useState(0);
  useEffect(() => setReady(hops >= 3), [hops, setReady]);
  return (
    <>
      <p className="ac-text">
        <Rich text={hops >= 3 ? ts.s3done : ts.s3} />
      </p>
      <div className="ac-stage" dir="ltr">
        <HopLine min={0} max={10} from={8} jumps={[-1, -1, -1]} shown={hops} />
      </div>
      <div className="ac-expr" dir="ltr">
        {hops ? `8 → ${[7, 6, 5].slice(0, hops).join(', ')}` : ' '}
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

function StepS4(p: StepProps) {
  const ts = useSA();
  return <Practice {...p} text={ts.s4} doneText={ts.s4done} expr="9 − 2" answer={7} options={[7, 6, 8, 11]} hint={<AutoHops min={0} max={10} from={9} jumps={[-1, -1]} />} />;
}

function StepS5({ setReady }: StepProps) {
  const ts = useSA();
  const [more, setMore] = useState(0);
  const done = more >= 4;
  useEffect(() => setReady(done), [done, setReady]);
  return (
    <>
      <p className="ac-text">
        <Rich text={done ? ts.s5done : ts.s5} />
      </p>
      <div className="ac-stage">
        <div className="ac-frames" dir="ltr">
          <div className="ac-frame">
            {Array.from({ length: 10 }, (_, i) => {
              const kind = i < 5 ? 'gold' : i < 5 + more ? 'blue' : null;
              return (
                <button
                  key={i}
                  type="button"
                  className={`ac-frame-cell ${i === 9 ? 'is-off' : ''}`}
                  disabled={kind !== null || done || i === 9}
                  onClick={() => {
                    setMore((m) => Math.min(4, m + 1));
                    sfx.pick(Math.min(3, more + 1));
                  }}
                  aria-label={kind ?? '+'}
                >
                  {kind && <motion.span className={`ac-star is-${kind}`} initial={{ scale: 0 }} animate={{ scale: 1 }} />}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <div className="ac-expr" dir="ltr">
        {more ? `5 + ${more} = ${5 + more}` : '5 + ? = 9'}
      </div>
    </>
  );
}

function StepS6({ setReady }: StepProps) {
  const ts = useSA();
  const facts = ['3 + 4 = 7', '4 + 3 = 7', '7 − 4 = 3', '7 − 3 = 4'];
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const ids = facts.map((_, k) => window.setTimeout(() => setShown(k + 1), 400 + k * 700));
    const r = window.setTimeout(() => setReady(true), 400 + facts.length * 700);
    return () => [...ids, r].forEach(window.clearTimeout);
    // (four facts, once)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setReady]);
  return (
    <>
      <p className="ac-text">
        <Rich text={ts.s6} />
      </p>
      <div className="ac-pairs ac-family">
        {facts.slice(0, shown).map((f, k) => (
          <motion.div key={f} className={`ac-pair-math ${k >= 2 ? 'is-take' : ''}`} dir="ltr" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
            {f}
          </motion.div>
        ))}
      </div>
    </>
  );
}

function StepS7(p: StepProps) {
  const ts = useSA();
  return (
    <Steps
      {...p}
      texts={[ts.s7q1, ts.s7q2]}
      doneText={ts.s7done}
      picture={<TakeFrames n={8} gone={3} />}
      qs={[
        { options: ['8 − 3', '8 − 5', '5 − 3', '8 + 3'], answer: '8 − 3' },
        { options: [5, 4, 6, 11], answer: 5 },
      ]}
    />
  );
}

function StepS8(p: StepProps) {
  const ts = useSA();
  return <Practice {...p} text={ts.s8} doneText={ts.s8done} expr="10 − 4" answer={6} options={[6, 7, 5, 14]} hint={<AutoTake n={10} take={4} />} />;
}

// ---------- course 2: back from 20 ----------

function StepT1({ setReady }: StepProps) {
  const ts = useSA();
  const [gone, setGone] = useState(0);
  useEffect(() => {
    const ids = [1, 2, 3, 4].map((k) => window.setTimeout(() => setGone(k), 900 + k * 450));
    const r = window.setTimeout(() => setReady(true), 900 + 5 * 450);
    return () => [...ids, r].forEach(window.clearTimeout);
  }, [setReady]);
  return (
    <>
      <p className="ac-text">
        <Rich text={ts.t1} />
      </p>
      <div className="ac-stage">
        <TakeFrames n={14} gone={gone} />
      </div>
      <div className="ac-expr" dir="ltr">
        {gone === 4 ? '14 − 4 = 10' : '14 = 10 + 4'}
      </div>
    </>
  );
}

function StepT2({ setReady }: StepProps) {
  const ts = useSA();
  const [gone, setGone] = useState(0);
  const done = gone >= 5;
  useEffect(() => setReady(done), [done, setReady]);
  return (
    <>
      <p className="ac-text">
        <Rich text={done ? ts.t2done : gone >= 3 ? ts.t2ten : ts.t2} />
      </p>
      <div className="ac-stage">
        <TakeFrames
          n={13}
          gone={gone}
          onTap={
            done
              ? undefined
              : () => {
                  setGone((g) => Math.min(5, g + 1));
                  sfx.pick(Math.min(3, gone + 1));
                }
          }
        />
      </div>
      <div className="ac-expr" dir="ltr">
        {gone === 0 ? '13 − 5' : gone <= 3 ? `13 − ${gone} = ${13 - gone}` : `13 − 3 − ${gone - 3} = ${13 - gone}`}
      </div>
    </>
  );
}

function StepT3(p: StepProps) {
  const ts = useSA();
  return (
    <Steps
      {...p}
      texts={[ts.t3q1, ts.t3q2, ts.t3q3]}
      doneText={ts.t3done}
      picture={<TakeFrames n={12} gone={0} />}
      qs={[
        { options: [2, 4, 8, 1], answer: 2 },
        { options: [2, 1, 4, 3], answer: 2 },
        { options: [8, 7, 9, 12], answer: 8 },
      ]}
    />
  );
}

function StepT4(p: StepProps) {
  const ts = useSA();
  return (
    <Steps
      {...p}
      texts={[ts.t4]}
      doneText={ts.t4done}
      picture={
        <div className="ac-rows" dir="ltr">
          {[7, 8].map((n, r) => (
            <div key={r} className="ac-row">
              {Array.from({ length: n }, (_, i) => (
                <span key={i} className={`ac-star is-${r === 0 ? 'gold' : 'blue'}`} />
              ))}
            </div>
          ))}
        </div>
      }
      qs={[{ options: [8, 7, 9, 22], answer: 8 }]}
    />
  );
}

function StepT5(p: StepProps) {
  const ts = useSA();
  return (
    <Steps
      {...p}
      texts={[ts.t5]}
      doneText={ts.t5done}
      picture={
        <div className="ac-rows" dir="ltr">
          {[0, 1].map((r) => (
            <div key={r} className="ac-row">
              {Array.from({ length: 8 }, (_, i) => (
                <span key={i} className={`ac-star is-${r === 0 ? 'gold' : 'blue'}`} />
              ))}
            </div>
          ))}
        </div>
      }
      qs={[{ options: [8, 6, 9, 24], answer: 8 }]}
    />
  );
}

function StepT6(p: StepProps) {
  const ts = useSA();
  return <Practice {...p} text={ts.t6} doneText={ts.t6done} expr="14 − 6" answer={8} options={[8, 7, 9, 20]} hint={<AutoHops min={5} max={15} from={14} jumps={[-4, -2]} />} />;
}

function StepT7(p: StepProps) {
  const ts = useSA();
  return <Practice {...p} text={ts.t7} doneText={ts.t7done} expr="17 − 9" answer={8} options={[8, 9, 7, 26]} hint={<AutoHops min={5} max={18} from={17} jumps={[-7, -2]} />} />;
}

// ---------- course 3: within 100 ----------

function StepU1({ setReady }: StepProps) {
  const ts = useSA();
  useEffect(() => setReady(true), [setReady]);
  return (
    <>
      <p className="ac-text">
        <Rich text={ts.u1} />
      </p>
      <div className="ac-stage">
        <Place rods={4} ones={7} />
      </div>
      <div className="ac-expr" dir="ltr">
        47 = 40 + 7
      </div>
    </>
  );
}

function StepU2(p: StepProps) {
  const ts = useSA();
  const [taken, setTaken] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setTaken(true), 1400);
    return () => window.clearTimeout(id);
  }, []);
  return (
    <Steps
      {...p}
      texts={[ts.u2]}
      doneText={ts.u2done}
      picture={
        <>
          <Place rods={7} ones={0} goneRods={taken ? 3 : 0} />
          <div className="ac-expr" dir="ltr">
            {taken ? '70 − 30 = 40' : '70 − 30'}
          </div>
        </>
      }
      qs={[{ options: [40, 30, 50, 80], answer: 40 }]}
    />
  );
}

function StepU3({ setReady }: StepProps) {
  const ts = useSA();
  const [tens, setTens] = useState(0);
  const [ones, setOnes] = useState(0);
  const done = tens === 2 && ones === 3;
  useEffect(() => setReady(done), [done, setReady]);
  const left = 58 - tens * 10 - ones;
  return (
    <>
      <p className="ac-text">
        <Rich text={done ? ts.u3done : tens < 2 ? ts.u3 : ts.u3ones} />
      </p>
      <div className="ac-stage">
        <Place rods={5} ones={8} goneRods={tens} goneOnes={ones} />
      </div>
      <div className="ac-expr" dir="ltr">
        {tens === 0 && ones === 0 ? '58 − 23' : `58 − ${tens * 10 + ones} = ${left}`}
      </div>
      {!done && (
        <div className="ac-buttons">
          <button
            type="button"
            className="ac-action"
            disabled={tens >= 2}
            onClick={() => {
              setTens((n) => Math.min(2, n + 1));
              sfx.pick(Math.min(3, tens + 1));
            }}
          >
            {ts.takeTen}
          </button>
          <button
            type="button"
            className="ac-action"
            disabled={tens < 2 || ones >= 3}
            onClick={() => {
              setOnes((n) => Math.min(3, n + 1));
              sfx.pick(Math.min(3, ones + 1));
            }}
          >
            {ts.takeOne}
          </button>
        </div>
      )}
    </>
  );
}

function StepU4(p: StepProps) {
  const ts = useSA();
  return (
    <Steps
      {...p}
      texts={[ts.u4q1, ts.u4q2]}
      doneText={ts.u4done}
      picture={<Place rods={7} ones={6} />}
      qs={[
        { options: [46, 42, 36, 106], answer: 46 },
        { options: [42, 41, 43, 50], answer: 42 },
      ]}
    />
  );
}

function StepU5({ setReady }: StepProps) {
  const ts = useSA();
  const [broken, setBroken] = useState(false);
  const [gone, setGone] = useState(0);
  const done = gone >= 7;
  useEffect(() => setReady(done), [done, setReady]);
  return (
    <>
      <p className="ac-text">
        <Rich text={done ? ts.u5done : broken ? ts.u5take : ts.u5} />
      </p>
      <div className="ac-stage">
        <Place rods={broken ? 3 : 4} ones={2} brokenOnes={broken ? 10 : 0} goneOnes={gone} />
      </div>
      <div className="ac-expr" dir="ltr">
        {!broken ? '42 − 7' : gone === 0 ? '42 = 30 + 12' : `42 − ${gone} = ${42 - gone}`}
      </div>
      {!done && (
        <button
          type="button"
          className="ac-action"
          onClick={() => {
            if (!broken) {
              setBroken(true);
              sfx.pick(2);
            } else {
              setGone((g) => Math.min(7, g + 1));
              sfx.pick(Math.min(3, gone + 1));
            }
          }}
        >
          {broken ? ts.takeOne : ts.breakTen}
        </button>
      )}
    </>
  );
}

function StepU6(p: StepProps) {
  const ts = useSA();
  return <Practice {...p} text={ts.u6} doneText={ts.u6done} expr="53 − 8" answer={45} options={[45, 55, 44, 61]} hint={<AutoHops min={43} max={55} from={53} jumps={[-3, -5]} />} />;
}

function StepU7(p: StepProps) {
  const ts = useSA();
  return <Practice {...p} text={ts.u7} doneText={ts.u7done} expr="64 − 27" answer={37} options={[37, 47, 43, 91]} hint={<AutoHops min={30} max={65} from={64} jumps={[-20, -4, -3]} />} />;
}

// ---------- the end of a course ----------

function doneStep(course: number) {
  return function StepDone({ setReady }: StepProps) {
    const ts = useSA();
    useEffect(() => setReady(true), [setReady]);
    return (
      <div className="ac-done">
        <motion.div className="ac-badge" initial={{ scale: 0, rotate: -180 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 180, damping: 12 }}>
          🎓
        </motion.div>
        <GradientText className="ac-done-title" colors={['#9fe0a8', '#6ad7ff', '#c9a4de', '#ffd77a', '#9fe0a8']} animationSpeed={3}>
          {ts.doneTitles[course]}
        </GradientText>
        <p className="ac-text">
          <Rich text={ts.doneTexts[course]} />
        </p>
      </div>
    );
  };
}

const step = (lesson: number, id: string): CourseStep => ({ lesson, id });

const COURSES: Array<{ steps: CourseStep[]; components: CourseSpec['components'] }> = [
  {
    steps: [step(0, 's1'), step(0, 's2'), step(1, 's3'), step(1, 's4'), step(2, 's5'), step(2, 's6'), step(3, 's7'), step(3, 's8'), step(4, 'done')],
    components: { s1: StepS1, s2: StepS2, s3: StepS3, s4: StepS4, s5: StepS5, s6: StepS6, s7: StepS7, s8: StepS8, done: doneStep(0) },
  },
  {
    steps: [step(0, 't1'), step(1, 't2'), step(1, 't3'), step(2, 't4'), step(2, 't5'), step(3, 't6'), step(3, 't7'), step(4, 'done')],
    components: { t1: StepT1, t2: StepT2, t3: StepT3, t4: StepT4, t5: StepT5, t6: StepT6, t7: StepT7, done: doneStep(1) },
  },
  {
    steps: [step(0, 'u1'), step(1, 'u2'), step(2, 'u3'), step(2, 'u4'), step(3, 'u5'), step(4, 'u6'), step(4, 'u7'), step(5, 'done')],
    components: { u1: StepU1, u2: StepU2, u3: StepU3, u4: StepU4, u5: StepU5, u6: StepU6, u7: StepU7, done: doneStep(2) },
  },
];

/** the text a step is about, for "read to me" */
function stepText(id: string, ts: SA, course: number): string {
  const texts: Record<string, string> = {
    s1: ts.s1,
    s2: `${ts.s2} ${ts.s2b}`,
    s7: ts.s7q1,
    t2: ts.t2,
    t3: ts.t3q1,
    u3: ts.u3,
    u4: ts.u4q1,
    u5: ts.u5,
    done: `${ts.doneTitles[course]} ${ts.doneTexts[course]}`,
  };
  return texts[id] ?? ((ts as unknown as Record<string, unknown>)[id] as string | undefined) ?? '';
}

// ---------- the menu and the screen ----------

const COURSE_ICONS = ['🔟', '🔙', '💯'];

function CourseMenu({ stage, done, onPick }: { stage: number; done: string[]; onPick: (i: number) => void }) {
  const ts = useSA();
  return (
    <div className="academy-step">
      <p className="ac-text">{ts.pick}</p>
      <div className="ac-courses">
        {ts.courses.map((c, i) => (
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
            {stage === i + 1 && <span className="ac-course-tag">📍 {ts.youAreHere}</span>}
            {done.includes(`sub${i + 1}`) && <span className="ac-course-done">{ts.finished}</span>}
          </motion.button>
        ))}
      </div>
    </div>
  );
}

export function SubtractionAcademy({ onClose, onBurst }: Props) {
  const ts = useSA();
  const [course, setCourse] = useState<number | null>(null);
  const stage = clampStage(useGameStore((s) => s.progress.subStage));
  const activeId = useProfiles((s) => s.activeId);
  const finished = useProfiles((s) => s.profiles.find((p) => p.id === s.activeId)?.academyDone) ?? [];

  const specs: CourseSpec[] = useMemo(
    () =>
      COURSES.map((c, i) => ({
        id: `sub${i + 1}`,
        subtitle: ts.courses[i].name,
        lessons: ts.lessons[i],
        steps: c.steps,
        components: c.components,
        stepText: (id: string) => stepText(id, ts, i),
        onFinish: () => {
          if (!activeId) return;
          const { profiles, update } = useProfiles.getState();
          const before = profiles.find((p) => p.id === activeId)?.academyDone ?? [];
          if (!before.includes(`sub${i + 1}`)) update(activeId, { academyDone: [...before, `sub${i + 1}`] });
        },
      })),
    [ts, activeId],
  );

  return (
    <AcademyScreen
      course={course === null ? null : specs[course]}
      menu={<CourseMenu stage={stage} done={finished} onPick={setCourse} />}
      menuSubtitle={ts.subtitle}
      onBackFromStart={() => setCourse(null)}
      onClose={onClose}
      onBurst={onBurst}
    />
  );
}
