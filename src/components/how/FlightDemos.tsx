import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Stars } from '@react-three/drei';
import { Bloom, EffectComposer } from '@react-three/postprocessing';
import * as THREE from 'three';
import { useGameStore } from '../../game/useGameStore';
import { useAdmiral } from '../../game/useAchievements';
import { PORTHOLE_Y } from '../../game/flight';
import { useProfiles, useShip } from '../../profiles/useProfiles';
import { useLang, useT } from '../../i18n/useLang';
import { colorForLevel, skyForLevel } from '../scene/palette';
import { shipArt, spriteSize, type ShipArt } from '../scene/ships';
import { useSvgTexture } from '../scene/spriteTexture';
import { BEAM_TOP_FRACTION, BEHIND_ROCKET, OVER_ROCKET, PLUME_HEADROOM, plumeMaterial, plumeSize, stepPlume } from '../scene/plume';
import { SpeedStreaks } from '../scene/SpeedStreaks';
import { GradientSky } from '../scene/GradientSky';
import { Slider, Toggle } from './parts';

// The "how does it work?" pages with the game's own flight in them: the
// pilot's ship (their ship, their animal at the window, the level's colour),
// its card turning (or not) to face a camera walking round it; the space
// dust streaming past it at a speed to slide; and its engine's shader, at a
// power to slide, counting the dots it works out.

/** the rocket's card, as big as the game's (RocketSprite) */
const CARD_W = 1.1;
const CARD_H = 2.3;
const CYAN = '#8fe6ff';

interface PilotShip {
  art: ShipArt;
  texture: THREE.Texture | null;
  admiral: boolean;
}

/** the pilot's ship as the game draws it, with their animal at the window */
function usePilotShip(): PilotShip {
  const level = useGameStore((s) => s.progress.level);
  const avatar = useProfiles((s) => s.profiles.find((p) => p.id === s.activeId)?.avatar);
  const admiral = useAdmiral();
  const ship = useShip();
  const art = useMemo(() => shipArt(ship, colorForLevel(level), false, admiral), [ship, level, admiral]);
  const [w, h] = spriteSize(ship);
  const window0 = useMemo(() => (avatar ? { ...art.windows[0], emoji: avatar } : undefined), [art, avatar]);
  const texture = useSvgTexture(art.svg, w, h, window0, art.picture);
  return { art, texture, admiral };
}

/** the card with the ship on it; `edges`: the card itself shown, its see-through part and its outline */
function Card({ texture, edges = false }: { texture: THREE.Texture; edges?: boolean }) {
  const outline = useMemo(
    () =>
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-CARD_W / 2, -CARD_H / 2, 0),
        new THREE.Vector3(CARD_W / 2, -CARD_H / 2, 0),
        new THREE.Vector3(CARD_W / 2, CARD_H / 2, 0),
        new THREE.Vector3(-CARD_W / 2, CARD_H / 2, 0),
      ]),
    [],
  );
  return (
    <>
      <mesh>
        <planeGeometry args={[CARD_W, CARD_H]} />
        <meshBasicMaterial map={texture} transparent alphaTest={0.05} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
      {edges && (
        <>
          <mesh position-z={-0.002}>
            <planeGeometry args={[CARD_W, CARD_H]} />
            <meshBasicMaterial color={CYAN} transparent opacity={0.14} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
          <lineLoop geometry={outline}>
            <lineBasicMaterial color={CYAN} />
          </lineLoop>
        </>
      )}
    </>
  );
}

// ---------- the rocket is a sticker ----------

/** how far the camera walking round the card is from it */
const WALK_R = 4.6;

function CardScene({ ship, walk, face, edges }: { ship: PilotShip; walk: number; face: boolean; edges: boolean }) {
  const card = useRef<THREE.Group>(null);
  const angle = useRef(0);
  useFrame(({ camera }, raw) => {
    const dt = Math.min(raw, 0.1);
    angle.current += ((walk * Math.PI) / 180 - angle.current) * Math.min(1, dt * 8);
    const a = angle.current;
    camera.position.set(Math.sin(a) * WALK_R, 0.7, Math.cos(a) * WALK_R);
    camera.lookAt(0, -0.1, 0);
    // as in the game (a billboard, upright): the card turned about its upright to face the camera
    const g = card.current;
    if (g) g.rotation.y += ((face ? a : 0) - g.rotation.y) * Math.min(1, dt * 10);
  });
  return (
    <>
      <color attach="background" args={['#0b0820']} />
      <Stars radius={30} depth={20} count={1500} factor={3} fade speed={0.3} />
      {/* the pad it stands on, for the walk round to be seen */}
      <polarGridHelper args={[2.2, 12, 4, 48, '#6ad7ff', '#3a3f6e']} position={[0, -CARD_H / 2, 0]} />
      <group ref={card}>{ship.texture && <Card texture={ship.texture} edges={edges} />}</group>
    </>
  );
}

