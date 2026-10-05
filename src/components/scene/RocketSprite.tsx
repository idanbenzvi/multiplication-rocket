import { useMemo } from 'react';
import { Billboard } from '@react-three/drei';
import { colorForLevel } from './palette';
import { rocketSvg } from './illustrations';
import { useSvgTexture } from './spriteTexture';

interface Props {
  level: number;
}

const WIDTH = 1.1;
const HEIGHT = 2.3;

// The rocket itself: a hand-drawn illustration rasterized to a texture and
// rendered as a billboarded flat sprite (locked upright, only turning to
// face the camera) rather than 3D-modeled geometry — a storybook cutout
// standing on the pad instead of a toy-model rocket.
export function RocketSprite({ level }: Props) {
  const accent = useMemo(() => colorForLevel(level), [level]);
  const svg = useMemo(() => rocketSvg(accent), [accent]);
  const texture = useSvgTexture(svg, 260, 520);

  if (!texture) return null;

  return (
    <Billboard position={[0, HEIGHT / 2 - 0.05, 0]} follow lockX lockZ>
      <mesh>
        <planeGeometry args={[WIDTH, HEIGHT]} />
        <meshBasicMaterial map={texture} transparent alphaTest={0.05} toneMapped={false} />
      </mesh>
    </Billboard>
  );
}
