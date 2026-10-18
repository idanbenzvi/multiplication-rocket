import { useEffect, useRef, useState } from 'react';
import { RearShip } from '../spaceArt';
import { ARRIVAL_MS } from './arrivalCard';
import { calmMotion } from './dropOut';
import { EclipseScene, type Point } from './eclipse';
import { HorizonScene } from './horizon';
import { useArrivalCanvas } from './useArrivalCanvas';
import './arrival.css';

// Arriving in a game mode opened through the warp (Monster Sun, Split Sky):
// as the warp clears, the mode's own sky lights up behind its lobby (Monster
// Sun's eclipsed monster sun, Split Sky's sunrise over a planet), and the
// pilot's ship flies in from behind the camera towards it, shrinking into the
// distance; then the lobby's card arrives (arrivalCard.ts: its panel can't be
// tapped till then). A tap or a key skips to the card. The
// sky stays behind the lobby, and fades once the game begins.

/** the ship's flight, from the mode opening (ms): it sets off as the warp clears */
const FLIGHT_MS = [480, 1750];
/** how far it flies off, in how many times its distance from the camera at the start */
const FLIGHT_DEPTH = 5;

export type ArrivalSky = 'eclipse' | 'horizon';

interface Props {
  sky: ArrivalSky;
  avatar?: string;
  /** false: fading away (the lobby has given way to the game) */
  show: boolean;
  /** the ship is there (`skipped`: a tap or a key cut it short) */
  onArrived: (skipped: boolean) => void;
}

const clamp01 = (t: number) => Math.max(0, Math.min(1, t));

export function ModeArrival({ sky, avatar, show, onArrived }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const shipRef = useRef<HTMLDivElement>(null);
  const [calm] = useState(calmMotion);
  const [scene] = useState(() => (sky === 'eclipse' ? new EclipseScene(calm) : new HorizonScene(calm)));
  // a skip jumps the clock ahead to the card
  const ahead = useRef(0);
  const clock = useRef(0);
  const arrived = useRef(false);
  const arrive = useRef(onArrived);
  arrive.current = (skipped: boolean) => {
    if (arrived.current) return;
    arrived.current = true;
    onArrived(skipped);
  };
  // it keeps drawing till it has faded away
  const [drawing, setDrawing] = useState(true);
  useEffect(() => {
    if (show) {
      setDrawing(true);
      return;
    }
    const id = window.setTimeout(() => setDrawing(false), 800);
    return () => window.clearTimeout(id);
  }, [show]);

  useArrivalCanvas(
    canvasRef,
    (ctx, W, H, elapsed) => {
      clock.current = elapsed;
      const ms = elapsed + ahead.current;
      if (calm || ms >= ARRIVAL_MS) arrive.current(false);
      const ship = flight(ms, W, H, scene.shipTarget(W, H), calm);
      if (scene instanceof EclipseScene) scene.draw(ctx, W, H, ms / 1000, ship);
      else scene.draw(ctx, W, H, ms / 1000);
      const el = shipRef.current;
      if (el) {
        el.style.display = ship ? '' : 'none';
        if (ship) {
          el.style.left = `${ship.x}px`;
          el.style.top = `${ship.y}px`;
          el.style.scale = String(ship.scale);
          el.style.rotate = `${ship.bank}deg`;
          el.style.opacity = String(ship.opacity);
        }
      }
    },
    drawing,
    'away',
  );

  // the card is there on time even if slow frames hold the flight back
  useEffect(() => {
    const id = window.setTimeout(() => arrive.current(false), ARRIVAL_MS);
    return () => window.clearTimeout(id);
  }, []);

  // a tap or a key skips to the card
  useEffect(() => {
    const skip = () => {
      if (arrived.current) return;
      ahead.current = Math.max(ahead.current, ARRIVAL_MS - clock.current);
      arrive.current(true);
    };
    const onKey = (e: KeyboardEvent) => {
      if (!e.repeat) skip();
    };
    window.addEventListener('pointerdown', skip, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('pointerdown', skip, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, []);

  return (
    <div className={`mode-arrival ${show ? '' : 'is-gone'}`} aria-hidden>
      <canvas ref={canvasRef} />
      <div ref={shipRef} className="player-ship mode-arrival-ship" style={{ display: 'none', '--burn': 0.6 } as React.CSSProperties}>
        <RearShip size={96} />
        {avatar && <span className="player-ship-avatar" style={{ fontSize: 19 }}>{avatar}</span>}
      </div>
    </div>
  );
}

/**
 * The ship's flight, `ms` after the mode opened: in from just behind the
 * camera at the bottom of the screen, flying off towards `to` at a steady
 * speed, so in perspective it shrinks and slows on screen as it gets far,
 * curving up on the way and fading out as it reaches it. Null when it isn't on
 * screen.
 */
function flight(ms: number, w: number, h: number, to: Point, calm: boolean) {
  if (calm) return null;
  const k = (ms - FLIGHT_MS[0]) / (FLIGHT_MS[1] - FLIGHT_MS[0]);
  if (k <= 0 || k >= 1) return null;
  // how near it still is (1 at the start), and how far along its way on screen
  const near = 1 / (1 + FLIGHT_DEPTH * k);
  const p = (1 - near) / (1 - 1 / (1 + FLIGHT_DEPTH));
  const from = { x: w * 0.6, y: h + 40 };
  const via = { x: w * 0.3, y: h * 0.72 };
  const at = (q: number) => ({
    x: (1 - q) ** 2 * from.x + 2 * (1 - q) * q * via.x + q * q * to.x,
    y: (1 - q) ** 2 * from.y + 2 * (1 - q) * q * via.y + q * q * to.y,
  });
  const here = at(p);
  const ahead = at(Math.min(1, p + 0.02));
  return {
    ...here,
    scale: 1.9 * near,
    // leaning into the curve
    bank: (Math.atan2(ahead.x - here.x, here.y - ahead.y) * 180) / Math.PI * 0.6,
    opacity: Math.min(1, k / 0.06) * (k > 0.8 ? clamp01((1 - k) / 0.2) : 1),
  };
}
