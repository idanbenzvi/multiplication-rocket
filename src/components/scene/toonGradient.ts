import * as THREE from 'three';

let cached: THREE.DataTexture | null = null;

// A 4-band gradient map for MeshToonMaterial — this is what gives the rocket
// its flat, hand-illustrated cel-shaded banding instead of a smooth PBR
// gradient, matching the storybook-illustration look we're going for.
export function getToonGradientMap(): THREE.DataTexture {
  if (cached) return cached;
  const bands = new Uint8Array([70, 130, 190, 255]);
  const texture = new THREE.DataTexture(bands, bands.length, 1, THREE.RedFormat);
  texture.needsUpdate = true;
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  cached = texture;
  return texture;
}
