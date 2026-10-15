import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useWarpCanvas } from './useWarpCanvas';
import { SpaceRipple } from './SpaceRipple';
import { CALM_END_MS, CALM_PEAK_MS, END_MS, PEAK_MS, useModeWarp, type WarpRun } from './warpTransition';

// The warp between the game and a game mode (started by warpTo in
// warpTransition.ts): a starfield over everything, stretching into
// hyperspace, bent by a space-time ripple from where the player tapped.

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const now = () => performance.now();

export function ModeWarp() {
  const run = useModeWarp((s) => s.run);
  if (!run) return null;
  return createPortal(<Flight key={run.id} run={run} />, document.body);
}

function Flight({ run }: { run: WarpRun }) {
  const layerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const speed = useRef(0.4);
  useWarpCanvas(canvasRef, 0.5, speed);
  const [calm] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  // The clock starts on the first frame, not at the tap: setting up the
  // ripple's shader can take a moment, and the menu's exit waits for it too.
  const [startedAt, setStartedAt] = useState(0);

  useEffect(() => {
    const peak = calm ? CALM_PEAK_MS : PEAK_MS;
    const end = calm ? CALM_END_MS : END_MS;
    let t0 = 0;
    let swapped = false;
    let raf = 0;
    const tick = () => {
      if (!t0) {
        t0 = now();
        setStartedAt(t0);
      }
      const t = now() - t0;
      if (!swapped && t >= peak) {
        swapped = true;
        // (a failing swap must not leave the warp stuck over the screen)
        try {
          run.action();
        } catch (e) {
          console.error(e);
        }
      }
      // space floods in (slowly at first, so the menu is seen dissolving), holds, then clears
      const fadeIn = clamp01(t / (peak * 0.6));
      const fadeOut = clamp01((t - peak - 100) / (end - peak - 100));
      const cover = t < peak ? fadeIn ** 1.6 : 1 - fadeOut * fadeOut * (3 - 2 * fadeOut);
      if (layerRef.current) layerRef.current.style.opacity = String(cover);
      // the stars stretch into hyperspace up to the swap, then ease back
      if (calm) speed.current = 0.3;
      else if (t < peak) speed.current = 0.4 + 4.4 * (t / peak) ** 2;
      else speed.current = 0.35 + 4.45 * (1 - clamp01((t - peak) / (end - peak))) ** 2;
      if (t >= end) {
        useModeWarp.setState({ run: null });
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [run, calm]);

  return (
    <div ref={layerRef} className="mode-warp" style={{ opacity: 0 }} aria-hidden>
      <canvas ref={canvasRef} className="mode-warp-stars" />
      {!calm && <SpaceRipple source={canvasRef} startedAt={startedAt} origin={run.origin} speed={1500} clock={now} />}
      {!calm && <div className="mode-warp-flare" />}
    </div>
  );
}
