import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { sfx } from '../../audio/sfx';
import { canVibrate, haptics } from '../../audio/haptics';
import { useAudio } from '../../audio/useAudio';
import { pauseGame, resumeGame, usePause } from '../../game/gameClock';
import { cockpitDolly, cockpitDollyAt, moveCockpitDolly, portholeScreen, portholeZoom } from '../../game/flight';
import { useGameStore } from '../../game/useGameStore';
import { useCrewStore } from '../../game/useCrewStore';
import { useLang, useT } from '../../i18n/useLang';
import { pilotName, useProfiles } from '../../profiles/useProfiles';
import { isTouchDevice, useSettings, type AnswerMode, type TypedCheck } from '../../settings/useSettings';
import { CockpitSpace } from './CockpitSpace';
import { GuardedButton, Module, PushButton, Selector, Throttle, Toggle } from './controls';
import './cockpit.css';

// The settings, as the rocket's cockpit. Opening them flies the camera in
// through the porthole (the cockpit is seen through the window, growing
// until you're inside), and closing them flies back out, the cockpit
// shrinking back into the window where the pilot looks out. Inside: the
// windscreen with space drifting by and numbers floating past, and a
// dashboard where every setting is a lever, a knob, a switch or a throttle.
// When the rocket isn't in plain view (a bonus round, a crew flight…) the
// cockpit opens out of the ⚙️ button instead; with reduced motion it fades.

