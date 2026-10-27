import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { canyonWind, sfx } from '../../../audio/sfx';
import { LOOKS } from '../../scene/planetLooks';
import { drawPlanet } from '../drawPlanet';
import { NOSE_PITCH } from '../drive';
import { glowLights } from '../lights';
import { view } from '../view';
import { CHUNK, type ChunkData } from './chunk';
import { HOVER, SUN, clamp01, smooth, sunlight } from './field';
import { flash, fx } from './fx';
import { RULER, type Gate } from './gates';
import { BAND_H, BAND_W, SIGN_H, SIGN_W, rulerTexture, signTexture } from './labels';
import { bridgeMaterial, skyMaterial, terrainMaterial } from './materials';
import { CLIMB_S, type RunEvent } from './run';
import { live, useCanyon } from './useCanyon';

// The Canyon Run, outside the cockpit's glass (the flight itself is run.ts;
// the canyon, field.ts). Each frame the flight steps on and the world is
// moved round the cockpit: the ship never moves, the canyon does, turned
// against the ship's heading, pitched against its nose and rolled against
// its bank, so the horizon tilts as it banks into a bend. The canyon comes
// in chunks as it's needed (built by a worker, builder.ts), and the gates'
// bridges of light as they come into the haze. Dust hangs in the air,
// streaking past; sparks fly off a wall scraped; a ring of light bursts
// out round the windscreen through a gate.
//
// The light in the cockpit follows the sun: warm and bright while it
// reaches the ship, cool and dim when the rock's shadow is over it, and its
// glare on the lens when it's in view; the cockpit shudders with the speed,
// more the nearer a wall, jolts against one and kicks through a gate.

const AHEAD = { high: 9, low: 7 };
const FOG_END = { high: 830, low: 650 };
const DUST = { high: 380, low: 200 };
const SPARKS = 140;
const GOLD: [number, number, number] = [1, 0.78, 0.35];
const CYAN: [number, number, number] = [0.35, 0.95, 1];
const DUSK: [number, number, number] = [0.55, 0.25, 0.6];
/** where the destination hangs in the sky */
const PLANET_AT = new THREE.Vector3(-Math.sin(0.55) * Math.cos(0.36), Math.sin(0.36), -Math.cos(0.55) * Math.cos(0.36)).multiplyScalar(1500);
const PLANET_ANGLE = 0.075;

interface Bridge {
  gate: Gate;
  group: THREE.Group;
  band: THREE.ShaderMaterial;
  sign: THREE.ShaderMaterial;
  pylons: THREE.MeshBasicMaterial;
  textures: THREE.Texture[];
  beacons: number;
}

function between(a: number, b: number) {
  return a + Math.random() * (b - a);
}

