import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { useT } from '../../../i18n/useLang';
import { destinationName } from '../../../i18n/strings';
import { getLevelConfig } from '../../../game/levels';
import { currentTrack } from '../../../audio/useAudio';
import { canyonWind, sfx } from '../../../audio/sfx';
import { pauseGame, resumeGame } from '../../../game/gameClock';
import { LOOKS } from '../../scene/planetLooks';
import { storyPilot } from '../../story/useStory';
import { pilotCanopy, rearShipSvg, sprite } from '../../traffic/trafficArt';
import { JetSmoke, type Jet } from '../../reactbits/JetSmoke';
import DecryptedText from '../../reactbits/DecryptedText';
import ShinyText from '../../reactbits/ShinyText';
import { drawPlanet } from '../drawPlanet';
import { useCockpit } from '../store';
import { endArrival, useArrival } from './arrival';
import './descent.css';

// Arriving at a destination for a Canyon Run (arrival.ts): the pilot's
// ship, seen from behind, dives into the destination's air. It grows from a
// world ahead to its whole sky; the ship's wrapped in fire as it hits the
// air, a glow round its nose, tongues of flame and a trail of glowing smoke
// streaming back past it (React Bits' FlyingButton smoke, JetSmoke, its jets
// round the ship), embers flying off it and the air streaking past, the
// view shaking harder the deeper it goes, ENTERING ATMOSPHERE decoding in
// over the world's name. Then the view rushes in, blurring, to white, and
// the cockpit opens under it, the canyon built meanwhile: the white clears
// on the dive into it. With reduced motion it's still, and fades.

/** the dive (s), and when the view starts rushing in, and the white coming up */
const DIVE_S = 3.9;
const RUSH_FROM = 2.85;
const WHITE_FROM = 3.15;
/** the white's held till the canyon's there (s, at least and at most), then clears */
const HOLD_MIN = 0.35;
const HOLD_MAX = 3;
const CLEAR_S = 0.8;
/** with reduced motion */
const CALM_DIVE_S = 2.4;
const EMBERS = 260;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (a: number, b: number, x: number) => {
  const k = clamp01((x - a) / (b - a));
  return k * k * (3 - 2 * k);
};
const between = (a: number, b: number) => a + Math.random() * (b - a);

export function Descent() {
  const level = useArrival((s) => s.level);
  const id = useArrival((s) => s.id);
  if (level === null) return null;
  return createPortal(<Dive key={id} level={level} />, document.body);
}

interface Ember {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  w: number;
}

