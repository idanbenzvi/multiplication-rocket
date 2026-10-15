import { useEffect, useRef, useState } from 'react';
import { sfx } from '../../audio/sfx';
import { haptics } from '../../audio/haptics';

// The cockpit's controls. Underneath each one is a real radio group, switch,
// slider or button (for keyboards and screen readers); on top it's dressed
// as a lever, a knob, a toggle switch or a throttle, and it clunks and clicks.

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** a module of the dashboard: a plate with its engraved name, the control, and a little screen saying what it does */
export function Module({
  label,
  screen,
  className = '',
  children,
}: {
  label: string;
  screen?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`ck-module ${className}`}>
      <h3 className="ck-label">{label}</h3>
      <div className="ck-body">{children}</div>
      {screen != null && <div className="ck-screen">{screen}</div>}
    </section>
  );
}

export interface Choice<T> {
  value: T;
  name: string;
}

/**
 * Two choices, one either side of a lever that swings over to the one that's
 * on (or a knob that turns to point at it). Tap a choice, tap the lever to
 * throw it over, or drag it across.
 */
export function Selector<T extends string>({
  kind,
  label,
  choices,
  value,
  onChange,
  rtl,
}: {
  kind: 'lever' | 'knob';
  label: string;
  choices: [Choice<T>, Choice<T>];
  value: T;
  onChange: (v: T) => void;
  rtl: boolean;
}) {
  const on = choices[1].value === value ? 1 : 0;
  // the first choice is on the reading side: the left, or the right in Hebrew
  const leftIndex = rtl ? 1 : 0;
  const tilt = on === leftIndex ? -1 : 1;
  const dragFrom = useRef<number | null>(null);

  const choose = (j: number) => {
    if (j === on) return;
    if (kind === 'lever') sfx.clunk(j === 1);
    else sfx.knob();
    haptics.tick();
    onChange(choices[j].value);
  };

  const choice = (j: number) => (
    <button
      type="button"
      role="radio"
      aria-checked={on === j}
      className={`ck-choice ${on === j ? 'is-on' : ''}`}
      onClick={() => choose(j)}
    >
      <span className="ck-lamp" aria-hidden />
      <span className="ck-choice-name">{choices[j].name}</span>
    </button>
  );

  return (
    <div className={`ck-selector ck-selector--${kind}`} role="radiogroup" aria-label={label}>
      {choice(0)}
      <div
        className="ck-pivot"
        aria-hidden
        onPointerDown={(e) => {
          dragFrom.current = e.clientX;
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerUp={(e) => {
          if (dragFrom.current === null) return;
          const dx = e.clientX - dragFrom.current;
          dragFrom.current = null;
          // dragged across: to that side; a tap throws it over
          if (Math.abs(dx) > 12) choose(dx < 0 ? leftIndex : 1 - leftIndex);
          else choose(1 - on);
        }}
        onPointerCancel={() => (dragFrom.current = null)}
      >
        {kind === 'lever' ? (
          <>
            <span className="ck-lever-gate" />
            <span className="ck-lever-arm" style={{ rotate: `${tilt * 34}deg` }}>
              <span className="ck-lever-ball" />
            </span>
            <span className="ck-lever-boot" />
          </>
        ) : (
          <>
            <span className="ck-knob-dial" />
            <span className="ck-knob" style={{ rotate: `${tilt * 55}deg` }}>
              <span className="ck-knob-pointer" />
            </span>
          </>
        )}
      </div>
      {choice(1)}
    </div>
  );
}

/** an aircraft toggle switch, with a light that's green when it's on (its module shows its name) */
export function Toggle({
  name,
  on,
  onChange,
  onWord,
  offWord,
}: {
  name: string;
  on: boolean;
  onChange: (on: boolean) => void;
  onWord: string;
  offWord: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={name}
      className={`ck-toggle ${on ? 'is-on' : ''}`}
      onClick={() => {
        sfx.clunk(!on);
        haptics.tick();
        onChange(!on);
      }}
    >
      <span className="ck-led" aria-hidden />
      <span className="ck-toggle-plate" aria-hidden>
        <span className="ck-toggle-word">{onWord}</span>
        <span className="ck-toggle-nut">
          <span className="ck-toggle-bat" />
        </span>
        <span className="ck-toggle-word">{offWord}</span>
      </span>
    </button>
  );
}

const STEP = 0.05;

/** a throttle lever for a volume: slide its grip up and down, with a row of lights showing how loud */
export function Throttle({
  name,
  icon,
  value,
  onChange,
  onRelease,
}: {
  name: string;
  icon: string;
  value: number;
  onChange: (v: number) => void;
  /** let go of it (or a key changed it): e.g. play a sound at the new volume */
  onRelease?: () => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const notch = useRef(Math.round(value * 10));
  const pct = Math.round(value * 100);

  const set = (v: number) => {
    const next = Math.round(clamp01(v) / STEP) / (1 / STEP);
    // a click at every tenth on the way
    const n = Math.round(next * 10);
    if (n !== notch.current) {
      notch.current = n;
      sfx.knob();
    }
    onChange(next);
  };
  const fromPointer = (clientY: number) => {
    const track = trackRef.current;
    if (!track) return;
    const r = track.getBoundingClientRect();
    // the grip's middle follows the finger, within the slot's ends
    const pad = 14;
    set(1 - (clientY - r.top - pad) / Math.max(1, r.height - pad * 2));
  };

  return (
    <div className="ck-throttle">
      <div
        ref={trackRef}
        className="ck-throttle-track"
        role="slider"
        tabIndex={0}
        aria-label={name}
        aria-orientation="vertical"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-valuetext={`${pct}%`}
        style={{ '--v': value } as React.CSSProperties}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          fromPointer(e.clientY);
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) fromPointer(e.clientY);
        }}
        onPointerUp={() => onRelease?.()}
        onKeyDown={(e) => {
          const by: Record<string, number> = { ArrowUp: STEP, ArrowRight: STEP, ArrowDown: -STEP, ArrowLeft: -STEP, PageUp: 0.2, PageDown: -0.2 };
          if (e.key in by) set(value + by[e.key]);
          else if (e.key === 'Home') set(0);
          else if (e.key === 'End') set(1);
          else return;
          e.preventDefault();
          onRelease?.();
        }}
      >
        <span className="ck-throttle-slot" aria-hidden />
        <span className="ck-throttle-grip" aria-hidden />
      </div>
      <div className="ck-meter" aria-hidden>
        {Array.from({ length: 10 }, (_, i) => (
          <span key={i} className={`ck-meter-cell ${value * 10 > i + 0.01 ? 'is-lit' : ''}`} />
        ))}
      </div>
      <div className="ck-throttle-name">
        <span aria-hidden>{icon}</span> {name}
      </div>
    </div>
  );
}

