import { useEffect, useState } from 'react';
import * as THREE from 'three';

const cache = new Map<string, THREE.CanvasTexture>();
const pending = new Map<string, Promise<THREE.CanvasTexture>>();

function loadSvgTexture(svg: string, width: number, height: number): Promise<THREE.CanvasTexture> {
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
export function useSvgTexture(svg: string, width = 256, height = 512): THREE.CanvasTexture | null {
  const [texture, setTexture] = useState<THREE.CanvasTexture | null>(cache.get(svg) ?? null);

  useEffect(() => {
    let cancelled = false;
    const cached = cache.get(svg);
    if (cached) {
      setTexture(cached);
      return;
    }
    let promise = pending.get(svg);
    if (!promise) {
      promise = loadSvgTexture(svg, width, height);
      pending.set(svg, promise);
    }
    promise
      .then((tex) => {
        cache.set(svg, tex);
        pending.delete(svg);
        if (!cancelled) setTexture(tex);
      })
      .catch(() => {
        pending.delete(svg);
      });
    return () => {
      cancelled = true;
    };
  }, [svg, width, height]);

  return texture;
}
