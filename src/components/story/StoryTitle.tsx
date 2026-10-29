import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { SpaceTimesLogo } from '../logo/SpaceTimesLogo';
import { LiquidMetal } from '../logo/LiquidMetal';
import { LOGO } from '../logo/layout';
import { calmMotion } from '../arrival/dropOut';
import { sfx } from '../../audio/sfx';
import { useT } from '../../i18n/useLang';
import { useSkip } from './filmHooks';
import { GlitchTeleport, type Box } from './GlitchTeleport';
import { loadGlitchArt } from './glitchArt';
import { endTitle, useStory } from './useStory';

// The title: out of the launch's white, SPACE TIMES poured in liquid metal,
// the letters first (LiquidMetal.tsx); as they cool, the rest of the logo
// comes: the globe opening out from its middle behind them with a ring of
// light, the + × − ÷ tokens popping onto their orbit, the rockets flying in
// along their trails, the sparkles, and the lightning and the shine switched
// on. It holds, then glitches out and in again at its place in the top bar
// (GlitchTeleport.tsx), as the game starts under it. Watching it again
// (About's over the top bar) it only glitches out; with reduced motion it
// fades in and out.

/** when the metal starts pouring, the white mostly gone (s) */
const POUR_AT = 0.45;
/** the rest of the logo coming, from when the letters have cooled (ms) */
const BUILD_MS = 1250;
/** how long the whole logo holds before it goes (ms) */
const HOLD_MS = 1500;
/** reduced motion: how long it holds (ms) */
const CALM_HOLD_MS = 2600;

type Stage = 'metal' | 'build' | 'hold' | 'glitch' | 'calm' | 'fade';

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeOut = (u: number) => 1 - (1 - clamp01(u)) ** 3;
/** overshooting a little before settling */
const easeBack = (u: number) => {
  const x = clamp01(u) - 1;
  return 1 + 2.7 * x ** 3 + 1.7 * x ** 2;
};

const boxOf = (r: DOMRect): Box => ({ x: r.left, y: r.top, w: r.width, h: r.height });

/** the rest of the logo coming, `ms` into it (the pieces' inline styles; cleared once it's whole), the art drawn `px` px to its own */
function build(art: HTMLElement, ring: HTMLElement | null, ms: number, px = 1) {
  const { globe } = LOGO;
  const q = <T extends HTMLElement>(sel: string) => Array.from(art.querySelectorAll<T>(sel));
  // the globe and everything drawn with it opening out from its middle
  const r = 620 * easeOut(ms / 760);
  for (const el of q('.st-whole')) el.style.clipPath = ms >= BUILD_MS ? '' : `circle(${r}px at ${globe.x}px ${globe.y}px)`;
  if (ring) {
    // (as far out as the globe's opened)
    ring.style.width = ring.style.height = `${2 * r * px}px`;
    ring.style.opacity = String(Math.max(0, 1 - ms / 700));
  }
  // the tokens popping on, one by one
  q('.st-token').forEach((el, i) => {
    el.style.scale = ms >= BUILD_MS ? '' : String(easeBack((ms - 260 - i * 95) / 380));
  });
  // the rockets flying in along their trails
  q('.st-rocket').forEach((el, i) => {
    const u = (ms - 380 - i * 120) / 480;
    const off = 220 * (1 - easeOut(u));
    const dx = Number(el.style.getPropertyValue('--dx')) || 0;
    const dy = Number(el.style.getPropertyValue('--dy')) || 0;
    el.style.visibility = u <= 0 && ms < BUILD_MS ? 'hidden' : '';
    el.style.translate = ms >= BUILD_MS ? '' : `${-dx * off}px ${-dy * off}px`;
  });
  // the sparkles
  q('.st-sparkle').forEach((el, i) => {
    el.style.scale = ms >= BUILD_MS ? '' : String(easeBack((ms - 520 - i * 55) / 300));
  });
  // the lightning, the shine and the scan switched on
  for (const el of q('.st-shine, .st-scan, .st-sparks')) el.style.visibility = ms < 900 ? 'hidden' : '';
}

