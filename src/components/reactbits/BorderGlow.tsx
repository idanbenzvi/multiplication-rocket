// BorderGlow from React Bits (https://reactbits.dev/components/border-glow), by
// David Haz, MIT + Commons Clause (its notice below; used here as part of the
// game, as the licence allows): the launch bay's buttons for choosing a ship
// (Hangar.tsx). Changes: it wraps a button rather than being a card (no
// background or border of its own: its coloured edge is a ring drawn over
// the button's, and the fill near the edge is left out), and as a phone has
// no pointer hovering to light it, its light can go round by itself, all the
// time (orbit) or once each time `sweep` changes; with reduced motion it just
// glows, still (orbiting) or not at all.
//
// Copyright (c) 2026 David Haz. Permission is hereby granted, free of charge,
// to any person obtaining a copy of this software and associated
// documentation files (the "Software"), to deal in the Software without
// restriction, including without limitation the rights to use, copy, modify,
// merge, publish, and distribute the Software as part of an application,
// website, or product, subject to the following conditions: the above
// copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software. Commons Clause
// Restriction: you may use this Software, including for any commercial
// purpose, so long as you do not sell, sublicense, or redistribute the
// components themselves, whether alone, in a bundle, or as a ported version.
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.
import { useCallback, useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import './BorderGlow.css';

interface BorderGlowProps {
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
  edgeSensitivity?: number;
  /** the glow's colour, as "H S L" (e.g. "40 80 80") */
  glowColor?: string;
  borderRadius?: number;
  glowRadius?: number;
  glowIntensity?: number;
  coneSpread?: number;
  /** three colours for the edge's mesh gradient */
  colors?: string[];
  /** how wide the coloured edge is (px) */
  ring?: number;
  /** the light goes round and round by itself, taking this long each time (ms) */
  orbit?: number;
  /** each time this changes (to something other than null), the light goes round once */
  sweep?: unknown;
  /** how long it takes going round once (ms) */
  sweepMs?: number;
}

function parseHSL(hslStr: string): { h: number; s: number; l: number } {
  const match = hslStr.match(/([\d.]+)\s*([\d.]+)%?\s*([\d.]+)%?/);
  if (!match) return { h: 40, s: 80, l: 80 };
  return { h: parseFloat(match[1]), s: parseFloat(match[2]), l: parseFloat(match[3]) };
}

function buildGlowVars(glowColor: string, intensity: number): Record<string, string> {
  const { h, s, l } = parseHSL(glowColor);
  const base = `${h}deg ${s}% ${l}%`;
  const opacities = [100, 60, 50, 40, 30, 20, 10];
  const keys = ['', '-60', '-50', '-40', '-30', '-20', '-10'];
  const vars: Record<string, string> = {};
  for (let i = 0; i < opacities.length; i++) {
    vars[`--glow-color${keys[i]}`] = `hsl(${base} / ${Math.min(opacities[i] * intensity, 100)}%)`;
  }
  return vars;
}

const GRADIENT_POSITIONS = ['80% 55%', '69% 34%', '8% 6%', '41% 38%', '86% 85%', '82% 18%', '51% 4%'];
const GRADIENT_KEYS = ['--gradient-one', '--gradient-two', '--gradient-three', '--gradient-four', '--gradient-five', '--gradient-six', '--gradient-seven'];
const COLOR_MAP = [0, 1, 2, 0, 1, 2, 1];

function buildGradientVars(colors: string[]): Record<string, string> {
  const vars: Record<string, string> = {};
  for (let i = 0; i < 7; i++) {
    const c = colors[Math.min(COLOR_MAP[i], colors.length - 1)];
    vars[GRADIENT_KEYS[i]] = `radial-gradient(at ${GRADIENT_POSITIONS[i]}, ${c} 0px, transparent 50%)`;
  }
  vars['--gradient-base'] = `linear-gradient(${colors[0]} 0 100%)`;
  return vars;
}

const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);
const easeInOutCubic = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
/** how near the edge the light seems to be, going round by itself (0 … 100) */
const ORBIT_PROXIMITY = 88;

