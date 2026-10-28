import type { ThinkVisual as Visual } from '../../game/thinkThrough';

// The pictures the ship's computer shows (game/thinkThrough.ts): groups as
// rows of dots, two numbers put together, some taken away, tens and ones,
// and counting in steps. Always left to right, like the math.

/** a colour for each group, so the groups read apart */
const ROWS = ['#6ad7ff', '#ffd77a', '#ff9de2', '#9fe0a8', '#c9a4de', '#ff9d76', '#8fe6ff', '#ffe08a', '#b6f0c2', '#f7b6ff'];
const A = '#6ad7ff';
const B = '#ffd77a';

/** `rows` groups of `cols`, a row each, as big as fits 232 × 140 */
function Groups({ rows, cols }: { rows: number; cols: number }) {
  const gap = Math.min(232 / cols, 140 / rows, 26);
  const r = gap * 0.36;
  const w = cols * gap;
  const h = rows * gap;
  return (
    <svg className="think-groups" viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <g key={i}>
          <rect x={gap * 0.08} y={i * gap + gap * 0.1} width={w - gap * 0.16} height={gap * 0.8} rx={gap * 0.4} fill={ROWS[i % ROWS.length]} opacity="0.13" />
          {Array.from({ length: cols }, (_, j) => (
            <circle key={j} cx={j * gap + gap / 2} cy={i * gap + gap / 2} r={r} fill={ROWS[i % ROWS.length]} />
          ))}
        </g>
      ))}
    </svg>
  );
}

/** `a` dots and `b` more, in rows of ten (a gap after five, like a ten-frame) */
function Join({ a, b }: { a: number; b: number }) {
  const gap = 21;
  const r = 7.5;
  const total = a + b;
  const rows = Math.ceil(total / 10);
  const x = (i: number) => (i % 10) * gap + (i % 10 >= 5 ? 8 : 0) + gap / 2;
  const w = 10 * gap + 8;
  return (
    <svg className="think-join" viewBox={`0 0 ${w} ${rows * gap}`} width={w} height={rows * gap} aria-hidden="true">
      {Array.from({ length: total }, (_, i) => (
        <circle key={i} cx={x(i)} cy={Math.floor(i / 10) * gap + gap / 2} r={r} fill={i < a ? A : B} />
      ))}
    </svg>
  );
}

/** `a` dots in rows of ten, the last `b` taken away: faded, and crossed out */
function TakeAway({ a, b }: { a: number; b: number }) {
  const gap = 21;
  const r = 7.5;
  const rows = Math.ceil(a / 10);
  const x = (i: number) => (i % 10) * gap + (i % 10 >= 5 ? 8 : 0) + gap / 2;
  const w = 10 * gap + 8;
  return (
    <svg className="think-join" viewBox={`0 0 ${w} ${rows * gap}`} width={w} height={rows * gap} aria-hidden="true">
      {Array.from({ length: a }, (_, i) => {
        const cx = x(i);
        const cy = Math.floor(i / 10) * gap + gap / 2;
        const gone = i >= a - b;
        return (
          <g key={i} className={gone ? 'think-gone' : undefined} style={gone ? { animationDelay: `${(i - (a - b)) * 0.12}s` } : undefined}>
            <circle cx={cx} cy={cy} r={r} fill={gone ? B : A} opacity={gone ? 0.35 : 1} />
            {gone && <path d={`M${cx - r} ${cy - r}L${cx + r} ${cy + r}M${cx + r} ${cy - r}L${cx - r} ${cy + r}`} stroke="#ff8f8f" strokeWidth={2.4} strokeLinecap="round" />}
          </g>
        );
      })}
    </svg>
  );
}

/** a number as its tens (bars) and ones (dots) */
function TensOnes({ n, color, at }: { n: number; color: string; at: number }) {
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  return (
    <g transform={`translate(${at} 0)`}>
      {Array.from({ length: tens }, (_, i) => (
        <rect key={i} x={i * 11} y={4} width={8} height={70} rx={3} fill={color} />
      ))}
      {Array.from({ length: ones }, (_, i) => (
        <circle key={i} cx={tens * 11 + 8 + (i % 2) * 11} cy={10 + Math.floor(i / 2) * 15} r={5} fill={color} />
      ))}
    </g>
  );
}

function Tens({ a, b, op = '+' }: { a: number; b: number; op?: '+' | '−' }) {
  const width = (n: number) => Math.floor(n / 10) * 11 + (n % 10 ? 26 : 0);
  const plus = width(a) + 10;
  const w = plus + 22 + width(b);
  return (
    <svg className="think-tens" viewBox={`0 0 ${w} 78`} width={w} height={78} aria-hidden="true">
      <TensOnes n={a} color={A} at={0} />
      <text x={plus + 5} y={46} className="think-plus">
        {op}
      </text>
      <TensOnes n={b} color={B} at={plus + 22} />
    </svg>
  );
}

/** counting in steps: each number a chip, the last one left to work out */
function Hops({ values }: { values: Array<number | null> }) {
  return (
    <div className="think-hops" dir="ltr">
      {values.map((v, i) => (
        <span key={i} className={`think-hop ${v === null ? 'is-todo' : ''}`} style={{ animationDelay: `${i * 0.18}s` }}>
          {v ?? '?'}
        </span>
      ))}
    </div>
  );
}

export function ThinkVisual({ visual }: { visual: Visual }) {
  switch (visual.kind) {
    case 'groups':
      return <Groups rows={visual.rows} cols={visual.cols} />;
    case 'join':
      return <Join a={visual.a} b={visual.b} />;
    case 'tens':
      return <Tens a={visual.a} b={visual.b} op={visual.op} />;
    case 'takeAway':
      return <TakeAway a={visual.a} b={visual.b} />;
    case 'hops':
      return <Hops values={visual.values} />;
  }
}