export function StoryTitle() {
  const replay = useStory((s) => s.replay);
  const t = useT();
  const [calm] = useState(calmMotion);
  const [stage, setStage] = useState<Stage>(() => (calm ? 'calm' : 'metal'));
  const [metal, setMetal] = useState(!calm);
  const [jump, setJump] = useState<{ from: Box; to: Box | null } | null>(null);
  const logo = useRef<HTMLDivElement | null>(null);
  const ring = useRef<HTMLElement | null>(null);
  const [height] = useState(() => Math.round(Math.min(window.innerHeight * 0.44, (window.innerWidth * 0.82 * 729) / 860, 380)));
  const done = useRef(false);
  const finish = useCallback(() => {
    if (done.current) return;
    done.current = true;
    endTitle();
  }, []);
  useSkip(finish);

  // (the glitch's art made now, ready for the end)
  useEffect(() => {
    if (!calm) loadGlitchArt().catch(() => {});
  }, [calm]);

  // the rest of the logo coming, a frame at a time (its pieces hidden before the first is painted)
  useLayoutEffect(() => {
    const art = logo.current?.querySelector<HTMLElement>('.st-logo-art');
    if (stage !== 'build' || !art) return;
    let raf = 0;
    const start = performance.now();
    const px = height / LOGO.height;
    build(art, ring.current, 0, px);
    const frame = () => {
      const ms = performance.now() - start;
      build(art, ring.current, ms, px);
      if (ms >= BUILD_MS) setStage('hold');
      else raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      build(art, null, BUILD_MS);
    };
  }, [stage, height]);

  // holding, then gone: glitching from here to its place in the top bar (hidden till it's there; watching it again, About's over it)
  useEffect(() => {
    if (stage !== 'hold' && stage !== 'calm') return;
    const id = window.setTimeout(
      () => {
        if (stage === 'calm') {
          setStage('fade');
          return;
        }
        const here = logo.current?.querySelector('.st-logo')?.getBoundingClientRect();
        const there = replay ? null : document.querySelector('.hud-logo .st-logo')?.getBoundingClientRect();
        if (!here) {
          finish();
          return;
        }
        sfx.teleport(!!there && there.height > 0);
        setJump({ from: boxOf(here), to: there && there.height > 0 ? boxOf(there) : null });
        setStage('glitch');
      },
      stage === 'calm' ? CALM_HOLD_MS : HOLD_MS,
    );
    return () => window.clearTimeout(id);
  }, [stage, replay, finish]);

  const dark = stage !== 'glitch' && stage !== 'fade';
  return (
    <motion.div
      className="story-title"
      role="img"
      aria-label={t.story.label}
      initial={{ backgroundColor: 'rgba(255, 252, 246, 1)' }}
      animate={{ backgroundColor: dark ? 'rgba(5, 3, 15, 1)' : 'rgba(5, 3, 15, 0)' }}
      transition={dark ? { duration: 1.1, ease: 'easeOut' } : { duration: 0.45, ease: 'easeInOut' }}
    >
      <motion.div
        ref={logo}
        className={`story-title-logo is-${stage}`}
        initial={calm ? { opacity: 0 } : false}
        animate={calm ? { opacity: stage === 'fade' ? 0 : 1 } : undefined}
        transition={{ duration: 0.8, ease: 'easeInOut', delay: stage === 'calm' ? 0.3 : 0 }}
        onAnimationComplete={() => stage === 'fade' && finish()}
      >
        <SpaceTimesLogo height={height} />
        <i
          ref={ring}
          className="story-title-ring"
          style={{ left: `${(LOGO.globe.x / LOGO.width) * 100}%`, top: `${(LOGO.globe.y / LOGO.height) * 100}%` }}
          aria-hidden
        />
        {metal && (
          <LiquidMetal
            height={height}
            delay={POUR_AT}
            onPour={() => sfx.metalPour()}
            onCooled={() => setStage((s) => (s === 'metal' ? 'build' : s))}
            onDone={() => setMetal(false)}
          />
        )}
      </motion.div>
      {jump && <GlitchTeleport from={jump.from} to={jump.to} onDone={finish} />}
    </motion.div>
  );
}
