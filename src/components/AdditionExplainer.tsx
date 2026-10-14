import { useT } from '../i18n/useLang';

interface Props {
  x: number;
  y: number;
}

const tensOf = (n: number) => n - (n % 10);

// The addition version of MultiplicationGrid, shown after a miss. Within 20
// the sum is drawn on ten-frames: the first number fills in, then the second
// in another colour, so filling up the 10 and carrying on past it is right
// there to see. Two-digit sums are drawn as tens (rods) and ones (dots):
// tens go with tens, ones with ones.
export function AdditionExplainer({ x, y }: Props) {
  const t = useT();
  const sum = x + y;

  if (x <= 10 && y <= 10) {
    const frames = sum > 10 ? 2 : 1;
    const fill = 10 - x;
    const math =
      sum <= 10 || x === 10 ? `${x} + ${y} = ${sum}` : `${x} + ${fill} + ${y - fill}  =  10 + ${y - fill}  =  ${sum}`;
    return (
      <div className="mult-grid-wrap add-explainer">
        <div className="ten-frames" dir="ltr">
          {Array.from({ length: frames }, (_, f) => (
            <div key={f} className="ten-frame">
              {Array.from({ length: 10 }, (_, k) => {
                const i = f * 10 + k;
                const kind = i < x ? 'add-a' : i < sum ? 'add-b' : '';
                // the second number lands after the first, with a beat between
                const delay = i < x ? i * 40 : x * 40 + 250 + (i - x) * 60;
                return <div key={k} className={`ten-frame-cell ${kind}`} style={kind ? { animationDelay: `${delay}ms` } : undefined} />;
              })}
            </div>
          ))}
        </div>
        <div className="mult-grid-caption">{sum > 10 && x < 10 ? t.addExplainMakeTen : t.addExplainCount}</div>
        <bdi dir="ltr" className="add-explainer-math">
          {math}
        </bdi>
      </div>
    );
  }

  const parts = [tensOf(x), tensOf(y), x % 10, y % 10].filter((n, i) => i < 2 || n > 0);
  const tens = tensOf(x) + tensOf(y);
  const ones = (x % 10) + (y % 10);
  const math = `${x} + ${y}  =  ${parts.join(' + ')}  =  ${ones > 0 ? `${tens} + ${ones}  =  ` : ''}${sum}`;
  let n = 0;
  const row = (value: number, kind: string) => (
    <div className="place-row">
      {Array.from({ length: Math.floor(value / 10) }, (_, k) => (
        <div key={`t${k}`} className={`place-rod ${kind}`} style={{ animationDelay: `${n++ * 70}ms` }} />
      ))}
      {Array.from({ length: value % 10 }, (_, k) => (
        <div key={`o${k}`} className={`place-dot ${kind}`} style={{ animationDelay: `${n++ * 70}ms` }} />
      ))}
    </div>
  );
  return (
    <div className="mult-grid-wrap add-explainer">
      <div className="place-rows" dir="ltr">
        {row(x, 'add-a')}
        {row(y, 'add-b')}
      </div>
      <div className="mult-grid-caption">{t.addExplainTens}</div>
      <bdi dir="ltr" className="add-explainer-math">
        {math}
      </bdi>
    </div>
  );
}
