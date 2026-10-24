import { useLayoutEffect, useMemo } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import { useGameStore } from '../../game/useGameStore';
import { useCrewStore } from '../../game/useCrewStore';
import { PortholeShimmer } from './PortholeShimmer';
import { PilotFade } from './PilotFade';
import { porthole } from '../../game/flight';
import { haptics } from '../../audio/haptics';
import { Billboard } from '@react-three/drei';
import { colorForLevel } from './palette';
import { shipArt, spriteSize } from './ships';
import { useProfiles, useShip } from '../../profiles/useProfiles';
import { useAdmiral } from '../../game/useAchievements';
import { useSvgTexture } from './spriteTexture';
import { useCockpit } from '../cockpit/cockpitStore';

interface Props {
  level: number;
}

const WIDTH = 1.1;
const HEIGHT = 2.3;

// The rocket itself: a hand-drawn illustration rasterized to a texture and
// rendered as a billboarded flat sprite (locked upright, only turning to
// face the camera) rather than 3D-modeled geometry — a storybook cutout
// standing on the pad instead of a toy-model rocket. It's the ship the
// pilot chose in the hangar (ships.ts): the classic rocket or the Explorer.
export function RocketSprite({ level }: Props) {
  const accent = useMemo(() => colorForLevel(level), [level]);
  // The active pilot's animal looks out of the porthole; flying together, the
  // rocket has two windows, one above the other, with a pilot at each.
  const avatar = useProfiles((s) => s.profiles.find((p) => p.id === s.activeId)?.avatar);
  const crew = useCrewStore((s) => s.members);
  const crewAvatars = useProfiles((s) =>
    crew ? crew.map((m) => s.profiles.find((p) => p.id === m.profileId)?.avatar ?? '🚀').join(' ') : '',
  );
  // a Space Admiral flies in the admiral's livery (solo: a crew's rocket is everyone's, the classic)
  const admiral = useAdmiral() && !crew;
  const ship = useShip();
  const art = useMemo(() => shipArt(ship, accent, !!crew, admiral), [ship, accent, crew, admiral]);
  const window0 = art.windows[0];
  // until this pilot has found the Academy, the window shimmers to invite taps
  const cockpitSeen = useProfiles((s) => !!s.profiles.find((p) => p.id === s.activeId)?.cockpitSeen);
  const portholes = useMemo(
    () =>
      crewAvatars
        ? crewAvatars.split(' ').map((emoji, i) => ({ ...art.windows[i], emoji }))
        : avatar
          ? { ...window0, emoji: avatar }
          : undefined,
    [crewAvatars, avatar, art, window0],
  );
  const [texW, texH] = spriteSize(ship, !!crew);
  const texture = useSvgTexture(art.svg, texW, texH, portholes, art.picture);
  // the camera dives into this ship's window, and the ship turns about it
  useLayoutEffect(() => {
    porthole.x = (window0.x - 0.5) * WIDTH;
    porthole.radius = window0.radius * WIDTH;
  }, [window0]);

  // The way in: a tap on the porthole flies the camera in through it, to the
  // cockpit (where the settings are, and the rest of the game's screens).
  const onTap = (e: ThreeEvent<MouseEvent>) => {
    const uv = e.uv;
    if (!uv) return;
    // porthole centre in UV space (v runs bottom→top); radius generous for small fingers
    const dx = (uv.x - window0.x) * WIDTH;
    const dy = (uv.y - (1 - window0.y)) * HEIGHT;
    if (Math.hypot(dx, dy) > window0.radius * WIDTH * 1.8) return;
    e.stopPropagation();
    const s = useGameStore.getState();
    // only from normal flight (not over a bonus round, launch or review)
    if (s.academyOpen || s.justLaunched || s.showHeatmap || s.challenge || s.bonusRound) return;
    if (useCrewStore.getState().active) return;
    haptics.tick();
    useCockpit.getState().open();
  };

  if (!texture) return null;

  return (
    <Billboard position={[0, HEIGHT / 2 - 0.05, 0]} follow lockX lockZ>
      <mesh onClick={onTap}>
        <planeGeometry args={[WIDTH, HEIGHT]} />
        <meshBasicMaterial map={texture} transparent alphaTest={0.05} toneMapped={false} />
      </mesh>
      {avatar && !crew && (
        <PilotFade
          texture={texture}
          svg={art.svg}
          picture={art.picture}
          texSize={[texW, texH]}
          window={window0}
          width={WIDTH}
          height={HEIGHT}
        />
      )}
      {!cockpitSeen && !crew && (
        <PortholeShimmer
          x={(window0.x - 0.5) * WIDTH}
          y={(0.5 - window0.y) * HEIGHT}
          radius={(window0.ry ?? window0.radius) * WIDTH}
        />
      )}
    </Billboard>
  );
}
