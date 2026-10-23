// What the "how does it work?" page's demos are worked with: a slider, and a
// switch.

export function Slider({
  label,
  min,
  max,
  step = 1,
  value,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="how-slider">
      <span className="how-slider-label">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

export function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button type="button" className={`how-toggle ${on ? 'is-on' : ''}`} aria-pressed={on} onClick={() => onChange(!on)}>
      <span className="how-toggle-switch" aria-hidden="true" />
      {label}
    </button>
  );
}
