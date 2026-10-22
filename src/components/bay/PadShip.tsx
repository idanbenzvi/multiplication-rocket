import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { LaserFlow, type Beam } from '../reactbits/LaserFlow';
import { ShipPicture } from '../ShipPicture';
import { shipArt } from '../scene/ships';
import { rasterizeSprite } from '../scene/spriteTexture';
import { TrafficPlume } from '../traffic/trafficPlume';
import { engineHum, sfx } from '../../audio/sfx';
import { haptics } from '../../audio/haptics';
import { LAMP, PAD, SHIP_HEIGHT, type BayLayout } from './layout';
import { launchDone, padEngine, PAD_IDLE, type Launch, type PadShipSpec } from './useBay';
import { ShipDissolve, type Departure } from './ShipDissolve';

interface Props {
  /** the ship asked for on the pad (none: an empty pad) */
  spec: PadShipSpec | null;
  launch: Launch | null;
  layout: BayLayout;
  /** reduced motion: ships just appear and go */
  calm: boolean;
}

type Phase = 'empty' | 'in' | 'idle' | 'out' | 'launch' | 'gone';

/** the beam's box: from just under the lamp down past the pad (picture px) */
const BEAM = { x0: PAD.x - 160, x1: PAD.x + 160, y0: LAMP.y + 4, y1: 300 };
/** how long a ship flares away (its last blocks still rising as the next is beamed down), and beams in (till the beam's faded) */
const OUT_MS = 900;
const IN_MS = 2300;

/** the take-off (s from the tap): the engine lights, the ship lifts off slowly, then climbs away out of the top */
const LIFT_AT = 0.8;
const CLIMB_FOR = 2.8;
/** how far it climbs, picture px: well out of the top, its plume too */
const CLIMB = 520;
const GONE_AT = LIFT_AT + CLIMB_FOR;
/** and the bay leaves, once it's gone and the pad's smoke is settling */
const LAUNCH_S = GONE_AT + 0.9;

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const smooth = (v: number) => {
  const x = clamp(v);
  return x * x * (3 - 2 * x);
};
const same = (a: PadShipSpec | null, b: PadShipSpec | null) => a?.ship === b?.ship;

// the plume's colour by power, as the game's (scene/plume.ts), for the glow round it here (the game's comes from its bloom)
const COLD = [106, 215, 255];
const WARM = [177, 140, 255];
const HOT = [255, 106, 213];
const GOLD_COLD = [255, 215, 122];
const GOLD_WARM = [255, 169, 77];
const GOLD_HOT = [255, 244, 208];
function plumeColour(s: number, gold: boolean, alpha: number) {
  const k = Math.min(s / 0.9, 1);
  const [a, b, f] = k < 0.5 ? [gold ? GOLD_COLD : COLD, gold ? GOLD_WARM : WARM, k * 2] : [gold ? GOLD_WARM : WARM, gold ? GOLD_HOT : HOT, (k - 0.5) * 2];
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * f));
  return `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${alpha.toFixed(3)})`;
}

/** the engine's power (the game's plume: 0 idle … 1.3 flat out) at `t` s into the take-off */
function power(t: number) {
  if (t < LIFT_AT) return 0.38 * smooth(t / LIFT_AT);
  if (t < 1.8) return 0.38 + 0.3 * smooth((t - LIFT_AT) / (1.8 - LIFT_AT));
  return 0.68 + 0.6 * smooth((t - 1.8) / 1.4);
}

