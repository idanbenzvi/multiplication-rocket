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
  /** an oval window: its half-height (a fraction of the width too), and how far it's turned (radians) */
  ry?: number;
  tilt?: number;
  /** where the pilot sits behind the glass: off the window's centre (fractions of the width), and how big (× radius) */
  seat?: { dx: number; dy: number; size: number };
  /** the glass's own colour, over the pilot */
  tint?: string;
  /** a soft glare on the glass, over the pilot (unless the picture has its own) */
  glare?: boolean;
}

/** a picture drawn under a sprite's drawing: its URL, and where it goes, as fractions of the sprite */
export interface SpritePicture {
  url: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

// Drawn on the canvas rather than as SVG <text>: an SVG rasterized through
// <img> doesn't reliably get color-emoji fonts, canvas fillText does.
function drawPorthole(ctx: CanvasRenderingContext2D, width: number, height: number, p: Porthole) {
  const cx = p.x * width;
  const cy = p.y * height;
  const r = p.radius * width;
  const ry = (p.ry ?? p.radius) * width;
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, cy, r, ry, p.tilt ?? 0, 0, Math.PI * 2);
  ctx.clip();
  const seat = p.seat ?? { dx: 0, dy: 0.12 * p.radius, size: 1.8 };
  ctx.font = `${Math.round(r * seat.size)}px ${EMOJI_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(p.emoji, cx + seat.dx * width, cy + seat.dy * width);
  if (p.tint) {
    ctx.fillStyle = p.tint;
    ctx.fillRect(cx - r, cy - ry, r * 2, ry * 2);
  }
  if (p.glare === false) {
    ctx.restore();
    return;
  }
  // the glass: a soft glare back on top, so the pilot sits *behind* the window
  const glare = ctx.createRadialGradient(cx - r * 0.4, cy - r * 0.45, 0, cx - r * 0.4, cy - r * 0.45, r * 0.9);
  glare.addColorStop(0, 'rgba(255,255,255,0.55)');
  glare.addColorStop(0.35, 'rgba(255,255,255,0.12)');
  glare.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glare;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.restore();
}

const pictures = new Map<string, Promise<HTMLImageElement>>();

/** a picture, loaded once */
export function loadPicture(url: string): Promise<HTMLImageElement> {
  let p = pictures.get(url);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => {
        pictures.delete(url);
        reject(new Error(`failed to load ${url}`));
      };
      img.src = url;
    });
    pictures.set(url, p);
  }
  return p;
}

function svgImage(svg: string): Promise<HTMLImageElement | null> {
  if (!svg) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('failed to rasterize sprite svg'));
    };
    img.src = url;
  });
}

/**
 * An illustration drawn onto a canvas (over its picture, if it has one, and
 * with the emoji in its windows), as a texture or for a 2D canvas.
 */
export async function rasterizeSprite(
  svg: string,
  width: number,
  height: number,
  portholes?: Porthole | readonly Porthole[],
  picture?: SpritePicture,
): Promise<HTMLCanvasElement> {
  const [under, over] = await Promise.all([picture ? loadPicture(picture.url) : null, svgImage(svg)]);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');
  if (under && picture) {
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(under, picture.x * width, picture.y * height, picture.width * width, picture.height * height);
  }
  if (over) ctx.drawImage(over, 0, 0, width, height);
  for (const p of portholeList(portholes)) drawPorthole(ctx, width, height, p);
  return canvas;
}

function portholeList(portholes?: Porthole | readonly Porthole[]): readonly Porthole[] {
  return !portholes ? [] : 'emoji' in portholes ? [portholes] : portholes;
}

function loadSvgTexture(
  svg: string,
  width: number,
  height: number,
  portholes?: Porthole | readonly Porthole[],
  picture?: SpritePicture,
): Promise<THREE.CanvasTexture> {
  return rasterizeSprite(svg, width, height, portholes, picture).then((canvas) => {
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
  });
}

// Rasterizes an inline SVG illustration into a texture the WebGL scene can
// use as a flat sprite. Cached by the SVG string itself, so regenerating the
// same accent-colored rocket twice (e.g. across remounts) reuses the texture
// instead of re-rasterizing.
export function useSvgTexture(
  svg: string,
  width = 256,
  height = 512,
  portholes?: Porthole | readonly Porthole[],
  picture?: SpritePicture,
): THREE.CanvasTexture | null {
  // (a window with nobody in it isn't the same as no window drawn at all)
  const emoji = portholeList(portholes).map((p) => `[${p.emoji}]`);
  const key = `${picture?.url ?? ''}|${svg}|${emoji.join('')}|${width}`;
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
      promise = loadSvgTexture(svg, width, height, portholes, picture);
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
    // the windows and the picture are captured through `key` (their only varying parts are the emoji and the URL)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, svg, width, height]);

  return texture;
}
