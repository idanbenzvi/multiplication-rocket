import { useState } from 'react';
import type { Day } from '../../stats/metrics';

// Small hand-rolled SVG charts for the parent dashboard, following the
// data-viz rules: one series per line chart (one y-axis, never two), thin
// 2px lines, >=8px markers with a surface ring, hairline solid grid, few
// selective labels, a crosshair + tooltip on hover, gaps where a day had no
// practice (no invented values), and a 2px surface gap between stacked bars.

const W = 640;
const H = 200;
const PAD = { left: 44, right: 12, top: 12, bottom: 28 };
const PW = W - PAD.left - PAD.right;
const PH = H - PAD.top - PAD.bottom;

function xAt(i: number, n: number) {
  return PAD.left + (n <= 1 ? PW / 2 : (i / (n - 1)) * PW);
}

function dateLabel(d: Date) {
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

/** first, middle and last date only (selective labels, not every day) */
function xTicks(days: Day[]) {
  const n = days.length;
  const idx = n <= 2 ? [0, n - 1] : [0, Math.floor((n - 1) / 2), n - 1];
  return [...new Set(idx)].filter((i) => i >= 0).map((i) => ({ i, label: dateLabel(days[i].date) }));
}

interface Tip {
  i: number;
  text: string;
}

function Tooltip({ tip, n }: { tip: Tip | null; n: number }) {
  if (!tip) return null;
  const leftPct = (xAt(tip.i, n) / W) * 100;
  return (
    <div className="pd-tooltip" style={{ left: `${leftPct}%`, transform: `translateX(${leftPct > 70 ? '-100%' : leftPct < 30 ? '0' : '-50%'})` }}>
      {tip.text}
    </div>
  );
}

interface LineProps {
  days: Day[];
  value: (d: Day) => number | null;
  yMax: number;
  yTicks: number[];
  yFormat: (v: number) => string;
  tooltip: (d: Day) => string;
  label: string;
}

export function LineChart({ days, value, yMax, yTicks, yFormat, tooltip, label }: LineProps) {
  const [tip, setTip] = useState<Tip | null>(null);
  const n = days.length;
  const y = (v: number) => PAD.top + PH - (Math.min(v, yMax) / yMax) * PH;

  // contiguous runs of days with data -> separate path segments (gaps stay gaps)
  const segments: Array<Array<{ i: number; v: number }>> = [];
  let run: Array<{ i: number; v: number }> = [];
  days.forEach((d, i) => {
    const v = value(d);
    if (v === null) {
      if (run.length) segments.push(run);
      run = [];
    } else run.push({ i, v });
  });
  if (run.length) segments.push(run);

  return (
    <div className="pd-chart" onPointerLeave={() => setTip(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        {yTicks.map((tv) => (
          <g key={tv}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(tv)} y2={y(tv)} className="pd-grid" />
            <text x={PAD.left - 8} y={y(tv) + 4} className="pd-axis" textAnchor="end">
              {yFormat(tv)}
            </text>
          </g>
        ))}
        {xTicks(days).map(({ i, label: l }) => (
          <text key={i} x={xAt(i, n)} y={H - 8} className="pd-axis" textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}>
            {l}
          </text>
        ))}
        {tip && <line x1={xAt(tip.i, n)} x2={xAt(tip.i, n)} y1={PAD.top} y2={PAD.top + PH} className="pd-crosshair" />}
        {segments.map((seg, k) => (
          <polyline key={k} points={seg.map((p) => `${xAt(p.i, n)},${y(p.v)}`).join(' ')} className="pd-line" />
        ))}
        {segments.flat().map((p) => (
          <circle key={p.i} cx={xAt(p.i, n)} cy={y(p.v)} r={tip?.i === p.i ? 6 : 4} className="pd-dot" />
        ))}
        {/* hit areas: a full-height column per day, wider than the mark */}
        {days.map((d, i) => (
          <rect
            key={d.key}
            x={xAt(i, n) - PW / Math.max(1, n - 1) / 2}
            y={PAD.top}
            width={Math.max(24, PW / Math.max(1, n - 1))}
            height={PH}
            fill="transparent"
            onPointerEnter={() => value(d) !== null && setTip({ i, text: tooltip(d) })}
          />
        ))}
      </svg>
      <Tooltip tip={tip} n={n} />
    </div>
  );
}

interface BarsProps {
  days: Day[];
  tooltip: (d: Day) => string;
  label: string;
}

/** correct (bottom) + wrong (top) answers per day */
export function StackedBars({ days, tooltip, label }: BarsProps) {
  const [tip, setTip] = useState<Tip | null>(null);
  const n = days.length;
  const max = Math.max(5, ...days.map((d) => d.answered));
  const step = Math.ceil(max / 4 / 5) * 5 || 5;
  const top = step * 4;
  const y = (v: number) => PAD.top + PH - (v / top) * PH;
  const slot = PW / Math.max(1, n);
  const barW = Math.max(3, Math.min(28, slot - 4));
  const bx = (i: number) => PAD.left + slot * i + (slot - barW) / 2;
  const GAP = 2;

  return (
    <div className="pd-chart" onPointerLeave={() => setTip(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        {[0, step, step * 2, step * 3, top].map((tv) => (
          <g key={tv}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(tv)} y2={y(tv)} className="pd-grid" />
            <text x={PAD.left - 8} y={y(tv) + 4} className="pd-axis" textAnchor="end">
              {tv}
            </text>
          </g>
        ))}
        {xTicks(days).map(({ i, label: l }) => (
          <text key={i} x={bx(i) + barW / 2} y={H - 8} className="pd-axis" textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}>
            {l}
          </text>
        ))}
        {days.map((d, i) => {
          if (!d.answered) return null;
          const yCorrect = y(d.correct);
          const yTop = y(d.answered);
          const hasWrong = d.wrong > 0;
          return (
            <g key={d.key} opacity={tip && tip.i !== i ? 0.55 : 1}>
              {d.correct > 0 && (
                <rect
                  x={bx(i)}
                  y={yCorrect}
                  width={barW}
                  height={Math.max(0, y(0) - yCorrect)}
                  rx={hasWrong ? 0 : Math.min(4, barW / 2)}
                  className="pd-bar-correct"
                />
              )}
              {hasWrong && (
                <rect
                  x={bx(i)}
                  y={yTop}
                  width={barW}
                  height={Math.max(0, yCorrect - yTop - (d.correct > 0 ? GAP : 0))}
                  rx={Math.min(4, barW / 2)}
                  className="pd-bar-wrong"
                />
              )}
            </g>
          );
        })}
        {days.map((d, i) => (
          <rect
            key={`h${d.key}`}
            x={PAD.left + slot * i}
            y={PAD.top}
            width={Math.max(slot, 1)}
            height={PH}
            fill="transparent"
            onPointerEnter={() => d.answered && setTip({ i, text: tooltip(d) })}
          />
        ))}
      </svg>
      <Tooltip tip={tip ? { ...tip, i: tip.i } : null} n={n} />
    </div>
  );
}
