import { useEffect, useRef, useState } from 'react';
import { sfx } from '../../audio/sfx';
import { haptics } from '../../audio/haptics';
import { plateTint } from './plates';

// The cockpit's controls. Underneath each one is a real radio group, switch,
// slider or button (for keyboards and screen readers); on top it's dressed
// as a lever, a knob, a toggle switch or a throttle, heavy 16-bit hardware,
// and it clunks and clicks.

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** a module's neon: what its plate and lights glow */
export type Tone = 'cyan' | 'orange' | 'magenta';

/** the light of something passing by outside, on a plate (passingLight.ts): lighting its edge towards it, and the shadow it casts */
export function PlateLight({ cast = true }: { cast?: boolean }) {
  return (
    <>
      {cast && <span className="ck-cast" aria-hidden />}
      <span className="ck-shade" aria-hidden />
    </>
  );
}

/**
 * a module of the dashboard: an armour-plated sub-module (a thick steel
 * frame, or hazard stripes round it), its name stencilled on a plate, the
 * control, and a little screen saying what it does
 */
export function Module({
  label,
  screen,
  tone = 'cyan',
  hazard = false,
  plate = 0,
  className = '',
  children,
}: {
  label: string;
  screen?: React.ReactNode;
  tone?: Tone;
  hazard?: boolean;
  /** which plate it is: its paint (plateTint) */
  plate?: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`ck-module is-${tone} ${hazard ? 'is-hazard' : ''} ${className}`} style={plateTint(plate)}>
      <PlateLight />
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
  onLift,
}: {
  name: string;
  liftLabel: string;
  lowerLabel: string;
  onPress: () => void;
  /** the cover lifted */
  onLift?: () => void;
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
          if (!open) onLift?.();
          setOpen(!open);
        }}
      >
        <span className="ck-cover-face" />
      </button>
    </div>
  );
}

/** the lever's locking teeth along its slider, and how far the grip travels up it (px: it follows the finger); how long it takes to ratchet all the way up when tapped, and to slam home before flying */
const TEETH = 7;
const TRAVEL = 92;
const RATCHET_MS = 420;
const SLAM_MS = 560;

/**
 * The hyperdrive lever, back to the flight: an industrial hydraulics
 * control, its grip on a stick coming up out of a worn rubber gaiter, riding
 * a slider with metal locking teeth along it, in an armour-plated housing
 * with glowing conduits feeding it. Push the grip forward (drag it up) and
 * it ratchets up a tooth at a time, clicking; let go and the teeth hold it
 * where it is; at the top it locks home with a clunk, the conduits blaze,
 * and off you go. A tap (or Enter, Space, the up arrow) runs it up by
 * itself. Underneath, a button.
 */