const BorderGlow: React.FC<BorderGlowProps> = ({
  children,
  className = '',
  style,
  edgeSensitivity = 30,
  glowColor = '40 80 80',
  borderRadius = 28,
  glowRadius = 40,
  glowIntensity = 1.0,
  coneSpread = 25,
  colors = ['#c084fc', '#f472b6', '#38bdf8'],
  ring = 2,
  orbit,
  sweep,
  sweepMs = 1500,
}) => {
  const cardRef = useRef<HTMLSpanElement>(null);
  /** a mouse over it: it follows that rather than going round */
  const hovering = useRef(false);

  const getCenterOfElement = useCallback((el: HTMLElement) => {
    const { width, height } = el.getBoundingClientRect();
    return [width / 2, height / 2];
  }, []);

  const getEdgeProximity = useCallback(
    (el: HTMLElement, x: number, y: number) => {
      const [cx, cy] = getCenterOfElement(el);
      const dx = x - cx;
      const dy = y - cy;
      let kx = Infinity;
      let ky = Infinity;
      if (dx !== 0) kx = cx / Math.abs(dx);
      if (dy !== 0) ky = cy / Math.abs(dy);
      return Math.min(Math.max(1 / Math.min(kx, ky), 0), 1);
    },
    [getCenterOfElement],
  );

  const getCursorAngle = useCallback(
    (el: HTMLElement, x: number, y: number) => {
      const [cx, cy] = getCenterOfElement(el);
      const dx = x - cx;
      const dy = y - cy;
      if (dx === 0 && dy === 0) return 0;
      const radians = Math.atan2(dy, dx);
      let degrees = radians * (180 / Math.PI) + 90;
      if (degrees < 0) degrees += 360;
      return degrees;
    },
    [getCenterOfElement],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLSpanElement>) => {
      const card = cardRef.current;
      if (!card || e.pointerType !== 'mouse') return;
      hovering.current = true;
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      card.style.setProperty('--edge-proximity', `${(getEdgeProximity(card, x, y) * 100).toFixed(3)}`);
      card.style.setProperty('--cursor-angle', `${getCursorAngle(card, x, y).toFixed(3)}deg`);
    },
    [getEdgeProximity, getCursorAngle],
  );

  // going round and round by itself
  useEffect(() => {
    const card = cardRef.current;
    if (!orbit || !card) return;
    card.classList.add('sweep-active');
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      card.style.setProperty('--edge-proximity', `${ORBIT_PROXIMITY}`);
      card.style.setProperty('--cursor-angle', '45deg');
      return () => card.classList.remove('sweep-active');
    }
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (hovering.current) return;
      // (fading in, the first time round)
      const k = Math.min(1, (now - t0) / 600);
      card.style.setProperty('--edge-proximity', `${(ORBIT_PROXIMITY * easeOutCubic(k)).toFixed(2)}`);
      card.style.setProperty('--cursor-angle', `${((((now - t0) / orbit) * 360 + 110) % 360).toFixed(2)}deg`);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      card.classList.remove('sweep-active');
    };
  }, [orbit]);

  // once round, each time `sweep` changes (not to start with, nor changing to null)
  const swept = useRef(sweep);
  useEffect(() => {
    const card = cardRef.current;
    if (!card || orbit || swept.current === sweep) return;
    swept.current = sweep;
    if (sweep === null || sweep === undefined) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    card.classList.add('sweep-active');
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / sweepMs);
      // (in at the start and out at the end, round once between)
      const near = t < 0.2 ? easeOutCubic(t / 0.2) : t > 0.75 ? 1 - easeOutCubic((t - 0.75) / 0.25) : 1;
      card.style.setProperty('--edge-proximity', `${(100 * near).toFixed(2)}`);
      card.style.setProperty('--cursor-angle', `${(110 + 360 * easeInOutCubic(t)).toFixed(2)}deg`);
      if (t < 1) raf = requestAnimationFrame(tick);
      else card.classList.remove('sweep-active');
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      card.classList.remove('sweep-active');
    };
  }, [sweep, orbit, sweepMs]);

  return (
    <span
      ref={cardRef}
      onPointerMove={handlePointerMove}
      onPointerLeave={() => {
        hovering.current = false;
      }}
      className={`border-glow ${className}`}
      style={
        {
          ...style,
          '--edge-sensitivity': edgeSensitivity,
          '--border-radius': `${borderRadius}px`,
          '--glow-padding': `${glowRadius}px`,
          '--cone-spread': coneSpread,
          '--ring': `${ring}px`,
          ...buildGlowVars(glowColor, glowIntensity),
          ...buildGradientVars(colors),
        } as CSSProperties
      }
    >
      {children}
      <span className="border-glow-ring" aria-hidden="true" />
      <span className="edge-light" aria-hidden="true" />
    </span>
  );
};

export default BorderGlow;
