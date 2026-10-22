import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { flight } from '../../game/flight';
import { useAdmiral } from '../../game/useAchievements';
import { useCrewStore } from '../../game/useCrewStore';
import { BEHIND_ROCKET, OVER_ROCKET } from './plume';

// A blast-off's light (FlyingRocket). Through the build-up a glow swells at
// the nozzle and an aura around the hull, pulsing faster and faster, and
// sparks spiral in to the engine; at ignition a white-hot flash and a
// shockwave ring burst out of it. All of it adds light, so the bloom makes
// it shine. Nothing shows in normal flight.

/** a soft round light, or (`ring`) a thin bright ring, white, to tint */
function radialTexture(ring: boolean): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    const stops: Array<[number, number]> = ring
      ? [
          [0, 0],
          [0.6, 0],
          [0.78, 0.95],
          [0.86, 0.35],
          [1, 0],
        ]
      : [
          [0, 1],
          [0.16, 0.8],
          [0.42, 0.24],
          [1, 0],
        ];
    for (const [at, a] of stops) g.addColorStop(at, `rgba(255, 255, 255, ${a})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const COOL = new THREE.Color('#6ad7ff');
const HOT = new THREE.Color('#ff6ad5');
const GOLD_COOL = new THREE.Color('#ffd77a');
// (warm amber rather than white-gold: the gold plume is near white already, and both together blow out)
const GOLD_HOT = new THREE.Color('#ffb84d');
const WHITE = new THREE.Color('#ffffff');

const SPARKS = 44;
/** how long the shockwave ring takes to spread and fade (s) */
const RING_S = 0.55;

const easeOut = (t: number) => 1 - (1 - t) ** 3;

export function EngineGlow({ nozzleY }: { nozzleY: number }) {
  const admiral = useAdmiral();
  const crew = useCrewStore((s) => s.active);
  // a Space Admiral's burns gold (flying solo: a crew's rocket is everyone's)
  const gold = admiral && !crew;

  const parts = useMemo(() => {
    const glow = radialTexture(false);
    const ring = radialTexture(true);
    // (in front of the rocket whatever the depth test says: OVER_ROCKET)
    const light = (map: THREE.Texture, over = true) =>
      new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, depthTest: !over, blending: THREE.AdditiveBlending, toneMapped: false, fog: false });
    const sparkGeometry = new THREE.BufferGeometry();
    sparkGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SPARKS * 3), 3));
    sparkGeometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(SPARKS * 3), 3));
    return {
      textures: [glow, ring],
      halo: light(glow, false),
      nozzle: light(glow),
      flash: light(glow),
      ring: light(ring),
      sparkGeometry,
      sparks: new THREE.PointsMaterial({
        map: glow,
        size: 0.22,
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
        fog: false,
      }),
      // each spark's own way in: where around the nozzle it starts, how far out, how fast, which way it curls
      seeds: Array.from({ length: SPARKS }, (_, i) => ({
        angle: (i / SPARKS) * Math.PI * 2 + Math.random() * 0.4,
        radius: 1.1 + Math.random() * 1.5,
        rate: 0.9 + Math.random() * 0.9,
        offset: Math.random(),
        curl: (Math.random() < 0.5 ? -1 : 1) * (1.2 + Math.random()),
      })),
    };
  }, []);
  useEffect(
    () => () => {
      parts.textures.forEach((t) => t.dispose());
      [parts.halo, parts.nozzle, parts.flash, parts.ring, parts.sparks].forEach((m) => m.dispose());
      parts.sparkGeometry.dispose();
    },
    [parts],
  );

  const root = useRef<THREE.Group>(null);
  const halo = useRef<THREE.Mesh>(null);
  const nozzle = useRef<THREE.Mesh>(null);
  const flash = useRef<THREE.Mesh>(null);
  const ring = useRef<THREE.Mesh>(null);
  const shock = useRef({ age: Infinity, last: 0 });
  const color = useMemo(() => new THREE.Color(), []);

  useFrame(({ clock }, rawDelta) => {
    const group = root.current;
    if (!group || !halo.current || !nozzle.current || !flash.current || !ring.current) return;
    const t = clock.elapsedTime;
    const dt = Math.min(rawDelta, 0.1);
    const charge = flight.charge;
    const ignition = flight.ignition;
    // a fresh ignition sends out the shockwave
    if (ignition > shock.current.last + 0.5) shock.current.age = 0;
    shock.current.last = ignition;
    shock.current.age += dt;
    const ringK = shock.current.age / RING_S;

    group.visible = charge > 0.001 || ignition > 0.01 || ringK < 1;
    if (!group.visible) return;

    // cool ion blue warming to hot pink as it builds (an admiral's gold to white-gold), the pulse quickening
    color.copy(gold ? GOLD_COOL : COOL).lerp(gold ? GOLD_HOT : HOT, charge);
    const pulse = 0.82 + 0.18 * Math.sin(t * (7 + 26 * charge));

    nozzle.current.scale.setScalar((0.35 + 2.3 * charge) * pulse + 2.2 * ignition);
    parts.nozzle.color.copy(color).lerp(WHITE, ignition * 0.6);
    parts.nozzle.opacity = Math.min(1, 0.95 * charge * pulse + ignition);

    halo.current.scale.set((1.5 + 1.2 * charge) * pulse + 1.4 * ignition, (2.6 + 1.4 * charge) * pulse + 1.6 * ignition, 1);
    parts.halo.color.copy(color);
    parts.halo.opacity = 0.48 * charge * pulse + 0.3 * ignition;

    flash.current.scale.setScalar(0.4 + 3.4 * ignition);
    parts.flash.color.copy(WHITE);
    parts.flash.opacity = ignition ** 1.5;

    const k = Math.min(1, ringK);
    ring.current.scale.setScalar(0.6 + 7 * easeOut(k));
    parts.ring.color.copy(color).lerp(WHITE, 0.4);
    parts.ring.opacity = ringK < 1 ? (1 - k) ** 2 : 0;

    // sparks drawn in to the nozzle, curling as they go, brightest as they arrive
    const pos = parts.sparkGeometry.getAttribute('position') as THREE.BufferAttribute;
    const col = parts.sparkGeometry.getAttribute('color') as THREE.BufferAttribute;
    parts.seeds.forEach((s, i) => {
      const q = (t * s.rate + s.offset) % 1;
      const r = s.radius * (1 - q) ** 1.6;
      const a = s.angle + s.curl * q * 2.2;
      pos.setXYZ(i, Math.cos(a) * r, nozzleY + 0.12 + Math.sin(a) * r * 0.75, 0.05);
      const b = charge * Math.sin(Math.PI * q) * 2.2;
      col.setXYZ(i, color.r * b, color.g * b, color.b * b);
    });
    pos.needsUpdate = true;
    col.needsUpdate = true;
  });

  return (
    <group ref={root} visible={false}>
      {/* the aura, behind the hull (so it shows round its outline) */}
      <mesh ref={halo} position={[0, 1.1, -0.06]} material={parts.halo} renderOrder={BEHIND_ROCKET}>
        <planeGeometry args={[1, 1]} />
      </mesh>
      <mesh ref={nozzle} position={[0, nozzleY + 0.04, 0.03]} material={parts.nozzle} renderOrder={OVER_ROCKET}>
        <planeGeometry args={[1, 1]} />
      </mesh>
      <mesh ref={ring} position={[0, nozzleY, 0.04]} material={parts.ring} renderOrder={OVER_ROCKET}>
        <planeGeometry args={[1, 1]} />
      </mesh>
      <mesh ref={flash} position={[0, nozzleY, 0.06]} material={parts.flash} renderOrder={OVER_ROCKET}>
        <planeGeometry args={[1, 1]} />
      </mesh>
      <points geometry={parts.sparkGeometry} material={parts.sparks} frustumCulled={false} renderOrder={OVER_ROCKET} />
    </group>
  );
}
