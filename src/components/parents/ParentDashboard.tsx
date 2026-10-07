import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '../../i18n/useLang';
import type { Strings } from '../../i18n/strings';
import { pilotName, progressKeyFor, useProfiles } from '../../profiles/useProfiles';
import { readLog } from '../../stats/answerLog';
import { computeDashboard, type Day, type PeriodStats, type Range } from '../../stats/metrics';
import type { Progress } from '../../game/types';
import { LineChart, StackedBars } from './charts';

type P = Strings['parents'];

// ---------- parent gate ----------

/** A small "grown-ups only" check: a two-digit multiplication the kids won't know yet. */
export function ParentGate({ onPass, onCancel }: { onPass: () => void; onCancel: () => void }) {
  const t = useT().parents;
  const [q] = useState(() => ({ a: 12 + Math.floor(Math.random() * 8), b: 3 + Math.floor(Math.random() * 7) }));
  const [value, setValue] = useState('');
  const [wrong, setWrong] = useState(false);
  const submit = () => {
    if (Number(value) === q.a * q.b) onPass();
    else {
      setWrong(true);
      setValue('');
    }
  };
  return createPortal(
    <div className="settings-backdrop" onClick={onCancel}>
      <div className="settings-sheet pd-gate" role="dialog" aria-modal="true" aria-label={t.gateTitle} onClick={(e) => e.stopPropagation()}>
        <h2 className="settings-title">👪 {t.gateTitle}</h2>
        <p className="pd-gate-q">
          {t.gateQuestion(q.a, q.b)}
        </p>
        <input
          className="profile-name-input"
          inputMode="numeric"
          autoFocus
          value={value}
          onChange={(e) => {
            setValue(e.target.value.replace(/\D/g, '').slice(0, 4));
            setWrong(false);
          }}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          aria-label={t.gateQuestion(q.a, q.b)}
        />
        {wrong && <div className="ac-wrong">{t.gateWrong}</div>}
        <button type="button" className="profile-primary" onClick={submit} disabled={!value}>
          {t.gateGo}
        </button>
        <button type="button" className="profile-secondary" onClick={onCancel}>
          {t.close}
        </button>
      </div>
    </div>,
    document.body,
  );
}

// ---------- helpers ----------

const pct = (v: number | null) => (v === null ? '–' : `${Math.round(v * 100)}%`);
const secs = (ms: number | null) => (ms === null ? '–' : (ms / 1000).toFixed(1));

function readProgress(id: string): Progress | null {
  try {
    const raw = localStorage.getItem(progressKeyFor(id));
    return raw ? (JSON.parse(raw) as Progress) : null;
  } catch {
    return null;
  }
}

type Direction = 'up' | 'down';
/** change vs the previous period, judged good or bad by which way is better */
function Delta({ now, before, better, format, t }: { now: number | null; before: number | null | undefined; better: Direction; format: (d: number) => string; t: P }) {
  if (now === null || before === null || before === undefined) return null;
  const d = now - before;
  if (Math.abs(d) < 1e-9) return null;
  const good = better === 'up' ? d > 0 : d < 0;
  return (
    <span className="pd-delta">
      {/* the arrow carries good/bad colour; the words say it too */}
      <span className={`pd-delta-mark ${good ? 'is-good' : 'is-bad'}`}>{d > 0 ? '▲' : '▼'}</span> {format(Math.abs(d))}{' '}
      <span className="pd-delta-ctx">
        {good ? t.better : t.worse} {t.vsPrevious}
      </span>
    </span>
  );
}

function StatTile({ label, value, hint, delta }: { label: string; value: string; hint: string; delta?: React.ReactNode }) {
  return (
    <div className="pd-tile">
      <div className="pd-tile-label">{label}</div>
      <div className="pd-tile-value">{value}</div>
      <div className="pd-tile-hint">{hint}</div>
      {delta}
    </div>
  );
}

function consistencyWord(sd: number | null, t: P) {
  if (sd === null) return t.notEnough;
  if (sd < 8) return t.steadyVery;
  if (sd < 15) return t.steadyFair;
  return t.steadyUpDown;
}

function Card({ title, legend, children, table }: { title: string; legend?: React.ReactNode; children: React.ReactNode; table: React.ReactNode }) {
  const t = useT().parents;
  const [showTable, setShowTable] = useState(false);
  return (
    <section className="pd-card">
      <div className="pd-card-head">
        <h3 className="pd-card-title">{title}</h3>
        <button type="button" className="pd-link" onClick={() => setShowTable((v) => !v)}>
          {showTable ? t.hideTable : t.showTable}
        </button>
      </div>
      {legend}
      {showTable ? <div className="pd-table-wrap">{table}</div> : children}
    </section>
  );
}

