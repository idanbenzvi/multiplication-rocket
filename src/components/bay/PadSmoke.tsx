import { useEffect, useRef } from 'react';
import { JetSmoke, type Jet } from '../reactbits/JetSmoke';
import { PAD_JETS, SMOKE_BOX } from './layout';
import { PAD_IDLE, padEngine } from './useBay';

interface Props {
  /** screen px for one of the picture's */
  u: number;
}

/** the jets' flames and the smoke, lit by them */
const THRUST = '#7fd4ff';
const SMOKE = '#e9eef7';

// The launch pad's jets, under its rim, firing down at the floor all the
// time, so the smoke billows out from under it and rolls away over the floor
// (React Bits' FlyingButton smoke, reactbits/JetSmoke.ts); as a ship takes
// off they fire all out (padEngine). Its canvas covers the pad and the floor
// round it, its bottom the floor; without WebGL 2 there's no smoke.
export function PadSmoke({ u }: Props) {
  const holder = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const box = holder.current;
    if (!box) return;
    const canvas = document.createElement('canvas');
    canvas.className = 'pad-smoke-canvas';
    box.append(canvas);
    const smoke = JetSmoke.create(canvas);
    if (!smoke) {
      canvas.remove();
      return;
    }
    const width = (SMOKE_BOX.x1 - SMOKE_BOX.x0) * u;
    const height = (SMOKE_BOX.y1 - SMOKE_BOX.y0) * u;
    smoke.resize(width, height, Math.min(window.devicePixelRatio || 1, 1.5));
    // (the jets and their smoke grow with the picture)
    const scale = Math.min(2.2, Math.max(0.8, u * 0.62));
    let raf = 0;
    let last = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (document.hidden) {
        last = 0;
        return;
      }
      const dt = last ? Math.min(1 / 30, (now - last) / 1000) : 0;
      last = now;
      const t = now / 1000;
      const thrust = padEngine.thrust;
      const jets: Jet[] = PAD_JETS.map((j, i) => {
        const len = Math.hypot(j.dx, 1);
        // (each sputters a little on its own)
        const flutter = 1 + 0.12 * Math.sin(t * (5.3 + i * 1.7) + i * 2.1) + 0.06 * Math.sin(t * 13.1 + i);
        return { x: (j.x - SMOKE_BOX.x0) * u, y: (SMOKE_BOX.y1 - j.y) * u, dx: j.dx / len, dy: -1 / len, thrust: thrust * flutter };
      });
      // idling, a little steam rolling out over the floor and thinning away; all out, a great billowing cloud
      const surge = Math.max(0, Math.min(1, (thrust - PAD_IDLE) / (2 - PAD_IDLE)));
      smoke.frame(dt, jets, {
        scale,
        activity: surge,
        smoke: 0.45 + 1.6 * surge,
        turbulence: 1 + 0.5 * surge,
        wind: 3,
        buoyancy: 0.3 + 0.6 * surge,
        fade: 2.2 - 0.9 * surge,
        smokeColor: SMOKE,
        thrustColor: THRUST,
      });
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      smoke.dispose();
      canvas.remove();
    };
  }, [u]);

  return (
    <div
      ref={holder}
      className="pad-smoke"
      style={{ left: SMOKE_BOX.x0 * u, top: SMOKE_BOX.y0 * u, width: (SMOKE_BOX.x1 - SMOKE_BOX.x0) * u, height: (SMOKE_BOX.y1 - SMOKE_BOX.y0) * u }}
      aria-hidden="true"
    />
  );
}
