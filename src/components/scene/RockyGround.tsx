import { useMemo } from 'react';
import * as THREE from 'three';
import { getRockyGroundTexture } from './groundTexture';
import { terrainHeightAt } from './terrainHeight';

const SIZE = 7;
const SEGMENTS = 64;

// Real vertex-displaced terrain instead of a flat painted disc — the bumps
// are actual geometry (normals recomputed so lighting responds to them),
// not a texture trick, which is what makes it read as ground rather than a
// sticker. Stays flat near the pad (see terrainHeight.ts) so nothing placed
// there clips into the relief.
export function RockyGround() {
  const texture = useMemo(() => {
    const tex = getRockyGroundTexture();
    tex.repeat.set(4, 4);
    return tex;
  }, []);

  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEGMENTS, SEGMENTS);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      pos.setZ(i, terrainHeightAt(x, y));
    }
    geo.computeVertexNormals();
    return geo;
  }, []);

  return (
    <mesh geometry={geometry} position={[0, -0.98, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <meshStandardMaterial map={texture} roughness={0.95} metalness={0.05} />
    </mesh>
  );
}