export function CanyonWorld({ destination }: { destination: number }) {
  const camera = useThree((s) => s.camera);
  // (the run as it was when this mounted: the store lets go of it as the run lands)
  const run = useMemo(() => live.run!, []);
  const builder = useMemo(() => live.builder!, []);
  const quality = live.quality;
  const calm = run.calm;

  const attitude = useRef<THREE.Group>(null);
  const world = useRef<THREE.Group>(null);
  const terrain = useRef<THREE.Group>(null);

  const sky = useMemo(skyMaterial, []);
  const ground = useMemo(() => terrainMaterial(FOG_END[quality]), [quality]);
  const planet = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    drawPlanet(ctx, 256, 256, 96, LOOKS[destination % LOOKS.length], destination, 0);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, depthWrite: false, toneMapped: false, fog: false }));
    sprite.position.copy(PLANET_AT);
    sprite.scale.setScalar(1500 * Math.tan(PLANET_ANGLE) * (512 / 96));
    sprite.renderOrder = -9;
    return sprite;
  }, [destination]);

  // the dust in the air, and the sparks off a wall: lines, each a streak from where it is back along the ship's flight
  const dust = useMemo(() => {
    const n = DUST[quality];
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 6), 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 6), 3));
    const motes = Array.from({ length: n }, () => ({ d: 0, u: 0, y: 0, b: between(0.4, 1) }));
    const lines = new THREE.LineSegments(
      geometry,
      new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    );
    lines.frustumCulled = false;
    lines.renderOrder = 2;
    return { lines, geometry, motes, placed: false };
  }, [quality]);
  const sparks = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SPARKS * 6), 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(SPARKS * 6), 3));
    const list = Array.from({ length: SPARKS }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), life: 0, max: 1 }));
    const lines = new THREE.LineSegments(
      geometry,
      new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    );
    lines.frustumCulled = false;
    lines.renderOrder = 3;
    return { lines, geometry, list, next: 0 };
  }, []);
  // the ring of light through a gate, round the windscreen
  const ring = useMemo(() => {
    const material = new THREE.MeshBasicMaterial({ color: new THREE.Color(...GOLD), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 96), material);
    mesh.position.z = -12;
    mesh.renderOrder = 4;
    mesh.visible = false;
    return { mesh, material, age: 99 };
  }, []);

  const state = useRef({
    chunks: new Map<number, THREE.Mesh>(),
    bridges: new Map<number, Bridge>(),
    lit: 1,
    thump: 0,
    flashGround: new THREE.Color(0, 0, 0),
    lastTick: 0,
    lastHeading: 0,
    lastPitch: 0,
    windAt: 0,
    climbing: false,
  });
  const wind = useMemo(() => canyonWind(), []);

  useEffect(() => {
    const s = state.current;
    sfx.hyperdrive();
    return () => {
      wind?.stop();
      for (const mesh of s.chunks.values()) mesh.geometry.dispose();
      s.chunks.clear();
      for (const b of s.bridges.values()) dropBridge(b);
      s.bridges.clear();
      sky.dispose();
      (ground.uniforms.uStrata.value as THREE.Texture).dispose();
      ground.dispose();
      planet.material.map?.dispose();
      planet.material.dispose();
      dust.geometry.dispose();
      (dust.lines.material as THREE.Material).dispose();
      sparks.geometry.dispose();
      (sparks.lines.material as THREE.Material).dispose();
      ring.mesh.geometry.dispose();
      ring.material.dispose();
      view.jolt.yaw = view.jolt.pitch = view.jolt.roll = 0;
      view.kick = 0;
      glowLights.ambient = 0.9;
      glowLights.tint = [1, 1, 1];
      glowLights.passing.k = 0;
    };
  }, [wind, sky, ground, planet, dust, sparks, ring]);

  const dropBridge = (b: Bridge) => {
    b.group.removeFromParent();
    b.group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    b.band.dispose();
    b.sign.dispose();
    b.pylons.dispose();
    b.textures.forEach((t) => t.dispose());
  };

  const makeBridge = (gate: Gate): Bridge => {
    const c = run.canyon;
    const group = new THREE.Group();
    group.position.set(c.center(gate.d), c.floor(gate.d) + HOVER, -gate.d);
    const ruler = rulerTexture(gate);
    const sign = signTexture(gate);
    const band = bridgeMaterial(ruler, BAND_W);
    const signMat = bridgeMaterial(sign, SIGN_W);
    const bandMesh = new THREE.Mesh(new THREE.PlaneGeometry(BAND_W, BAND_H), band);
    bandMesh.renderOrder = 1;
    const signMesh = new THREE.Mesh(new THREE.PlaneGeometry(SIGN_W, SIGN_H), signMat);
    signMesh.position.y = BAND_H / 2 + 5 + SIGN_H / 2;
    signMesh.renderOrder = 1;
    group.add(bandMesh, signMesh);
    // its pylons, either end, where the light's thrown from
    const pylons = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 1.5, 1.7), transparent: true, depthWrite: false, toneMapped: false });
    for (const side of [-1, 1]) {
      const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.7, 26, 0.7), pylons);
      pylon.position.set(side * (RULER + 3.4), 4, 0);
      pylon.renderOrder = 1;
      group.add(pylon);
    }
    world.current?.add(group);
    return { gate, group, band, sign: signMat, pylons, textures: [ruler, sign], beacons: 0 };
  };

  const ringOut = (rgb: [number, number, number], k: number) => {
    if (calm) return;
    ring.material.color.setRGB(rgb[0] * k, rgb[1] * k, rgb[2] * k);
    ring.age = 0;
  };

  const spray = (side: -1 | 1, strength: number) => {
    const [x, y, z] = run.position();
    const count = Math.round(10 + 22 * strength);
    for (let i = 0; i < count; i++) {
      const s = sparks.list[sparks.next++ % SPARKS];
      s.p.set(x + side * 3.8, y + between(-1.2, 0.8), z - between(3, 9));
      s.v.set(-side * between(2, 12), between(1, 9), -run.forward() * between(0.25, 0.75));
      s.life = s.max = between(0.35, 0.8);
    }
  };

  const handle = (e: RunEvent) => {
    const s = state.current;
    const soft = calm ? 0.5 : 1;
    if (e.type === 'gate') {
      const { verdict } = e.result;
      sfx.gate(verdict, run.combo);
      useCanyon.getState().gate(e.result);
      if (verdict === 'bullseye') {
        flash(GOLD, 0.38 * soft, 0.03, 0.5);
        s.flashGround.setRGB(1.2, 0.85, 0.35);
        if (!calm) view.kick = 0.085;
        s.thump = 0.006;
        ringOut(GOLD, 2.6);
      } else if (verdict === 'close') {
        flash(CYAN, 0.2 * soft, 0.03, 0.4);
        s.flashGround.setRGB(0.3, 0.8, 1);
        if (!calm) view.kick = 0.04;
        ringOut(CYAN, 1.8);
      } else {
        flash(DUSK, 0.14 * soft, 0.03, 0.45);
        s.thump = 0.005;
        ringOut(DUSK, 0.9);
      }
    } else if (e.type === 'scrape') {
      sfx.scrape(e.strength);
      glowLights.flicker = Math.max(glowLights.flicker, e.strength * 0.8);
      spray(e.side, e.strength);
    } else if (e.type === 'spire') {
      sfx.thud();
      glowLights.flicker = 1;
      s.thump = 0.014;
      flash([1, 0.6, 0.4], 0.16 * soft, 0.02, 0.35);
      spray(e.side, 1);
    } else if (e.type === 'lane') {
      const now = performance.now();
      if (now - s.lastTick > 45) {
        s.lastTick = now;
        sfx.tick(e.value);
      }
    } else if (e.type === 'climb') {
      s.climbing = true;
      sfx.flareOut();
      // (white as it tops out over the rim)
      flash([1, 0.97, 0.92], calm ? 0.7 : 1.15, 1.0, 1.0, CLIMB_S - 1.0);
    } else if (e.type === 'done') {
      useCanyon.getState().land(true);
    }
  };

  // scratch
  const tmp = useMemo(
    () => ({
      euler: new THREE.Euler(0, 0, 0, 'YXZ'),
      ship: new THREE.Matrix4(),
      nose: new THREE.Matrix4().makeRotationX(NOSE_PITCH),
      att: new THREE.Matrix4(),
      move: new THREE.Matrix4(),
      v: new THREE.Vector3(),
      sun: new THREE.Vector3(),
    }),
    [],
  );

  useFrame(({ clock }, raw) => {
    const s = state.current;
    const dt = Math.min(raw, 0.05);
    const now = performance.now();
    for (const e of run.step(dt)) handle(e);
    const c = run.canyon;
    const ship = run.ship;
    const fwd = run.forward();
    const pos = run.position();

    // ---- the canyon round the ship ----
    const here = Math.floor(ship.d / CHUNK);
    const ahead = AHEAD[quality];
    builder.want(here - 1, here + ahead + 2);
    for (let i = here - 1; i <= here + ahead; i++) {
      if (s.chunks.has(i)) continue;
      const data = builder.take(i);
      if (data) {
        const mesh = chunkMesh(data, ground);
        s.chunks.set(i, mesh);
        terrain.current?.add(mesh);
      }
    }
    for (const [i, mesh] of s.chunks) {
      if (i >= here - 1) continue;
      mesh.removeFromParent();
      mesh.geometry.dispose();
      s.chunks.delete(i);
      builder.drop(i);
    }

    // ---- the world, turned and moved against the ship ----
    tmp.euler.set(ship.pitch, -ship.heading, -ship.bank, 'YXZ');
    tmp.ship.makeRotationFromEuler(tmp.euler).transpose();
    tmp.att.copy(tmp.nose).multiply(tmp.ship);
    const att = attitude.current;
    const wld = world.current;
    if (att && wld) {
      att.matrix.copy(tmp.att);
      att.matrixWorldNeedsUpdate = true;
      wld.matrix.copy(tmp.att).multiply(tmp.move.makeTranslation(-pos[0], -pos[1], -pos[2]));
      wld.matrixWorldNeedsUpdate = true;
    }

    // ---- the gates' bridges ----
    run.gates.forEach((gate, i) => {
      const to = gate.d - ship.d;
      let b = s.bridges.get(i);
      if (!b && to < 1000 && to > -30) s.bridges.set(i, (b = makeBridge(gate)));
      if (!b) return;
      if (to < -60) {
        dropBridge(b);
        s.bridges.delete(i);
        return;
      }
      const next = i === run.next;
      // (each a pane of glass: gone as the ship's about to go through it, so it doesn't darken the view)
      b.band.uniforms.uFade.value = smooth(1000, 640, to) * smooth(3, 24, to);
      b.pylons.opacity = smooth(1000, 640, to);
      b.sign.uniforms.uFade.value = smooth(1000, 640, to) * smooth(6, 40, to);
      b.band.uniforms.uTime.value = clock.elapsedTime;
      b.sign.uniforms.uTime.value = clock.elapsedTime;
      b.band.uniforms.uMark.value = next && run.phase === 'fly' ? (ship.u + BAND_W / 2) / BAND_W : -1;
      // beacons as it nears
      if (next && run.phase === 'fly') {
        while (b.beacons < 3 && to < 330 - b.beacons * 100) sfx.beacon(b.beacons++);
      }
    });

    // ---- the light ----
    const lit = sunlight(c, pos, 6);
    s.lit += (lit - s.lit) * (1 - Math.exp(-dt * 9));
    tmp.sun.set(...SUN).applyMatrix4(tmp.att);
    glowLights.ambient = 0.58 + 0.42 * s.lit;
    glowLights.tint = [0.82 + 0.28 * s.lit, 0.84 + 0.14 * s.lit, 1.1 - 0.22 * s.lit];
    glowLights.passing.dir = [tmp.sun.x, tmp.sun.y, tmp.sun.z];
    glowLights.passing.color = '#ffc98f';
    glowLights.passing.k = s.lit * 0.85;
    glowLights.hud = Math.min(1, fwd / 100);
    glowLights.flicker *= Math.exp(-dt * 6);

    // the terrain's light: the next gate's number line and its glow, and a bullseye's flash
    const gate = run.ahead();
    const u = ground.uniforms;
    (u.uEye.value as THREE.Vector3).set(...pos);
    u.uFloorY.value = c.floor(ship.d);
    u.uTime.value = clock.elapsedTime;
    if (gate) {
      const to = gate.d - ship.d;
      (u.uRuler.value as THREE.Vector4).set(gate.d, gate.lo, run.phase === 'fly' ? 1 : 0, ship.u);
      (u.uBand.value as THREE.Vector4).set(c.center(gate.d), c.floor(gate.d) + HOVER, -gate.d, smooth(700, 200, to) * 1.1);
    } else {
      (u.uRuler.value as THREE.Vector4).z = 0;
      (u.uBand.value as THREE.Vector4).w = 0;
    }
    s.flashGround.multiplyScalar(Math.exp(-dt * 3.5));
    (u.uFlash.value as THREE.Color).copy(s.flashGround);
    sky.uniforms.uTime.value = clock.elapsedTime;

    // ---- the lens ----
    const rush = clamp01((fwd - 40) / 60);
    const boost = clamp01(ship.boost / 30);
    fx.speed = calm ? 0 : rush * 0.05 + boost * 0.04;
    tmp.v.set(0, Math.sin(NOSE_PITCH), -Math.cos(NOSE_PITCH)).project(camera);
    fx.heading = [tmp.v.x * 0.5 + 0.5, tmp.v.y * 0.5 + 0.5];
    const turnRate = (ship.heading - s.lastHeading) / Math.max(dt, 1e-3);
    const pitchRate = (ship.pitch - s.lastPitch) / Math.max(dt, 1e-3);
    s.lastHeading = ship.heading;
    s.lastPitch = ship.pitch;
    fx.turn = calm ? [0, 0] : [Math.max(-0.03, Math.min(0.03, -turnRate * 0.02)), Math.max(-0.03, Math.min(0.03, pitchRate * 0.02))];
    const inFront = tmp.v.copy(tmp.sun).transformDirection(camera.matrixWorldInverse).z < 0;
    tmp.v.copy(tmp.sun).multiplyScalar(100).project(camera);
    const onScreen = inFront ? smooth(1.25, 0.95, Math.max(Math.abs(tmp.v.x), Math.abs(tmp.v.y))) : 0;
    fx.sunUV = [tmp.v.x * 0.5 + 0.5, tmp.v.y * 0.5 + 0.5];
    fx.sun = s.lit * onScreen * (calm ? 0.5 : 1) * (s.climbing ? 1.4 : 1);
    fx.split = boost * 0.3;

    // ---- the shudder ----
    s.thump *= Math.exp(-dt * 5);
    if (!calm) {
      const t = run.time;
      const k = 0.0005 + 0.0011 * rush + ship.near * 0.0035 + ship.scrape * 0.012 + s.thump;
      view.jolt.yaw = k * (0.6 * Math.sin(t * 37.3) + 0.4 * Math.sin(t * 61.7 + 2.1));
      view.jolt.pitch = k * (0.6 * Math.sin(t * 43.1 + 1.2) + 0.4 * Math.sin(t * 71.3));
      view.jolt.roll = k * 0.8 * Math.sin(t * 29.7 + 0.4);
    }
    view.kick *= Math.exp(-dt * 3);

    // ---- the wind ----
    if (wind && now - s.windAt > 90) {
      s.windAt = now;
      wind.set(clamp01((fwd - 25) / 75), Math.max(ship.near, ship.scrape));
    }

    // ---- the dust, streaking past ----
    const vel = tmp.v.set(c.slope(ship.d) * fwd + ship.vu, ship.vy, -fwd);
    const exposure = calm ? 0.01 : 0.03 + 0.02 * rush;
    const dp = dust.geometry.attributes.position.array as Float32Array;
    const dc = dust.geometry.attributes.color.array as Float32Array;
    const warm = s.lit;
    dust.motes.forEach((m, i) => {
      if (!dust.placed || m.d < ship.d - 12) {
        m.d = ship.d + (dust.placed ? between(180, 260) : between(-10, 260));
        m.u = between(-1, 1) * (c.half(m.d) + 6);
        m.y = c.floor(m.d) + between(1.5, 34);
      }
      const x = c.center(m.d) + m.u;
      const o = i * 6;
      dp[o] = x;
      dp[o + 1] = m.y;
      dp[o + 2] = -m.d;
      dp[o + 3] = x + vel.x * exposure;
      dp[o + 4] = m.y + vel.y * exposure;
      dp[o + 5] = -m.d + vel.z * exposure;
      // brighter near, and warm in the sun, violet in the shade
      const near = 1 - clamp01((m.d - ship.d) / 260);
      const k = m.b * near * (0.6 + 0.9 * warm);
      dc[o] = k * (0.55 + 0.6 * warm);
      dc[o + 1] = k * (0.45 + 0.35 * warm);
      dc[o + 2] = k * (0.8 - 0.25 * warm);
      dc[o + 3] = dc[o + 4] = dc[o + 5] = 0;
    });
    dust.placed = true;
    dust.geometry.attributes.position.needsUpdate = true;
    dust.geometry.attributes.color.needsUpdate = true;

    // ---- the sparks ----
    const sp = sparks.geometry.attributes.position.array as Float32Array;
    const sc = sparks.geometry.attributes.color.array as Float32Array;
    sparks.list.forEach((p, i) => {
      const o = i * 6;
      if (p.life <= 0) {
        sc[o] = sc[o + 1] = sc[o + 2] = sc[o + 3] = sc[o + 4] = sc[o + 5] = 0;
        return;
      }
      p.life -= dt;
      p.v.y -= 30 * dt;
      p.p.addScaledVector(p.v, dt);
      const k = clamp01(p.life / p.max);
      sp[o] = p.p.x;
      sp[o + 1] = p.p.y;
      sp[o + 2] = p.p.z;
      sp[o + 3] = p.p.x - (p.v.x - vel.x) * 0.03;
      sp[o + 4] = p.p.y - (p.v.y - vel.y) * 0.03;
      sp[o + 5] = p.p.z - (p.v.z - vel.z) * 0.03;
      sc[o] = 3 * k;
      sc[o + 1] = 1.7 * k;
      sc[o + 2] = 0.6 * k;
      sc[o + 3] = 1.2 * k;
      sc[o + 4] = 0.4 * k;
      sc[o + 5] = 0.1 * k;
    });
    sparks.geometry.attributes.position.needsUpdate = true;
    sparks.geometry.attributes.color.needsUpdate = true;

    // ---- the ring through a gate ----
    ring.age += dt;
    const ringK = 1 - ring.age / 0.65;
    ring.mesh.visible = ringK > 0;
    if (ringK > 0) {
      ring.mesh.scale.setScalar(2 + ring.age * 34);
      ring.material.opacity = ringK * ringK;
    }
  }, -2);

  return (
    <>
      <group ref={attitude} matrixAutoUpdate={false}>
        <mesh material={sky} renderOrder={-10} frustumCulled={false}>
          <sphereGeometry args={[1800, 48, 24]} />
        </mesh>
        <primitive object={planet} />
      </group>
      <group ref={world} matrixAutoUpdate={false}>
        <group ref={terrain} />
        <primitive object={dust.lines} />
        <primitive object={sparks.lines} />
      </group>
      <group rotation-x={NOSE_PITCH}>
        <primitive object={ring.mesh} />
      </group>
    </>
  );
}

function chunkMesh(data: ChunkData, material: THREE.Material): THREE.Mesh {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3));
  geometry.setAttribute('shade', new THREE.BufferAttribute(data.shade, 4));
  geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
  geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.matrixAutoUpdate = false;
  return mesh;
}