export function HyperdriveLever({
  label,
  name,
  go,
  push,
  calm,
  onLaunch,
}: {
  /** what it does, for screen readers (back to the flight) */
  label: string;
  /** what's on its plates */
  name: string;
  go: string;
  push: string;
  calm: boolean;
  /** once it's locked home */
  onLaunch: () => void;
}) {
  // how far up the slider it is (0 back … 1 home), and whether it's locked home
  const [throw_, setThrow] = useState(0);
  const [fired, setFired] = useState(false);
  const [held, setHeld] = useState(false);
  const at = useRef(0);
  /** the tooth it's held at */
  const tooth = useRef(0);
  // (k: how big it's drawn, smaller on a short screen, so a push goes as far as it looks)
  const drag = useRef<{ y: number; from: number; moved: boolean; k: number } | null>(null);
  const run = useRef(0);
  // (fired once, however many moves get there before it re-renders)
  const done = useRef(false);
  useEffect(() => () => cancelAnimationFrame(run.current), []);

  const fire = () => {
    if (done.current) return;
    done.current = true;
    cancelAnimationFrame(run.current);
    setFired(true);
    at.current = 1;
    setThrow(1);
    sfx.hyperdrive();
    haptics.correct();
    window.setTimeout(onLaunch, calm ? 0 : SLAM_MS);
  };
  /** to here (0..1): past each tooth a click, and at the top it fires; it can't go back below the tooth holding it */
  const moveTo = (k: number) => {
    const next = Math.max(tooth.current / TEETH, clamp01(k));
    const t = Math.floor(next * TEETH + 1e-6);
    if (t > tooth.current) {
      tooth.current = t;
      sfx.knob();
      haptics.tick();
    }
    at.current = next;
    setThrow(next);
    if (t >= TEETH) fire();
  };
  /** a tap: up it goes by itself, tooth by tooth */
  const ratchet = () => {
    if (done.current) return;
    if (calm) {
      fire();
      return;
    }
    const from = at.current;
    const start = performance.now();
    cancelAnimationFrame(run.current);
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / RATCHET_MS);
      moveTo(from + (1 - from) * k * k);
      if (k < 1 && !done.current) run.current = requestAnimationFrame(step);
    };
    run.current = requestAnimationFrame(step);
  };

  return (
    <button
      type="button"
      className={`ck-hyper ${fired ? 'is-fired' : ''} ${held ? 'is-held' : ''}`}
      aria-label={label}
      style={{ '--throw': throw_, '--travel': `${TRAVEL}px` } as React.CSSProperties}
      onPointerDown={(e) => {
        if (done.current) return;
        cancelAnimationFrame(run.current);
        const el = e.currentTarget;
        drag.current = { y: e.clientY, from: at.current, moved: false, k: el.getBoundingClientRect().height / (el.offsetHeight || 1) || 1 };
        setHeld(true);
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d || !e.currentTarget.hasPointerCapture(e.pointerId)) return;
        if (Math.abs(d.y - e.clientY) > 6) d.moved = true;
        if (d.moved) moveTo(d.from + (d.y - e.clientY) / (TRAVEL * d.k));
      }}
      onPointerUp={() => {
        const d = drag.current;
        drag.current = null;
        setHeld(false);
        if (!d || done.current) return;
        // a tap runs it up; a push leaves it held by its teeth, settling onto the last one
        if (!d.moved) ratchet();
        else {
          at.current = tooth.current / TEETH;
          setThrow(at.current);
        }
      }}
      onPointerCancel={() => {
        drag.current = null;
        setHeld(false);
      }}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowUp') return;
        e.preventDefault();
        moveTo((tooth.current + 1) / TEETH);
      }}
      onClick={(e) => {
        // (a keyboard's Enter or Space; a pointer's tap has done it already)
        if (e.detail === 0) ratchet();
      }}
    >
      <span className="ck-hyper-conduits" aria-hidden>
        <svg viewBox="0 0 300 200" preserveAspectRatio="none">
          <path className="is-cyan" d="M0 150 C40 150 40 96 74 96" />
          <path className="is-magenta" d="M300 150 C260 150 260 96 226 96" />
          <path className="is-cyan is-low" d="M0 176 C50 176 46 132 74 132" />
          <path className="is-magenta is-low" d="M300 176 C250 176 254 132 226 132" />
        </svg>
      </span>
      <span className="ck-hyper-housing" aria-hidden>
        <span className="ck-hyper-bolts" />
        <span className="ck-hyper-bulbs is-l">
          {Array.from({ length: 6 }, (_, i) => (
            <i key={i} style={{ '--i': i } as React.CSSProperties} />
          ))}
        </span>
        <span className="ck-hyper-base">
          <span className="ck-hyper-go">{go}</span>
          <span className="ck-hyper-track">
            <span className="ck-hyper-teeth is-l" />
            <span className="ck-hyper-slot" />
            <span className="ck-hyper-teeth is-r" />
            <span className="ck-hyper-carriage">
              <span className="ck-hyper-stick">
                <span className="ck-hyper-grip">
                  <span className="ck-hyper-thumb" />
                </span>
              </span>
              <span className="ck-hyper-gaiter" />
              <span className="ck-hyper-collar" />
            </span>
          </span>
        </span>
        <span className="ck-hyper-bulbs is-r">
          {Array.from({ length: 6 }, (_, i) => (
            <i key={i} style={{ '--i': i } as React.CSSProperties} />
          ))}
        </span>
      </span>
      <span className="ck-hyper-plate" aria-hidden>
        {name}
      </span>
      {!fired && throw_ === 0 && (
        <span className="ck-hyper-push" aria-hidden>
          ▲ {push}
        </span>
      )}
    </button>
  );
}
