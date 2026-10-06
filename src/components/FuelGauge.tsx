import type { FactStat } from '../game/types';
import { formatFactKey, getStrugglingFactKeys } from '../game/facts';
import { useT } from '../i18n/useLang';
import CountUp from './reactbits/CountUp';

interface Props {
  fuelPercent: number;
  bestStreak: number;
  mastery: Record<string, FactStat>;
  /** hide the "nail these to launch" note (e.g. the launch gate already passed) */
  hideCallout?: boolean;
}

const MAX_LISTED = 3;

// A vertical mercury thermometer instead of a horizontal progress bar — fill
// rises from the bulb at the bottom, which reads as "gauge" rather than
// "website loading bar" and gives the HUD a left-edge anchor point. It stays
// on the left in Hebrew too: it's a physical instrument, not reading order.
export function FuelGauge({ fuelPercent, bestStreak, mastery, hideCallout = false }: Props) {
  const t = useT();
  const struggling = fuelPercent >= 100 && !hideCallout ? getStrugglingFactKeys(mastery) : [];
  const percent = Math.round(fuelPercent);

  return (
    <div className="fuel-gauge" dir="ltr">
      <div className="fuel-gauge-percent">
        <CountUp to={percent} duration={0.6} />%
      </div>
      <div className="fuel-gauge-tube">
        <div className="fuel-gauge-fill" style={{ height: `${fuelPercent}%` }} />
        <div className="fuel-gauge-tick" style={{ bottom: '25%' }} />
        <div className="fuel-gauge-tick" style={{ bottom: '50%' }} />
        <div className="fuel-gauge-tick" style={{ bottom: '75%' }} />
      </div>
      <div className="fuel-gauge-bulb">
        <div className="fuel-gauge-bulb-core" />
      </div>
      <div className="fuel-gauge-caption">{t.fuel}</div>
      <div className="fuel-gauge-streak">{t.best(bestStreak)}</div>

      {struggling.length > 0 && (
        <div className="fuel-gauge-callout" dir="auto">
          {t.nailTheseToLaunch}
          <br />
          <bdi dir="ltr">{struggling.slice(0, MAX_LISTED).map(formatFactKey).join(', ')}</bdi>
          {struggling.length > MAX_LISTED && ` ${t.more(struggling.length - MAX_LISTED)}`}
        </div>
      )}
    </div>
  );
}
