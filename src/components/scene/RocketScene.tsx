import { useEffect, useRef, useState } from 'react';
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
// That axis is turned onto the level's course, so they drift past the way
// the streaks do.
function DriftingStars() {
  const courseRef = useRef<Group>(null);
  const ref = useRef<Group>(null);
  useFrame((_, rawDelta) => {
    if (courseRef.current) courseRef.current.rotation.z = flight.heading;
    if (ref.current) ref.current.rotation.x -= Math.min(rawDelta, 0.1) * (0.004 + flight.effective * 0.05);
  });
  return (
    <group ref={courseRef}>
      <group ref={ref}>
        <Stars radius={60} depth={40} count={5000} factor={4} fade speed={0.4} />
      </group>
    </group>
  );
}

// Always in flight: the rocket holds its place on screen while the world
// rushes past, faster as the level's fuel fills and the answer streak grows
// (see game/flight.ts), with the destination planet growing ahead. Each
// level flies its own course (flight.heading): the rocket, streaks, stars and
// sky turn with it, and only the destination stays where it is.
/** bonus rounds drawn over the whole screen on their own canvases, and how long they take to cover the scene */
const COVERING_ROUNDS: ReadonlySet<string> = new Set(['traffic', 'battle', 'stranded', 'stardust', 'road']);
const COVERED_AFTER_MS = 900;

export function RocketScene() {
  const progress = useGameStore((s) => s.progress);
  const justLaunched = useGameStore((s) => s.justLaunched);
  // paused (player left the tab/app): stop rendering the scene entirely
  const paused = usePause((s) => s.paused);
  // The bonus rounds that cover the whole screen with their own canvases: once
  // one has faded in over the scene, the scene stops drawing underneath and
  // gives it the GPU (it starts again as the round ends, for the rocket to fly home)
  const covering = useGameStore((s) => s.bonusRound !== null && COVERING_ROUNDS.has(s.bonusRound));
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    if (!covering) return;
    const id = window.setTimeout(() => setHidden(true), COVERED_AFTER_MS);
    return () => {
      window.clearTimeout(id);
      setHidden(false);
    };
  }, [covering]);

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
