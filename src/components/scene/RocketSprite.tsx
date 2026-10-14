import { useMemo, useRef } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import { useGameStore } from '../../game/useGameStore';
import { useCrewStore } from '../../game/useCrewStore';
import { PortholeShimmer } from './PortholeShimmer';
import { DIVE_MS, portholeZoom, ZOOM_RESET_MS } from '../../game/flight';
import { sfx } from '../../audio/sfx';
import { haptics } from '../../audio/haptics';
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
  // Each tap pulls the camera a step closer to the window (FlightController
  // follows portholeZoom); the third dives into it, then the Academy opens.
  const diving = useRef(false);
  const onTap = (e: ThreeEvent<MouseEvent>) => {
    const uv = e.uv;
    if (!uv) return;
    // porthole centre in UV space (v runs bottom→top); radius generous for small fingers
    const dx = (uv.x - ROCKET_PORTHOLE.x) * WIDTH;
    const dy = (uv.y - (1 - ROCKET_PORTHOLE.y)) * HEIGHT;
    if (Math.hypot(dx, dy) > ROCKET_PORTHOLE.radius * WIDTH * 1.8) return;
    e.stopPropagation();
    if (diving.current) return;
    const s = useGameStore.getState();
    // only from normal flight (not over a bonus round, launch or review)
    if (s.academyOpen || s.justLaunched || s.showHeatmap || s.challenge || s.bonusRound) return;
    if (useCrewStore.getState().active) return;
    const now = performance.now();
    const z = portholeZoom;
    if (now - z.lastTap > ZOOM_RESET_MS) z.level = 0;
    z.level = Math.min(3, z.level + 1);
    z.lastTap = now;
    sfx.pick(z.level);
    haptics.tick();
    if (z.level >= 3) {
      diving.current = true;
      z.diveAt = now;
      window.setTimeout(() => {
        useGameStore.getState().openAcademy();
        // back to normal: the camera eases out again once the scene resumes
        z.level = 0;
        z.diveAt = 0;
        z.lastTap = 0;
        diving.current = false;
      }, DIVE_MS);
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
