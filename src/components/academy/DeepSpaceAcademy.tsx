import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useT } from '../../i18n/useLang';
import { sfx } from '../../audio/sfx';
import GradientText from '../reactbits/GradientText';
import { AcademyScreen, Alien, Bus, Choices, Rich, type A, type CourseSpec, type StepProps } from './parts';

// The Deep Space Academy: multiplication from the ground up, for a child
// who has never met "×". Opened by tapping the rocket's window three times.
//
// The sequence follows the research on how children build multiplicative
// thinking (see README → "Deep Space Academy"):
//   1. equal groups — counting all (children's intuitive starting model)
//   2. repeated addition and skip counting on a number line
//   3. "×" as a shortcut for "groups of": first number = how many groups,
//      second = how many in each
//   4. arrays: each row is an equal group, the whole is a group of groups
//   5. commutativity by turning the array (3 × 4 = 4 × 3)
//   6. guided practice that fades the support: build with objects →
//      read a picture → symbols only (concrete → representational → abstract)
// Everything can be read aloud, so non-readers can follow.

interface Props {
  onClose: () => void;
  onBurst: (x: number, y: number, color: string) => void;
}

const STEPS: Array<{ lesson: number; id: string }> = [
  { lesson: 0, id: 's1' },
  { lesson: 0, id: 's2' },
  { lesson: 0, id: 's3' },
  { lesson: 1, id: 's4' },
  { lesson: 1, id: 's5' },
  { lesson: 2, id: 's6' },
  { lesson: 2, id: 's7' },
  { lesson: 3, id: 's8' },
  { lesson: 4, id: 's9' },
  { lesson: 5, id: 's10' },
  { lesson: 5, id: 's11' },
  { lesson: 5, id: 's12' },
  { lesson: 6, id: 'done' },
];

// ---------- the steps ----------

function StepS1({ t, setReady }: StepProps) {
  const [counted, setCounted] = useState(0);
  useEffect(() => {
    const ids = [1, 2, 3, 4].map((n) => window.setTimeout(() => setCounted(n), 600 + n * 550));
    const r = window.setTimeout(() => setReady(true), 3000);
    return () => [...ids, r].forEach(window.clearTimeout);
  }, [setReady]);
  return (
    <>
      <p className="ac-text"><Rich text={t.s1} /></p>
      <div className="ac-stage">
        <Bus>{[1, 2, 3, 4].map((n) => <Alien key={n} n={n <= counted ? n : undefined} lit={n <= counted} />)}</Bus>
      </div>
    </>
  );
}

function StepS2({ t, setReady }: StepProps) {
  useEffect(() => setReady(true), [setReady]);
  return (
    <>
      <p className="ac-text"><Rich text={t.s2} /></p>
      <div className="ac-stage ac-buses">
        {[0, 1, 2].map((g) => (
          <Bus key={g} delay={g * 0.35} label="4">
            {[0, 1, 2, 3].map((n) => <Alien key={n} />)}
          </Bus>
        ))}
      </div>
      <div className="ac-caption" dir="auto">{t.groupsOf(3, 4)}</div>
    </>
  );
}

