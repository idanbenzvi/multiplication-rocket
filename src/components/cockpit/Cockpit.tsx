import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { sfx } from '../../audio/sfx';
import { canVibrate, haptics } from '../../audio/haptics';
import { useAudio } from '../../audio/useAudio';
import { pauseGame, resumeGame, usePause } from '../../game/gameClock';
import { cockpitDolly, cockpitDollyAt, cockpitView, moveCockpitDolly, portholeScreen, portholeZoom } from '../../game/flight';
import { useGameStore } from '../../game/useGameStore';
import { paceMs } from '../../game/scoring';
import { useCrewStore } from '../../game/useCrewStore';
import { useLang, useT } from '../../i18n/useLang';
import { pilotName, useProfiles } from '../../profiles/useProfiles';
import { isTouchDevice, useSettings, type AnswerMode, type TypedCheck } from '../../settings/useSettings';
import { CockpitSpace } from './CockpitSpace';
import { getLevelConfig } from '../../game/levels';
import { destinationName, STRINGS } from '../../i18n/strings';
import { GuardedButton, HyperdriveLever, Module, PushButton, Selector, Throttle, Toggle } from './controls';
import { Droid } from './Droid';
import { emote } from './droidBus';
import './cockpit.css';
import { useBack } from '../../native/back';

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
// flight. Where it doesn't all fit, you look down at the dashboard and back
// up at the windscreen: it scrolls, and as it does the view pitches like a
// head turning, the windscreen tilting away overhead as the dashboard comes
// round to face you, space shifting a little behind the glass.

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
/** how much it shifts (a share of the scroll), the most being SPACE_OVER of the glass */
const SPACE_PARALLAX = 0.22;

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
  if (useCrewStore.getState().active || usePause.getState().paused || portholeZoom.diveAt) return false;
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
  const scrollRef = useRef<HTMLDivElement>(null);
  // more to see below (the dashboard) or above (the windscreen)
  const [more, setMore] = useState({ above: false, below: false });
  const lookFrame = useRef(0);
  // Looking up or down: how far (0 ahead … 1 down at the dashboard) sets the
  // pitch (cockpit.css), and the space beyond the glass lags behind the frame.
  const look = useCallback(() => {
    lookFrame.current = 0;
    const el = scrollRef.current;
    const win = windowRef.current;
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    const fits = max <= 2;
    const k = fits ? 0 : clamp01(el.scrollTop / max);
    el.style.setProperty('--look', k.toFixed(4));
    el.style.setProperty('--space-shift', `${Math.min(el.scrollTop * SPACE_PARALLAX, (win?.offsetHeight ?? 0) * SPACE_OVER).toFixed(1)}px`);
    el.dataset.fits = fits ? 'yes' : 'no';
    const above = !fits && el.scrollTop > 6;
    const below = !fits && el.scrollTop < max - 6;
    setMore((m) => (m.above === above && m.below === below ? m : { above, below }));
  }, []);
  const onScroll = () => {
    if (!lookFrame.current) lookFrame.current = requestAnimationFrame(look);
  };
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    look();
    const observer = new ResizeObserver(() => look());
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.lastElementChild ?? el.firstElementChild);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(lookFrame.current);
    };
  }, [look]);
  /** the look-up / look-down buttons: most of a screen that way */
  const turn = (dir: 1 | -1) => scrollRef.current?.scrollBy({ top: dir * scrollRef.current.clientHeight * 0.7, behavior: calm ? 'auto' : 'smooth' });
  const [calm] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  const [way] = useState<Way>(() => (calm ? 'calm' : canFlyIn() ? 'porthole' : 'iris'));
  // the window's size on screen from outside, before flying in
  const [r0] = useState(() => Math.max(2, portholeScreen.r));
  const [moving, setMoving] = useState(true);
  // the step under way (and when it began), so a second run of the effect carries on with it
  const step = useRef<{ leaving: boolean; at: number } | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    const inner = innerRef.current;
    if (!root || !inner) return;
    const W = window.innerWidth;
    const H = window.innerHeight;
    const button = from?.getBoundingClientRect();
    const origin = button ? { x: button.left + button.width / 2, y: button.top + button.height / 2 } : { x: W / 2, y: H / 2 };
    const win = windowRef.current;
    const view = { x: W / 2, y: win ? win.offsetTop + win.offsetHeight / 2 : H / 4 };
    /** a circle this big around (x, y) covers the whole screen */
    const cover = (x: number, y: number) => Math.hypot(Math.max(x, W - x), Math.max(y, H - y)) + 2;
    // The cockpit seen through a round window at (x, y): at first just its
    // windscreen, a little magnified; the rest comes into view as you go in (p: 0 → 1).
    const show = (x: number, y: number, r: number, p: number) => {
      root.style.clipPath = `circle(${r.toFixed(1)}px at ${x.toFixed(1)}px ${y.toFixed(1)}px)`;
      const k = 1 - p;
      inner.style.transformOrigin = `${view.x}px ${view.y}px`;
      inner.style.transform = `translate(${((x - view.x) * k).toFixed(1)}px, ${((y - view.y) * k).toFixed(1)}px) scale(${(1 + 0.3 * k).toFixed(3)})`;
    };
    const arrived = () => {
      root.style.clipPath = 'none';
      root.style.opacity = '1';
      inner.style.transform = '';
      setMoving(false);
      (scrollRef.current ?? root).focus({ preventScroll: true });
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

  useEffect(() => {
    if (covered || leaving) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [covered, leaving, onClose]);

  const rtl = lang === 'he';
  /** a switch's change, and the switch droid's reaction to it: happy at an ON, sleepy at an OFF */
  const switched = (set: (on: boolean) => void) => (on: boolean) => {
    set(on);
    emote({ who: 'switch', mood: on ? 'happy' : 'sleepy' });
  };
  const checkName = (c: TypedCheck) =>
    c === 'auto' ? t.typedCheckAuto : isTouchDevice ? t.typedCheckConfirmTouch : t.typedCheckConfirmKeys;
  const checkHint = (c: TypedCheck) =>
    c === 'auto' ? t.typedCheckAutoHint : isTouchDevice ? t.typedCheckConfirmTouchHint : t.typedCheckConfirmKeysHint;

  return (
    <div
      ref={rootRef}
      className={`cockpit ${moving ? 'is-moving' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={t.settings}
      tabIndex={-1}
      style={{ opacity: way === 'iris' ? 1 : 0, clipPath: way === 'calm' ? 'none' : 'circle(0px at 50% 50%)' }}
      // the game's own keys (answers, the hint) stay out while the cockpit is open
      onKeyDown={(e) => e.key !== 'Escape' && e.stopPropagation()}
    >
      <div ref={innerRef} className="ck-inner">
        <div ref={scrollRef} className="ck-scroll" tabIndex={-1} onScroll={onScroll} data-fits="yes">
          <div ref={windowRef} className="ck-window">
            <div className="ck-window-view">
              <CockpitSpace calm={calm} destination={destination} over={SPACE_OVER} />
            </div>
            <Canopy />
          </div>

          <div className="ck-dash">
            <div className="ck-hood">
              <Droid who="sound" side="left" color="#2ff3ff" />
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
                <div className="ck-hud-title">{t.settings}</div>
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
              <Droid who="switch" side="right" color="#ff3df0" />
            </div>

            <Wires />
            <div className="ck-deck">
              <Tower side="left" />
              <div className="ck-panel">
                <Module label={t.answerBy} screen={answerMode === 'type' ? t.modeTypeHint : t.modeChoiceHint} tone="cyan" className="ck-wide">
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
                  <Module label={t.typedCheckLabel} screen={checkHint(typedCheck)} tone="cyan" className="ck-wide">
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

                <Module label={t.sound} tone="orange" hazard className="ck-sound">
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

                <Module label={t.language} className="ck-mid">
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

                <Module label={t.mistakeReviewLabel} screen={t.mistakeReviewHint} tone="magenta">
                  <Toggle name={t.mistakeReviewLabel} on={mistakeReview} onChange={switched(setMistakeReview)} onWord={t.on} offWord={t.off} />
                </Module>

                {/* Orbie, the ship's computer, floating beside its switch (lit while it's on) */}
                <Module label={t.orbieLabel} screen={orbie ? t.orbieOnHint : t.orbieOffHint} tone="magenta">
                  <div className="ck-orbie-row">
                    <span className={`ck-orbie ${orbie ? 'is-on' : ''}`} aria-hidden>
                      <span className="ck-orbie-face">?</span>
                    </span>
                    <Toggle name={t.orbieLabel} on={orbie} onChange={switched(setOrbie)} onWord={t.on} offWord={t.off} />
                  </div>
                </Module>

                {/* this pilot's own: racing the clock for a bigger boost, or a steady one with no clock */}
                {profile && (
                  <Module label={t.timedBoostLabel} screen={timedBoost ? t.timedBoostOnHint(paceSeconds) : t.timedBoostOffHint} tone="orange" hazard>
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
                  <Module label={t.vibrationLabel} screen={t.vibrationHint} tone="magenta">
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

                <Module label={t.cockpit.parents}>
                  <PushButton icon="👪" name={t.cockpit.parents} onPress={onParents} />
                </Module>

                <Module label={t.progressSection} tone="orange" hazard>
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
        </div>

        <div className="ck-flash" aria-hidden />
        <button type="button" className="ck-x" onClick={onClose} aria-label={t.close} title={t.close}>
          ✕
        </button>
        <button
          type="button"
          className={`ck-look is-up ${more.above ? 'is-shown' : ''}`}
          onClick={() => turn(-1)}
          aria-label={t.cockpit.lookUp}
          tabIndex={more.above ? 0 : -1}
        >
          <span aria-hidden>▲</span>
        </button>
        <button
          type="button"
          className={`ck-look is-down ${more.below ? 'is-shown' : ''}`}
          onClick={() => turn(1)}
          aria-label={t.cockpit.lookDown}
          tabIndex={more.below ? 0 : -1}
        >
          <span aria-hidden>▼</span>
        </button>
      </div>
    </div>
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
            [0, '#535b7a'],
            [0.04, '#3e4560'],
            [0.18, '#31374b'],
            [0.5, '#2a2f41'],
            [0.8, '#1f2331'],
          ])}
          {bands(
            'ck-strut',
            [
              [0, '#161925'],
              [0.18, '#2a2f41'],
              [0.34, '#5a6282'],
              [0.48, '#3e4560'],
              [0.72, '#2a2f41'],
              [0.88, '#161925'],
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
        <g fill="none" stroke="#04050a" strokeWidth="4" vectorEffect="non-scaling-stroke">
          <path d="M42 400 L74 64 Q80 24 124 22 L876 22 Q920 24 926 64 L958 400" />
          <path d="M318 20 L362 20 L306 400 L246 400 Z M638 20 L682 20 L754 400 L694 400 Z" />
        </g>
        <g fill="none" stroke="#7d86a8" strokeOpacity="0.5" strokeWidth="2" vectorEffect="non-scaling-stroke">
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
    <div className={`ck-tower is-${side}`} aria-hidden>
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
