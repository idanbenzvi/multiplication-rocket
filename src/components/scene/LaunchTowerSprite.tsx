import { useMemo } from 'react';
import { Billboard } from '@react-three/drei';
import { towerSvg } from './illustrations';
import { useSvgTexture } from './spriteTexture';

interface Props {
  accent: string;
}

const WIDTH = 0.9;
const HEIGHT = 2.1;
const GROUND_Y = -0.95;

// A static gantry/support tower standing on the pad next to the rocket —
// same hand-drawn sprite technique as RocketSprite, so the launch site reads
// as one consistent illustrated diorama rather than a rocket floating with
// nothing grounding it to the ground.
export function LaunchTowerSprite({ accent }: Props) {
  const svg = useMemo(() => towerSvg(accent), [accent]);
  const texture = useSvgTexture(svg, 220, 520);

  if (!texture) return null;

  return (
    <Billboard position={[-1.15, GROUND_Y + HEIGHT / 2, -0.3]} follow lockX lockZ>
      <mesh>
        <planeGeometry args={[WIDTH, HEIGHT]} />
        <meshBasicMaterial map={texture} transparent alphaTest={0.05} toneMapped={false} />
      </mesh>
    </Billboard>
  );
}