/** the flight in: the cockpit fills the screen about half-way, the camera keeps going behind it */
const OPEN_MS = 1500;
/** the flight back out, from wherever the cockpit filled the screen to the usual view */
const CLOSE_MS = 1000;
/** the cockpit, nearly porthole-sized, fades away into the window over the end of that and a little after */
const FADE_FROM_MS = 650;
const FADE_MS = 150;
const IRIS_OPEN_MS = 650;
const IRIS_CLOSE_MS = 520;
const CALM_MS = 250;

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
  const vibration = useSettings((s) => s.vibration);
  const setVibration = useSettings((s) => s.setVibration);
  const musicVolume = useAudio((s) => s.musicVolume);
  const effectsVolume = useAudio((s) => s.effectsVolume);
  const setMusicVolume = useAudio((s) => s.setMusicVolume);
  const setEffectsVolume = useAudio((s) => s.setEffectsVolume);
  const profile = useProfiles((s) => s.profiles.find((p) => p.id === s.activeId));
  const timedBoost = profile?.timedBoost !== false;

  const rootRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const windowRef = useRef<HTMLDivElement>(null);
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
      root.focus({ preventScroll: true });
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
        if (!leaving) {
          // (the pilot at the window fades into the cockpit's view)
          root.style.opacity = String(clamp01(el / 200));
          if (r < big && el < OPEN_MS + 300) return;
          // inside: the camera waits here, through the glass, until the way back out
          const a = cockpitDollyAt(now);
          Object.assign(cockpitDolly, { from: a, to: a, startedAt: now, ms: 1 });
          pauseGame('cockpit');
        } else {
          // nearly back at the window, the cockpit fades to show the pilot again, and the HUD returns
          root.style.opacity = String(clamp01(1 - (el - FADE_FROM_MS) / (CLOSE_MS + FADE_MS - FADE_FROM_MS)));
          if (el >= FADE_FROM_MS) hudBack();
          if (el < CLOSE_MS + FADE_MS) return;
        }
      }
      cancelAnimationFrame(raf);
      if (leaving) {
        hudBack();
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
      resumeGame('cockpit');
      if (cockpitDolly.to > 0) moveCockpitDolly(0, CLOSE_MS);
    },
    [],
  );

  useEffect(() => {
    if (covered || leaving) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [covered, leaving, onClose]);

  const rtl = lang === 'he';
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
        <div ref={windowRef} className="ck-window">
          <CockpitSpace calm={calm} />
          <svg className="ck-canopy" viewBox="0 0 1000 400" preserveAspectRatio="none" aria-hidden>
            <defs>
              <linearGradient id="ck-frame" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#2c2350" />
                <stop offset="1" stopColor="#15102b" />
              </linearGradient>
              <linearGradient id="ck-glass" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#fff" stopOpacity="0.09" />
                <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path fill="url(#ck-glass)" d="M120 40 L470 40 L250 400 L70 400 Z" />
            <path
              fill="url(#ck-frame)"
              fillRule="evenodd"
              d="M0 0 H1000 V400 H0 Z M58 400 L92 70 Q100 32 150 30 L850 30 Q900 32 908 70 L942 400 Z"
            />
            <path
              fill="url(#ck-frame)"
              stroke="#ff9d76"
              strokeOpacity="0.22"
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
              d="M318 30 L344 30 L300 400 L262 400 Z M656 30 L682 30 L738 400 L700 400 Z"
            />
            <path
              fill="none"
              stroke="#ff9d76"
              strokeOpacity="0.28"
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
              d="M58 400 L92 70 Q100 32 150 30 L850 30 Q900 32 908 70 L942 400"
            />
          </svg>
          <div className="ck-hud" aria-hidden>
            <div className="ck-hud-title">{t.settings}</div>
            <div className="ck-hud-seat">{t.cockpit.seat(pilotName(profile, t.defaultPilotName))}</div>
          </div>
          <button type="button" className="ck-x" onClick={onClose} aria-label={t.close} title={t.close}>
            ✕
          </button>
        </div>

        <div className="ck-glare" aria-hidden>
          <span className="ck-blinks">
            <i />
            <i />
            <i />
          </span>
          {profile?.avatar && <span className="ck-bobble">{profile.avatar}</span>}
          <span className="ck-blinks">
            <i />
            <i />
            <i />
          </span>
        </div>

        <div className="ck-console">
          <div className="ck-panel">
            <Module label={t.answerBy} screen={answerMode === 'type' ? t.modeTypeHint : t.modeChoiceHint} className="ck-wide">
              <Selector<AnswerMode>
                kind="lever"
                label={t.answerBy}
                rtl={rtl}
                choices={[
                  { value: 'choice', name: t.modeChoice },
                  { value: 'type', name: t.modeType },
                ]}
                value={answerMode}
                onChange={setAnswerMode}
              />
            </Module>

            {/* touch devices only: on a computer, typed answers always wait for Enter */}
            {answerMode === 'type' && isTouchDevice && (
              <Module label={t.typedCheckLabel} screen={checkHint(typedCheck)} className="ck-wide">
                <Selector<TypedCheck>
                  kind="knob"
                  label={t.typedCheckLabel}
                  rtl={rtl}
                  choices={[
                    { value: 'auto', name: checkName('auto') },
                    { value: 'confirm', name: checkName('confirm') },
                  ]}
                  value={typedCheck}
                  onChange={setTypedCheck}
                />
              </Module>
            )}

            <Module label={t.sound} className="ck-sound">
              <Throttle name={t.music} icon="🎵" value={musicVolume} onChange={setMusicVolume} />
              <Throttle
                name={t.effects}
                icon="✨"
                value={effectsVolume}
                onChange={setEffectsVolume}
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
                onChange={(l) => l !== lang && toggleLang()}
              />
            </Module>

            <Module label={t.mistakeReviewLabel} screen={t.mistakeReviewHint}>
              <Toggle name={t.mistakeReviewLabel} on={mistakeReview} onChange={setMistakeReview} onWord={t.on} offWord={t.off} />
            </Module>

            {/* this pilot's own: racing the clock for a bigger boost, or a steady one with no clock */}
            {profile && (
              <Module label={t.timedBoostLabel} screen={timedBoost ? t.timedBoostOnHint : t.timedBoostOffHint}>
                <Toggle
                  name={t.timedBoostLabel}
                  on={timedBoost}
                  onChange={(on) => useProfiles.getState().update(profile.id, { timedBoost: on })}
                  onWord={t.on}
                  offWord={t.off}
                />
              </Module>
            )}

            {/* only where the device can actually vibrate (not iPhone/iPad) */}
            {canVibrate && (
              <Module label={t.vibrationLabel} screen={t.vibrationHint}>
                <Toggle
                  name={t.vibrationLabel}
                  on={vibration}
                  onChange={(on) => {
                    setVibration(on);
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

            <Module label={t.progressSection}>
              <GuardedButton name={t.reset} liftLabel={t.cockpit.liftCover} lowerLabel={t.cockpit.lowerCover} onPress={onReset} />
            </Module>
          </div>

          <div className="ck-footer">
            <button type="button" className="ck-back" onClick={onClose}>
              🚀 {t.cockpit.back}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
