import { useEffect, useRef, type RefObject } from 'react';
import { LIMITS, view } from './view';

// Looking round the cockpit. Drag anywhere (a mouse or a finger) and the
// cockpit turns with it, as if grabbing the view, letting go with a fling
// that slows to a stop; a drag that started on a screen doesn't click it.
// With a mouse, resting it near an edge of the screen turns the head that
// way (a little after it gets there, so reaching for a corner doesn't), and
// the head always follows the mouse a little. The wheel zooms (a trackpad's
// sideways swipe turns), and so does a pinch. All of it only while looking
// round: zoomed into a screen, a drag first backs out of it (onUnfocus).

const DEG = Math.PI / 180;
/** a press that moves this far (px) is a drag, not a tap */
const DRAG_PX = 7;
/** the edges that turn the head: how deep (a share of the screen), how fast at their outer edge (rad/s), and after how long resting there (ms) */
const EDGE = 0.09;
const EDGE_SPEED = 75 * DEG;
const EDGE_DELAY_MS = 260;
/** how far the head follows the mouse from the middle (radians) */
const SWAY_YAW = 2.4 * DEG;
const SWAY_PITCH = 1.4 * DEG;

/** where a press doesn't turn anything: the pages and the HUD's own buttons */
const UI = '.ck3-panel, .ck3-hud-ui, input, select, textarea';

interface Options {
  enabled: boolean;
  /** zoomed into a screen: a drag backs out of it first */
  focused: boolean;
  onUnfocus: () => void;
  /** a pointer is held down (the shudders wait) */
  holding: RefObject<boolean>;
}

