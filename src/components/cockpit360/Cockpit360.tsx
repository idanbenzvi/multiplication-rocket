import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { sfx } from '../../audio/sfx';
import { pauseGame, resumeGame, usePause } from '../../game/gameClock';
import { cockpitDolly, cockpitDollyAt, cockpitView, moveCockpitDolly, portholeScreen, portholeZoom } from '../../game/flight';
import { useGameStore } from '../../game/useGameStore';
import { useCrewStore } from '../../game/useCrewStore';
import { getLevelConfig } from '../../game/levels';
import { useLang, useT } from '../../i18n/useLang';
import { isTouchDevice } from '../../settings/useSettings';
import { useBack } from '../../native/back';
import { CssLayer, type FaceId } from './css3d';
import { drive } from './drive';
import { dirOfLook, frame, project } from './geometry';
import { glowLights } from './lights';
import { Scene } from './Scene';
import { ScreenFace, WindscreenFace, HotspotFace } from './faces';
import { Hud } from './Hud';
import { Panel } from './Panel';
import { HOTSPOT_QUADS, HOTSPOTS, QUADS, SCREENS, WINDSCREEN_QUAD, type HotspotId, type ScreenId } from './screens';
import { stopLook, useCockpit } from './store';
import { useLookControls } from './useLookControls';
import { baseFov, HOME, lookAt, lookTo, settled, shudder, startShudders, stopShudders, view } from './view';
import './cockpit360.css';

// The rocket's cockpit, all the way round: the pilot's seat in the middle of
// a panorama of it (the art: public/cockpit/, scripts/cockpit-360.py), space
// streaming past outside its glass, and the game's own screens on its
// screens: the pilot, their badges, the sound and the ship's systems on the
// left wall, the practice map on the console, the game modes on the right
// wall, and the flight's HUD on the windscreen. Look round by dragging (or
// resting the mouse at an edge); on a phone, the arrows turn from one screen
// to the next. Touch a screen and the view zooms into it, the edges blurring
// as it rushes in, until the screen fills the view and its page opens on it
// (Panel.tsx). Grab the joystick to fly on.
//
// Opening it flies the camera in through the rocket's window, as the settings
// cockpit did: the cockpit seen through the window, growing until you're
// inside; closing it flies back out. When the rocket isn't in plain view it
// opens out of the ⚙️ button instead; with reduced motion it fades.

/** the flight in: the cockpit fills the screen about half-way, the camera keeps going behind it */
const OPEN_MS = 1500;
/** the flight back out */
const CLOSE_MS = 1000;
/** the cockpit's view comes through the window as it grows: all there once the window's grown this share of the way */
const VIEW_BY = 0.35;
const HUD_BACK_MS = 650;
const LINGER_MS = 150;
const IRIS_OPEN_MS = 650;
const IRIS_CLOSE_MS = 520;
const CALM_MS = 250;
/** a screen's page opens once the zoom is nearly there (or after this long, whatever) */
const PANEL_AFTER_MS = 900;

type Way = 'porthole' | 'iris' | 'calm';

// While in the cockpit the game's HUD steps aside (cockpit360.css), fading out
// as the camera dives in and back once you're out again.
const AWAY = 'ck-visit';
const BACK = 'ck-back';
let backTimer = 0;
function hudAway() {
  window.clearTimeout(backTimer);
  document.body.classList.remove(BACK);
  document.body.classList.add(AWAY);
}
function hudBack() {
  if (!document.body.classList.contains(AWAY)) return;
  document.body.classList.replace(AWAY, BACK);
  backTimer = window.setTimeout(() => document.body.classList.remove(BACK), 600);
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);

/** the rocket is out there in plain view, flying along: go in through its window */
function canFlyIn(): boolean {
  const s = useGameStore.getState();
  if (s.academyOpen || s.justLaunched || s.showHeatmap || s.challenge || s.bonusRound || s.inWormhole) return false;
  if (useCrewStore.getState().active || usePause.getState().paused || portholeZoom.diveAt) return false;
  const { x, y, r } = portholeScreen;
  return r > 2 && x > 0 && y > 0 && x < window.innerWidth && y < window.innerHeight;
}

interface Props {
  /** flying back out: when it's done, onGone */
  leaving: boolean;
  /** the ⚙️ button: the cockpit opens out of it when it can't fly in through the window */
  from: HTMLElement | null;
  /** something's open over the cockpit (the parents' dialogs, About, the pilots): it waits, and Escape is theirs */
  covered: boolean;
  onClose: () => void;
  onGone: () => void;
  onParents: () => void;
  onReset: () => void;
  onAbout: () => void;
  onPilot: (edit: boolean) => void;
}