export function CardDemo() {
  const t = useT().how.card;
  const ship = usePilotShip();
  const [walk, setWalk] = useState(0);
  const [face, setFace] = useState(true);
  const [edges, setEdges] = useState(false);
  return (
    <>
      <div className="how-stage">
        <Canvas dpr={[1, 1.5]} camera={{ position: [0, 0.7, WALK_R], fov: 42 }}>
          <CardScene ship={ship} walk={walk} face={face} edges={edges} />
        </Canvas>
      </div>
      <div className="how-controls">
        <Slider label={t.walk} min={-88} max={88} value={walk} onChange={setWalk} />
        <Toggle label={t.face} on={face} onChange={setFace} />
        <Toggle label={t.edges} on={edges} onChange={setEdges} />
      </div>
    </>
  );
}

// ---------- the rocket in flight, its engine burning ----------

/** a speed (0 cruise … 1.25 overdrive, as game/flight.ts's) and a wrong answer's jolt, eased each frame */
interface Drive {
  /** what it's eased to */
  target: number;
  effective: number;
  heading: number;
  jolt: number;
}

const useDrive = (start: number) => useMemo<Drive>(() => ({ target: start, effective: start, heading: 0, jolt: 0 }), [start]);

/**
 * The ship flying as in the game (FlyingRocket, EngineExhaust): floating, a
 * tight shake and a surge as it goes faster, a lurch on a wrong answer, its
 * plume longer and hotter with speed and sputtering after a miss. `plume`:
 * given the plume's mesh (where its shader runs); `box`: that shown, outlined.
 */
function FlyingShip({ ship, drive, plume: given, box = false }: { ship: PilotShip; drive: Drive; plume?: React.RefObject<THREE.Mesh | null>; box?: boolean }) {
  const group = useRef<THREE.Group>(null);
  const own = useRef<THREE.Mesh>(null);
  const plume = given ?? own;
  const material = useMemo(() => plumeMaterial(false, PLUME_HEADROOM), []);
  useEffect(() => () => material.dispose(), [material]);
  const square = useMemo(
    () =>
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-0.5, -0.5, 0),
        new THREE.Vector3(0.5, -0.5, 0),
        new THREE.Vector3(0.5, 0.5, 0),
        new THREE.Vector3(-0.5, 0.5, 0),
      ]),
    [],
  );
  // (where the engine bell's bottom lands on the card: FlyingRocket's nozzleY)
  const nozzleY = 2.25 - (ship.art.nozzle / 400) * CARD_H + 0.0245;
  const calm = useMemo(() => (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0.2 : 1), []);

  useFrame(({ clock }, raw) => {
    const dt = Math.min(raw, 0.1);
    drive.effective += (drive.target - drive.effective) * Math.min(1, dt * 3);
    drive.jolt *= Math.exp(-2.2 * dt);
    const s = Math.max(0, drive.effective - drive.jolt * 0.3);
    const t = clock.elapsedTime;
    const g = group.current;
    const mesh = plume.current;
    if (!g || !mesh) return;
    const bob = Math.sin(t * 1.3) * 0.06 * (1 - Math.min(s, 1) * 0.6);
    const shake = s * s * 0.012 * calm;
    g.position.set(Math.sin(t * 0.7) * 0.05 + Math.sin(t * 61) * shake, bob + s * 0.18 - drive.jolt * 0.25 + Math.cos(t * 57) * shake - PORTHOLE_Y, 0);
    g.rotation.z = Math.sin(t * 0.9) * 0.03 - s * 0.04 + Math.sin(t * 19) * drive.jolt * 0.06 * calm;

    const sputter = drive.jolt * (0.4 + 0.6 * Math.abs(Math.sin(t * 38)));
    stepPlume(material, dt, s, sputter, ship.admiral);
    const { width, height } = plumeSize(s);
    const full = height * (1 + PLUME_HEADROOM);
    mesh.scale.set(width, full, 1);
    mesh.position.y = nozzleY + (BEAM_TOP_FRACTION + PLUME_HEADROOM) * height - full / 2;
  });

  return (
    <group ref={group}>
      <mesh ref={plume} material={material} position={[0, nozzleY, -0.02]} frustumCulled={false} renderOrder={BEHIND_ROCKET}>
        <planeGeometry args={[1, 1]} />
        {box && (
          <lineLoop geometry={square} renderOrder={OVER_ROCKET}>
            <lineBasicMaterial color="#ffd77a" toneMapped={false} depthTest={false} />
          </lineLoop>
        )}
      </mesh>
      <group position={[0, CARD_H / 2 - 0.05, 0]}>{ship.texture && <Card texture={ship.texture} />}</group>
    </group>
  );
}

/** the game's view of its rocket (FlightController's camera, its view widening with speed) */
function GameCamera({ drive }: { drive: Drive }) {
  useFrame(({ camera }) => {
    camera.position.set(0.9, 0.2, 5);
    camera.lookAt(0, 0.5, 0);
    if (camera instanceof THREE.PerspectiveCamera) {
      const fov = 50 + Math.min(drive.effective, 1.1) * 16;
      if (Math.abs(camera.fov - fov) > 0.01) {
        camera.fov = fov;
        camera.updateProjectionMatrix();
      }
    }
  });
  return null;
}

