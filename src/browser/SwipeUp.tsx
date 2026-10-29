import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '../i18n/useLang';
import { IN_APP } from '../storage/backup';
import './swipeUp.css';

// An iPhone on its side, in Safari (docs/plans/2026-10-29-leave-fullscreen-haptics.md):
// its bars take a good slice of a screen that's short already, and no iPhone
// browser lets a page go full screen. What it does do is tuck its bars away
// as the page is scrolled down; but the game doesn't scroll. So while they
// show, a sheet over the game asks for a swipe up, with room under it to
// scroll into: the swipe tucks the bars away, the page is the whole screen's
// height again, the room goes and the game's back where it was. Should the
// bars come back (a tap at the screen's top edge), it asks again; Not now, or
// a browser whose bars stay put however it's scrolled, and it doesn't for the
// rest of the visit. From the Home Screen the game has no bars to tuck away.

const IPHONE = typeof navigator !== 'undefined' && /iPhone|iPod/.test(navigator.userAgent);

/** opened from the Home Screen: no browser bars */
const standalone = () => (navigator as Navigator & { standalone?: boolean }).standalone === true || !!window.matchMedia?.('(display-mode: standalone), (display-mode: fullscreen)').matches;

/** the page's height with the browser's bars tucked away (100lvh) */
function fullHeight(): number {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:100vh;height:100lvh;visibility:hidden;pointer-events:none';
  document.body.appendChild(probe);
  const height = probe.getBoundingClientRect().height;
  probe.remove();
  return height;
}

/** on its side, with the bars taking more than a sliver of the height */
const barsInTheWay = () => window.innerWidth > window.innerHeight && fullHeight() - window.innerHeight > 20;

/** scrolled this far (px) with the bars still there, they're staying */
const SWIPED_PX = 60;
/** … once it's been still this long (ms) */
const SETTLED_MS = 1200;

/** Not now, or the bars staying put: not asked again this visit */
let declined = false;

export function SwipeUp() {
  const t = useT();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!IPHONE || IN_APP || standalone()) return;
    let raf = 0;
    let settle = 0;
    const check = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setShow(!declined && barsInTheWay()));
    };
    const scrolled = () => {
      check();
      window.clearTimeout(settle);
      if (window.scrollY < SWIPED_PX) return;
      settle = window.setTimeout(() => {
        if (!barsInTheWay()) return;
        // (this browser keeps them, however it's scrolled)
        declined = true;
        setShow(false);
        window.scrollTo(0, 0);
      }, SETTLED_MS);
    };
    check();
    window.addEventListener('resize', check);
    window.visualViewport?.addEventListener('resize', check);
    window.addEventListener('scroll', scrolled, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(settle);
      window.removeEventListener('resize', check);
      window.visualViewport?.removeEventListener('resize', check);
      window.removeEventListener('scroll', scrolled);
    };
  }, []);

  // room to scroll into while it asks (gone with it, and the page with it is the screen's height again)
  useEffect(() => {
    if (!show) return;
    document.documentElement.classList.add('swipe-room');
    return () => document.documentElement.classList.remove('swipe-room');
  }, [show]);

  if (!show) return null;
  return createPortal(
    <div className="swipe-up" role="dialog" aria-label={t.swipeUpTitle}>
      <div className="swipe-up-hand" aria-hidden>
        <span className="swipe-up-chevrons">
          <i />
          <i />
          <i />
        </span>
        <span className="swipe-up-finger">👆</span>
      </div>
      <p className="swipe-up-title">{t.swipeUpTitle}</p>
      <button
        type="button"
        className="swipe-up-later"
        onClick={() => {
          declined = true;
          setShow(false);
        }}
      >
        {t.swipeUpNotNow}
      </button>
    </div>,
    document.body,
  );
}
