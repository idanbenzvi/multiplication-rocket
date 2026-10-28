import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Stars } from '@react-three/drei';
import * as THREE from 'three';
import { activeMission } from '../../profiles/useProfiles';
import { LOOKS } from '../scene/planetLooks';
import { drawPlanet } from './drawPlanet';
import { glyphCanvas } from './glyphs';
import { glowLights } from './lights';
import { dirOfLook } from './geometry';
import { drive, NOSE_PITCH, planetAngle, startDrive, stepDrive } from './drive';
import { loopFx } from './loop/live';

// Outside the cockpit's glass: the flight going on. Space streams past from
// dead ahead (the windscreen's middle, the ship's nose): stars stretching
// into streaks, as fast as the flight is (the pilot's streak, their tank and
// their last right answer's boost, game/flight.ts), wavering a little as the
// HUD's speed does (drive.ts); the
// pilot's numbers floating past among them (glyphs.ts); and dead ahead the
// level's destination, as big as the tank says it's near and growing a
// little as you watch. Far behind it all, a nebula's glow. Now and then a
// comet streaks across the top of the windscreen, lighting the cockpit as it goes
// (lights.ts). Everything is beyond the cockpit's walls (10 units round),
// so it's only ever seen through the glass.
//
// Pulling the afterburner (loop/), the ship loops the loop: the sky wheels
// round past the glass (the nebula, the stars, the destination), while the
// streaks and the numbers keep flying along the nose, faster, and all of it
// nearly stops while a moment's frozen.

const DEG = Math.PI / 180;

export interface Destination {
  /** which destination (planetLooks.ts order) */
  index: number;
  /** how near it is: the fuel tank, 0 to 1 */
  approach: number;
}

const between = (a: number, b: number) => a + Math.random() * (b - a);

// ---- the nebula far behind everything ----

