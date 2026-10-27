import { useEffect, useRef, type CSSProperties } from 'react';
import { useLang, useT } from '../../i18n/useLang';
import { isTouchDevice } from '../../settings/useSettings';
import { sfx } from '../../audio/sfx';
import TargetCursor from '../reactbits/TargetCursor';
import { lookOfDir, yawDelta } from './geometry';
import { BANK_QUAD, QUADS, SCREEN_BY_ID, STOPS, type Stop } from './screens';
import { useCockpit } from './store';
import { view } from './view';
import type { FaceId } from './css3d';

// What's over the view, as if on the visor: the way back to the flight, a
// heading tape along the top (where the head's turned, every screen's name
// marked where it is round the cockpit, lit as it comes into view, and a
// tap on one turns there), what's under the mouse, and how to get round:
// on a phone or a tablet, arrows either side of the screen you're at (and a
// dot for each), stepping round from one screen to the next; with a mouse, a
// dock of all of them along the bottom, and the cursor locking onto
// whatever's under it.

const DEG = Math.PI / 180;
/** px across the tape for a degree */
const TAPE_PX = 2.6;

/** the heading tape's marks: the three walls round the pilot, where each one is (degrees) */
const MARKS = [
  { id: 'bank', yaw: lookOfDir(BANK_QUAD.center).yaw / DEG, icons: '🧑‍🚀🏅🎵⚙️' },
  { id: 'ahead', yaw: 0, icons: '🚀🗺️' },
  { id: 'modes', yaw: lookOfDir(QUADS.modes.center).yaw / DEG, icons: '🎮' },
] as const;

function stopIcon(s: Stop) {
  return s === 'ahead' ? '🚀' : SCREEN_BY_ID[s].icon;
}

/** the heading tape: ticks every 10°, the walls' names where they are, sliding as the head turns; a tap on one turns there */
function HeadingTape() {
  const t = useT().deck;
  const strip = useRef<HTMLDivElement>(null);
  const readout = useRef<HTMLSpanElement>(null);
  const turnTo = useCockpit((s) => s.turnTo);
  const toBank = useCockpit((s) => s.toBank);
  useEffect(() => {
    let raf = 0;
    let shown = '';
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const yaw = (view.yaw + view.sway.yaw) / DEG;
      const wrapped = ((yaw % 360) + 540) % 360 - 180;
      const key = wrapped.toFixed(1);
      if (key === shown) return;
      shown = key;
      strip.current?.style.setProperty('--yaw', key);
      if (readout.current) readout.current.textContent = String(Math.round((wrapped + 360) % 360)).padStart(3, '0');
      // (the wall in view lit)
      strip.current?.querySelectorAll<HTMLElement>('[data-yaw]').forEach((el) => {
        const d = Math.abs(yawDelta(wrapped * DEG, Number(el.dataset.yaw) * DEG)) / DEG;
        el.classList.toggle('is-near', d < 30);
      });
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);
  const name = (id: (typeof MARKS)[number]['id']) => (id === 'bank' ? t.bank : id === 'ahead' ? t.ahead : t.screens.modes);
  const go = (id: (typeof MARKS)[number]['id']) => (id === 'bank' ? toBank() : turnTo(id));
  // (the tape repeats a turn either side, so it never runs out)
  return (
    <div className="ck3-tape-top ck3-hud-ui" dir="ltr" style={{ '--px': TAPE_PX } as CSSProperties}>
      <div ref={strip} className="ck3-tape-strip">
        {[-360, 0, 360].map((off) =>
          MARKS.map((m) => (
            <button
              key={`${off}-${m.id}`}
              type="button"
              className="ck3-tape-stop"
              data-yaw={m.yaw}
              style={{ '--at': m.yaw + off } as CSSProperties}
              onClick={() => go(m.id)}
              tabIndex={off === 0 ? 0 : -1}
              aria-hidden={off !== 0}
            >
              <span aria-hidden>{m.icons}</span> {name(m.id)}
            </button>
          )),
        )}
      </div>
      <span className="ck3-tape-caret" aria-hidden>
        <span ref={readout}>000</span>
      </span>
    </div>
  );
}

export function Hud({ hover, onClose }: { hover: FaceId | null; onClose: () => void }) {
  const t = useT();
  const d = t.deck;
  const lang = useLang((s) => s.lang);
  const stop = useCockpit((s) => s.stop);
  const focused = useCockpit((s) => s.focused);
  const step = useCockpit((s) => s.step);
  const turnTo = useCockpit((s) => s.turnTo);
  const rtl = lang === 'he';
  // (in Hebrew the arrows point the way the reading goes: the "next" one is on the left)
  const next = () => {
    sfx.whoosh();
    step(1);
  };
  const prev = () => {
    sfx.whoosh();
    step(-1);
  };
  const hoverName =
    hover === null || hover === 'windscreen'
      ? null
      : hover === 'stick'
        ? d.stick
        : hover === 'manual'
          ? d.manual
          : hover === 'overhead'
            ? d.overhead
            : hover === 'remote'
              ? d.remote
              : `${d.screens[hover]} · ${d.clickToOpen}`;

  return (
    <div className="ck3-hud" dir={rtl ? 'rtl' : 'ltr'}>
      <span className="ck3-visor" aria-hidden />
      <button type="button" className="ck3-exit ck3-hud-ui" onClick={onClose}>
        <span aria-hidden>🚀</span> {d.back}
      </button>
      <HeadingTape />

      {!isTouchDevice && hoverName && !focused && <div className="ck3-hover">{hoverName}</div>}
      {!focused && <div className="ck3-hint">{isTouchDevice ? d.lookTouch : d.lookMouse}</div>}

      {isTouchDevice ? (
        <nav className="ck3-nav ck3-hud-ui" aria-label={d.ahead}>
          <button type="button" className="ck3-nav-arrow" onClick={rtl ? next : prev} aria-label={rtl ? d.turnRight : d.turnLeft}>
            ◀
          </button>
          <div className="ck3-nav-here">
            <span className="ck3-nav-icon" aria-hidden>
              {stopIcon(stop)}
            </span>
            <span className="ck3-nav-name">{stop === 'ahead' ? d.ahead : d.screens[stop]}</span>
            <span className="ck3-nav-dots" aria-hidden>
              {STOPS.map((s) => (
                <i key={s} className={s === stop ? 'is-on' : ''} />
              ))}
            </span>
          </div>
          <button type="button" className="ck3-nav-arrow" onClick={rtl ? prev : next} aria-label={rtl ? d.turnLeft : d.turnRight}>
            ▶
          </button>
        </nav>
      ) : (
        <nav className="ck3-dock ck3-hud-ui" aria-label={d.ahead}>
          {STOPS.map((s) => (
            <button key={s} type="button" className={`ck3-dock-key ck3-target ${s === stop ? 'is-on' : ''}`} onClick={() => turnTo(s)} title={s === 'ahead' ? d.ahead : d.screens[s]}>
              <span aria-hidden>{stopIcon(s)}</span>
              <em>{s === 'ahead' ? d.ahead : d.screens[s]}</em>
            </button>
          ))}
        </nav>
      )}

      {!isTouchDevice && !focused && <TargetCursor targetSelector=".ck3-target" cursorColor="#ffd9a8" cursorColorOnTarget="#ffb35c" spinDuration={3} size={30} cornerSize={10} thickness={2} padding={8} blendMode="normal" showLabel={false} container={null} />}
    </div>
  );
}
