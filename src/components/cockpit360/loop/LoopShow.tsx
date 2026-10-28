import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { canyonWind, sfx, type Wind } from '../../../audio/sfx';
import { useLang, useT } from '../../../i18n/useLang';
import type { ShipId } from '../../scene/ships';
import { flash, fx, resetFx } from '../canyon/fx';
import { drive, NOSE_PITCH } from '../drive';
import { dirOfLook, project } from '../geometry';
import { glowLights } from '../lights';
import { WINDSCREEN_QUAD } from '../screens';
import { HOME, lookTo, shownLook, shudder, view } from '../view';
import { loopFx, resetLoopFx } from './live';
import { LoopPainter, type PaintState, type Words } from './paint';
import { splitFor, type P2, type Split } from './split';
import { angleAt, BEATS, buildStory, feltG, forcesAt, FROZEN, holdFor, Story, type BeatId } from './story';
import { shipModel } from './wireframe';
import './loop.css';

// The afterburner's loop, the cockpit's easter egg: the orange lever right of
// the stick. Pulled, the cockpit's lights go red and the engines charge, a
// blade's slash cuts the screen in two (split.ts), and a blueprint slides in
// beside the cockpit, which moves over to keep the windscreen in its half.
// The afterburner lights (an impact frame, black and white, ドォン!!) and
// the ship loops the loop (story.ts): out of the windscreen the sky wheels
// round, smeared and streaking, the g pressing the edges of the view dark;
// on the blueprint the ship flies its loop as a wireframe (paint.ts). Four
// times time stops dead, the colour drains from the cockpit, the camera
// drifts round the frozen ship and a narration box explains the force it's
// showing: thrust, the turning force, the seat's 3 G, inertia. A tap goes on
// sooner; Escape (or Skip) ends it. Out of the loop, a ta-daa, and the
// blueprint slides away. With reduced motion there are no impact frames,
// shakes, smears or speed lines, and the panels slide gently.

export interface LoopControl {
  /** a tap: a frozen moment goes on */
  next: () => void;
  /** to the end: the blueprint slides away */
  end: () => void;
}

interface Props {
  calm: boolean;
  low: boolean;
  ship: ShipId;
  /** the pilot's animal, in the wireframe's window */
  avatar: string;
  /** the cockpit's view, moved over to stay framed in its half */
  inner: RefObject<HTMLDivElement | null>;
  control: RefObject<LoopControl | null>;
  onDone: () => void;
}

type SfxKind = 'slash' | 'boom' | 'zoom' | 'shine' | 'done';

/** the sound effects, written as an anime writes them */
const JP: Record<SfxKind, string> = { slash: 'ズバッ', boom: 'ドォン!!', zoom: 'ギュイイン', shine: 'キラッ', done: 'ババーン!' };
/** "the space loop's analysis", under the blueprint's title */
const JP_TITLE = '宇宙ループ解析';

interface Sfx {
  id: number;
  kind: SfxKind;
  x: number;
  y: number;
  rot: number;
  size: number;
}

const DEG = Math.PI / 180;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const easeOutBack = (u: number) => 1 + 2.4 * (u - 1) ** 3 + 1.4 * (u - 1) ** 2;
const easeOut = (u: number) => 1 - (1 - u) ** 3;
const easeIn = (u: number) => u ** 3;

/** where the cut's x is at height y (a screen wider than tall) */
const cutX = (sp: Split, y: number) => sp.a[0] + (sp.b[0] - sp.a[0]) * ((y - sp.a[1]) / (sp.b[1] - sp.a[1]));