function Dive({ level }: { level: number }) {
  const t = useT();
  const back = useRef<HTMLCanvasElement>(null);
  const front = useRef<HTMLCanvasElement>(null);
  const smokeHost = useRef<HTMLDivElement>(null);
  const scene = useRef<HTMLDivElement>(null);
  const white = useRef<HTMLDivElement>(null);
  const skipAt = useRef<number | null>(null);
  const [calm] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  const [words, setWords] = useState(true);
  const config = getLevelConfig(level);
  const look = LOOKS[config.destinationIndex % LOOKS.length];

  useEffect(() => {
    const bc = back.current!.getContext('2d')!;
    const fc = front.current!.getContext('2d')!;
    const before = currentTrack();
    pauseGame('canyon');
    sfx.hyperdrive();
    const wind = calm ? null : canyonWind();
    let windAt = 0;
    // the canyon, built while it dives (the cockpit's own chunk with it)
    let failed = false;
    let canyon: typeof import('./useCanyon') | null = null;
    import('./useCanyon')
      .then((m) => {
        canyon = m;
        m.useCanyon.getState().start(m.runQuality(), calm, 'arrival', level);
      })
      .catch(() => (failed = true));
    import('../Cockpit360').catch(() => {});

    // the ship, from behind
    const pilot = storyPilot();
    const svg = rearShipSvg(pilot?.accent, pilot?.admiral ?? false, pilot?.ship ?? 'classic');
    const porthole = pilot?.avatar ? { emoji: pilot.avatar, ...pilotCanopy(pilot.ship) } : undefined;
    sprite(svg, 384, 384, porthole);
    const hot = document.createElement('canvas');
    hot.width = hot.height = 384;
    const hc = hot.getContext('2d')!;

    // the smoke, streaming back off it
    let smoke: JetSmoke | null = null;
    let smokeCanvas: HTMLCanvasElement | null = null;
    if (!calm && smokeHost.current) {
      smokeCanvas = document.createElement('canvas');
      smokeCanvas.className = 'cd-smoke';
      smokeHost.current.append(smokeCanvas);
      smoke = JetSmoke.create(smokeCanvas);
      if (!smoke) smokeCanvas.remove();
    }

    let W = 0;
    let H = 0;
    const size = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth;
      H = window.innerHeight;
      for (const c of [back.current!, front.current!]) {
        c.width = Math.round(W * dpr);
        c.height = Math.round(H * dpr);
      }
      bc.setTransform(dpr, 0, 0, dpr, 0, 0);
      fc.setTransform(dpr, 0, 0, dpr, 0, 0);
      smoke?.resize(W, H, 0.6);
    };
    size();
    window.addEventListener('resize', size);

    const stars = Array.from({ length: 160 }, () => ({ a: Math.random() * Math.PI * 2, r: Math.random(), b: between(0.3, 1) }));
    const embers: Ember[] = Array.from({ length: EMBERS }, () => ({ x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, w: 1 }));
    let nextEmber = 0;
    let owed = 0;

    const dive = calm ? CALM_DIVE_S : DIVE_S;
    const whiteFrom = calm ? dive - 0.8 : WHITE_FROM;
    let stage: 'dive' | 'white' | 'clear' = 'dive';
    let whiteAt = 0;
    let clearAt = 0;
    let t0 = 0;
    let last = 0;
    let raf = 0;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!t0) t0 = now;
      if (skipAt.current !== null) {
        // (Skip: on to the white)
        if (stage === 'dive') t0 = Math.min(t0, now - whiteFrom * 1000);
        skipAt.current = null;
      }
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now;
      const time = (now - t0) / 1000;

      if (stage === 'dive') {
        draw(time, dt);
        const k = smooth(whiteFrom, dive, time);
        if (white.current) white.current.style.opacity = String(k);
        if (!calm && scene.current) {
          const rush = smooth(RUSH_FROM, dive, time);
          scene.current.style.transform = `scale(${(1 + rush * 0.7).toFixed(3)})`;
          scene.current.style.filter = rush > 0.01 ? `blur(${(rush * 18).toFixed(1)}px) brightness(${(1 + rush * 0.8).toFixed(2)})` : '';
        }
        if (time > 2.7) setWords(false);
        if (wind && now - windAt > 100) {
          windAt = now;
          const p = clamp01(time / dive);
          wind.set(0.25 + 0.75 * p, 0.2 + 0.7 * p);
        }
        if (!calm && time >= RUSH_FROM && time - dt < RUSH_FROM) sfx.warp();
        if (time >= dive) {
          stage = 'white';
          whiteAt = now;
          setWords(false);
          wind?.stop();
          if (white.current) white.current.style.opacity = '1';
          if (failed || !canyon) {
            // (no canyon to go to: back to the flight)
            finish();
            return;
          }
          // the cockpit, under the white: the canyon's run goes there
          useCockpit.getState().open(null, { before });
        }
        return;
      }
      if (stage === 'white') {
        const held = (now - whiteAt) / 1000;
        const run = canyon!.useCanyon.getState();
        if (run.phase === 'off') {
          // (the run's been ended under the white: back to the flight)
          finish();
          return;
        }
        if ((run.seen && held >= HOLD_MIN) || held >= HOLD_MAX) {
          stage = 'clear';
          clearAt = now;
          run.unveil();
        }
        return;
      }
      const k = clamp01((now - clearAt) / 1000 / CLEAR_S);
      if (white.current) white.current.style.opacity = String(1 - k * k * (3 - 2 * k));
      if (scene.current) scene.current.style.opacity = '0';
      if (k >= 1) finish();
    };

    const draw = (time: number, dt: number) => {
      const p = calm ? 0.42 : clamp01(time / DIVE_S);
      const heat = calm ? 0.55 : smooth(0.12, 0.62, p);
      const m = Math.min(W, H);
      const shake = calm ? 0 : (0.6 + 9 * heat * heat) * (1 + 1.5 * smooth(RUSH_FROM - 0.6, DIVE_S, time));
      const sx = W / 2 + (Math.random() - 0.5) * shake;
      const sy = H * 0.42 + (Math.random() - 0.5) * shake;
      const s = m * 0.3 * (1 - 0.22 * p);

      // ---- space, and the world ahead filling it ----
      bc.globalCompositeOperation = 'source-over';
      bc.fillStyle = '#05030c';
      bc.fillRect(0, 0, W, H);
      const pace = 0.08 + 1.6 * p * p;
      bc.fillStyle = '#ffffff';
      for (const st of stars) {
        st.r += st.r * pace * dt * 2 + pace * dt * 0.05;
        if (st.r > 1.2) st.r = between(0.02, 0.1);
        const r = st.r * Math.max(W, H) * 0.75;
        const x = sx + Math.cos(st.a) * r;
        const y = sy + Math.sin(st.a) * r;
        const len = Math.max(1, r * pace * 0.08);
        bc.globalAlpha = st.b * Math.min(1, st.r * 3);
        bc.fillRect(x, y, 1.6, 1.6);
        if (len > 2) {
          bc.strokeStyle = 'rgba(255, 255, 255, 0.5)';
          bc.lineWidth = 1;
          bc.beginPath();
          bc.moveTo(x, y);
          bc.lineTo(x - Math.cos(st.a) * len, y - Math.sin(st.a) * len);
          bc.stroke();
        }
      }
      bc.globalAlpha = 1;
      const R = m * (0.3 + 2.5 * p ** 2.1);
      drawPlanet(bc, W / 2, H * 0.5 + R * 0.6, R, look, config.destinationIndex, time);
      // in its air: the sky turning its colour
      const air = smooth(0.42, 0.95, p) * 0.78;
      if (air > 0) {
        const g = bc.createRadialGradient(sx, sy, 0, sx, sy, Math.max(W, H) * 0.8);
        g.addColorStop(0, rgba(look.glow, air * 0.6));
        g.addColorStop(1, rgba(look.base, air));
        bc.fillStyle = g;
        bc.fillRect(0, 0, W, H);
      }

      // ---- the smoke, streaming back ----
      if (smoke) {
        const yUp = H - sy;
        const thrust = 0.35 + 1.5 * heat;
        const jets: Jet[] = [150, 30, 212, 328].map((deg, i) => {
          const a = (deg * Math.PI) / 180;
          const flutter = 1 + 0.15 * Math.sin(time * (6 + i * 1.3) + i);
          return { x: sx + Math.cos(a) * s * 0.36, y: yUp + Math.sin(a) * s * 0.3, dx: Math.cos(a), dy: Math.sin(a), thrust: thrust * flutter };
        });
        smoke.frame(dt, jets, {
          scale: Math.max(1.2, m / 380),
          activity: heat,
          smoke: 0.8 + 1.4 * heat,
          turbulence: 1.2 + heat,
          wind: 0,
          buoyancy: 0.6,
          fade: 1.6 - 0.6 * heat,
          smokeColor: '#ff7a3d',
          thrustColor: '#ffd27a',
        });
      }

      // ---- the fire round the ship, and what flies off it ----
      fc.clearRect(0, 0, W, H);
      fc.globalCompositeOperation = 'lighter';
      // the air past it, streaking
      const streaks = Math.round(26 + 40 * heat);
      fc.lineWidth = 1.2;
      for (let i = 0; i < streaks; i++) {
        const a = Math.random() * Math.PI * 2;
        const r0 = s * between(0.6, 1.6);
        const len = s * between(0.5, 2.2) * (0.4 + heat);
        fc.strokeStyle = `rgba(255, ${Math.round(between(170, 230))}, 160, ${(0.05 + 0.18 * heat).toFixed(3)})`;
        fc.beginPath();
        fc.moveTo(sx + Math.cos(a) * r0, sy + Math.sin(a) * r0);
        fc.lineTo(sx + Math.cos(a) * (r0 + len), sy + Math.sin(a) * (r0 + len));
        fc.stroke();
      }
      // the glow round its nose
      const flicker = 0.85 + 0.15 * Math.sin(time * 41) * Math.sin(time * 17.3);
      const shock = fc.createRadialGradient(sx, sy, s * 0.1, sx, sy, s * (0.9 + 0.8 * heat));
      shock.addColorStop(0, `rgba(255, 255, 240, ${(0.95 * heat * flicker).toFixed(3)})`);
      shock.addColorStop(0.3, `rgba(255, 214, 120, ${(0.75 * heat * flicker).toFixed(3)})`);
      shock.addColorStop(0.62, `rgba(255, 110, 40, ${(0.42 * heat).toFixed(3)})`);
      shock.addColorStop(1, 'rgba(190, 40, 110, 0)');
      fc.fillStyle = shock;
      fc.fillRect(sx - s * 2, sy - s * 2, s * 4, s * 4);
      // tongues of flame, flung back round it
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 + Math.sin(time * 3 + i) * 0.12;
        const len = s * (0.35 + 1.3 * heat) * (0.7 + 0.3 * Math.sin(time * (9 + i) + i * 2));
        const bx = sx + Math.cos(a) * s * 0.3;
        const by = sy + Math.sin(a) * s * 0.26;
        const tx = bx + Math.cos(a) * len;
        const ty = by + Math.sin(a) * len;
        const w = s * 0.11;
        const g = fc.createLinearGradient(bx, by, tx, ty);
        g.addColorStop(0, `rgba(255, 240, 190, ${(0.8 * heat).toFixed(3)})`);
        g.addColorStop(0.4, `rgba(255, 140, 50, ${(0.5 * heat).toFixed(3)})`);
        g.addColorStop(1, 'rgba(200, 40, 80, 0)');
        fc.fillStyle = g;
        fc.beginPath();
        fc.moveTo(bx - Math.sin(a) * w, by + Math.cos(a) * w);
        fc.quadraticCurveTo(bx + Math.cos(a) * len * 0.6, by + Math.sin(a) * len * 0.6, tx, ty);
        fc.quadraticCurveTo(bx + Math.cos(a) * len * 0.6, by + Math.sin(a) * len * 0.6, bx + Math.sin(a) * w, by - Math.cos(a) * w);
        fc.fill();
      }
      // embers
      owed += dt * (calm ? 30 : 60 + 420 * heat);
      while (owed >= 1) {
        owed -= 1;
        const e = embers[nextEmber++ % EMBERS];
        const a = Math.random() * Math.PI * 2;
        const v = between(160, 560) * (calm ? 0.3 : 0.5 + heat);
        e.x = sx + Math.cos(a) * s * 0.32;
        e.y = sy + Math.sin(a) * s * 0.28;
        e.vx = Math.cos(a) * v;
        e.vy = Math.sin(a) * v;
        e.life = e.max = between(0.35, 1.1);
        e.w = between(1.2, 3.2);
      }
      for (const e of embers) {
        if (e.life <= 0) continue;
        e.life -= dt;
        e.vx *= 1 + dt * 0.8;
        e.vy *= 1 + dt * 0.8;
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        const k = clamp01(e.life / e.max);
        fc.strokeStyle = `rgba(255, ${Math.round(90 + 160 * k)}, ${Math.round(40 + 160 * k * k)}, ${(0.9 * k).toFixed(3)})`;
        fc.lineWidth = e.w;
        fc.beginPath();
        fc.moveTo(e.x, e.y);
        fc.lineTo(e.x - e.vx * 0.035, e.y - e.vy * 0.035);
        fc.stroke();
      }

      // ---- the ship, glowing with the heat ----
      fc.globalCompositeOperation = 'source-over';
      const ship = sprite(svg, 384, 384, porthole);
      if (ship) {
        hc.globalCompositeOperation = 'source-over';
        hc.clearRect(0, 0, 384, 384);
        hc.drawImage(ship, 0, 0);
        hc.globalCompositeOperation = 'source-atop';
        const tint = hc.createRadialGradient(192, 230, 20, 192, 192, 220);
        tint.addColorStop(0, `rgba(255, 190, 90, ${(0.1 * heat).toFixed(3)})`);
        tint.addColorStop(1, `rgba(255, 90, 30, ${(0.5 * heat).toFixed(3)})`);
        hc.fillStyle = tint;
        hc.fillRect(0, 0, 384, 384);
        const wobble = calm ? 0 : Math.sin(time * 7.3) * 0.035 * heat + (Math.random() - 0.5) * 0.02 * heat;
        fc.save();
        fc.translate(sx, sy);
        fc.rotate(wobble);
        fc.drawImage(hot, -s / 2, -s / 2, s, s);
        fc.restore();
      }
    };

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      cancelAnimationFrame(raf);
      resumeGame('canyon');
      endArrival();
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' && e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      e.stopPropagation();
      skipAt.current = 0;
    };
    window.addEventListener('keydown', onKey, true);

    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', size);
      window.removeEventListener('keydown', onKey, true);
      wind?.stop();
      smoke?.dispose();
      smokeCanvas?.remove();
      resumeGame('canyon');
    };
    // (once, for this descent)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="cd" role="presentation">
      <div ref={scene} className="cd-scene">
        <canvas ref={back} className="cd-canvas" />
        <div ref={smokeHost} className="cd-smoke-host" />
        <canvas ref={front} className="cd-canvas" />
      </div>
      <AnimatePresence>
        {words && (
          <motion.div className="cd-words" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 1.1, filter: 'blur(8px)' }} transition={{ delay: 0.35, duration: 0.5 }}>
            <DecryptedText text={t.canyon.entering} className="cd-entering" animateOn="view" speed={45} maxIterations={12} sequential revealDirection="start" characters="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*" />
            <ShinyText text={destinationName(t, config)} className="cd-name" color="#fff1dc" shineColor="#ffffff" speed={1.8} />
          </motion.div>
        )}
      </AnimatePresence>
      <button type="button" className="cd-skip" onClick={() => (skipAt.current = 0)}>
        {t.canyon.skip} ⏭
      </button>
      <div ref={white} className="cd-white" style={{ opacity: 0 }} />
    </div>
  );
}

function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a.toFixed(3)})`;
}
