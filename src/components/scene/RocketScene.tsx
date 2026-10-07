import { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Stars } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import type { Group } from 'three';
import { useGameStore } from '../../game/useGameStore';
import { usePause } from '../../game/gameClock';
import { getLevelConfig } from '../../game/levels';
import { flight } from '../../game/flight';
import { FlightController } from './FlightController';
import { FlyingRocket } from './FlyingRocket';
import { SpeedStreaks } from './SpeedStreaks';
import { DestinationPlanet } from './DestinationPlanet';
import { SpeedBlur } from './SpeedBlur';
import { GradientSky } from './GradientSky';
import { AuroraSky } from './AuroraSky';
import { skyForLevel } from './palette';

// The distant star sphere turns around the camera's horizontal axis so the
// far stars drift downward too — slow parallax behind the fast near streaks.
function DriftingStars() {
  const ref = useRef<Group>(null);
  useFrame((_, rawDelta) => {
    if (ref.current) ref.current.rotation.x -= Math.min(rawDelta, 0.1) * (0.004 + flight.effective * 0.05);
  });
  return (
    <group ref={ref}>
      <Stars radius={60} depth={40} count={5000} factor={4} fade speed={0.4} />
    </group>
  );
}

// Always in flight: the rocket holds its place on screen while the world
// rushes past, faster as the level's fuel fills and the answer streak grows
// (see game/flight.ts), with the destination planet growing ahead.
export function RocketScene() {
  const progress = useGameStore((s) => s.progress);
  const justLaunched = useGameStore((s) => s.justLaunched);
  // paused (player left the tab/app): stop rendering the scene entirely
  const paused = usePause((s) => s.paused);
  // Stardust Run covers the screen and runs a heavy fluid simulation: give it the GPU
  const hidden = useGameStore((s) => s.bonusRound === 'stardust');

  // While the launch overlay is up, progress.level has already advanced —
  // keep rendering the level that's mid-launch until the player dismisses it.
  const displayLevel = justLaunched ? progress.level - 1 : progress.level;
  const sky = skyForLevel(displayLevel);
  const destination = getLevelConfig(displayLevel).destinationIndex;

  return (
    // dpr capped at 1.5: on retina tablets/phones full resolution would cost
    // 4-9x the pixels for the bloom, blur and plume shaders, for little gain.
    <Canvas dpr={[1, 1.5]} frameloop={paused || hidden ? 'never' : 'always'}>
      <FlightController />
      <GradientSky topColor={sky.top} bottomColor={sky.bottom} />
      <AuroraSky level={displayLevel} />
      <fog attach="fog" args={[sky.fog, 10, 60]} />
      <DriftingStars />
      <DestinationPlanet key={destination} destinationIndex={destination} />
      <SpeedStreaks />
      <FlyingRocket level={displayLevel} />

      <EffectComposer>
        <Bloom
          luminanceThreshold={0.35}
          luminanceSmoothing={0.9}
          intensity={justLaunched ? 1.6 : 1.0}
          mipmapBlur
        />
        <SpeedBlur />
      </EffectComposer>
    </Canvas>
  );
}
