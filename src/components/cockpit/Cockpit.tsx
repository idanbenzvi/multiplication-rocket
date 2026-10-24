import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { animate, motion, useMotionValue, useTransform, type MotionValue } from 'motion/react';
import { sfx } from '../../audio/sfx';
import { canVibrate, haptics } from '../../audio/haptics';
import { useAudio } from '../../audio/useAudio';
import { pauseGame, resumeGame, usePause } from '../../game/gameClock';
import { cockpitDolly, cockpitDollyAt, cockpitView, moveCockpitDolly, portholeScreen } from '../../game/flight';
import { useGameStore } from '../../game/useGameStore';
import { paceMs } from '../../game/scoring';
import { useCrewStore } from '../../game/useCrewStore';
import { useLang, useT } from '../../i18n/useLang';
import { pilotName, useProfiles } from '../../profiles/useProfiles';
import { isTouchDevice, useSettings, type AnswerMode, type TypedCheck } from '../../settings/useSettings';
import { CockpitSpace } from './CockpitSpace';
import { getLevelConfig } from '../../game/levels';
import { destinationName, STRINGS } from '../../i18n/strings';
import { GuardedButton, HyperdriveLever, Module, PlateLight, PushButton, Selector, Throttle, Toggle } from './controls';
import { plateTint } from './plates';
import { Droid } from './Droid';
import { emote } from './droidBus';
import { useTurbulence } from './turbulence';
import { usePassingLight } from './passingLight';
import './cockpit.css';
import { useBack } from '../../native/back';
import { openPage } from '../pages';

// The settings, as the rocket's cockpit. Opening them flies the camera in
// through the porthole (the cockpit is seen through the window, growing
// until you're inside), and closing them flies back out, the cockpit
// shrinking back into the window where the pilot looks out. Inside: the
// windscreen with space drifting by and numbers floating past, and a
// dashboard where every setting is a lever, a knob, a switch or a throttle.
// When the rocket isn't in plain view (a bonus round, a crew flight…) the
// cockpit opens out of the ⚙️ button instead; with reduced motion it fades.
//
// It's a toy of a cockpit: a dashboard of chunky plastic modules in toy
// colours, two little droids on its corners reacting to what's changed
// (Droid.tsx), and a big hyperdrive lever to slam forward, back to the
// flight.
//
// And it's where the rest of the game is: you look round it, its corners on
// the walls round the pilot's seat, each a screen of its own (nothing to
// scroll), a turn of the head away. Ahead, the windscreen and the hyperdrive
// lever; to one side the controls (how to answer, the sound, the language)
// and the helpers (the practice map, Orbie, the speed boost, the buzz); to
// the other the missions (doors to the game modes, the map of what they
// know, the Academy) and the pilot's own (switching pilot, their badges,
// About, the parents' dashboard and the reset). The dock along the bottom
// has a key for each, lit for the one in view; a key turns the head there,
// as do a swipe across, the arrow keys, and with a mouse, resting at the
// screen's edge.

/** the flight in: the cockpit fills the screen about half-way, the camera keeps going behind it */
const OPEN_MS = 1500;
/** the flight back out, from wherever the cockpit filled the screen to the usual view */
const CLOSE_MS = 1000;
/**
 * The cockpit's view comes through the window as it grows, the pilot at the
 * window blurring away in its place (PilotFade): all there once the window
 * has grown this share of the way to filling the screen. Flying back out, it
 * goes the same way, the pilot coming back into focus.
 */
const VIEW_BY = 0.35;
/** on the way back out, the HUD returns from here, and the cockpit is gone a little after the camera is back */
const HUD_BACK_MS = 650;
const LINGER_MS = 150;
const IRIS_OPEN_MS = 650;
const IRIS_CLOSE_MS = 520;
const CALM_MS = 250;
/** the space beyond the glass reaches this far above it (a share of its height), for it to shift as you look down */
const SPACE_OVER = 0.2;

/** the cockpit's corners, in the row they make round the pilot's seat (the dock's keys) */
const VIEWS = ['controls', 'helpers', 'ahead', 'missions', 'pilot'] as const;
type ViewId = (typeof VIEWS)[number];
const VIEW_ICONS: Record<ViewId, string> = { controls: '🎛️', helpers: '🤖', ahead: '🚀', missions: '🎮', pilot: '🧑‍🚀' };

type Way = 'porthole' | 'iris' | 'calm';

// While in the cockpit the game's HUD steps aside (cockpit.css), fading out as
// the camera dives in and back once you're out again.
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
  if (useCrewStore.getState().active || usePause.getState().paused) return false;
  const { x, y, r } = portholeScreen;
  return r > 2 && x > 0 && y > 0 && x < window.innerWidth && y < window.innerHeight;
}

interface Props {
  /** flying back out: when it's done, onGone */
  leaving: boolean;
  /** the ⚙️ button: the cockpit opens out of it when it can't fly in through the window */
  from: HTMLElement | null;
  /** a dialog is open over the cockpit (the parents' one): Escape is theirs */
  covered: boolean;
  onClose: () => void;
  onGone: () => void;
  onParents: () => void;
  onReset: () => void;
}