const NEBULA_VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
const NEBULA_FRAGMENT = /* glsl */ `
varying vec3 vDir;
uniform float uTime;
float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float fbm(vec3 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 5; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; }
  return s;
}
void main() {
  vec3 d = normalize(vDir);
  float n = fbm(d * 2.4 + vec3(0.0, 0.0, uTime * 0.004));
  float m = fbm(d * 5.1 + 3.7);
  float ahead = max(0.0, -d.z);
  vec3 col = vec3(0.010, 0.008, 0.026);
  col += vec3(0.20, 0.07, 0.34) * smoothstep(0.42, 0.9, n) * 0.75;
  col += vec3(0.04, 0.24, 0.32) * smoothstep(0.55, 0.95, m) * smoothstep(0.35, 0.8, n) * 0.6;
  col += vec3(0.42, 0.20, 0.62) * pow(ahead, 7.0) * 0.32;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

function Nebula() {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: NEBULA_VERTEX,
        fragmentShader: NEBULA_FRAGMENT,
        side: THREE.BackSide,
        depthWrite: false,
        depthTest: false,
        uniforms: { uTime: { value: 0 } },
      }),
    [],
  );
  useFrame(({ clock }) => {
    material.uniforms.uTime.value = clock.elapsedTime;
  });
  return (
    <mesh material={material} renderOrder={-10} frustumCulled={false}>
      <sphereGeometry args={[400, 48, 24]} />
    </mesh>
  );
}

// ---- the streaks ----

const STREAKS = 700;
const Z_FAR = -800;
const Z_NEAR = 60;
const PALETTE = ['#ffe1a8', '#c9a4de', '#7ec4b0', '#f2a6c0', '#bfe6f5', '#ffffff', '#ffffff'].map((c) => new THREE.Color(c));

function Streaks({ calm }: { calm: boolean }) {
  const { geometry, positions, colors, parts } = useMemo(() => {
    const positions = new Float32Array(STREAKS * 6);
    const colors = new Float32Array(STREAKS * 6);
    const spawn = (z: number) => {
      // (round the nose, never through the cockpit: from just past its walls out)
      const r = 16 + 150 * Math.random() ** 1.5;
      const a = Math.random() * Math.PI * 2;
      return { x: Math.cos(a) * r, y: Math.sin(a) * r, z, f: between(0.6, 1.4), color: PALETTE[Math.floor(Math.random() * PALETTE.length)], b: between(0.4, 1) };
    };
    const parts = Array.from({ length: STREAKS }, () => spawn(between(Z_FAR, Z_NEAR)));
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return { geometry, positions, colors, parts: { list: parts, spawn } };
  }, []);
  const material = useMemo(
    () => new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, toneMapped: false }),
    [],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame((_, raw) => {
    const dt = Math.min(raw, 0.1) * loopFx.time;
    // the drive's speed, the HUD's (drive.ts)
    const s = (calm ? 0.25 : 1) * (0.25 + drive.k * 0.9);
    const speed = (40 + s * 220) * loopFx.warp;
    const tail = (2 + s * s * 46) * loopFx.warp;
    const glow = 1.4 + s * 0.9;
    const list = parts.list;
    for (let i = 0; i < STREAKS; i++) {
      let p = list[i];
      p.z += speed * p.f * dt;
      if (p.z > Z_NEAR) p = list[i] = parts.spawn(Z_FAR + Math.random() * 40);
      const o = i * 6;
      positions[o] = p.x;
      positions[o + 1] = p.y;
      positions[o + 2] = p.z;
      positions[o + 3] = p.x;
      positions[o + 4] = p.y;
      positions[o + 5] = p.z - tail * p.f;
      // fading in out of the distance; the head bright (past white, to bloom), the tail dark
      const k = Math.min(1, (p.z - Z_FAR) / 220) * p.b * glow;
      colors[o] = p.color.r * k;
      colors[o + 1] = p.color.g * k;
      colors[o + 2] = p.color.b * k;
      colors[o + 3] = colors[o + 4] = colors[o + 5] = 0;
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
  });

  return <lineSegments geometry={geometry} material={material} renderOrder={1} frustumCulled={false} />;
}

// ---- the numbers floating past ----

const GLYPHS = 18;
const GLYPH_POOL = 26;

function Numbers({ calm }: { calm: boolean }) {
  const group = useRef<THREE.Group>(null);
  const pool = useMemo(() => {
    const mission = activeMission();
    return Array.from({ length: GLYPH_POOL }, () => {
      const { canvas, aspect } = glyphCanvas(mission);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      return { texture, aspect };
    });
  }, []);
  const sprites = useMemo(() => {
    const spawn = (z: number) => {
      const r = 24 + 60 * Math.random();
      const a = Math.random() * Math.PI * 2;
      return { x: Math.cos(a) * r, y: Math.sin(a) * r * 0.8, z, f: between(0.7, 1.2), h: between(7, 12), art: Math.floor(Math.random() * GLYPH_POOL), spin: between(-0.25, 0.25) };
    };
    const list = Array.from({ length: GLYPHS }, (_, i) => spawn(Z_FAR * 0.8 + ((i + Math.random()) / GLYPHS) * (40 - Z_FAR * 0.8)));
    const objects = list.map(() => {
      const m = new THREE.SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
      return new THREE.Sprite(m);
    });
    return { list, objects, spawn };
  }, []);
  useEffect(
    () => () => {
      pool.forEach((p) => p.texture.dispose());
      sprites.objects.forEach((o) => o.material.dispose());
    },
    [pool, sprites],
  );
  useEffect(() => {
    const g = group.current;
    if (!g) return;
    sprites.objects.forEach((o) => {
      o.renderOrder = 2;
      g.add(o);
    });
    return () => {
      sprites.objects.forEach((o) => g.remove(o));
    };
  }, [sprites]);

  useFrame((_, raw) => {
    const dt = Math.min(raw, 0.1) * loopFx.time;
    const speed = (calm ? 8 : 26) * (0.7 + drive.k * 0.6) * loopFx.warp;
    sprites.list.forEach((g, i) => {
      g.z += speed * g.f * dt;
      if (g.z > 30) sprites.list[i] = g = sprites.spawn(Z_FAR * 0.8);
      const o = sprites.objects[i];
      const art = pool[g.art];
      if (o.material.map !== art.texture) {
        o.material.map = art.texture;
        o.material.needsUpdate = true;
      }
      o.position.set(g.x, g.y, g.z);
      o.scale.set(g.h * art.aspect, g.h, 1);
      o.material.rotation += g.spin * dt;
      // fading in out of the distance, and out as they slip past
      const fadeIn = Math.min(1, (g.z - Z_FAR * 0.8) / 180);
      const fadeOut = Math.min(1, (30 - g.z) / 40);
      o.material.opacity = Math.max(0, fadeIn * fadeOut) * 0.95;
      // (a touch past white, to glow)
      o.material.color.setScalar(1.25);
    });
  });

  return <group ref={group} />;
}

// ---- the destination ahead ----

const PLANET_PX = 512;
const PLANET_R = 96;
const PLANET_DIST = 900;

function Planet({ destination, calm }: { destination: Destination; calm: boolean }) {
  const ahead = useRef(destination);
  useEffect(() => {
    ahead.current = destination;
  });
  const { canvas, texture } = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = PLANET_PX;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return { canvas, texture };
  }, []);
  useEffect(() => () => texture.dispose(), [texture]);
  const sprite = useRef<THREE.Sprite>(null);
  const opened = useRef(performance.now());
  const frame = useRef(0);

  useFrame(() => {
    const d = ahead.current;
    const ctx = canvas.getContext('2d');
    if (!ctx || !sprite.current) return;
    const now = performance.now();
    // (it turns slowly: drawn every third frame is plenty)
    if (frame.current++ % 3 === 0) {
      ctx.clearRect(0, 0, PLANET_PX, PLANET_PX);
      drawPlanet(ctx, PLANET_PX / 2, PLANET_PX / 2, PLANET_R, LOOKS[d.index % LOOKS.length], d.index, (now - opened.current) / 1000);
      texture.needsUpdate = true;
    }
    // as near as the tank says, and nearing as you watch
    const nearing = 1 + Math.min(1, (now - opened.current) / 40000) * 0.12 * (calm ? 0.3 : 1);
    const angle = planetAngle(d.approach) * nearing;
    const r = PLANET_DIST * Math.tan(angle);
    sprite.current.scale.setScalar(r * (PLANET_PX / PLANET_R));
  });

  return (
    <sprite ref={sprite} position={[0, 0, -PLANET_DIST]} renderOrder={0}>
      <spriteMaterial map={texture} transparent depthTest={false} depthWrite={false} toneMapped={false} color={[1.08, 1.08, 1.08]} />
    </sprite>
  );
}

// ---- a comet across the canopy ----

const COMET_COLORS = ['#ffe2a0', '#a8f6ff', '#ffc0f4'];
const TAIL = 48;
const COMET_DIST = 300;

function cometGlow(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.18, 'rgba(255,255,255,0.85)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.25)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function Comet({ calm }: { calm: boolean }) {
  const glow = useMemo(cometGlow, []);
  const head = useRef<THREE.Sprite>(null);
  const { geometry, positions, colors } = useMemo(() => {
    const positions = new Float32Array(TAIL * 3);
    const colors = new Float32Array(TAIL * 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return { geometry, positions, colors };
  }, []);
  const tailMaterial = useMemo(
    () => new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, toneMapped: false }),
    [],
  );
  const tail = useMemo(() => {
    const line = new THREE.Line(geometry, tailMaterial);
    line.renderOrder = 3;
    line.frustumCulled = false;
    return line;
  }, [geometry, tailMaterial]);
  const pass = useRef<{ at: number; ms: number; dir: number; p0: number; p1: number; color: THREE.Color; css: string } | null>(null);
  const next = useRef(performance.now() + between(5, 9) * 1000);
  useEffect(
    () => () => {
      glow.dispose();
      geometry.dispose();
      glowLights.passing.k = 0;
    },
    [glow, geometry],
  );

  const at = (p: NonNullable<typeof pass.current>, t: number) => {
    // across the top of the windscreen, from one side to the other and dipping a little
    const yaw = p.dir * (-80 + 160 * t) * DEG;
    const pitch = (p.p0 + (p.p1 - p.p0) * t) * DEG;
    return dirOfLook({ yaw, pitch }).map((v) => v * COMET_DIST) as [number, number, number];
  };

  useFrame(() => {
    const now = performance.now();
    const h = head.current;
    if (!h) return;
    if (!pass.current) {
      h.visible = false;
      if (calm || now < next.current || document.hidden || loopFx.on) return;
      const css = COMET_COLORS[Math.floor(Math.random() * COMET_COLORS.length)];
      pass.current = { at: now, ms: between(3600, 4800), dir: Math.random() < 0.5 ? 1 : -1, p0: between(24, 33), p1: between(13, 19), color: new THREE.Color(css), css };
    }
    const p = pass.current;
    const t = (now - p.at) / p.ms;
    if (t >= 1) {
      pass.current = null;
      next.current = now + between(16, 30) * 1000;
      glowLights.passing.k = 0;
      h.visible = false;
      positions.fill(0);
      geometry.attributes.position.needsUpdate = true;
      return;
    }
    const pos = at(p, t);
    h.visible = true;
    h.position.set(...pos);
    h.scale.setScalar(16);
    h.material.color.copy(p.color).multiplyScalar(3.2);
    for (let i = 0; i < TAIL; i++) {
      const q = at(p, Math.max(0, t - i * 0.0042));
      positions.set(q, i * 3);
      const k = (1 - i / TAIL) ** 1.6 * 2.4;
      colors[i * 3] = p.color.r * k;
      colors[i * 3 + 1] = p.color.g * k;
      colors[i * 3 + 2] = p.color.b * k;
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
    // its light, coming in through the glass
    const len = Math.hypot(...pos);
    glowLights.passing.dir = [pos[0] / len, pos[1] / len, pos[2] / len];
    glowLights.passing.color = p.css;
    glowLights.passing.k = Math.sin(Math.PI * t) ** 0.7;
  });

  return (
    <>
      <sprite ref={head} renderOrder={3} visible={false}>
        <spriteMaterial map={glow} transparent blending={THREE.AdditiveBlending} depthTest={false} depthWrite={false} toneMapped={false} />
      </sprite>
      <primitive object={tail} />
    </>
  );
}

// ---- the drive ----

function Drive() {
  useEffect(startDrive, []);
  useFrame(({ clock }, raw) => {
    stepDrive(clock.elapsedTime, Math.min(raw, 0.1));
    // (the HUD's light on the dashboard, a little brighter the faster we go)
    glowLights.hud = Math.min(1, drive.k / 1.3);
  });
  return null;
}

export function Space({ destination, calm }: { destination?: Destination; calm: boolean }) {
  // (looping, the sky wheels round the other way to the ship's pitch)
  const sky = useRef<THREE.Group>(null);
  useFrame(() => {
    if (sky.current) sky.current.rotation.x = -loopFx.pitch;
  });
  return (
    <>
      <Drive />
      <group ref={sky}>
        <Nebula />
        <group rotation-x={NOSE_PITCH}>
          <Stars radius={180} depth={120} count={4200} factor={7} saturation={0.4} fade speed={0.6} />
          {destination && <Planet destination={destination} calm={calm} />}
        </group>
        <Comet calm={calm} />
      </group>
      <group rotation-x={NOSE_PITCH}>
        <Streaks calm={calm} />
        <Numbers calm={calm} />
      </group>
    </>
  );
}
