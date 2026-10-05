import type { FactStat } from '../game/types';
import { formatFactKey, getStrugglingFactKeys } from '../game/facts';

interface Props {
  fuelPercent: number;
  bestStreak: number;
  mastery: Record<string, FactStat>;
}

const MAX_LISTED = 3;

// A vertical mercury thermometer instead of a horizontal progress bar — fill
// rises from the bulb at the bottom, which reads as "gauge" rather than
// "website loading bar" and gives the HUD a left-edge anchor point.
export function FuelGauge({ fuelPercent, bestStreak, mastery }: Props) {
  const struggling = fuelPercent >= 100 ? getStrugglingFactKeys(mastery) : [];

  return (
    <div className="fuel-gauge">
      <div className="fuel-gauge-percent">{Math.round(fuelPercent)}%</div>
      <div className="fuel-gauge-tube">
        <div className="fuel-gauge-fill" style={{ height: `${fuelPercent}%` }} />
        <div className="fuel-gauge-tick" style={{ bottom: '25%' }} />
        <div className="fuel-gauge-tick" style={{ bottom: '50%' }} />
        <div className="fuel-gauge-tick" style={{ bottom: '75%' }} />
      </div>
      <div className="fuel-gauge-bulb">
        <div className="fuel-gauge-bulb-core" />
      </div>
      <div className="fuel-gauge-caption">FUEL</div>
      <div className="fuel-gauge-streak">best {bestStreak}</div>

      {struggling.length > 0 && (
        <div className="fuel-gauge-callout">
          🔒 Nail these to launch:
          <br />
          {struggling.slice(0, MAX_LISTED).map(formatFactKey).join(', ')}
          {struggling.length > MAX_LISTED && ` +${struggling.length - MAX_LISTED} more`}
        </div>
      )}
    </div>
  );
}
