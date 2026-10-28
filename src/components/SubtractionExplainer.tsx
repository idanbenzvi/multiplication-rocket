import type { CSSProperties } from 'react';
import { useT } from '../i18n/useLang';

interface Props {
  /** the number taken from */
  x: number;
  /** the number taken away */
  y: number;
}

const tensOf = (n: number) => n - (n % 10);

/** a cell that pops in at `inMs` and is taken away (faded, crossed out) at `outMs` */
const timing = (inMs: number, outMs?: number): CSSProperties =>
  (outMs === undefined ? { animationDelay: `${inMs}ms` } : { '--in': `${inMs}ms`, '--out': `${outMs}ms` }) as CSSProperties;

// The subtraction version of AdditionExplainer, shown after a miss. Within
// 20 the first number fills ten-frames, then the number taken away goes from
// its end, one at a time, so taking back to the 10 first and then the rest
// is right there to see. Two-digit differences are drawn as tens (rods) and
// ones (dots), the tens and ones taken away crossed out; when there aren't
// enough ones, a ten is broken into ten ones first (borrowing).
export function SubtractionExplainer({ x, y }: Props) {
  const t = useT();
  const left = x - y;

  if (x <= 20 && y <= 10) {
    const frames = x > 10 ? 2 : 1;
    const ones = x % 10;
    const across = x > 10 && ones > 0 && ones < y;
    const math = across ? `${x} − ${ones} − ${y - ones}  =  10 − ${y - ones}  =  ${left}` : `${x} − ${y}  =  ${left}`;
    const filled = x * 40;
    return (
      <div className="mult-grid-wrap add-explainer">
        <div className="ten-frames" dir="ltr">
          {Array.from({ length: frames }, (_, f) => (
            <div key={f} className="ten-frame">
              {Array.from({ length: 10 }, (_, k) => {
                const i = f * 10 + k;
                if (i >= x) return <div key={k} className="ten-frame-cell" />;
                // taken from the end: the last one first, with a beat after the filling
                const gone = i >= left;
                return <div key={k} className={`ten-frame-cell add-a ${gone ? 'sub-gone' : ''}`} style={timing(i * 40, gone ? filled + 300 + (x - 1 - i) * 90 : undefined)} />;
              })}
            </div>
          ))}
        </div>
        <div className="mult-grid-caption">{across ? t.subExplainBackTen : t.subExplainTakeAway}</div>
        <bdi dir="ltr" className="add-explainer-math">
          {math}
        </bdi>
      </div>
    );
  }

  const tensX = Math.floor(x / 10);
  const onesX = x % 10;
  const tensY = Math.floor(y / 10);
  const onesY = y % 10;
  const borrow = onesX < onesY;
  // the rods still whole, and the ones: x's own, then a broken ten's
  const rods = tensX - (borrow ? 1 : 0);
  const dots = onesX + (borrow ? 10 : 0);
  let n = 0;
  const shown = rods + dots;
  const outAt = shown * 60 + 400;
  let out = 0;
  const math =
    onesY === 0
      ? `${x} − ${y}  =  ${left}`
      : tensY === 0
        ? onesX > 0 && borrow
          ? `${x} − ${onesX} − ${y - onesX}  =  ${tensOf(x)} − ${y - onesX}  =  ${left}`
          : `${x} − ${y}  =  ${left}`
        : `${x} − ${tensOf(y)} − ${onesY}  =  ${x - tensOf(y)} − ${onesY}  =  ${left}`;
  return (
    <div className="mult-grid-wrap add-explainer">
      <div className="place-rows" dir="ltr">
        <div className="place-row">
          {Array.from({ length: rods }, (_, k) => {
            const gone = k >= rods - tensY;
            return <div key={`t${k}`} className={`place-rod add-a ${gone ? 'sub-gone' : ''}`} style={timing(n++ * 60, gone ? outAt + out++ * 120 : undefined)} />;
          })}
          {Array.from({ length: dots }, (_, k) => {
            const gone = k >= dots - onesY;
            const broken = borrow && k >= onesX;
            return (
              <div
                key={`o${k}`}
                className={`place-dot ${broken ? 'add-b' : 'add-a'} ${gone ? 'sub-gone' : ''}`}
                style={timing(n++ * 60, gone ? outAt + out++ * 120 : undefined)}
              />
            );
          })}
        </div>
      </div>
      <div className="mult-grid-caption">{borrow ? t.subExplainBorrow : t.subExplainTens}</div>
      <bdi dir="ltr" className="add-explainer-math">
        {math}
      </bdi>
    </div>
  );
}