export function Cockpit(props: Props) {
  return createPortal(<CockpitView {...props} />, document.body);
}

function CockpitView({ leaving, from, covered, onClose, onGone, onParents, onReset }: Props) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const toggleLang = useLang((s) => s.toggle);
  const answerMode = useSettings((s) => s.answerMode);
  const setAnswerMode = useSettings((s) => s.setAnswerMode);
  const typedCheck = useSettings((s) => s.typedCheck);
  const setTypedCheck = useSettings((s) => s.setTypedCheck);
  const mistakeReview = useSettings((s) => s.mistakeReview);
  const setMistakeReview = useSettings((s) => s.setMistakeReview);
  const orbie = useSettings((s) => s.orbie);
  // the level's destination, dead ahead through the windscreen (the one still being reached while its launch shows)
  const level = useGameStore((s) => (s.justLaunched ? s.progress.level - 1 : s.progress.level));
  const nearness = useGameStore((s) => (s.justLaunched ? 1 : s.progress.fuel / 100));
  const crewing = useCrewStore((s) => s.active);
  const dest = getLevelConfig(level);
  const destination = crewing ? undefined : { index: dest.destinationIndex, name: destinationName(t, dest), approach: nearness };
  const setOrbie = useSettings((s) => s.setOrbie);
  const vibration = useSettings((s) => s.vibration);
  const setVibration = useSettings((s) => s.setVibration);
  const musicVolume = useAudio((s) => s.musicVolume);
  const effectsVolume = useAudio((s) => s.effectsVolume);
  const setMusicVolume = useAudio((s) => s.setMusicVolume);
  const setEffectsVolume = useAudio((s) => s.setEffectsVolume);
  const profile = useProfiles((s) => s.profiles.find((p) => p.id === s.activeId));
  const timedBoost = profile?.timedBoost !== false;
  // the big boost's window, as it has followed this pilot's pace
  const paceSeconds = String(Math.round(paceMs(useGameStore((s) => s.progress.pace)) / 100) / 10);

  const rootRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const windowRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [calm] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  const [way] = useState<Way>(() => (calm ? 'calm' : canFlyIn() ? 'porthole' : 'iris'));
  // the window's size on screen from outside, before flying in
  const [r0] = useState(() => Math.max(2, portholeScreen.r));
  const [moving, setMoving] = useState(true);
  // the step under way (and when it began), so a second run of the effect carries on with it
  const step = useRef<{ leaving: boolean; at: number } | null>(null);

  // Looking round: the corners, in a row round the pilot's seat (a crew has no missions or pilots to switch),
  // the one in view (the dock's lit key) and where the head is turned to (pos: 0 … the last, between while turning)
  const [views] = useState<readonly ViewId[]>(() => (crewing ? VIEWS.filter((v) => v !== 'missions') : VIEWS));
  const ahead = views.indexOf('ahead');
  const [view, setView] = useState(ahead);
  const pos = useMotionValue(ahead);
  const [turning, setTurning] = useState(false);
  const rtl = lang === 'he';
  const turnTo = useCallback(
    (i: number) => {
      const to = Math.max(0, Math.min(views.length - 1, i));
      setView(to);
      if (Math.abs(to - pos.get()) < 0.01) return;
      sfx.turn();
      if (calm) {
        pos.set(to);
        return;
      }
      setTurning(true);
      animate(pos, to, { type: 'spring', stiffness: 150, damping: 22, onComplete: () => setTurning(false) });
    },
    [views, pos, calm],
  );
  // The drum the cockpit's walls are on, the camera at its centre: its radius from the screen's width,
  // each corner at its heading round it (to the right in English, to the left in Hebrew)
  const [size, setSize] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const radius = Math.round(size.w * DRUM_K);
  const side = rtl ? -1 : 1;
  const heading = useCallback((i: number) => i * SPREAD_DEG * side, [side]);
  const rig = useTransform(pos, (v) => `translateZ(${radius}px) rotateY(${(v * SPREAD_DEG * side).toFixed(3)}deg) translateZ(${-radius}px)`);
  // (the tape moves as the wall does, straight ahead)
  const tapeK = (radius * Math.PI) / 180;
  const ticks = useTransform(pos, (v) => `${(-v * SPREAD_DEG * tapeK * side).toFixed(1)}px`);
  // (the stars beyond the canopy, as far off as can be, going round with the head)
  const stars = useTransform(pos, (v) => `0px, ${(-v * SPREAD_DEG * tapeK * side).toFixed(1)}px`);
  /** one corner over to the screen's right (1) or left (-1): the row runs the other way in Hebrew */
  const toward = (side: 1 | -1) => view + (rtl ? -side : side);
  const hover = useRef(0);
  const unhover = () => window.clearTimeout(hover.current);
  useEffect(() => unhover, []);

  // swiping across (a finger or a pen, starting off the controls) turns the head with it
  const drag = useRef<{ id: number; x: number; y: number; from: number; on: boolean } | null>(null);
  const onDragStart = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' || calm || moving) return;
    if ((e.target as Element).closest('button, input, [role="slider"], .ck-selector')) return;
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, from: pos.get(), on: false };
  };
  const onDragMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    if (!d.on) {
      if (Math.abs(dx) < 10) return;
      // (scrolling up or down, rather)
      if (Math.abs(e.clientY - d.y) > Math.abs(dx)) {
        drag.current = null;
        return;
      }
      d.on = true;
      pos.stop();
      setTurning(true);
      stageRef.current?.setPointerCapture(e.pointerId);
    }
    const w = stageRef.current?.clientWidth || window.innerWidth;
    const last = views.length - 1;
    let p = d.from - ((rtl ? -1 : 1) * dx) / w;
    // (a little give past the ends)
    if (p < 0) p *= 0.3;
    else if (p > last) p = last + (p - last) * 0.3;
    pos.set(p);
  };
  const onDragEnd = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (!d.on) return;
    // over to the next one, if it's come a quarter of the way round, or was flicked that way
    const moved = pos.get() - d.from;
    const flick = pos.getVelocity();
    const go = Math.abs(moved) > 0.25 || (Math.abs(flick) > 1.5 && Math.sign(flick) === Math.sign(moved));
    turnTo(Math.round(d.from) + (go ? Math.sign(moved) : 0));
  };

  useEffect(() => {
    const root = rootRef.current;
    const inner = innerRef.current;
    if (!root || !inner) return;
    const W = window.innerWidth;
    const H = window.innerHeight;
    const button = from?.getBoundingClientRect();
    const origin = button ? { x: button.left + button.width / 2, y: button.top + button.height / 2 } : { x: W / 2, y: H / 2 };
    const win = windowRef.current;
    const glass = { x: W / 2, y: win ? win.offsetTop + win.offsetHeight / 2 : H / 4 };
    /** a circle this big around (x, y) covers the whole screen */
    const cover = (x: number, y: number) => Math.hypot(Math.max(x, W - x), Math.max(y, H - y)) + 2;
    // The cockpit seen through a round window at (x, y): at first just its
    // windscreen, a little magnified; the rest comes into view as you go in (p: 0 → 1).
    const show = (x: number, y: number, r: number, p: number) => {
      root.style.clipPath = `circle(${r.toFixed(1)}px at ${x.toFixed(1)}px ${y.toFixed(1)}px)`;
      const k = 1 - p;
      inner.style.transformOrigin = `${glass.x}px ${glass.y}px`;
      inner.style.transform = `translate(${((x - glass.x) * k).toFixed(1)}px, ${((y - glass.y) * k).toFixed(1)}px) scale(${(1 + 0.3 * k).toFixed(3)})`;
    };
    const arrived = () => {
      root.style.clipPath = 'none';
      root.style.opacity = '1';
      inner.style.transform = '';
      setMoving(false);
      (stageRef.current ?? root).focus({ preventScroll: true });
    };

    // React may run this more than once for a step (and run the cleanup below
    // in between): the sounds play once, and the rest just makes sure.
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
      // back out, from wherever the camera is
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
          // nearly back at the window, the HUD returns
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
    },
    [],
  );

  // (Back too; a dialog over the cockpit takes it first)
  useBack(!covered && !leaving && onClose);

  // a little flight jitter now and then, once inside (not under a dialog, or flying back out)
  useTurbulence(rootRef, stageRef, !calm && !moving && !leaving && !covered);
  // and now and then something glowing passing by outside, its light moving over the dashboard
  usePassingLight(rootRef, !calm && !moving && !leaving && !covered);

  useEffect(() => {
    if (covered || leaving) return;
    // (unless it's for a screen opened over it, from one of its doors)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !document.querySelector(OVER_IT) && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [covered, leaving, onClose]);

  /** a switch's change, and the switch droid's reaction to it: happy at an ON, sleepy at an OFF */
  const switched = (set: (on: boolean) => void) => (on: boolean) => {
    set(on);
    emote({ who: 'switch', mood: on ? 'happy' : 'sleepy' });
  };
  const checkName = (c: TypedCheck) =>
    c === 'auto' ? t.typedCheckAuto : isTouchDevice ? t.typedCheckConfirmTouch : t.typedCheckConfirmKeys;
  const checkHint = (c: TypedCheck) =>
    c === 'auto' ? t.typedCheckAutoHint : isTouchDevice ? t.typedCheckConfirmTouchHint : t.typedCheckConfirmKeysHint;

  const here = (id: ViewId) => views[view] === id;
  /** a door to another of the game's screens: a big button on its plate */
  const door = (plate: number, tone: 'cyan' | 'orange' | 'magenta', icon: string, name: string, onPress: () => void) => (
    <Module plate={plate} label={name} tone={tone} className="ck-door">
      <PushButton icon={icon} name={name} onPress={onPress} />
    </Module>
  );

  const corners: Record<ViewId, React.ReactNode> = {
    // ahead: the windscreen, the hood under it, and the hyperdrive lever back to the flight
    ahead: (
      <>
        <div ref={windowRef} className="ck-window">
          <div className="ck-window-view">
            <CockpitSpace calm={calm} destination={destination} over={SPACE_OVER} active={here('ahead') || turning} />
          </div>
          <Canopy />
        </div>
        <div className="ck-dash">
          {/* (its light, falling through the glass) */}
          <span className="ck-passlight" aria-hidden />
          <div className="ck-hood">
            <PlateLight cast={false} />
            <span className="ck-gadgets is-l" aria-hidden>
              <span className="ck-radar" />
              <Bulbs n={14} seed={1} />
              <span className="ck-dial">
                <i />
              </span>
            </span>
            <div className="ck-hood-screen">
              {profile?.avatar && (
                <span className="ck-bobble" aria-hidden>
                  {profile.avatar}
                </span>
              )}
              <div className="ck-hud-title">{t.cockpit.views.ahead}</div>
              <div className="ck-hud-seat">{t.cockpit.seat(pilotName(profile, t.defaultPilotName))}</div>
            </div>
            <span className="ck-gadgets is-r" aria-hidden>
              <span className="ck-dial">
                <i />
              </span>
              <Bulbs n={14} seed={2} />
              <span className="ck-gauge">
                <i />
              </span>
            </span>
          </div>
          <Wires />
          <div className="ck-launch">
            <HyperdriveLever
              label={t.cockpit.back}
              name={t.cockpit.hyperdrive}
              go={t.cockpit.go}
              push={t.cockpit.push}
              calm={calm}
              onLaunch={() => {
                emote({ who: 'both', mood: 'cheer', word: t.cockpit.cheer });
                onClose();
              }}
            />
          </div>
        </div>
      </>
    ),

    // how the questions are answered, and the sound
    controls: (
      <>
        <div className="ck-deck">
          <Tower side="left" />
          <div className="ck-panel">
            <Module plate={1} label={t.answerBy} screen={answerMode === 'type' ? t.modeTypeHint : t.modeChoiceHint} tone="cyan" className="ck-wide">
              <Selector<AnswerMode>
                kind="lever"
                label={t.answerBy}
                rtl={rtl}
                choices={[
                  { value: 'choice', name: t.modeChoice },
                  { value: 'type', name: t.modeType },
                ]}
                value={answerMode}
                onChange={(m) => {
                  setAnswerMode(m);
                  emote({ who: 'switch', mood: 'happy' });
                }}
              />
            </Module>

            {/* touch devices only: on a computer, typed answers always wait for Enter */}
            {answerMode === 'type' && isTouchDevice && (
              <Module plate={2} label={t.typedCheckLabel} screen={checkHint(typedCheck)} tone="cyan" className="ck-wide">
                <Selector<TypedCheck>
                  kind="knob"
                  label={t.typedCheckLabel}
                  rtl={rtl}
                  choices={[
                    { value: 'auto', name: checkName('auto') },
                    { value: 'confirm', name: checkName('confirm') },
                  ]}
                  value={typedCheck}
                  onChange={(c) => {
                    setTypedCheck(c);
                    emote({ who: 'switch', mood: 'happy' });
                  }}
                />
              </Module>
            )}

            <Module plate={3} label={t.sound} tone="orange" hazard className="ck-sound">
              <Throttle
                name={t.music}
                icon="🎵"
                value={musicVolume}
                onChange={(v) => {
                  setMusicVolume(v);
                  emote({ who: 'sound', mood: 'music', level: v });
                }}
              />
              <Throttle
                name={t.effects}
                icon="✨"
                value={effectsVolume}
                onChange={(v) => {
                  setEffectsVolume(v);
                  emote({ who: 'sound', mood: 'effects', level: v });
                }}
                // at the new volume, on letting go
                onRelease={() => sfx.correct(3, false)}
              />
            </Module>

            <Module plate={4} label={t.language} className="ck-mid">
              <Selector
                kind="knob"
                label={t.language}
                rtl={rtl}
                choices={[
                  { value: 'he', name: 'עברית' },
                  { value: 'en', name: 'English' },
                ]}
                value={lang}
                onChange={(l) => {
                  if (l === lang) return;
                  toggleLang();
                  // (hello in the new one)
                  emote({ who: 'switch', mood: 'hello', word: STRINGS[l].cockpit.hello });
                }}
              />
            </Module>
          </div>
          <Tower side="right" />
        </div>
      </>
    ),

    // what helps along the way: the practice map, Orbie, the clock's boost, the buzz
    helpers: (
      <>
        <div className="ck-deck">
          <Tower side="left" />
          <div className="ck-panel">
            <Module plate={5} label={t.mistakeReviewLabel} screen={t.mistakeReviewHint} tone="magenta">
              <Toggle name={t.mistakeReviewLabel} on={mistakeReview} onChange={switched(setMistakeReview)} onWord={t.on} offWord={t.off} />
            </Module>

            {/* Orbie, the ship's computer, floating beside its switch (lit while it's on) */}
            <Module plate={6} label={t.orbieLabel} screen={orbie ? t.orbieOnHint : t.orbieOffHint} tone="magenta">
              <div className="ck-orbie-row">
                <span className={`ck-orbie ${orbie ? 'is-on' : ''}`} aria-hidden>
                  <span className="ck-orbie-face">?</span>
                </span>
                <Toggle name={t.orbieLabel} on={orbie} onChange={switched(setOrbie)} onWord={t.on} offWord={t.off} />
              </div>
            </Module>

            {/* this pilot's own: racing the clock for a bigger boost, or a steady one with no clock */}
            {profile && (
              <Module plate={7} label={t.timedBoostLabel} screen={timedBoost ? t.timedBoostOnHint(paceSeconds) : t.timedBoostOffHint} tone="orange" hazard>
                <Toggle
                  name={t.timedBoostLabel}
                  on={timedBoost}
                  onChange={switched((on) => useProfiles.getState().update(profile.id, { timedBoost: on }))}
                  onWord={t.on}
                  offWord={t.off}
                />
              </Module>
            )}

            {/* only where the device can actually vibrate (not iPhone/iPad) */}
            {canVibrate && (
              <Module plate={8} label={t.vibrationLabel} screen={t.vibrationHint} tone="magenta">
                <Toggle
                  name={t.vibrationLabel}
                  on={vibration}
                  onChange={(on) => {
                    setVibration(on);
                    emote({ who: 'switch', mood: on ? 'buzz' : 'sleepy' });
                    if (on) haptics.correct(); // feel it, switching on
                  }}
                  onWord={t.on}
                  offWord={t.off}
                />
              </Module>
            )}
          </div>
          <Tower side="right" />
        </div>
      </>
    ),

    // the doors to the ways to play, the map of what they know, and the Academy
    missions: (
      <>
        <div className="ck-deck">
          <Tower side="left" />
          <div className="ck-panel">
            {door(11, 'cyan', '🎮', t.modes.title, () => openPage('modes'))}
            {door(12, 'orange', '🗺️', t.stopAndReview, () => useGameStore.getState().requestHeatmap())}
            {door(13, 'magenta', '🎓', t.cockpit.academy, () => useGameStore.getState().openAcademy())}
          </div>
          <Tower side="right" />
        </div>
      </>
    ),

    // the pilot's own: who's flying, their badges, About; and the grown-ups' dashboard and reset
    pilot: (
      <>
        <div className="ck-deck">
          <Tower side="left" />
          <div className="ck-panel">
            {!crewing && door(14, 'cyan', profile?.avatar ?? '🙂', t.switchPilot, () => openPage('pilot'))}
            {door(15, 'orange', '🏅', t.badges.open, () => openPage('badges'))}
            {door(16, 'magenta', '📖', t.about.open, () => openPage('about'))}
            <Module plate={9} label={t.cockpit.parents} className="ck-door">
              <PushButton icon="👪" name={t.cockpit.parents} onPress={onParents} />
            </Module>
            <Module plate={10} label={t.progressSection} tone="orange" hazard className="ck-door">
              <GuardedButton
                name={t.reset}
                liftLabel={t.cockpit.liftCover}
                lowerLabel={t.cockpit.lowerCover}
                onPress={onReset}
                onLift={() => emote({ who: 'both', mood: 'scared' })}
              />
            </Module>
          </div>
          <Tower side="right" />
        </div>
      </>
    ),
  };

  return (
    <div
      ref={rootRef}
      className={`cockpit ${moving ? 'is-moving' : ''} ${turning ? 'is-turning' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={t.cockpit.seat(pilotName(profile, t.defaultPilotName))}
      tabIndex={-1}
      style={{ opacity: way === 'iris' ? 1 : 0, clipPath: way === 'calm' ? 'none' : 'circle(0px at 50% 50%)' }}
      onKeyDown={(e) => {
        // the game's own keys (answers, the hint) stay out while the cockpit is open
        if (e.key !== 'Escape') e.stopPropagation();
        // ← → look round (not while a slider or the lever has them)
        if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !(e.target as Element).closest('[role="slider"], .ck-hyper')) {
          e.preventDefault();
          turnTo(toward(e.key === 'ArrowRight' ? 1 : -1));
        }
      }}
    >
      <div ref={innerRef} className="ck-inner">
        <motion.div
          ref={stageRef}
          className="ck-stage"
          style={{ perspective: `${radius}px`, backgroundPositionX: stars }}
          tabIndex={-1}
          onPointerDown={onDragStart}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          onPointerCancel={onDragEnd}
        >
          <motion.div className="ck-rig" style={{ transform: rig }}>
            <Wall radius={radius} width={size.w} from={Math.min(0, heading(views.length - 1)) - WALL_OVER} to={Math.max(0, heading(views.length - 1)) + WALL_OVER} pos={pos} heading={heading} />
            {views.map((id, i) => (
              <Corner key={id} id={id} heading={heading(i)} radius={radius} width={size.w} pos={pos} index={i} current={i === view}>
                {corners[id]}
              </Corner>
            ))}
          </motion.div>
        </motion.div>

        {/* the visor: the view's edges darkening round it, as from inside a helmet, its HUD's arcs */}
        <div className="ck-visor" aria-hidden>
          <svg className="ck-visor-arcs" viewBox="0 0 100 100" preserveAspectRatio="none">
            <path d="M4 22 Q4 6 20 4" />
            <path d="M96 22 Q96 6 80 4" />
            <path d="M4 78 Q4 94 20 96" />
            <path d="M96 78 Q96 94 80 96" />
          </svg>
        </div>
        {/* the HUD's heading tape: where the head's turned, the corners' names sliding past */}
        <div className="ck-tape" style={{ '--tick': `${(10 * tapeK).toFixed(1)}px` } as React.CSSProperties} aria-hidden>
          <motion.span className="ck-tape-ticks" style={{ backgroundPositionX: ticks }} />
          {views.map((id, i) => (
            <TapeMark key={id} pos={pos} at={(i * SPREAD_DEG * tapeK) * side} spread={SPREAD_DEG * tapeK * side} lit={i === view}>
              {t.cockpit.views[id]}
            </TapeMark>
          ))}
          <span className="ck-tape-caret" />
        </div>
        {/* the droids, either side of the pilot, reacting to whatever's changed */}
        <div className="ck-droids">
          <Droid who="sound" side="left" color="#2ff3ff" />
          <Droid who="switch" side="right" color="#ff3df0" />
        </div>

        <div className="ck-flash" aria-hidden />
        <button type="button" className="ck-x" onClick={onClose} aria-label={t.close} title={t.close}>
          ✕
        </button>
        {/* with a mouse: at the screen's edge, the head turns that way */}
        {([-1, 1] as const).map((side) => {
          const to = toward(side);
          if (to < 0 || to >= views.length) return null;
          return (
            <button
              key={side}
              type="button"
              tabIndex={-1}
              className={`ck-edge ${side < 0 ? 'is-left' : 'is-right'}`}
              aria-label={side < 0 ? t.cockpit.lookLeft : t.cockpit.lookRight}
              onClick={() => turnTo(to)}
              onPointerEnter={(e) => {
                if (e.pointerType !== 'mouse') return;
                unhover();
                hover.current = window.setTimeout(() => turnTo(to), EDGE_MS);
              }}
              onPointerLeave={unhover}
            >
              <span aria-hidden>{side < 0 ? '◀' : '▶'}</span>
            </button>
          );
        })}
        {/* the dock: a key for each corner, lit for the one in view */}
        <nav className="ck-dock" aria-label={t.cockpit.lookAround}>
          {views.map((id, i) => (
            <button
              key={id}
              type="button"
              className={`ck-dock-key ${i === view ? 'is-on' : ''}`}
              style={{ '--arc': (i - (views.length - 1) / 2) * side } as React.CSSProperties}
              aria-current={i === view || undefined}
              onClick={() => turnTo(i)}
            >
              <span className="ck-dock-lamp" aria-hidden />
              <span className="ck-dock-icon" aria-hidden>
                {id === 'pilot' && profile?.avatar ? profile.avatar : VIEW_ICONS[id]}
              </span>
              <span className="ck-dock-name">{t.cockpit.views[id]}</span>
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}

/** the screens its doors open, over it */
const OVER_IT = '[aria-modal="true"]:not(.cockpit), .heatmap-overlay, .academy';
/** how long the mouse waits at the screen's edge before the head turns */
const EDGE_MS = 260;
/** the drum's radius, a share of the screen's width (the camera at its centre: a view about 47° across) */
const DRUM_K = 1.15;
/** how far round the drum each corner's heading is from the next (deg) */
const SPREAD_DEG = 52;
/** the wall: in strips this many degrees wide, a little behind the parts on it, and on past the end corners */
const WALL_STEP = 3;
const WALL_BACK = 40;
const WALL_OVER = 50;
/** what's on the drum is drawn no further round than this from straight ahead (deg) */
const SEEN_DEG = 95;
/** the parts of a corner laid on the drum, each turned to face the pilot */
const ARC_PARTS = '.ck-module, .ck-tower, .ck-window, .ck-hood, .ck-wires, .ck-launch';

/** `transform` putting something at `angle` round the drum (deg, to the right) `back` behind its face, from `dx` off its middle */
const onDrum = (radius: number, angle: number, dx = 0, back = 0) =>
  `translate3d(${(-dx).toFixed(1)}px, 0, ${radius}px) rotateY(${(-angle).toFixed(3)}deg) translate3d(0, 0, ${-(radius + back)}px)`;

/**
 * One of the cockpit's corners, on the drum round the pilot's seat at its
 * heading: its parts laid out flat as on a screen, then each one put on the
 * drum where the flat layout has it (seen from the middle, it's just where
 * it was) and turned to face the pilot, so the dashboard curves round them,
 * and turning the head glides along it. (Not drawn when it's round behind.)
 */
function Corner({ id, heading, radius, width, pos, index, current, children }: { id: ViewId; heading: number; radius: number; width: number; pos: MotionValue<number>; index: number; current: boolean; children: React.ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const corner = ref.current;
    if (!corner) return;
    const leftIn = (el: HTMLElement) => {
      let x = 0;
      for (let e: HTMLElement | null = el; e && e !== corner; e = e.offsetParent as HTMLElement | null) x += e.offsetLeft;
      return x;
    };
    const place = () => {
      for (const part of corner.querySelectorAll<HTMLElement>(ARC_PARTS)) {
        // (only the outermost: a part inside another goes with it)
        if (part.parentElement?.closest(ARC_PARTS)) continue;
        const dx = leftIn(part) + part.offsetWidth / 2 - width / 2;
        part.style.transform = onDrum(radius, heading + (Math.atan2(dx, radius) * 180) / Math.PI, dx);
      }
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(corner);
    for (const panel of corner.querySelectorAll('.ck-panel, .ck-dash')) observer.observe(panel);
    return () => observer.disconnect();
  }, [radius, width, heading]);
  const visibility = useTransform(pos, (v) => (Math.abs(index - v) * SPREAD_DEG < SEEN_DEG + 30 ? 'visible' : 'hidden'));
  return (
    <motion.section ref={ref} className={`ck-view is-${id}`} style={{ visibility }} aria-hidden={!current || undefined} inert={!current}>
      {children}
    </motion.section>
  );
}

/** the drum's wall, from `from` round to `to` (deg): strips of the hull, its top and bottom edges bowing round the pilot */
function Wall({ radius, width, from, to, pos, heading }: { radius: number; width: number; from: number; to: number; pos: MotionValue<number>; heading: (i: number) => number }) {
  const ref = useRef<HTMLDivElement>(null);
  const r = radius + WALL_BACK;
  const strip = 2 * r * Math.tan(((WALL_STEP / 2) * Math.PI) / 180) + 1;
  const angles = useMemo(() => Array.from({ length: Math.floor((to - from) / WALL_STEP) + 1 }, (_, k) => from + k * WALL_STEP), [from, to]);
  // the strips round behind aren't drawn
  useEffect(() => {
    const strips = ref.current ? [...ref.current.children] as HTMLElement[] : [];
    const shown: boolean[] = [];
    const cull = (v: number) => {
      const ahead = heading(1) * v;
      angles.forEach((a, k) => {
        const on = Math.abs(a - ahead) < SEEN_DEG;
        if (shown[k] === on) return;
        shown[k] = on;
        strips[k].style.visibility = on ? '' : 'hidden';
      });
    };
    cull(pos.get());
    return pos.on('change', cull);
  }, [angles, pos, heading]);
  return (
    <div ref={ref} className="ck-wall" aria-hidden>
      {angles.map((a) => (
        <i
          key={a}
          style={{
            width: `${strip.toFixed(1)}px`,
            left: `${(width / 2 - strip / 2).toFixed(1)}px`,
            transform: onDrum(radius, a, 0, WALL_BACK),
            backgroundPositionX: `${(-(a * Math.PI) / 180 * r).toFixed(1)}px`,
          }}
        />
      ))}
    </div>
  );
}

/** one of the heading tape's marks, a corner's name at its heading, sliding past as the head turns */
function TapeMark({ pos, at, spread, lit, children }: { pos: MotionValue<number>; at: number; spread: number; lit: boolean; children: React.ReactNode }) {
  const x = useTransform(pos, (v) => at - v * spread);
  return (
    <motion.span className={`ck-tape-mark ${lit ? 'is-lit' : ''}`} style={{ x }}>
      {children}
    </motion.span>
  );
}

/**
 * the windscreen's frame: heavy steel, banded (hard bands, not a smooth
 * gradient) and gritty, three panes between thick riveted struts, the glass
 * catching the light and scratched
 */
function Canopy() {
  // each band from where it starts to where the next does, in one colour: hard edges
  const bands = (id: string, stops: [number, string][], vertical = true) => (
    <linearGradient id={id} x1="0" y1="0" x2={vertical ? '0' : '1'} y2={vertical ? '1' : '0'}>
      {stops.flatMap(([at, colour], i) => [
        <stop key={`${i}a`} offset={at} stopColor={colour} />,
        <stop key={`${i}b`} offset={stops[i + 1]?.[0] ?? 1} stopColor={colour} />,
      ])}
    </linearGradient>
  );
  return (
    <>
      <svg className="ck-canopy" viewBox="0 0 1000 400" preserveAspectRatio="none" aria-hidden>
        <defs>
          {bands('ck-frame', [
            [0, '#565c91'],
            [0.04, '#404673'],
            [0.18, '#34385b'],
            [0.5, '#2d3150'],
            [0.8, '#22253e'],
          ])}
          {bands(
            'ck-strut',
            [
              [0, '#181b30'],
              [0.18, '#2d3150'],
              [0.34, '#5d639a'],
              [0.48, '#404673'],
              [0.72, '#2d3150'],
              [0.88, '#181b30'],
            ],
            false,
          )}
        </defs>
        {/* the glass: broad diagonal glints, and a few scratches */}
        <g fill="#bff8ff">
          <path opacity="0.06" d="M120 22 L300 22 L150 400 L60 400 Z" />
          <path opacity="0.04" d="M380 22 L430 22 L330 400 L300 400 Z" />
          <path opacity="0.05" d="M720 22 L840 22 L760 400 L700 400 Z" />
        </g>
        <g stroke="#dfe4ff" strokeOpacity="0.16" strokeWidth="1" vectorEffect="non-scaling-stroke">
          <path d="M150 120 l40 -22 M168 132 l22 -12 M810 300 l46 -18 M520 330 l30 -8" />
        </g>
        <path
          fill="url(#ck-frame)"
          fillRule="evenodd"
          d="M0 0 H1000 V400 H0 Z M42 400 L74 64 Q80 24 124 22 L876 22 Q920 24 926 64 L958 400 Z"
        />
        <path fill="url(#ck-strut)" d="M318 20 L362 20 L306 400 L246 400 Z M638 20 L682 20 L754 400 L694 400 Z" />
        <g fill="none" stroke="#05060f" strokeWidth="4" vectorEffect="non-scaling-stroke">
          <path d="M42 400 L74 64 Q80 24 124 22 L876 22 Q920 24 926 64 L958 400" />
          <path d="M318 20 L362 20 L306 400 L246 400 Z M638 20 L682 20 L754 400 L694 400 Z" />
        </g>
        <g fill="none" stroke="#8a90bb" strokeOpacity="0.5" strokeWidth="2" vectorEffect="non-scaling-stroke">
          <path d="M51 400 L82 66 Q88 31 126 29 L874 29" />
          <path d="M327 25 L268 400 M647 25 L709 400" />
        </g>
        {/* a cyan glow-strip along the top of the glass */}
        <path d="M140 31 L860 31" stroke="#2ff3ff" strokeOpacity="0.5" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
      <span className="ck-canopy-grit" aria-hidden />
      {/* rivets along the top and down the struts (in their own layer: the frame stretches with the screen, they stay round) */}
      <span className="ck-rivets is-top" aria-hidden />
      <span className="ck-rivets is-strut is-l" aria-hidden />
      <span className="ck-rivets is-strut is-r" aria-hidden />
    </>
  );
}

/** a tower of gadgets beside the dashboard, where there's room: banks of tiny bulbs, sliders, dials, wiring */
function Tower({ side }: { side: 'left' | 'right' }) {
  const seed = side === 'left' ? 3 : 4;
  return (
    <div className={`ck-tower is-${side}`} style={plateTint(seed + 20)} aria-hidden>
      <PlateLight />
      <span className="ck-tower-lamps">
        <i />
        <i />
        <i />
      </span>
      <Bulbs n={24} seed={seed} />
      <span className="ck-tower-sliders">
        <i />
        <i />
        <i />
      </span>
      <span className="ck-dial is-big">
        <i />
      </span>
      <Bulbs n={16} seed={seed + 10} />
      <span className="ck-tower-sliders is-short">
        <i />
        <i />
        <i />
      </span>
      <span className="ck-tower-vents" />
    </div>
  );
}

const BULB_COLORS = ['c', 'o', 'm', 'c', 'w'];

/** a bank of tiny indicator bulbs, each its own colour (cyan, orange, magenta, white) and blinking in its own time */
function Bulbs({ n, seed }: { n: number; seed: number }) {
  return (
    <span className="ck-bulbs">
      {Array.from({ length: n }, (_, i) => {
        const r = ((i + 1) * 7919 * (seed + 3)) % 101;
        return (
          <i
            key={i}
            className={`is-${BULB_COLORS[r % BULB_COLORS.length]}`}
            style={{ animationDelay: `${-(r % 37) / 10}s`, animationDuration: `${1.2 + (r % 23) / 10}s` } as React.CSSProperties}
          />
        );
      })}
    </span>
  );
}

/** the wiring looms under the hood: bundles of cables sagging between their clamps, their sleeves glowing in places */
function Wires() {
  return (
    <svg className="ck-wires" viewBox="0 0 1000 60" preserveAspectRatio="none" aria-hidden>
      <g fill="none" strokeLinecap="round">
        <path className="is-rubber" d="M0 8 C120 52 220 52 330 10" />
        <path className="is-c" d="M0 4 C130 44 230 46 330 6" />
        <path className="is-rubber" d="M330 10 C420 40 520 42 600 12" />
        <path className="is-o" d="M330 6 C430 34 510 36 600 8" />
        <path className="is-rubber" d="M600 12 C720 54 860 50 1000 8" />
        <path className="is-m" d="M600 8 C730 46 850 44 1000 4" />
        <path className="is-thin" d="M60 6 C150 30 250 34 330 14 M640 10 C760 34 880 32 980 10" />
      </g>
      <g className="ck-wire-clamps">
        <rect x="318" y="0" width="24" height="18" rx="3" />
        <rect x="588" y="0" width="24" height="20" rx="3" />
      </g>
    </svg>
  );
}
