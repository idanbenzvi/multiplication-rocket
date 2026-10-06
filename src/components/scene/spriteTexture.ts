import { useEffect, useState } from 'react';
import * as THREE from 'three';

const cache = new Map<string, THREE.CanvasTexture>();
const pending = new Map<string, Promise<THREE.CanvasTexture>>();

/** An emoji drawn into a round window of the sprite (e.g. the pilot's avatar in the rocket's porthole). */
export interface Porthole {
  emoji: string;
  /** window center and radius, as fractions of the sprite's width/height */
  x: number;
  y: number;
  radius: number; // fraction of width
}

const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

// Drawn on the canvas rather than as SVG <text>: an SVG rasterized through
// <img> doesn't reliably get color-emoji fonts, canvas fillText does.
function drawPorthole(ctx: CanvasRenderingContext2D, width: number, height: number, p: Porthole) {
  const cx = p.x * width;
  const cy = p.y * height;
  const r = p.radius * width;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.font = `${Math.round(r * 1.8)}px ${EMOJI_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(p.emoji, cx, cy + r * 0.12);
  // the glass: a soft glare back on top, so the pilot sits *behind* the window
  const glare = ctx.createRadialGradient(cx - r * 0.4, cy - r * 0.45, 0, cx - r * 0.4, cy - r * 0.45, r * 0.9);
  glare.addColorStop(0, 'rgba(255,255,255,0.55)');
  glare.addColorStop(0.35, 'rgba(255,255,255,0.12)');
  glare.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glare;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.restore();
}

function loadSvgTexture(svg: string, width: number, height: number, porthole?: Porthole): Promise<THREE.CanvasTexture> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error('2d context unavailable'));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      if (porthole) drawPorthole(ctx, width, height, porthole);
      URL.revokeObjectURL(url);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.needsUpdate = true;
      resolve(texture);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('failed to rasterize sprite svg'));
    };
    img.src = url;
  });
}

// Rasterizes an inline SVG illustration into a texture the WebGL scene can
// use as a flat sprite. Cached by the SVG string itself, so regenerating the
// same accent-colored rocket twice (e.g. across remounts) reuses the texture
// instead of re-rasterizing.
export function useSvgTexture(svg: string, width = 256, height = 512, porthole?: Porthole): THREE.CanvasTexture | null {
  const key = porthole ? `${svg}|${porthole.emoji}` : svg;
  const [texture, setTexture] = useState<THREE.CanvasTexture | null>(cache.get(key) ?? null);

  useEffect(() => {
    let cancelled = false;
    const cached = cache.get(key);
    if (cached) {
      setTexture(cached);
      return;
    }
    let promise = pending.get(key);
    if (!promise) {
      promise = loadSvgTexture(svg, width, height, porthole);
      pending.set(key, promise);
    }
    promise
      .then((tex) => {
        cache.set(key, tex);
        pending.delete(key);
        if (!cancelled) setTexture(tex);
      })
      .catch(() => {
        pending.delete(key);
      });
    return () => {
      cancelled = true;
    };
    // porthole is captured through `key` (its only varying part is the emoji)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, svg, width, height]);

  return texture;
}