function DayTable({ days, cols }: { days: Day[]; cols: Array<{ head: string; cell: (d: Day) => string }> }) {
  const t = useT().parents;
  const rows = days.filter((d) => d.answered > 0).reverse();
  return (
    <table className="pd-table">
      <thead>
        <tr>
          <th>{t.colDate}</th>
          {cols.map((c) => (
            <th key={c.head}>{c.head}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((d) => (
          <tr key={d.key}>
            <td>{`${d.date.getDate()}/${d.date.getMonth() + 1}/${d.date.getFullYear()}`}</td>
            {cols.map((c) => (
              <td key={c.head}>{c.cell(d)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ---------- the dashboard ----------

export function ParentDashboard({ onClose }: { onClose: () => void }) {
  const all = useT();
  const t = all.parents;
  const profiles = useProfiles((s) => s.profiles);
  const activeId = useProfiles((s) => s.activeId);
  const [pilotId, setPilotId] = useState(activeId ?? profiles[0]?.id ?? '');
  const [range, setRange] = useState<Range>(7);

  const dash = useMemo(() => {
    const progress = readProgress(pilotId);
    return computeDashboard(readLog(pilotId), progress?.mastery ?? {}, range);
  }, [pilotId, range]);
  const cur: PeriodStats = dash.current;
  const prev = dash.previous;
  const dateOf = (d: Day) => `${d.date.getDate()}/${d.date.getMonth() + 1}`;
  const hasData = dash.totalLogged > 0;
  const fmtFact = (f: string) => f.replace('x', ' × ');

  return createPortal(
    <div className="pd-overlay" role="dialog" aria-modal="true" aria-label={t.title}>
      <div className="pd-panel" dir="auto">
        <header className="pd-header">
          <h2 className="pd-title">👪 {t.title}</h2>
          <button type="button" className="academy-close" onClick={onClose} aria-label={t.close}>
            ✕
          </button>
        </header>

        {/* one filter row, scoping everything below */}
        <div className="pd-filters">
          <div className="pd-pills" role="radiogroup" aria-label="pilot">
            {profiles.map((p) => (
              <button key={p.id} type="button" role="radio" aria-checked={pilotId === p.id} className={`pd-pill ${pilotId === p.id ? 'is-on' : ''}`} onClick={() => setPilotId(p.id)}>
                {p.avatar} {pilotName(p, all.defaultPilotName)}
              </button>
            ))}
          </div>
          <div className="pd-pills" role="radiogroup" aria-label="range">
            {([7, 30, 'all'] as Range[]).map((r) => (
              <button key={String(r)} type="button" role="radio" aria-checked={range === r} className={`pd-pill ${range === r ? 'is-on' : ''}`} onClick={() => setRange(r)}>
                {r === 7 ? t.range7 : r === 30 ? t.range30 : t.rangeAll}
              </button>
            ))}
          </div>
        </div>

        {!hasData ? (
          <p className="pd-empty">{t.empty}</p>
        ) : (
          <>
            <div className="pd-tiles">
              <StatTile
                label={t.accuracy}
                value={pct(cur.accuracy)}
                hint={t.answersCount(cur.answered)}
                delta={<Delta now={cur.accuracy} before={prev?.accuracy} better="up" format={(d) => `${Math.round(d * 100)}${t.unitPts}`} t={t} />}
              />
              <StatTile
                label={t.speed}
                value={cur.medianMs === null ? '–' : `${secs(cur.medianMs)}${t.unitSec}`}
                hint={t.speedHint}
                delta={<Delta now={cur.medianMs} before={prev?.medianMs} better="down" format={(d) => `${(d / 1000).toFixed(1)}${t.unitSec}`} t={t} />}
              />
              <StatTile
                label={t.rushing}
                value={pct(cur.rushRate)}
                hint={t.rushingHint}
                delta={<Delta now={cur.rushRate} before={prev?.rushRate} better="down" format={(d) => `${Math.round(d * 100)}${t.unitPts}`} t={t} />}
              />
              <StatTile
                label={t.consistency}
                value={consistencyWord(cur.consistencySd, t)}
                hint={`${t.consistencyHint(cur.daysPracticed)}${cur.consistencySd !== null ? ` · ±${Math.round(cur.consistencySd)}${t.unitPts}` : ''}`}
                delta={<Delta now={cur.consistencySd} before={prev?.consistencySd} better="down" format={(d) => `${Math.round(d)}${t.unitPts}`} t={t} />}
              />
              <StatTile label={t.mastered} value={`${dash.mastered} / 55`} hint={t.masteredHint(dash.practice, dash.untried)} />
            </div>

            <div className="pd-grid">
              <Card
                title={t.chartAccuracy}
                table={<DayTable days={dash.days} cols={[{ head: t.colAnswered, cell: (d) => String(d.answered) }, { head: t.colAccuracy, cell: (d) => pct(d.accuracy) }]} />}
              >
                <LineChart
                  days={dash.days}
                  value={(d) => d.accuracy}
                  yMax={1}
                  yTicks={[0, 0.5, 1]}
                  yFormat={(v) => `${Math.round(v * 100)}%`}
                  tooltip={(d) => t.tipAccuracy(dateOf(d), Math.round((d.accuracy ?? 0) * 100), d.answered)}
                  label={t.chartAccuracy}
                />
              </Card>
              <Card
                title={t.chartAnswers}
                legend={
                  <div className="pd-legend">
                    <span><i className="pd-swatch is-correct" /> {t.legendCorrect}</span>
                    <span><i className="pd-swatch is-wrong" /> {t.legendWrong}</span>
                  </div>
                }
                table={<DayTable days={dash.days} cols={[{ head: t.colCorrect, cell: (d) => String(d.correct) }, { head: t.legendWrong, cell: (d) => String(d.wrong) }]} />}
              >
                <StackedBars days={dash.days} tooltip={(d) => t.tipAnswers(dateOf(d), d.correct, d.wrong)} label={t.chartAnswers} />
              </Card>
              <Card
                title={t.chartSpeed}
                table={<DayTable days={dash.days} cols={[{ head: t.colSpeed, cell: (d) => (d.medianMs === null ? '–' : `${secs(d.medianMs)}${t.unitSec}`) }]} />}
              >
                <LineChart
                  days={dash.days}
                  value={(d) => (d.medianMs === null ? null : d.medianMs / 1000)}
                  yMax={Math.max(6, ...dash.days.map((d) => (d.medianMs ?? 0) / 1000)) }
                  yTicks={[0, 3, 6, 9].filter((v) => v <= Math.max(6, ...dash.days.map((d) => (d.medianMs ?? 0) / 1000)))}
                  yFormat={(v) => `${v}s`}
                  tooltip={(d) => t.tipSpeed(dateOf(d), secs(d.medianMs))}
                  label={t.chartSpeed}
                />
              </Card>
              <Card
                title={t.chartRushing}
                table={<DayTable days={dash.days} cols={[{ head: t.colRushing, cell: (d) => pct(d.rushRate) }]} />}
              >
                <LineChart
                  days={dash.days}
                  value={(d) => d.rushRate}
                  yMax={Math.max(0.3, ...dash.days.map((d) => d.rushRate ?? 0))}
                  yTicks={[0, 0.1, 0.2, 0.3]}
                  yFormat={(v) => `${Math.round(v * 100)}%`}
                  tooltip={(d) => t.tipRushing(dateOf(d), Math.round((d.rushRate ?? 0) * 100), d.timed)}
                  label={t.chartRushing}
                />
              </Card>
            </div>

            <div className="pd-lists">
              <section className="pd-card">
                <h3 className="pd-card-title">{t.hardest}</h3>
                {dash.hardest.length === 0 ? (
                  <p className="pd-muted">{t.hardestNone}</p>
                ) : (
                  <ul className="pd-facts">
                    {dash.hardest.map((h) => (
                      <li key={h.fact}>
                        <bdi dir="ltr" className="pd-fact">{fmtFact(h.fact)}</bdi>
                        <span className="pd-meter"><span style={{ width: `${Math.round(h.accuracy * 100)}%` }} /></span>
                        <span className="pd-fact-num">{pct(h.accuracy)} · {t.tries(h.attempts)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <section className="pd-card">
                <h3 className="pd-card-title">{t.improved}</h3>
                {dash.improved.length === 0 ? (
                  <p className="pd-muted">{t.improvedNone}</p>
                ) : (
                  <ul className="pd-facts">
                    {dash.improved.map((h) => (
                      <li key={h.fact}>
                        <bdi dir="ltr" className="pd-fact">{fmtFact(h.fact)}</bdi>
                        <span className="pd-fact-num">
                          <bdi dir="ltr">{pct(h.before)} → {pct(h.after)}</bdi>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>

            <section className="pd-card pd-reading">
              <h3 className="pd-card-title">{t.reading.title}</h3>
              <ul>
                <li><b>{t.accuracy}:</b> {t.reading.accuracy}</li>
                <li><b>{t.speed}:</b> {t.reading.speed}</li>
                <li><b>{t.rushing}:</b> {t.reading.rushing}</li>
                <li><b>{t.consistency}:</b> {t.reading.consistency}</li>
              </ul>
              <p className="pd-muted">{t.note}</p>
            </section>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
