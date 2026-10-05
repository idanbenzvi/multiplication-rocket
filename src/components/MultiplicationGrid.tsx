interface Props {
  x: number;
  y: number;
}

// Shows the fact as what it actually is — x rows of y — with cells popping
// in row by row, instead of just stating the product. This is deliberately
// the *wrong-answer* explainer, not something shown before answering: seeing
// it right after a miss is the teachable moment, and it doesn't cost the
// fast-answer scoring loop anything since it only appears when that speed
// bonus was already lost.
export function MultiplicationGrid({ x, y }: Props) {
  const cells = Array.from({ length: x * y });

  return (
    <div className="mult-grid-wrap">
      <div
        className="mult-grid"
        style={{ gridTemplateColumns: `repeat(${y}, 1fr)` }}
      >
        {cells.map((_, i) => (
          <div key={i} className="mult-grid-cell" style={{ animationDelay: `${i * 12}ms` }} />
        ))}
      </div>
      <div className="mult-grid-caption">
        {x} rows × {y} columns = {x * y}
      </div>
    </div>
  );
}