// The ship standing on the launch pad, in the bay's picture. Changing ships,
// the one there glows white-hot, flares like a lens catching the sun and
// comes apart in dithered blocks rising into the lamp (ShipDissolve); then a beam drops from the lamp in the ceiling onto the pad (React
// Bits' LaserFlow) and the next ship appears from the top down as it falls,
// glowing as it lands and settling. Launching, its engine lights with the
// game's own plume, the pad's jets roar and the ship lifts off slowly, then
// climbs away out of the top.
export function PadShip({ spec, launch, layout, calm }: Props) {
  const { u } = layout;
  const [shown, setShown] = useState<PadShipSpec | null>(null);
  const [phase, setPhase] = useState<Phase>('empty');
  const [beamKey, setBeamKey] = useState(0);
  // ships leaving, block by block (a quick change can have two at once)
  const [leaving, setLeaving] = useState<Departure[]>([]);
  /** the ship on the pad as drawn there, ready to come apart */
  const snapshot = useRef<{ of: PadShipSpec; image: HTMLCanvasElement; dpr: number } | null>(null);
  const phaseRef = useRef(phase);
  useEffect(() => {
    phaseRef.current = phase;
  });

  // what's asked for, against what's there
  useEffect(() => {
    if (launch || phase === 'launch' || phase === 'gone' || phase === 'out') return;
    if (same(spec, shown)) {
      // the same ship, another pilot or colour: just so
      if (spec && shown && spec !== shown) setShown(spec);
      return;
    }
    if (shown) {
      if (!calm) {
        sfx.flareOut();
        const snap = snapshot.current;
        if (snap?.of === shown) {
          const { image, dpr } = snap;
          const w = image.width / dpr;
          const h = image.height / dpr;
          setLeaving((l) => [...l, { id: performance.now(), image, dpr, left: PAD.x * u - w / 2, top: PAD.y * u - h, width: w, height: h }]);
        }
      }
      setPhase('out');
    } else if (spec) {
      setShown(spec);
      setPhase('in');
      setBeamKey((k) => k + 1);
      if (!calm) sfx.beamDown();
    }
  }, [spec, shown, phase, launch, calm, u]);

  useEffect(() => {
    if (phase === 'out') {
      const t = window.setTimeout(
        () => {
          setShown(null);
          setPhase('empty');
        },
        calm ? 0 : OUT_MS,
      );
      return () => window.clearTimeout(t);
    }
    if (phase === 'in') {
      const t = window.setTimeout(() => setPhase('idle'), calm ? 0 : IN_MS);
      return () => window.clearTimeout(t);
    }
  }, [phase, calm]);

  // launching: the ship on the pad takes off
  useEffect(() => {
    if (launch) setPhase('launch');
  }, [launch]);

  const art = useMemo(() => (shown ? shipArt(shown.ship, shown.accent, false, shown.admiral) : null), [shown]);
  const [bx, by, bw, bh] = art?.bounds ?? [0, 0, 1, 1];
  const height = SHIP_HEIGHT * u;
  const width = (height * bw) / bh;
  // the nozzle, in the ship's box: the frame's middle across, and its own height
  const nozzleX = ((100 - bx) / bw) * width;
  const nozzleY = (((art?.nozzle ?? 0) - by) / bh) * height;
  // the plume as wide as in the game, for the ship's width (its frame is 200 wide, the sprite 1.1)
  const frameW = (200 / bw) * width;

  // the ship as it's drawn on the pad, on a canvas, for it to come apart when it leaves
  useEffect(() => {
    if (!shown || !art || calm) return;
    let alive = true;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const fw = Math.round(frameW * dpr);
    const window0 = art.windows[0];
    rasterizeSprite(art.svg, fw, fw * 2, shown.avatar ? { ...window0, emoji: shown.avatar } : undefined, art.picture)
      .then((frame) => {
        if (!alive) return;
        const image = document.createElement('canvas');
        image.width = Math.round(width * dpr);
        image.height = Math.round(height * dpr);
        // (just the ship: its bounds in the frame, as on the pad)
        image.getContext('2d')?.drawImage(frame, (bx / 200) * fw, (by / 400) * fw * 2, (bw / 200) * fw, (bh / 400) * fw * 2, 0, 0, image.width, image.height);
        snapshot.current = { of: shown, image, dpr };
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [shown, art, calm, frameW, width, height, bx, by, bw, bh]);

  const wrap = useRef<HTMLDivElement>(null);
  const picture = useRef<HTMLDivElement>(null);
  const scan = useRef<HTMLDivElement>(null);
  const lamp = useRef<HTMLDivElement>(null);
  const plumeBox = useRef<HTMLDivElement>(null);
  const glow = useRef<HTMLDivElement>(null);
  const blast = useRef<HTMLDivElement>(null);

  // the beam falling: the ship appears down to its front, glowing like a hologram till it lands
  const onBeam = (beam: Beam) => {
    if (phaseRef.current !== 'in') return;
    const art = picture.current;
    if (!art) return;
    const y = BEAM.y0 + beam.front / u;
    const reveal = clamp((y - (PAD.y - SHIP_HEIGHT)) / SHIP_HEIGHT);
    const holo = 1 - clamp(beam.bloom);
    art.style.clipPath = `inset(0 0 ${((1 - reveal) * 100).toFixed(2)}% 0)`;
    art.style.filter = `brightness(${(1 + 0.8 * holo + 2.6 * beam.flash).toFixed(3)}) saturate(${(1 - 0.45 * holo).toFixed(3)}) drop-shadow(0 0 ${((3 + 9 * holo + 14 * beam.flash) * u).toFixed(1)}px rgba(140, 205, 255, ${(0.3 + 0.55 * holo).toFixed(3)}))`;
    if (scan.current) {
      scan.current.style.top = `${(reveal * 100).toFixed(2)}%`;
      scan.current.style.opacity = reveal > 0.001 && reveal < 0.999 ? '1' : '0';
    }
    if (lamp.current) lamp.current.style.opacity = String(clamp(0.35 + 0.65 * holo + beam.flash));
    if (beam.flash > 0.5) haptics.tick();
  };
  // (once the ship's there, it's itself)
  useEffect(() => {
    if (phase === 'in') return;
    for (const el of [picture.current, scan.current, lamp.current]) el?.removeAttribute('style');
  }, [phase]);

  // the take-off
  useEffect(() => {
    if (phase !== 'launch') return;
    const ship = wrap.current;
    const stage = ship?.closest<HTMLElement>('.bay-stage');
    const plume = calm || !shown ? null : TrafficPlume.create(!!shown.admiral);
    if (plume) {
      plume.canvas.className = 'pad-plume-canvas';
      plumeBox.current?.append(plume.canvas);
    }
    const start = performance.now();
    const cues = new Set<string>();
    const cue = (name: string, at: number, t: number, fn: () => void) => {
      if (t >= at && !cues.has(name)) {
        cues.add(name);
        fn();
      }
    };
    let raf = 0;
    const frame = (now: number) => {
      const t = (now - start) / 1000;
      if (calm) {
        if (ship) ship.style.opacity = String(1 - clamp(t / 0.8));
      } else {
        cue('ignite', 0, t, () => engineHum(0.5, 0.6));
        cue('lift', LIFT_AT - 0.05, t, () => {
          sfx.blastOff();
          haptics.tick();
          engineHum(1, 1.6);
          // ignition: a white-hot flash and a shockwave out of the nozzle
          ship?.classList.add('is-lit');
        });
        cue('away', GONE_AT - 0.6, t, () => engineHum(0, 1.4));
        const s = power(t);
        const rise = t < LIFT_AT ? 0 : CLIMB * Math.pow((t - LIFT_AT) / CLIMB_FOR, 2.6);
        // the whole bay trembles as the engine lights and the ship lifts, less as it climbs away
        const quake = (t < 0.15 ? t / 0.15 : 1) * Math.max(0, 1 - Math.max(0, t - 1.4) / 1.6) * (t < GONE_AT ? 1 : 0);
        const jx = (Math.random() - 0.5) * 1.6 * quake;
        const jy = (Math.random() - 0.5) * 1.2 * quake;
        if (ship) ship.style.transform = `translate(${(jx * u * 0.4).toFixed(2)}px, ${(-rise * u).toFixed(2)}px)`;
        if (stage) stage.style.translate = `${(jx * u * 0.25).toFixed(2)}px ${(jy * u * 0.25).toFixed(2)}px`;
        const gold = !!shown?.admiral;
        if (plume) {
          const box = plumeBox.current;
          const w = (1.25 * frameW * (0.95 + 0.5 * s)) / 1.1;
          const h = w * 3 * (1 + 0.35 * s);
          // (its glow, as the game's bloom gives it)
          const halo = `drop-shadow(0 0 ${(3 * u).toFixed(1)}px ${plumeColour(s, gold, 0.9)}) drop-shadow(0 0 ${(10 * u).toFixed(1)}px ${plumeColour(s, gold, 0.55)})`;
          // (it stops at the pad, where it's blasting, however high the ship)
          const top = nozzleY - h * 0.1;
          const cut = Math.max(1, height + rise * u - top);
          const stop = `linear-gradient(to bottom, #000 ${Math.max(0, cut - Math.min(14 * u, cut * 0.5)).toFixed(1)}px, transparent ${cut.toFixed(1)}px)`;
          if (box) box.style.cssText = `width:${w.toFixed(1)}px;height:${h.toFixed(1)}px;left:${(nozzleX - w / 2).toFixed(1)}px;top:${top.toFixed(1)}px;opacity:${clamp(t / 0.25).toFixed(3)};filter:brightness(1.35) ${halo};-webkit-mask-image:${stop};mask-image:${stop}`;
          plume.frame(now / 1000, s, 0);
        }
        // the exhaust blasting the pad, spreading over it, till the ship's climbed clear
        if (blast.current) {
          blast.current.style.opacity = String(clamp(t / 0.4) * (1 - smooth((rise - 15) / 70)) * (0.6 + 0.4 * Math.min(1, s)));
          blast.current.style.background = `radial-gradient(ellipse, rgba(255, 255, 255, 0.9), ${plumeColour(s, gold, 0.6)} 30%, ${plumeColour(s, gold, 0.2)} 55%, transparent 72%)`;
        }
        if (glow.current) {
          glow.current.style.opacity = String(clamp(t / 0.3) * (0.55 + 0.45 * Math.min(1, s)));
          glow.current.style.background = `radial-gradient(ellipse, rgba(255, 255, 255, 0.95), ${plumeColour(s, gold, 0.75)} 26%, ${plumeColour(s, gold, 0.3)} 50%, transparent 72%)`;
        }
        // the build-up: an aura round the hull, pulsing faster and faster till it lights
        if (picture.current && t < LIFT_AT + 0.6) {
          const build = t < LIFT_AT ? t / LIFT_AT : 1 - (t - LIFT_AT) / 0.6;
          const pulse = 0.6 + 0.4 * Math.sin(t * (8 + 26 * clamp(t / LIFT_AT)));
          const aura = clamp(build) * pulse;
          picture.current.style.filter = `drop-shadow(0 0 ${(2 + 7 * aura) * u}px ${plumeColour(0.2, gold, 0.85 * aura)}) brightness(${1 + 0.25 * aura})`;
        } else if (picture.current) picture.current.style.filter = '';
        // the pad's jets: all out as the engine lights and the ship lifts off, dying down as it climbs away
        padEngine.thrust = PAD_IDLE + (2 - PAD_IDLE) * smooth((t - 0.15) / 0.7) * (1 - smooth((t - 1.9) / 1.6));
      }
      if (t >= GONE_AT && plume && !cues.has('gone')) {
        cues.add('gone');
        plume.canvas.remove();
      }
      if (t >= LAUNCH_S) {
        launchDone();
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      plume?.dispose();
      plume?.canvas.remove();
      if (stage) stage.style.translate = '';
      padEngine.thrust = PAD_IDLE;
      engineHum(0, 0.4);
    };
    // (the ship, its size and its nozzle are as they were when it lit up)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // after the take-off, the pad's empty till another ship's asked for
  useEffect(() => {
    if (!launch && phase === 'launch') {
      setShown(null);
      setPhase('empty');
    }
  }, [launch, phase]);

  // the lens flare's ghosts, along the line from it through the middle of the screen
  const fx = PAD.x;
  const fy = PAD.y - SHIP_HEIGHT / 2;
  const cx = (layout.vw / 2 - layout.left) / u;
  const cy = (layout.vh / 2 - layout.top) / u;
  const ghost = (k: number): CSSProperties => ({ left: `${(fx + (cx - fx) * k) * u}px`, top: `${(fy + (cy - fy) * k) * u}px` });

  const beaming = phase === 'in';
  return (
    <>
      <div ref={lamp} className={`pad-lamp ${beaming ? 'is-on' : ''}`} style={{ left: LAMP.x * u, top: LAMP.y * u }} aria-hidden="true" />
      {shown && art && phase !== 'gone' && (
        <div
          ref={wrap}
          className={`pad-ship is-${phase} ${phase === 'out' && leaving.length ? 'is-dissolving' : ''}`}
          style={{ left: PAD.x * u - width / 2, top: PAD.y * u - height, width, height }}
        >
          <div ref={plumeBox} className="pad-plume" aria-hidden="true" />
          <div ref={glow} className="pad-engine-glow" style={{ left: nozzleX, top: nozzleY }} aria-hidden="true" />
          <div className="pad-ignite" style={{ left: nozzleX, top: nozzleY }} aria-hidden="true">
            <span className="pad-ignite-flash" />
            <span className="pad-ignite-ring" />
          </div>
          <div ref={picture} className="pad-ship-art">
            <ShipPicture ship={shown.ship} accent={shown.accent} admiral={shown.admiral} avatar={shown.avatar} fit />
          </div>
          <div ref={scan} className="pad-scan" aria-hidden="true" />
        </div>
      )}
      {leaving.map((ship) => (
        <ShipDissolve key={ship.id} ship={ship} u={u} onDone={() => setLeaving((l) => l.filter((s) => s !== ship))} />
      ))}
      {phase === 'launch' && !calm && <div ref={blast} className="pad-blast" style={{ left: PAD.x * u, top: PAD.y * u }} aria-hidden="true" />}
      {/* (over the ship: it appears in the beam's light) */}
      {!calm && (
        <div
          className={`pad-beam ${beaming ? 'is-on' : ''}`}
          style={{ left: BEAM.x0 * u, top: BEAM.y0 * u, width: (BEAM.x1 - BEAM.x0) * u, height: (BEAM.y1 - BEAM.y0) * u }}
          aria-hidden="true"
        >
          <LaserFlow
            introKey={beamKey}
            onFrame={onBeam}
            paused={!beaming}
            mouseInteraction={false}
            beamPosition={0.5}
            surfaceLevel={(PAD.y - BEAM.y0) / (BEAM.y1 - BEAM.y0)}
            intro={false}
            intensity={2.6}
            beamWidth={2.4}
            flare={1.6}
            spread={1}
            fog={0.5}
            dust={1.4}
            dpr={1.5}
          />
        </div>
      )}
      {phase === 'out' && !calm && (
        <div className="pad-flare" style={{ left: fx * u, top: fy * u }} aria-hidden="true">
          <span className="pad-flare-rays" />
          <span className="pad-flare-streak" />
          <span className="pad-flare-core" />
        </div>
      )}
      {phase === 'out' && !calm && (
        <>
          <span className="pad-flare-ghost is-1" style={ghost(0.55)} aria-hidden="true" />
          <span className="pad-flare-ghost is-2" style={ghost(1.15)} aria-hidden="true" />
          <span className="pad-flare-ghost is-3" style={ghost(1.6)} aria-hidden="true" />
        </>
      )}
    </>
  );
}