export function Cockpit360(props: Props) {
  return createPortal(<CockpitView {...props} />, document.body);
}

function CockpitView({ leaving, from, covered, onClose, onGone, onParents, onReset, onAbout, onPilot }: Props) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const focused = useCockpit((s) => s.focused);
  const away = usePause((s) => s.away);
  // the level's destination, dead ahead (the one still being reached while its launch shows)
  const level = useGameStore((s) => (s.justLaunched ? s.progress.level - 1 : s.progress.level));
  const nearness = useGameStore((s) => (s.justLaunched ? 1 : s.progress.fuel / 100));
  const crewing = useCrewStore((s) => s.active);
  const dest = getLevelConfig(level);
  const destination = crewing ? undefined : { index: dest.destinationIndex, approach: nearness };

  const rootRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const cssHost = useRef<HTMLDivElement>(null);
  const [css] = useState(() => new CssLayer());
  const holding = useRef(false);
  const hovered = useRef<string | null>(null);
  const [hover, setHover] = useState<FaceId | null>(null);
  const [calm] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  // a phone or a small tablet: a lighter lens
  const [low] = useState(() => isTouchDevice && Math.min(window.innerWidth, window.innerHeight) < 820);
  const [way] = useState<Way>(() => (calm ? 'calm' : canFlyIn() ? 'porthole' : 'iris'));
  const [r0] = useState(() => Math.max(2, portholeScreen.r));
  const [moving, setMoving] = useState(true);
  const [panelFor, setPanelFor] = useState<ScreenId | null>(null);
  const step = useRef<{ leaving: boolean; at: number } | null>(null);

  useEffect(() => {
    css.mount(cssHost.current);
    return () => css.dispose();
  }, [css]);

  // looking ahead as it opens, from a little way in (the view widening as you arrive)
  useState(() => {
    view.calm = calm;
    const aspect = window.innerWidth / Math.max(1, window.innerHeight);
    view.base = baseFov(aspect);
    lookAt(HOME, calm ? view.base : view.base * 0.62);
    lookTo(HOME, view.base, 4.2);
    return 0;
  });

  // ---- flying in and out ----
  useEffect(() => {
    const root = rootRef.current;
    const inner = innerRef.current;
    if (!root || !inner) return;
    const W = window.innerWidth;
    const H = window.innerHeight;
    const button = from?.getBoundingClientRect();
    const origin = button ? { x: button.left + button.width / 2, y: button.top + button.height / 2 } : { x: W / 2, y: H / 2 };
    // (the windscreen's middle, where the window's view is centred as it grows)
    const ws = project(WINDSCREEN_QUAD.center, HOME, view.base, W / H);
    const centre = ws ? { x: (ws[0] * 0.5 + 0.5) * W, y: (0.5 - ws[1] * 0.5) * H } : { x: W / 2, y: H / 3 };
    const cover = (x: number, y: number) => Math.hypot(Math.max(x, W - x), Math.max(y, H - y)) + 2;
    const show = (x: number, y: number, r: number, p: number) => {
      root.style.clipPath = `circle(${r.toFixed(1)}px at ${x.toFixed(1)}px ${y.toFixed(1)}px)`;
      const k = 1 - p;
      inner.style.transformOrigin = `${centre.x}px ${centre.y}px`;
      inner.style.transform = `translate(${((x - centre.x) * k).toFixed(1)}px, ${((y - centre.y) * k).toFixed(1)}px) scale(${(1 + 0.3 * k).toFixed(3)})`;
    };
    const arrived = () => {
      root.style.clipPath = 'none';
      root.style.opacity = '1';
      inner.style.transform = '';
      setMoving(false);
      root.focus({ preventScroll: true });
    };

    const fresh = step.current?.leaving !== leaving;
    if (fresh) {
      step.current = { leaving, at: performance.now() };
      setMoving(true);
      if (leaving) sfx.cockpitOut();
      else sfx.cockpitIn();
    }
    if (!leaving) {
      hudAway();
      if (way !== 'porthole') pauseGame('cockpit');
      else if (cockpitDolly.to !== 1) moveCockpitDolly(1, OPEN_MS);
    } else {
      resumeGame('cockpit');
      if (way === 'porthole' && fresh) moveCockpitDolly(0, CLOSE_MS);
    }
    const t0 = step.current!.at;

    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const now = performance.now();
      const el = now - t0;
      if (way === 'calm') {
        const k = clamp01(el / CALM_MS);
        root.style.opacity = String(leaving ? 1 - k : k);
        if (k < 1) return;
      } else if (way === 'iris') {
        const k = clamp01(el / (leaving ? IRIS_CLOSE_MS : IRIS_OPEN_MS));
        const p = leaving ? 1 - ease(k) : ease(k);
        show(origin.x, origin.y, cover(origin.x, origin.y) * p, p);
        if (k < 1) return;
      } else {
        // through the porthole, as the camera flies in (or out): the window as it is on screen right now
        const { x, y, r } = portholeScreen;
        const big = cover(x, y);
        const p = clamp01(Math.log(Math.max(r, 1) / r0) / Math.log(big / r0));
        show(x, y, Math.max(r, 0), p);
        const seen = clamp01(p / VIEW_BY);
        root.style.opacity = String(seen);
        cockpitView.shown = seen;
        if (!leaving) {
          if (r < big && el < OPEN_MS + 300) return;
          // inside: the camera waits here, through the glass, until the way back out
          const a = cockpitDollyAt(now);
          Object.assign(cockpitDolly, { from: a, to: a, startedAt: now, ms: 1 });
          pauseGame('cockpit');
        } else {
          if (el >= HUD_BACK_MS) hudBack();
          if (el < CLOSE_MS + LINGER_MS) return;
        }
      }
      cancelAnimationFrame(raf);
      if (leaving) {
        hudBack();
        cockpitView.shown = 0;
        onGone();
      } else arrived();
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // runs per step (in, then out); the rest is fixed for the visit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaving]);

  // gone mid-way (the app closed it): the game runs again and the camera comes back out
  useEffect(
    () => () => {
      hudBack();
      cockpitView.shown = 0;
      resumeGame('cockpit');
      if (cockpitDolly.to > 0) moveCockpitDolly(0, CLOSE_MS);
      glowLights.hot = null;
    },
    [],
  );

  // ---- the flight's shudders: a rumble, the lights flickering, the HUD jolting ----
  const live = !calm && !moving && !leaving && !covered;
  useEffect(() => {
    if (!live) return;
    startShudders((strength) => {
      sfx.rumble(strength);
      glowLights.flicker = Math.max(glowLights.flicker, strength);
      // (a bump costs the ship a little speed, the stars and the HUD's alike)
      drive.knock = Math.max(drive.knock, strength);
      const root = rootRef.current;
      root?.classList.remove('is-jolted');
      void root?.offsetWidth;
      root?.classList.add('is-jolted');
    });
    return stopShudders;
  }, [live]);

  // ---- looking round, and into the screens ----
  const unfocus = useCockpit((s) => s.unfocus);
  const turnTo = useCockpit((s) => s.turnTo);
  const stepTo = useCockpit((s) => s.step);
  useLookControls(rootRef, { enabled: !moving && !leaving && !covered, focused: focused !== null, onUnfocus: unfocus, holding });

  // a screen's page opens once the view has zoomed into it
  useEffect(() => {
    setPanelFor(null);
    if (!focused) return;
    const started = performance.now();
    let raf = 0;
    const wait = () => {
      if (settled() || performance.now() - started > PANEL_AFTER_MS || calm) setPanelFor(focused);
      else raf = requestAnimationFrame(wait);
    };
    raf = requestAnimationFrame(wait);
    return () => cancelAnimationFrame(raf);
  }, [focused, calm]);

  // a turn of the window (or the phone): the screen zoomed into stays framed
  useEffect(() => {
    const onResize = () => {
      const { stop } = useCockpit.getState();
      if (focused) {
        const { look, fov } = stopLook(stop);
        lookTo(look, fov, 14);
      }
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [focused]);

  const act = useCallback(
    (id: FaceId) => {
      if (id === 'windscreen') return turnTo('ahead');
      if (id === 'stick') {
        shudder(1.6);
        sfx.hyperdrive();
        return onClose();
      }
      if (id === 'overhead') return onAbout();
      if (id === 'remote') return onParents();
      sfx.whoosh();
      turnTo(id);
    },
    [turnTo, onClose, onAbout, onParents],
  );

  const onClick = (e: React.MouseEvent) => {
    const face = (e.target as Element).closest<HTMLElement>('[data-face]');
    if (face?.dataset.face) {
      act(face.dataset.face as FaceId);
      return;
    }
    // a click on nothing in particular, zoomed into a screen: back out of it
    if (focused && !(e.target as Element).closest('.ck3-panel, .ck3-hud-ui')) unfocus();
  };
  const onOver = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    const id = ((e.target as Element).closest<HTMLElement>('[data-face]')?.dataset.face ?? null) as FaceId | null;
    if (hovered.current === id) return;
    hovered.current = id;
    setHover(id);
    if (id && id !== 'windscreen') sfx.blip(id === 'stick' ? 4 : 2);
    const spot = HOTSPOTS.find((h) => h.id === id);
    glowLights.hot = spot ? { dir: HOTSPOT_QUADS[spot.id as HotspotId].center.map((v) => v / 1000) as [number, number, number], color: spot.id === 'stick' ? '#ff6a3d' : '#ffd36b', k: 1 } : null;
  };

  // Escape (and Back): out of a screen, or out of the cockpit; ← → round the screens; Enter into the one in front
  useBack(!covered && !leaving && (focused ? unfocus : onClose));
  useEffect(() => {
    if (covered || leaving) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as Element | null;
      // (keys for a control that has them: a dial, a switch, a field)
      const busy = !!target?.closest?.('input, textarea, select, [role="slider"], [role="radiogroup"], [role="switch"]');
      if (e.key === 'Escape') {
        e.preventDefault();
        if (useCockpit.getState().focused) unfocus();
        else onClose();
      } else if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && !busy) {
        e.preventDefault();
        sfx.whoosh();
        // (in Hebrew, read right to left, the next one is to the left)
        const forward = e.key === 'ArrowRight' ? 1 : -1;
        stepTo((lang === 'he' ? -forward : forward) as 1 | -1);
      } else if (e.key === 'Enter' && !busy && !useCockpit.getState().focused && !target?.closest?.('button')) {
        // into the screen nearest the middle of the view
        const ahead = dirOfLook({ yaw: view.yaw, pitch: view.pitch });
        let best: ScreenId | null = null;
        let bestD = 0.35;
        for (const s of SCREENS) {
          const { look } = frame(QUADS[s.id], 1, 1);
          const d = Math.acos(Math.min(1, dirOfLook(look).reduce((a, v, i) => a + v * ahead[i], 0)));
          if (d < bestD) {
            bestD = d;
            best = s.id;
          }
        }
        if (best) act(best);
      }
    };
    // (before the cockpit keeps keys from the game below it)
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [covered, leaving, onClose, unfocus, stepTo, act, lang]);

  return (
    <div
      ref={rootRef}
      className={`ck3 ${moving ? 'is-moving' : ''} ${focused ? 'is-focused' : ''} ${isTouchDevice ? 'is-touch' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={t.settings}
      tabIndex={-1}
      dir="ltr"
      style={{ opacity: way === 'iris' ? 1 : 0, clipPath: way === 'calm' ? 'none' : 'circle(0px at 50% 50%)' }}
      // the game's own keys (answers, the hint) stay out while the cockpit is open
      onKeyDown={(e) => e.key !== 'Escape' && e.stopPropagation()}
      onClick={onClick}
      onPointerOver={onOver}
    >
      <div ref={innerRef} className="ck3-inner">
        <Scene
          css={css}
          destination={destination}
          calm={calm}
          low={low}
          holding={holding}
          hovered={hovered}
          focused={focused}
          running={!away && !covered}
        />
        <div ref={cssHost} className="ck3-css-host" />
        <Hud hover={hover} onClose={onClose} />
        {panelFor && (
          <Panel key={panelFor} id={panelFor} onClose={unfocus} onParents={onParents} onReset={onReset} onAbout={onAbout} onPilot={onPilot} />
        )}
      </div>
      {/* the pages on the screens and the windscreen, drawn on them (css3d.ts) */}
      {createPortal(<WindscreenFace />, css.faces.windscreen.element)}
      {SCREENS.map((s) => createPortal(<ScreenFace id={s.id} lit={hover === s.id} open={focused === s.id} rtl={lang === 'he'} />, css.faces[s.id].element, s.id))}
      {HOTSPOTS.map((h) => createPortal(<HotspotFace id={h.id} />, css.faces[h.id].element, h.id))}
    </div>
  );
}
