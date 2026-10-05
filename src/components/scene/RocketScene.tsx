import { useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Stars } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import { DoubleSide, PerspectiveCamera, Vector3 } from 'three';
import { useGameStore } from '../../game/useGameStore';
import { LaunchGroup } from './LaunchGroup';
import { LaunchTowerSprite } from './LaunchTowerSprite';
import { SmokeBillow } from './SmokeBillow';
import { AmbientMotes } from './AmbientMotes';
import { ScatteredRocks } from './ScatteredRocks';
import { GradientSky } from './GradientSky';
import { RockyGround } from './RockyGround';
import { getToonGradientMap } from './toonGradient';
import { colorForLevel, skyForLevel } from './palette';

// Fixed hero shot: camera sits low and off to the side, tilted up at the
// rocket so the sky fills most of the frame above it — a "looking up
// from the launch pad" angle rather than a straight-on studio shot. It does
// not track the rocket during launch, so the ship visibly shrinks into the
// distance as it climbs instead of the camera following it up.
function CameraRig() {
  const { camera } = useThree();

  useEffect(() => {
    camera.position.set(2.3, -0.75, 2.9);
    camera.lookAt(new Vector3(0, 1.3, 0));
    if (camera instanceof PerspectiveCamera) {
      camera.fov = 58;
      camera.updateProjectionMatrix();
    }
  }, [camera]);

  return null;
}

export function RocketScene() {
  const progress = useGameStore((s) => s.progress);
  const flare = useGameStore((s) => s.flare);
  const justLaunched = useGameStore((s) => s.justLaunched);
  const gradientMap = getToonGradientMap();

  // While the launch overlay is up, progress.level has already advanced —
  // keep rendering the level that's mid-launch until the player dismisses it.
  const displayLevel = justLaunched ? progress.level - 1 : progress.level;
  const padColor = colorForLevel(displayLevel);
  const sky = skyForLevel(displayLevel);

  return (
    <Canvas>
      <CameraRig />
      <GradientSky topColor={sky.top} bottomColor={sky.bottom} />
      {/* dusk haze for depth — softens the horizon and distant stars instead
          of a hard black void, matching the illustrated-diorama look. Its
          color changes with the sky theme so each passage feels distinct. */}
      <fog attach="fog" args={[sky.fog, 8, 50]} />
      <ambientLight intensity={0.55} color="#ffd9b3" />
      <directionalLight position={[3, 4, 2]} intensity={0.85} color="#ffcf9c" />
      <Stars radius={60} depth={40} count={5000} factor={4} fade speed={0.4} />

      <AmbientMotes />
      <ScatteredRocks />

      {/* rocky terrain: real vertex-displaced bumps under a painted rock
          texture, flat only in the small footprint the pad sits on */}
      <RockyGround />

      {/* launchpad: a glowing accent ring and a darker flame trench sitting
          just above the terrain's flat center, so it reads as solid ground */}
      <mesh position={[0, -0.965, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.0, 1.35, 48]} />
        <meshBasicMaterial color={padColor} transparent opacity={0.55} side={DoubleSide} />
      </mesh>
      <mesh position={[0, -0.96, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.55, 32]} />
        <meshToonMaterial color="#4a3f42" gradientMap={gradientMap} />
      </mesh>

      <LaunchTowerSprite accent={padColor} />
      <SmokeBillow launched={justLaunched} />

      <LaunchGroup
        level={displayLevel}
        fuelPercent={progress.fuel}
        flare={flare}
        launched={justLaunched}
      />

      <EffectComposer>
        <Bloom
          luminanceThreshold={0.35}
          luminanceSmoothing={0.9}
          intensity={justLaunched ? 1.6 : 0.9}
          mipmapBlur
        />
      </EffectComposer>
    </Canvas>
  );
}