/** a big illuminated push button (its module shows its name) */
export function PushButton({ icon, name, onPress }: { icon: string; name: string; onPress: () => void }) {
  return (
    <button
      type="button"
      className="ck-push"
      aria-label={name}
      onClick={() => {
        sfx.clunk(true);
        haptics.tick();
        onPress();
      }}
    >
      <span className="ck-push-cap" aria-hidden>
        {icon}
      </span>
    </button>
  );
}

/** a red button under a striped safety cover: lift the cover first (it drops back by itself after a while) */
export function GuardedButton({
  name,
  liftLabel,
  lowerLabel,
  onPress,
}: {
  name: string;
  liftLabel: string;
  lowerLabel: string;
  onPress: () => void;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      setOpen(false);
      sfx.clunk(false);
    }, 6000);
    return () => window.clearTimeout(t);
  }, [open]);

  return (
    <div className={`ck-guard ${open ? 'is-open' : ''}`}>
      <button
        type="button"
        className="ck-red"
        tabIndex={open ? 0 : -1}
        aria-hidden={!open}
        onClick={() => {
          setOpen(false);
          onPress();
        }}
      >
        {name}
      </button>
      <button
        type="button"
        className="ck-cover"
        aria-expanded={open}
        aria-label={open ? lowerLabel : liftLabel}
        title={open ? lowerLabel : liftLabel}
        onClick={() => {
          sfx.clunk(!open);
          haptics.tick();
          setOpen(!open);
        }}
      >
        <span className="ck-cover-face" />
      </button>
    </div>
  );
}