export function useLookControls(root: RefObject<HTMLElement | null>, { enabled, focused, onUnfocus, holding }: Options) {
  const latest = useRef({ focused, onUnfocus });
  useEffect(() => {
    latest.current = { focused, onUnfocus };
  });

  useEffect(() => {
    const el = root.current;
    if (!el || !enabled) return;
    const pointers = new Map<number, { x: number; y: number }>();
    let press: { id: number; x: number; y: number; lastX: number; lastY: number; lastT: number; dragging: boolean; mouse: boolean } | null = null;
    let pinch: { d: number; fov: number } | null = null;
    /** a drag just ended: swallow the click it would make */
    let swallow = false;
    let edgeSince = 0;
    let mouse: { x: number; y: number } | null = null;
    let raf = 0;

    const perPx = () => {
      const h = el.clientHeight || 1;
      // (how far a px turns the view, at the middle of the screen)
      return (2 * Math.tan(view.fov / 2)) / h;
    };

    const down = (e: PointerEvent) => {
      if ((e.target as Element).closest(UI)) return;
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      holding.current = true;
      if (pointers.size === 2) {
        // a pinch: from how far apart the two fingers are
        const [a, b] = [...pointers.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), fov: view.goal.fov };
        press = null;
        view.dragging = false;
        return;
      }
      press = { id: e.pointerId, x: e.clientX, y: e.clientY, lastX: e.clientX, lastY: e.clientY, lastT: e.timeStamp, dragging: false, mouse: e.pointerType === 'mouse' };
    };

    const move = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') mouse = { x: e.clientX, y: e.clientY };
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const t = Math.tan(pinch.fov / 2) * (pinch.d / Math.max(20, d));
        view.goal.fov = Math.max(LIMITS.fovMin * 2, Math.min(view.base * 1.12, 2 * Math.atan(t)));
        return;
      }
      if (!press || e.pointerId !== press.id) return;
      if (!press.dragging) {
        if (Math.hypot(e.clientX - press.x, e.clientY - press.y) < DRAG_PX) return;
        press.dragging = true;
        view.dragging = true;
        view.flingYaw = view.flingPitch = 0;
        if (latest.current.focused) latest.current.onUnfocus();
        try {
          el.setPointerCapture(e.pointerId);
        } catch {
          // (gone already)
        }
      }
      const k = perPx();
      const dx = e.clientX - press.lastX;
      const dy = e.clientY - press.lastY;
      const dt = Math.max(1, e.timeStamp - press.lastT) / 1000;
      // grabbing the view: it moves with the hand, so the head turns the other way
      view.yaw -= dx * k;
      view.pitch = Math.max(LIMITS.pitchMin, Math.min(LIMITS.pitchMax, view.pitch + dy * k));
      view.goal.yaw = view.yaw;
      view.goal.pitch = view.pitch;
      view.vYaw = view.vPitch = 0;
      // (the fling it'll let go with: this move's speed, smoothed)
      view.flingYaw = view.flingYaw * 0.6 + ((-dx * k) / dt) * 0.4;
      view.flingPitch = view.flingPitch * 0.6 + ((dy * k) / dt) * 0.4;
      press.lastX = e.clientX;
      press.lastY = e.clientY;
      press.lastT = e.timeStamp;
    };

    const up = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      if (pointers.size === 0) holding.current = false;
      if (!press || e.pointerId !== press.id) return;
      if (press.dragging) {
        swallow = true;
        // (a hand that stopped before letting go doesn't fling)
        if (e.timeStamp - press.lastT > 80) view.flingYaw = view.flingPitch = 0;
        const cap = 220 * DEG;
        view.flingYaw = Math.max(-cap, Math.min(cap, view.flingYaw));
        view.flingPitch = Math.max(-cap, Math.min(cap, view.flingPitch)) * 0.6;
      }
      view.dragging = false;
      press = null;
    };

    const click = (e: MouseEvent) => {
      if (!swallow) return;
      swallow = false;
      e.stopPropagation();
      e.preventDefault();
    };
    // (any later press clears it: a drag that ended off any element makes no click)
    const clearSwallow = () => {
      swallow = false;
    };

    const wheel = (e: WheelEvent) => {
      if ((e.target as Element).closest(UI)) return;
      e.preventDefault();
      if (latest.current.focused) {
        // scrolling out of a screen backs out of it
        if (e.deltaY > 0 && !e.ctrlKey) latest.current.onUnfocus();
        return;
      }
      const sideways = Math.abs(e.deltaX) > Math.abs(e.deltaY);
      if (sideways && !e.ctrlKey) {
        view.goal.yaw += e.deltaX * perPx() * 0.6;
        return;
      }
      const t = Math.tan(view.goal.fov / 2) * Math.exp(e.deltaY * (e.ctrlKey ? 0.01 : 0.0012));
      view.goal.fov = Math.max(LIMITS.fovMin * 2, Math.min(view.base * 1.12, 2 * Math.atan(t)));
    };

    const leave = () => {
      mouse = null;
    };

    // the mouse at an edge turns the head; the head follows the mouse a little
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      view.panYaw = view.panPitch = 0;
      if (!mouse || press || latest.current.focused) {
        edgeSince = 0;
        view.swayGoal.yaw = view.swayGoal.pitch = 0;
        return;
      }
      const w = el.clientWidth || 1;
      const h = el.clientHeight || 1;
      const nx = mouse.x / w;
      const ny = mouse.y / h;
      view.swayGoal.yaw = (nx - 0.5) * 2 * SWAY_YAW;
      view.swayGoal.pitch = -(ny - 0.5) * 2 * SWAY_PITCH;
      const into = (v: number) => (v < EDGE ? -(1 - v / EDGE) : v > 1 - EDGE ? (v - (1 - EDGE)) / EDGE : 0);
      const ex = into(nx);
      const ey = into(ny);
      // (over the HUD's buttons, it doesn't)
      const overUi = (document.elementFromPoint(mouse.x, mouse.y) as Element | null)?.closest(UI + ', .ck3-hud button');
      if ((!ex && !ey) || overUi) {
        edgeSince = 0;
        return;
      }
      if (!edgeSince) edgeSince = now;
      if (now - edgeSince < EDGE_DELAY_MS) return;
      const ramp = Math.min(1, (now - edgeSince - EDGE_DELAY_MS) / 400);
      view.panYaw = Math.sign(ex) * ex * ex * EDGE_SPEED * ramp;
      view.panPitch = -Math.sign(ey) * ey * ey * EDGE_SPEED * 0.6 * ramp;
    };
    raf = requestAnimationFrame(frame);

    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerdown', clearSwallow, true);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    el.addEventListener('click', click, true);
    el.addEventListener('wheel', wheel, { passive: false });
    el.addEventListener('pointerleave', leave);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointerdown', clearSwallow, true);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      el.removeEventListener('click', click, true);
      el.removeEventListener('wheel', wheel);
      el.removeEventListener('pointerleave', leave);
      view.dragging = false;
      view.panYaw = view.panPitch = 0;
      holding.current = false;
    };
  }, [root, enabled, holding]);
}