function StepS3({ t, setReady }: StepProps) {
  const [order, setOrder] = useState<number[]>([]); // alien ids in the order they were tapped
  const total = 12;
  const done = order.length === total;
  useEffect(() => setReady(done), [done, setReady]);
  const tap = (id: number) => {
    if (order.includes(id)) return;
    setOrder((o) => [...o, id]);
    sfx.pick(1);
  };
  const countForMe = () => {
    const remaining = Array.from({ length: total }, (_, i) => i).filter((i) => !order.includes(i));
    remaining.forEach((id, k) => window.setTimeout(() => setOrder((o) => (o.includes(id) ? o : [...o, id])), k * 220));
  };
  return (
    <>
      <p className="ac-text"><Rich text={done ? t.s3done(total) : t.s3} /></p>
      <div className="ac-stage ac-buses">
        {[0, 1, 2].map((g) => (
          <Bus key={g} highlight={done}>
            {[0, 1, 2, 3].map((n) => {
              const id = g * 4 + n;
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

function StepS4({ t, setReady }: StepProps) {
  const [added, setAdded] = useState(0);
  useEffect(() => setReady(added >= 3), [added, setReady]);
  const terms = Array.from({ length: added }, () => '4');
  const expr = added === 0 ? '' : added === 1 ? '4' : `${terms.join(' + ')} = ${added * 4}`;
  return (
    <>
      <p className="ac-text"><Rich text={t.s4} /></p>
      <div className="ac-stage ac-buses">
        {[0, 1, 2].map((g) => (
          <Bus key={g} highlight={g < added} label={g < added ? '4' : undefined}>
            {[0, 1, 2, 3].map((n) => <Alien key={n} lit={g < added} />)}
          </Bus>
        ))}
      </div>
      <div className="ac-expr" dir="ltr">
        <AnimatePresence mode="popLayout">
          <motion.span key={expr} initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
            {expr || ' '}
          </motion.span>
        </AnimatePresence>
      </div>
      {added < 3 && (
        <button
          type="button"
          className="ac-action"
          onClick={() => {
            setAdded((a) => a + 1);
            sfx.pick(Math.min(3, added + 1));
          }}
        >
          {t.addBus}
        </button>
      )}
    </>
  );
}

function StepS5({ t, setReady }: StepProps) {
  const [hops, setHops] = useState(0);
  useEffect(() => setReady(hops >= 3), [hops, setReady]);
  const W = 560;
  const x = (n: number) => 20 + (n / 12) * (W - 40);
  return (
    <>
      <p className="ac-text"><Rich text={t.s5} /></p>
      <div className="ac-stage" dir="ltr">
        <svg className="ac-numberline" viewBox={`0 0 ${W} 130`}>
          <line x1={x(0)} y1={100} x2={x(12)} y2={100} className="ac-nl-axis" />
          {Array.from({ length: 13 }, (_, n) => (
            <g key={n}>
              <line x1={x(n)} y1={92} x2={x(n)} y2={108} className={`ac-nl-tick ${n % 4 === 0 && n / 4 <= hops ? 'is-hit' : ''}`} />
              <text x={x(n)} y={126} className={`ac-nl-num ${n % 4 === 0 && n / 4 <= hops ? 'is-hit' : ''}`}>
                {n}
              </text>
            </g>
          ))}
          {Array.from({ length: hops }, (_, k) => (
            <motion.path
              key={k}
              d={`M ${x(k * 4)} 96 Q ${(x(k * 4) + x(k * 4 + 4)) / 2} 20 ${x(k * 4 + 4)} 96`}
              className="ac-nl-hop"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.5 }}
            />
          ))}
          {Array.from({ length: hops }, (_, k) => (
            <text key={`l${k}`} x={(x(k * 4) + x(k * 4 + 4)) / 2} y={40} className="ac-nl-label">
              +4
            </text>
          ))}
          <motion.text
            className="ac-nl-rocket"
            animate={{ x: x(hops * 4) - 14, y: hops ? 84 : 84 }}
            transition={{ type: 'spring', stiffness: 160, damping: 14 }}
            x={0}
            y={0}
          >
            🚀
          </motion.text>
        </svg>
      </div>
      <div className="ac-expr" dir="ltr">{hops ? Array.from({ length: hops }, (_, k) => (k + 1) * 4).join(', ') : ' '}</div>
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

function StepS6({ t, setReady }: StepProps) {
  const [stage, setStage] = useState(0); // 0: 4+4+4, 1: 3 × 4, 2: + labels
  useEffect(() => {
    const a = window.setTimeout(() => setStage(1), 1600);
    const b = window.setTimeout(() => setStage(2), 3000);
    const c = window.setTimeout(() => setReady(true), 3200);
    return () => [a, b, c].forEach(window.clearTimeout);
  }, [setReady]);
  return (
    <>
      <p className="ac-text"><Rich text={t.s6} /></p>
      <div className="ac-stage ac-symbol" dir="ltr">
        <AnimatePresence mode="wait">
          {stage === 0 ? (
            <motion.div key="sum" className="ac-big" exit={{ scale: 0.4, opacity: 0, filter: 'blur(6px)' }}>
              <span className="ac-each">4</span> + <span className="ac-each">4</span> + <span className="ac-each">4</span>
            </motion.div>
          ) : (
            <motion.div key="times" className="ac-big" initial={{ scale: 1.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
              <span className="ac-groups">3</span> × <span className="ac-each">4</span>
            </motion.div>
          )}
        </AnimatePresence>
        {stage === 2 && (
          <motion.div className="ac-symbol-labels" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <span className="ac-groups">↑ {t.groupsLabel}</span>
            <span className="ac-each">↑ {t.eachLabel}</span>
          </motion.div>
        )}
      </div>
      {stage === 2 && (
        <p className="ac-text ac-text-small">
          <Rich text={t.s6b} />
        </p>
      )}
    </>
  );
}

function StepS7({ t, setReady }: StepProps) {
  const [q, setQ] = useState(0); // 0: groups?, 1: each?, 2: done
  useEffect(() => setReady(q === 2), [q, setReady]);
  return (
    <>
      <p className="ac-text"><Rich text={q === 0 ? t.s7q1 : q === 1 ? t.s7q2 : t.s7done} /></p>
      <div className="ac-stage ac-buses ac-buses-small">
        {[0, 1, 2, 3, 4].map((g) => (
          <Bus key={g} delay={g * 0.12} highlight={q >= 1}>
            {[0, 1].map((n) => <Alien key={n} lit={q === 2} />)}
          </Bus>
        ))}
      </div>
      <div className="ac-big ac-big-small" dir="ltr">
        <span className={q >= 1 ? 'ac-groups' : ''}>5</span> × <span className={q >= 2 ? 'ac-each' : ''}>2</span>
        {q === 2 && <span> = 10</span>}
      </div>
      {q === 0 && <Choices key="q0" options={[2, 5, 7, 10]} answer={5} onCorrect={() => setQ(1)} t={t} />}
      {q === 1 && <Choices key="q1" options={[5, 2, 3, 10]} answer={2} onCorrect={() => setQ(2)} t={t} />}
    </>
  );
}

function Grid({ rows, cols, litRows = 0, rotate = false }: { rows: number; cols: number; litRows?: number; rotate?: boolean }) {
  // A rotating element keeps its original layout box, so a turned 3×4 grid
  // would spill over whatever is below it. Reserve a square that fits it
  // either way round.
  const side = `calc(${Math.max(rows, cols)} * (clamp(36px, 8vw, 46px) + 0.35rem))`;
  return (
    <div className="ac-grid-frame" style={{ width: side, height: side }}>
    <motion.div
      className="ac-grid"
      style={{ gridTemplateColumns: `repeat(${cols}, auto)` }}
      animate={{ rotate: rotate ? 90 : 0 }}
      transition={{ duration: 1.1, ease: 'easeInOut' }}
    >
      {Array.from({ length: rows * cols }, (_, i) => {
        const r = Math.floor(i / cols);
        return (
          <motion.span
            key={i}
            className={`ac-grid-cell ${r < litRows ? 'is-lit' : ''}`}
            initial={{ scale: 0, y: -40 }}
            animate={{ scale: 1, y: 0, rotate: rotate ? -90 : 0 }}
            transition={{ delay: i * 0.05, type: 'spring', stiffness: 300, damping: 18, rotate: { duration: 1.1 } }}
          >
            👽
          </motion.span>
        );
      })}
    </motion.div>
    </div>
  );
}

function StepS8({ t, setReady }: StepProps) {
  const [lit, setLit] = useState(0);
  useEffect(() => {
    const ids = [1, 2, 3].map((r) => window.setTimeout(() => setLit(r), 1200 + r * 900));
    const done = window.setTimeout(() => setReady(true), 4200);
    return () => [...ids, done].forEach(window.clearTimeout);
  }, [setReady]);
  return (
    <>
      <p className="ac-text"><Rich text={lit >= 3 ? t.s8b : t.s8} /></p>
      <div className="ac-stage ac-array">
        <Grid rows={3} cols={4} litRows={lit} />
        <div className="ac-row-totals" dir="ltr">
          {[1, 2, 3].map((r) => (
            <span key={r} className={r <= lit ? 'is-on' : ''}>
              {r <= lit ? r * 4 : ''}
            </span>
          ))}
        </div>
      </div>
      <div className="ac-caption" dir="auto">{t.rowsOf(3, 4)}</div>
    </>
  );
}

function StepS9({ t, setReady }: StepProps) {
  const [stage, setStage] = useState(0); // 0: 3 rows of 4, 1: rotated, 2: trick
  useEffect(() => {
    const a = window.setTimeout(() => setStage(1), 1800);
    const b = window.setTimeout(() => setStage(2), 4200);
    const c = window.setTimeout(() => setReady(true), 4400);
    return () => [a, b, c].forEach(window.clearTimeout);
  }, [setReady]);
  return (
    <>
      <p className="ac-text"><Rich text={stage === 0 ? t.s9 : stage === 1 ? t.s9b : t.s9c} /></p>
      <div className="ac-stage ac-array">
        <Grid rows={3} cols={4} rotate={stage >= 1} />
      </div>
      <div className="ac-big ac-big-small" dir="ltr">
        {stage === 0 ? '3 × 4 = 12' : '4 × 3 = 12'}
      </div>
    </>
  );
}

function StepS10({ t, setReady }: StepProps) {
  const [groups, setGroups] = useState(1);
  const [each, setEach] = useState(1);
  const [answered, setAnswered] = useState(false);
  const built = groups === 2 && each === 3;
  useEffect(() => setReady(answered), [answered, setReady]);
  return (
    <>
      <p className="ac-text"><Rich text={answered ? t.s10done : built ? t.s10q : t.s10} /></p>
      <div className="ac-stage ac-buses">
        {Array.from({ length: groups }, (_, g) => (
          <Bus key={g} highlight={built}>
            {Array.from({ length: each }, (_, n) => <Alien key={n} lit={built} />)}
          </Bus>
        ))}
      </div>
      <div className="ac-caption" dir="auto">{t.groupsOf(groups, each)}</div>
      {!built && (
        <div className="ac-build-buttons">
          <button type="button" className="ac-secondary" onClick={() => setGroups((g) => Math.max(1, g - 1))}>{t.removeGroup}</button>
          <button type="button" className="ac-action" onClick={() => { setGroups((g) => Math.min(5, g + 1)); sfx.pick(1); }}>{t.addGroup}</button>
          <button type="button" className="ac-secondary" onClick={() => setEach((e) => Math.max(1, e - 1))}>{t.removeEach}</button>
          <button type="button" className="ac-action" onClick={() => { setEach((e) => Math.min(6, e + 1)); sfx.pick(1); }}>{t.addEach}</button>
        </div>
      )}
      {built && !answered && <Choices options={[5, 6, 7, 9]} answer={6} onCorrect={() => setAnswered(true)} t={t} />}
    </>
  );
}

function StepS11({ t, setReady }: StepProps) {
  const [q, setQ] = useState(0);
  useEffect(() => setReady(q === 2), [q, setReady]);
  return (
    <>
      <p className="ac-text"><Rich text={q === 0 ? t.s11q1 : q === 1 ? t.s11q2 : t.s11done} /></p>
      <div className="ac-stage ac-array">
        <div className="ac-dots" style={{ gridTemplateColumns: 'repeat(2, auto)' }}>
          {Array.from({ length: 8 }, (_, i) => (
            <span key={i} className={`ac-dot ${q === 2 ? 'is-lit' : ''}`} />
          ))}
        </div>
      </div>
      {q === 0 && <Choices key="a" options={['4 × 2', '4 + 2', '2 + 2', '6 × 2']} answer="4 × 2" onCorrect={() => setQ(1)} t={t} />}
      {q === 1 && <Choices key="b" options={[6, 8, 10, 42]} answer={8} onCorrect={() => setQ(2)} t={t} />}
    </>
  );
}

function StepS12({ t, setReady }: StepProps) {
  const [hint, setHint] = useState(false);
  const [done, setDone] = useState(false);
  useEffect(() => setReady(done), [done, setReady]);
  return (
    <>
      <p className="ac-text"><Rich text={done ? t.s12done : t.s12} /></p>
      <div className="ac-stage ac-symbol" dir="ltr">
        <div className="ac-big">5 × 3 = {done ? '15' : '?'}</div>
        {(hint || done) && (
          <motion.div className="ac-hint" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <div className="ac-expr">3 + 3 + 3 + 3 + 3</div>
            <div className="ac-dots" style={{ gridTemplateColumns: 'repeat(3, auto)' }}>
              {Array.from({ length: 15 }, (_, i) => <span key={i} className={`ac-dot ${done ? 'is-lit' : ''}`} />)}
            </div>
          </motion.div>
        )}
      </div>
      {!done && (
        <>
          <Choices options={[15, 8, 53, 12]} answer={15} onCorrect={() => setDone(true)} t={t} />
          {!hint && <button type="button" className="ac-secondary" onClick={() => setHint(true)}>{t.showMe}</button>}
        </>
      )}
    </>
  );
}

function StepDone({ t, setReady }: StepProps) {
  useEffect(() => setReady(true), [setReady]);
  return (
    <div className="ac-done">
      <motion.div className="ac-badge" initial={{ scale: 0, rotate: -180 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 180, damping: 12 }}>
        🎓
      </motion.div>
      <GradientText className="ac-done-title" colors={['#ffd77a', '#ff9d76', '#c9a4de', '#6ad7ff', '#ffd77a']} animationSpeed={3}>
        {t.doneTitle}
      </GradientText>
      <p className="ac-text"><Rich text={t.doneText} /></p>
    </div>
  );
}

const STEP_COMPONENTS: Record<string, (p: StepProps) => React.ReactElement> = {
  s1: StepS1, s2: StepS2, s3: StepS3, s4: StepS4, s5: StepS5, s6: StepS6, s7: StepS7,
  s8: StepS8, s9: StepS9, s10: StepS10, s11: StepS11, s12: StepS12, done: StepDone,
};

/** the text a step is about right now, for "read to me" */
function stepText(id: string, t: A): string {
  switch (id) {
    case 's3': return t.s3;
    case 's6': return `${t.s6} ${t.s6b}`;
    case 's7': return t.s7q1;
    case 's8': return `${t.s8} ${t.s8b}`;
    case 's9': return `${t.s9} ${t.s9b} ${t.s9c}`;
    case 's10': return t.s10;
    case 's11': return t.s11q1;
    case 'done': return `${t.doneTitle} ${t.doneText}`;
    default: return (t as unknown as Record<string, string>)[id] ?? '';
  }
}

// ---------- the screen ----------

export function DeepSpaceAcademy({ onClose, onBurst }: Props) {
  const t = useT().academy;
  const course: CourseSpec = useMemo(
    () => ({ id: 'mul', subtitle: t.subtitle, lessons: t.lessons, steps: STEPS, components: STEP_COMPONENTS, stepText: (id) => stepText(id, t) }),
    [t],
  );
  return <AcademyScreen course={course} onClose={onClose} onBurst={onBurst} />;
}
