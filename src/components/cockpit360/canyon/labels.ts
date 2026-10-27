import * as THREE from 'three';
import { OP_SYMBOL } from '../../../game/mission';
import { LANE, RULER, SPAN, type Gate } from './gates';

// What's written in light on a gate: its stretch of the number line (a tick
// for every number, every fifth named, the line itself at the height the
// ship flies through), and over it, the fact, "7 × 8 = ?". Drawn once on a
// canvas each, white on black, for the gate's additive glow to colour.

/** a bridge, wall to wall: the ruler, and a little either end */
export const BAND_W = (RULER + 3) * 2;
export const BAND_H = 8.75;
const PX = 2048 / BAND_W;
/** the fact's sign over the bridge */
export const SIGN_W = 26;
export const SIGN_H = 6.5;
const FONT = "'Fredoka', 'Trebuchet MS', sans-serif";

function texture(canvas: HTMLCanvasElement): THREE.Texture {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function rulerTexture(gate: Gate): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const mid = canvas.height / 2;
  const x0 = (BAND_W / 2 - RULER) * PX;
  ctx.strokeStyle = '#fff';
  ctx.fillStyle = '#fff';
  ctx.shadowColor = '#bff';
  ctx.shadowBlur = 14;
  ctx.lineCap = 'round';
  // the line
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(x0 - 30, mid);
  ctx.lineTo(x0 + RULER * 2 * PX + 30, mid);
  ctx.stroke();
  ctx.font = `700 70px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let k = 0; k <= SPAN; k++) {
    const n = gate.lo + k;
    const x = x0 + k * LANE * PX;
    const five = n % 5 === 0;
    ctx.lineWidth = five ? 7 : 4;
    ctx.beginPath();
    ctx.moveTo(x, mid - (five ? 46 : 22));
    ctx.lineTo(x, mid + (five ? 46 : 22));
    ctx.stroke();
    if (five) ctx.fillText(String(n), x, mid - 86);
  }
  return texture(canvas);
}

export function signTexture(gate: Gate): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = '#bff';
  ctx.shadowBlur = 22;
  ctx.font = `700 168px ${FONT}`;
  const fact = `${gate.x} ${OP_SYMBOL[gate.op]} ${gate.y}`;
  const ask = ' = ?';
  const wFact = ctx.measureText(fact).width;
  ctx.font = `700 120px ${FONT}`;
  const wAsk = ctx.measureText(ask).width;
  const left = 512 - (wFact + wAsk) / 2;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#fff';
  ctx.font = `700 168px ${FONT}`;
  ctx.fillText(fact, left, 132);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.font = `700 120px ${FONT}`;
  ctx.fillText(ask, left + wFact, 138);
  return texture(canvas);
}
