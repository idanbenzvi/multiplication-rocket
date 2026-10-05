import * as THREE from 'three';

let flameTex: THREE.CanvasTexture | null = null;

// A painted flame-lick silhouette (two stacked soft blobs, wider at the base,
// tapering up) baked as a white-on-transparent alpha mask — particles tint it
// via their own per-vertex color, so this only supplies the *shape*.
export function getFlameSpriteTexture(): THREE.CanvasTexture {
  if (flameTex) return flameTex;
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const base = ctx.createRadialGradient(size * 0.5, size * 0.6, 2, size * 0.5, size * 0.6, size * 0.4);
  base.addColorStop(0, 'rgba(255,255,255,1)');
  base.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = base;
  ctx.beginPath();
  ctx.ellipse(size * 0.5, size * 0.6, size * 0.34, size * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();

  const tip = ctx.createRadialGradient(size * 0.5, size * 0.3, 1, size * 0.5, size * 0.3, size * 0.22);
  tip.addColorStop(0, 'rgba(255,255,255,1)');
  tip.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = tip;
  ctx.beginPath();
  ctx.ellipse(size * 0.5, size * 0.3, size * 0.16, size * 0.24, 0, 0, Math.PI * 2);
  ctx.fill();

  flameTex = new THREE.CanvasTexture(canvas);
  flameTex.needsUpdate = true;
  return flameTex;
}

let smokeTex: THREE.CanvasTexture | null = null;

// A puffy cloud silhouette (several overlapping soft circles) instead of a
// single flat glow dot, so each smoke particle reads as a painted puff.
export function getSmokeSpriteTexture(): THREE.CanvasTexture {
  if (smokeTex) return smokeTex;
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const puffs = [
    { x: 0.5, y: 0.55, r: 0.34 },
    { x: 0.3, y: 0.45, r: 0.24 },
    { x: 0.7, y: 0.45, r: 0.24 },
    { x: 0.5, y: 0.28, r: 0.22 },
  ];
  puffs.forEach(({ x, y, r }) => {
    const grad = ctx.createRadialGradient(size * x, size * y, 1, size * x, size * y, size * r);
    grad.addColorStop(0, 'rgba(255,255,255,0.9)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(size * x, size * y, size * r, 0, Math.PI * 2);
    ctx.fill();
  });

  smokeTex = new THREE.CanvasTexture(canvas);
  smokeTex.needsUpdate = true;
  return smokeTex;
}
