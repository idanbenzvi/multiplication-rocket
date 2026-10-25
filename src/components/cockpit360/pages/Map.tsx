import { useT } from '../../../i18n/useLang';
import { useGameStore } from '../../../game/useGameStore';
import { masterySummary } from '../../../game/masteryStats';
import { dayNumber } from '../../../game/memory';
import { useMission } from '../../../profiles/useProfiles';
import { MasteryMap } from '../../MasteryHeatmap';
import Counter from '../../reactbits/Counter';

// The console screen under the windscreen: the practice map (Stop & Review's,
// MasteryHeatmap.tsx), every fact the pilot's working on, green as they've
// got it, amber when it's time for a check, red while they're practising it,
// with the counts rolling up beside it.

export function MapPage() {
  const t = useT();
  const mission = useMission();
  const mastery = useGameStore((s) => s.progress.mastery);
  const summary = masterySummary(mastery, mission, dayNumber());
  const counts = [
    { key: 'mastered', n: summary.mastered, name: t.deck.legend.mastered },
    { key: 'fading', n: summary.fading, name: t.deck.legend.fading },
    { key: 'practice', n: summary.practice, name: t.deck.legend.practice },
    { key: 'untried', n: summary.untried, name: t.deck.legend.untried },
  ];
  return (
    <div className="ck3-page ck3-map">
      <div className="ck3-map-grid">
        <MasteryMap mastery={mastery} mission={mission} />
      </div>
      <ul className="ck3-map-counts">
        {counts.map((c) => (
          <li key={c.key} className={`is-${c.key}`}>
            <b dir="ltr">
              <Counter value={c.n} fontSize={34} textColor="currentColor" fontWeight={800} />
            </b>
            <span>{c.name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