export function LoopShow({ calm, low, ship, avatar, inner, control, onDone }: Props) {
  const t = useT();
  const L = t.loop;
  const rtl = useLang((s) => s.lang) === 'he';
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [split, setSplit] = useState(() => splitFor(window.innerWidth, window.innerHeight));
  const [beat, setBeat] = useState<{ id: BeatId; ms: number; key: number } | null>(null);
  const [caption, setCaption] = useState(false);
  const [sfxs, setSfxs] = useState<Sfx[]>([]);
  const words = useRef({ L, rtl, avatar });
  const done = useRef(onDone);
  useEffect(() => {
    words.current = { L, rtl, avatar };
    done.current = onDone;
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const { L: l, rtl: rl } = words.current;
    const holds = Object.fromEntries(BEATS.map((b) => [b.id, holdFor(`${l.beats[b.id].title} ${l.beats[b.id].text}`)])) as Record<BeatId, number>;
    const story = new Story(buildStory(holds));
    control.current = { next: () => story.next(), end: () => story.end() };
    const painter = new LoopPainter(shipModel(ship));
    const paintWords: Words = {
      title: l.title,
      jp: JP_TITLE,
      thrust: l.thrust,
      turn: l.turn,
      velocity: l.velocity,
      seat: l.seat,
      inertia: l.inertia,
      centre: l.centre,
      speed: l.speed,
      kmh: l.kmh,
      angle: l.angle,
      noAir: l.noAir,
      off: l.off,
      rtl: rl,
    };

    // the canvas over the whole cockpit (a little softer than the screen: it's lines and glow)
    let W = 0;
    let H = 0;
    let sp = splitFor(window.innerWidth, window.innerHeight);
    /** how far the cockpit moves over to keep the windscreen in its half */
    let shift: P2 = [0, 0];
    const dpr = Math.min(window.devicePixelRatio || 1, low ? 1 : 1.35);
    const size = () => {
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      sp = splitFor(W, H);
      setSplit(sp);
      const ws = project(WINDSCREEN_QUAD.center, HOME, view.base * 1.1, W / H);
      const at: P2 = ws ? [(ws[0] * 0.5 + 0.5) * W, (0.5 - ws[1] * 0.5) * H] : [W / 2, H / 2];
      // (across on a wide screen, up on a tall one: never opening a gap on the cockpit's own side)
      shift = sp.portrait ? [0, Math.min(0, (sp.cockpit[1] - at[1]) * 0.9)] : [Math.min(0, (sp.cockpit[0] - at[0]) * 0.9), 0];
    };
    size();
    window.addEventListener('resize', size);

    let id = 0;
    const spawn = (kind: SfxKind, at: P2, rot: number, size: number) => {
      setSfxs((list) => [...list, { id: ++id, kind, x: at[0], y: at[1], rot, size }]);
    };
    const min = () => Math.min(W, H);

    // the lever pulled: a clunk, the engines charging, the view widening a little (the anime's fisheye)
    sfx.clunk(true);
    sfx.chargeUp(0.6);
    lookTo({ yaw: 0, pitch: HOME.pitch + 2 * DEG }, view.base * 1.1, 7);
    if (!calm) shudder(0.8);

    let wind: Wind | null = null;
    let raf = 0;
    // (the cockpit, shifted aside to make room: put back as it was at the end)
    let shifted: HTMLDivElement | null = null;
    let last = performance.now();
    let seen = -1;
    let slashAt = -Infinity;
    let lastPitch = 0;

    const enter = (index: number) => {
      const seg = story.segs[index];
      const now = performance.now();
      const c = sp.cockpit;
      if (seg.kind === 'slash') {
        sfx.slash();
        slashAt = now;
        const mid: P2 = [(sp.a[0] + sp.b[0]) / 2 - sp.n[0] * 90, (sp.a[1] + sp.b[1]) / 2 - sp.n[1] * 90];
        spawn('slash', mid, -14, clamp(min() * 0.11, 46, 96));
      } else if (seg.kind === 'split') {
        sfx.whoosh();
      } else if (seg.kind === 'ignite') {
        sfx.ignite();
        spawn('boom', [c[0], c[1] + min() * 0.16], -9, clamp(min() * 0.17, 64, 150));
        wind = canyonWind();
        drive.boost = 1.3;
        if (!calm) {
          shudder(2.6);
          view.kick = 0.14;
          flash([1, 0.82, 0.6], 0.6, 0.02, 0.45);
        }
      } else if (seg.kind === 'move') {
        setCaption(false);
        if (index > 4) sfx.whoosh();
        // (into the loop itself: the turn kicks in)
        if (seg.s0 < 0 && seg.s1 > 0) spawn('zoom', [c[0] - min() * 0.1, c[1] - min() * 0.2], 8, clamp(min() * 0.1, 40, 92));
        if (!calm) shudder(1.2);
      } else if (seg.kind === 'hold' && seg.beat) {
        setBeat({ id: seg.beat, ms: seg.ms, key: index });
        setCaption(true);
        if (seg.beat === 'done') {
          sfx.loopDone();
          spawn('done', [sp.box.cx, sp.box.cy - sp.box.h * 0.24], -6, clamp(min() * 0.12, 48, 110));
        } else {
          sfx.timeStop();
          // (by the ship, where the camera's closing in on it)
          spawn('shine', [sp.box.cx + sp.box.w * 0.2, sp.box.cy - sp.box.h * 0.2], 0, clamp(min() * 0.06, 28, 56));
        }
      } else if (seg.kind === 'close') {
        setCaption(false);
        sfx.whoosh();
        wind?.stop();
        wind = null;
        lookTo(HOME, view.base, 6);
      }
    };

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const now = performance.now();
      const dt = Math.min(60, now - last);
      last = now;
      story.step(dt);
      if (story.done) {
        cancelAnimationFrame(raf);
        done.current();
        return;
      }
      // (a segment's start; skipped to the end, only the one landed in)
      if (story.index !== seen) {
        seen = story.index;
        enter(seen);
      }
      const f = story.frame();
      const hold = f.kind === 'hold';

      // the blueprint sliding in, and out at the end
      const off =
        f.kind === 'charge' || f.kind === 'slash'
          ? sp.reach
          : f.kind === 'split'
            ? sp.reach * (1 - (calm ? easeOut(f.u) : easeOutBack(f.u)))
            : f.kind === 'close'
              ? sp.reach * easeIn(f.u)
              : 0;
      const p = 1 - clamp(off / sp.reach, 0, 1);
      shifted = inner.current;
      if (shifted) shifted.style.transform = p > 0 ? `translate(${(shift[0] * p).toFixed(1)}px, ${(shift[1] * p).toFixed(1)}px)` : '';

      // the nose on the screen (the focus lines close in on it; the lens smears out from it)
      const look = shownLook();
      const nd = project(dirOfLook({ yaw: 0, pitch: NOSE_PITCH }), look, view.fov * (1 + view.kick), W / H) ?? [0, 0.2];
      fx.heading = [nd[0] * 0.5 + 0.5, nd[1] * 0.5 + 0.5];
      const nose: P2 = [(nd[0] * 0.5 + 0.5) * W + shift[0] * p, (0.5 - nd[1] * 0.5) * H + shift[1] * p];

      // the flight outside: the sky wheeling round, time running (or not), the lens and the g
      const { thrust, turn } = forcesAt(f.s);
      const g = feltG(f.s);
      const impact = !calm && f.kind === 'ignite' && f.u < 0.65;
      const pitch = angleAt(f.s);
      const rate = (pitch - lastPitch) / Math.max(0.001, dt / 1000);
      lastPitch = pitch;
      loopFx.on = true;
      loopFx.pitch = pitch;
      loopFx.time = f.time;
      loopFx.warp = 1 + (calm ? 0.3 : 2.2) * Math.max(f.rush, thrust * 0.5);
      fx.speed = calm ? 0 : 0.14 * f.rush;
      fx.split = calm ? 0 : 0.22 * f.rush + (impact ? 0.6 : 0);
      fx.turn = [0, calm ? 0 : clamp(rate * 0.004, -0.045, 0.045)];
      fx.mono = hold ? 0.82 * clamp(1 - (f.time - FROZEN) / (1 - FROZEN), 0, 1) : 0;
      fx.vignette = calm ? 0 : Math.max(0, g - 1) * 0.16;
      drive.boost = Math.max(drive.boost, thrust > 0 ? 1.2 : 0.5);
      const k = calm ? 0 : (0.002 + 0.006 * f.rush + 0.002 * thrust) * f.time;
      const s = now / 1000;
      view.jolt.yaw = k * Math.sin(s * 41.3);
      view.jolt.pitch = k * Math.sin(s * 53.1 + 1) - (calm ? 0 : (g - 1) * 0.008);
      view.jolt.roll = k * 0.8 * Math.sin(s * 37.7 + 2);
      view.kick *= Math.exp((-dt / 1000) * 4);
      // the engine's fire lighting the cockpit from behind, the side thrusters' from under it
      glowLights.hot =
        thrust > 0
          ? { dir: [0, -0.15, 0.99], color: '#ff7a2a', k: thrust * (hold ? 0.6 : 0.9 + (calm ? 0 : 0.25 * Math.random())) }
          : turn > 0.05
            ? { dir: [0, -0.98, 0.2], color: '#9ff3ff', k: 0.4 * turn }
            : null;
      wind?.set(hold ? 0.04 : 0.35 + 0.6 * f.rush, hold ? 0 : 0.35 * f.rush);

      const st: PaintState = {
        w: W,
        h: H,
        split: sp,
        off,
        frame: f,
        nose,
        slash: f.kind === 'slash' ? f.u : now > slashAt ? 1 : 0,
        slashFade: f.kind === 'slash' ? 1 : clamp(1 - (now - slashAt - 140) / 320, 0, 1),
        impact,
        charge: f.kind === 'charge' ? f.u : f.kind === 'slash' ? 1 : f.kind === 'split' ? 1 - f.u : 0,
        calm,
        avatar: words.current.avatar,
        words: paintWords,
        now,
      };
      painter.step(st, dt / 1000);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      painter.paint(ctx, st);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', size);
      wind?.stop();
      control.current = null;
      resetLoopFx();
      resetFx();
      view.jolt.yaw = view.jolt.pitch = view.jolt.roll = 0;
      view.kick = 0;
      glowLights.hot = null;
      if (shifted) shifted.style.transform = '';
    };
    // (once: the story plays through as it was started)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // the words: in the blueprint, under the picture (where the cut leaves it widest); upright, over the cockpit's top (frozen while they're up)
  const capStyle: CSSProperties = split.portrait
    ? { left: 12, right: 12, top: 'calc(env(safe-area-inset-top, 0px) + 20px)' }
    : { left: Math.round(cutX(split, split.b[1] - Math.min(220, split.box.h * 0.32)) + 26), right: 20, bottom: 20 };
  const skipStyle: CSSProperties = split.portrait ? { left: 14, top: Math.round(split.a[1] + 18) } : { left: Math.round(split.a[0] + 26), top: 16 };
  const b = beat ? L.beats[beat.id] : null;

  return (
    <div
      className={`lp ${calm ? 'is-calm' : ''}`}
      onPointerDown={(e) => {
        if (!(e.target as Element).closest('.lp-skip')) control.current?.next();
      }}
    >
      <canvas ref={canvasRef} className="lp-canvas" />
      {sfxs.map((s) => (
        <div
          key={s.id}
          className={`lp-sfx is-${s.kind}`}
          style={{ left: s.x, top: s.y, '--rot': `${s.rot}deg`, '--size': `${Math.round(s.size)}px` } as CSSProperties}
          onAnimationEnd={(e) => e.target === e.currentTarget && setSfxs((list) => list.filter((x) => x.id !== s.id))}
          aria-hidden
        >
          <span lang="ja">{JP[s.kind]}</span>
          <small dir={rtl ? 'rtl' : 'ltr'}>({L.sfx[s.kind]})</small>
        </div>
      ))}
      {b && beat && (
        <div key={beat.key} className={`lp-caption is-${beat.id} ${caption ? 'is-on' : ''}`} style={capStyle} dir={rtl ? 'rtl' : 'ltr'} role="status">
          <span className="lp-caption-tag">{b.tag}</span>
          <strong className="lp-caption-title">{b.title}</strong>
          <p className="lp-caption-text">{b.text}</p>
          <span className="lp-caption-next" aria-hidden>
            ▶▶ {L.tap}
            <i style={{ animationDuration: `${beat.ms}ms` }} />
          </span>
        </div>
      )}
      <button type="button" className="lp-skip" style={skipStyle} onClick={() => control.current?.end()}>
        {L.skip} ✕
      </button>
    </div>
  );
}