/** the far stars drifting down past, slowly, faster with speed (RocketScene's) */
function DriftingStars({ drive }: { drive: Drive }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, raw) => {
    if (ref.current) ref.current.rotation.x -= Math.min(raw, 0.1) * (0.004 + drive.effective * 0.05);
  });
  return (
    <group ref={ref}>
      <Stars radius={60} depth={40} count={3000} factor={4} fade speed={0.4} />
    </group>
  );
}

/** the game's glow round what's bright (RocketScene's bloom) */
function Glow() {
  return (
    <EffectComposer>
      <Bloom luminanceThreshold={0.35} luminanceSmoothing={0.9} intensity={1} mipmapBlur />
    </EffectComposer>
  );
}

function Sky() {
  const level = useGameStore((s) => s.progress.level);
  const sky = skyForLevel(level);
  return <GradientSky topColor={sky.top} bottomColor={sky.bottom} />;
}

export function SpeedDemo() {
  const t = useT().how.speed;
  const ship = usePilotShip();
  const drive = useDrive(0.3);
  const [speed, setSpeed] = useState(drive.target);
  return (
    <>
      <div className="how-stage">
        <Canvas dpr={[1, 1.5]} camera={{ position: [0.9, 0.2, 5], fov: 50 }}>
          <GameCamera drive={drive} />
          <Sky />
          <DriftingStars drive={drive} />
          <SpeedStreaks source={drive} />
          <FlyingShip ship={ship} drive={drive} />
          <Glow />
        </Canvas>
      </div>
      <div className="how-controls">
        <Slider
          label={t.speed}
          min={0.12}
          max={1.25}
          step={0.01}
          value={speed}
          onChange={(v) => {
            setSpeed(v);
            drive.target = v;
          }}
        />
      </div>
    </>
  );
}

const corner = new THREE.Vector3();

/**
 * How many dots of the screen the plume's shader works out each frame (its
 * rectangle's area there, as the canvas draws it) and how many frames a
 * second, told every half second.
 */
function DotCounter({ plume, onCount }: { plume: React.RefObject<THREE.Mesh | null>; onCount: (dots: number, fps: number) => void }) {
  const frames = useRef({ n: 0, since: 0 });
  useFrame(({ camera, size, gl, clock }) => {
    const mesh = plume.current;
    if (!mesh) return;
    const f = frames.current;
    f.n++;
    const now = clock.elapsedTime;
    if (now - f.since < 0.5) return;
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const [cx, cy] of [
      [-0.5, -0.5],
      [0.5, -0.5],
      [0.5, 0.5],
      [-0.5, 0.5],
    ]) {
      mesh.localToWorld(corner.set(cx, cy, 0)).project(camera);
      x0 = Math.min(x0, corner.x);
      x1 = Math.max(x1, corner.x);
      y0 = Math.min(y0, corner.y);
      y1 = Math.max(y1, corner.y);
    }
    const clip = (v: number) => Math.max(-1, Math.min(1, v));
    const dpr = gl.getPixelRatio();
    const dots = (((clip(x1) - clip(x0)) / 2) * size.width * dpr) * (((clip(y1) - clip(y0)) / 2) * size.height * dpr);
    onCount(Math.round(dots), f.n / (now - f.since));
    f.n = 0;
    f.since = now;
  });
  return null;
}

export function PlumeDemo() {
  const t = useT().how.plume;
  const lang = useLang((s) => s.lang);
  const ship = usePilotShip();
  const drive = useDrive(0.45);
  const plume = useRef<THREE.Mesh>(null);
  const [power, setPower] = useState(drive.target);
  const [count, setCount] = useState<{ dots: number; fps: number } | null>(null);
  const [box, setBox] = useState(false);
  const fmt = (n: number) => Math.round(n).toLocaleString(lang === 'he' ? 'he-IL' : 'en-US');
  return (
    <>
      <div className="how-stage">
        <Canvas dpr={[1, 1.5]} camera={{ position: [0.9, 0.2, 5], fov: 50 }}>
          <GameCamera drive={drive} />
          <color attach="background" args={['#0b0820']} />
          <FlyingShip ship={ship} drive={drive} plume={plume} box={box} />
          <DotCounter plume={plume} onCount={(dots, fps) => setCount({ dots, fps })} />
          <Glow />
        </Canvas>
        {count && (
          <p className="how-readout" aria-live="off">
            {t.count(fmt(count.dots), fmt(count.fps), fmt(count.dots * Math.round(count.fps)))}
          </p>
        )}
      </div>
      <div className="how-controls">
        <Slider
          label={t.power}
          min={0}
          max={1.25}
          step={0.01}
          value={power}
          onChange={(v) => {
            setPower(v);
            drive.target = v;
          }}
        />
        <Toggle label={t.box} on={box} onChange={setBox} />
        <button type="button" className="how-button" onClick={() => (drive.jolt = 1)}>
          {t.oops}
        </button>
      </div>
    </>
  );
}
