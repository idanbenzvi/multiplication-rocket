import { useMemo, useRef } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import { useGameStore } from '../../game/useGameStore';
import { PortholeShimmer } from './PortholeShimmer';
import { Billboard } from '@react-three/drei';
import { colorForLevel } from './palette';
import { ROCKET_PORTHOLE, rocketSvg } from './illustrations';
import { useProfiles } from '../../profiles/useProfiles';
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
  // The active pilot's animal looks out of the porthole.
  const avatar = useProfiles((s) => s.profiles.find((p) => p.id === s.activeId)?.avatar);
  // until this pilot has found the Academy, the window shimmers to invite taps
  const academySeen = useProfiles((s) => !!s.profiles.find((p) => p.id === s.activeId)?.academySeen);
  const porthole = useMemo(() => (avatar ? { ...ROCKET_PORTHOLE, emoji: avatar } : undefined), [avatar]);
  const texture = useSvgTexture(svg, 260, 520, porthole);

  // Secret door: three quick taps on the porthole open the Deep Space Academy.
  const taps = useRef<number[]>([]);
  const onTap = (e: ThreeEvent<MouseEvent>) => {
    const uv = e.uv;
    if (!uv) return;
    // porthole centre in UV space (v runs bottom→top); radius generous for small fingers
    const dx = (uv.x - ROCKET_PORTHOLE.x) * WIDTH;
    const dy = (uv.y - (1 - ROCKET_PORTHOLE.y)) * HEIGHT;
    if (Math.hypot(dx, dy) > ROCKET_PORTHOLE.radius * WIDTH * 1.8) return;
    e.stopPropagation();
    const now = performance.now();
    taps.current = [...taps.current.filter((t) => now - t < 1200), now];
    if (taps.current.length >= 3) {
      taps.current = [];
      useGameStore.getState().openAcademy();
    }
  };

  if (!texture) return null;

  return (
    <Billboard position={[0, HEIGHT / 2 - 0.05, 0]} follow lockX lockZ>
      <mesh onClick={onTap}>
        <planeGeometry args={[WIDTH, HEIGHT]} />
        <meshBasicMaterial map={texture} transparent alphaTest={0.05} toneMapped={false} />
      </mesh>
      {!academySeen && (
        <PortholeShimmer
          x={(ROCKET_PORTHOLE.x - 0.5) * WIDTH}
          y={(0.5 - ROCKET_PORTHOLE.y) * HEIGHT}
          radius={ROCKET_PORTHOLE.radius * WIDTH}
        />
      )}
    </Billboard>
  );
}
