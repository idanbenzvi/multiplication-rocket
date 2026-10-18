import { create } from 'zustand';
import { useGameStore } from '../game/useGameStore';
import { useSunStore } from '../game/useSunStore';
import { useSkyStore } from '../game/useSkyStore';
import { useCrewStore } from '../game/useCrewStore';
import { usePause } from '../game/gameClock';

// Dev mode only (?devmode=true): watches the game for hiccups on whatever
// device it runs on, for the dev panel to show and copy. A freeze is a frame
// that took far longer than a frame (the picture stood still); a lost 3D
// surface is a WebGL canvas the browser took the drawing surface away from
// (it shows black until it's given back: "restored"). Each comes with what was
// on screen at the time.

/** a frame this long or longer is a freeze (about six frames missed) */
const FREEZE_MS = 100;
const KEEP = 40;

export interface PerfEvent {
  /** seconds since the page opened */
  at: number;
  kind: 'freeze' | 'lost' | 'restored';
  ms?: number;
  /** which canvas, for a lost surface */
  what?: string;
  where: string;
}

interface PerfState {
  fps: number;
  freezes: number;
  worst: number;
  lost: number;
  events: PerfEvent[];
}

export const usePerf = create<PerfState>(() => ({ fps: 0, freezes: 0, worst: 0, lost: 0, events: [] }));

/** what's on screen, in a word or two */
function where(): string {
  if (document.querySelector('.splash')) return 'opening (splash)';
  const g = useGameStore.getState();
  if (useSunStore.getState().open) return 'Monster Sun';
  if (useSkyStore.getState().open) return 'Split Sky';
  if (useCrewStore.getState().active) return 'Crew Flight';
  if (g.justLaunched) return 'level done (launch screen)';
  if (g.departing) return `flying off to ${g.departing}`;
  if (g.bonusRound) return `round: ${g.bonusRound}`;
  if (g.challenge) return g.inWormhole ? 'wormhole tunnel' : 'wormhole';
  if (g.academyOpen) return 'academy';
  return 'playing';
}

function log(e: Omit<PerfEvent, 'at' | 'where'>) {
  const event: PerfEvent = { ...e, at: Math.round(performance.now() / 100) / 10, where: where() };
  usePerf.setState((s) => ({
    events: [...s.events, event].slice(-KEEP),
    freezes: s.freezes + (e.kind === 'freeze' ? 1 : 0),
    worst: e.kind === 'freeze' ? Math.max(s.worst, e.ms ?? 0) : s.worst,
    lost: s.lost + (e.kind === 'lost' ? 1 : 0),
  }));
}

/** a canvas's name in the log: its class, or its parent's */
function nameOf(canvas: HTMLCanvasElement): string {
  return canvas.className || (canvas.parentElement?.className ? `in .${String(canvas.parentElement.className).split(' ')[0]}` : 'canvas');
}

let started = false;

/** before the game renders, so every WebGL canvas is watched from its start */
export function startPerfMonitor() {
  if (started) return;
  started = true;
  // every WebGL canvas: when it loses its drawing surface, and gets it back
  const getContext = HTMLCanvasElement.prototype.getContext;
  const watched = new WeakSet<HTMLCanvasElement>();
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
    const ctx = (getContext as (...a: unknown[]) => RenderingContext | null).call(this, type, ...rest);
    if (ctx && /webgl/.test(type) && !watched.has(this)) {
      watched.add(this);
      // (one we release ourselves, on closing an effect, is lost too: only count it if it was still on the page)
      this.addEventListener('webglcontextlost', () => this.isConnected && log({ kind: 'lost', what: nameOf(this) }));
      this.addEventListener('webglcontextrestored', () => log({ kind: 'restored', what: nameOf(this) }));
    }
    return ctx;
  } as typeof HTMLCanvasElement.prototype.getContext;

  // frames: a freeze is a long gap between two (not while the page is hidden or the game is paused)
  let last = performance.now();
  let count = 0;
  let windowStart = last;
  const tick = (now: number) => {
    const gap = now - last;
    last = now;
    if (gap >= FREEZE_MS && document.visibilityState === 'visible' && !usePause.getState().away) log({ kind: 'freeze', ms: Math.round(gap) });
    count++;
    if (now - windowStart >= 1000) {
      usePerf.setState({ fps: Math.round((count * 1000) / (now - windowStart)) });
      count = 0;
      windowStart = now;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** the log as text, to paste somewhere */
export function perfReport(): string {
  const s = usePerf.getState();
  const lines = s.events.map((e) =>
    e.kind === 'freeze' ? `${e.at}s  freeze ${e.ms} ms  (${e.where})` : `${e.at}s  3D surface ${e.kind}: ${e.what}  (${e.where})`,
  );
  return [`${navigator.userAgent}`, `${s.fps} fps, ${s.freezes} freezes (worst ${s.worst} ms), ${s.lost} 3D surfaces lost`, ...lines].join('\n');
}
