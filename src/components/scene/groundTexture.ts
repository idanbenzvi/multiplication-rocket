import * as THREE from 'three';

let cached: THREE.CanvasTexture | null = null;

// A painted rocky-ground texture (base wash + scattered rock speckles +
// crack lines + fine grit) — the closest approximation to a "rock photo"
// available without an external image asset or image-generation tool.
export function getRockyGroundTexture(): THREE.CanvasTexture {
  if (cached) return cached;
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const base = ctx.createRadialGradient(
    size * 0.5,
    size * 0.45,
    size * 0.05,
    size * 0.5,
    size * 0.5,
    size * 0.72,
  );
  base.addColorStop(0, '#9c8b76');
  base.addColorStop(1, '#6f6152');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);

  const rockColors = ['#8a7a68', '#7c6c5a', '#a89a82', '#5f5346', '#93826c'];
  for (let i = 0; i < 260; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 3 + Math.random() * 14;
    ctx.fillStyle = rockColors[i % rockColors.length];
    ctx.globalAlpha = 0.35 + Math.random() * 0.4;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * (0.6 + Math.random() * 0.5), Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  ctx.strokeStyle = 'rgba(40,32,26,0.35)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 40; i++) {
    let x = Math.random() * size;
    let y = Math.random() * size;
    ctx.beginPath();
    ctx.moveTo(x, y);
    const segments = 3 + Math.floor(Math.random() * 3);
    for (let s = 0; s < segments; s++) {
      x += (Math.random() - 0.5) * 60;
      y += (Math.random() - 0.5) * 60;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = Math.random() > 0.5 ? 'rgba(30,24,20,0.15)' : 'rgba(220,205,180,0.12)';
    ctx.fillRect(Math.random() * size, Math.random() * size, 1.5, 1.5);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  cached = texture;
  return texture;
}
