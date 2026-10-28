import * as THREE from 'three';
import { smooth } from './field';
import type { CanyonPalette, Rgb } from './palette';
import type { Run } from './run';

// What hangs in the canyon's air for its way in (canyon/World.tsx shows
// them): wisps of cloud low over it, some set along the dive's way so it
// swoops down through them (each a puff of white on the glass), the rest
// round its way down and strung along the canyon ahead, in the view as the
// white clears; and a flock of gliders circling over the canyon ahead, their
// wings flapping and gliding by turns, which scatter as the ship comes.
// Everything's in the world's own coordinates, as the canyon is.

const between = (a: number, b: number) => a + Math.random() * (b - a);

/** a wisp of cloud: soft puffs strung along a long, thin streak, white (the sprite's colour lights it) */
function wispTexture(): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  for (let i = 0; i < 16; i++) {
    const x = 34 + Math.random() * 188;
    // (fuller in the middle, thinning to its ends)
    const mid = Math.sin((x / 256) * Math.PI);
    const y = 64 + (Math.random() - 0.5) * 34 * mid;
    const r = 14 + Math.random() * 34 * mid;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(255, 255, 255, ${0.2 + 0.2 * mid})`);
    g.addColorStop(0.6, `rgba(255, 255, 255, ${0.07 + 0.08 * mid})`);
    g.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export interface Wisps {
  group: THREE.Group;
  /** a frame: each thinned as it comes close (never a sheet over the glass) and into the haze far off; true if the ship's just gone through one */
  update(eye: THREE.Vector3, shipD: number): boolean;
  dispose(): void;
}

export function makeWisps(run: Run, palette: CanyonPalette, count: number, fogEnd: number): Wisps {
  const c = run.canyon;
  const textures = [0, 1, 2].map(wispTexture);
  const group = new THREE.Group();
  // (lit from the low star ahead, through the haze)
  const [hr, hg, hb] = palette.hazeLow;
  const [cr, cg, cb] = palette.cloud;
  const lit = new THREE.Color().setRGB(hr * 0.9 + cr * 0.55, hg * 0.9 + cg * 0.55, hb * 0.9 + cb * 0.55);
  const list: Array<{ sprite: THREE.Sprite; material: THREE.SpriteMaterial; d: number; w: number; base: number; through: boolean }> = [];
  const add = (d: number, u: number, y: number, w: number, base: number) => {
    const material = new THREE.SpriteMaterial({ map: textures[list.length % textures.length], color: lit, transparent: true, depthWrite: false, opacity: 0, fog: false });
    material.rotation = between(-0.12, 0.12);
    const sprite = new THREE.Sprite(material);
    const [x] = c.toWorld(d, u, y);
    sprite.position.set(x, y, -d);
    sprite.scale.set(w, w * 0.42, 1);
    sprite.renderOrder = 1;
    group.add(sprite);
    list.push({ sprite, material, d, w, base, through: false });
  };
  // on the dive's way down, for it to swoop through (none low down, where it's levelling out)
  for (const t of [1.75, 2.35]) {
    const p = run.descentAt(t);
    add(p.d + between(-5, 5), between(-4, 4), p.y + between(-2, 2), between(34, 46), between(0.5, 0.7));
  }
  // round its way down, and strung along the canyon ahead
  for (let i = 2; i < count; i++) {
    const near = i < count * 0.55;
    const d = near ? between(40, 270) : between(290, 900);
    const side = Math.random() < 0.5 ? -1 : 1;
    const u = side * (near ? between(12, 70) : between(20, 190));
    add(d, u, c.floor(d) + (near ? between(55, 128) : between(90, 150)), between(32, 72), between(0.3, 0.55));
  }
  return {
    group,
    update(eye, shipD) {
      let through = false;
      for (const w of list) {
        if (w.d < shipD - 40) {
          w.sprite.visible = false;
          continue;
        }
        const dist = w.sprite.position.distanceTo(eye);
        const k = w.base * smooth(6, 40, dist) * (1 - smooth(fogEnd * 0.45, fogEnd * 0.9, dist));
        w.material.opacity = k;
        w.sprite.visible = k > 0.003;
        if (!w.through && dist < w.w * 0.3) {
          w.through = true;
          through = true;
        }
      }
      return through;
    },
    dispose() {
      textures.forEach((t) => t.dispose());
      list.forEach((w) => w.material.dispose());
    },
  };
}

// ---- the flock ----

const FLOCK = 14;
/** each glider's triangles (two a wing's inner part, one its tip, either side, and its body), and so its points */
const TRIS = 8;
const POINTS = TRIS * 3;
const DARK: Rgb = [0.03, 0.02, 0.035];

export interface Flock {
  mesh: THREE.Mesh;
  update(time: number, dt: number, eye: THREE.Vector3, shipD: number): void;
  dispose(): void;
}

export function makeFlock(run: Run, palette: CanyonPalette, calm: boolean): Flock {
  const c = run.canyon;
  // where they circle: over the canyon ahead, about level with the ship gliding in
  const cd = between(330, 420);
  const cu = between(-8, 8);
  const ch = c.floor(cd) + between(112, 128);
  const turn = Math.random() < 0.5 ? -1 : 1;
  const birds = Array.from({ length: FLOCK }, () => ({
    r: between(7, 24),
    w: turn * between(0.32, 0.5),
    phase: Math.random() * Math.PI * 2,
    dh: between(-7, 7),
    flap: Math.random() * Math.PI * 2,
    rate: between(5.5, 7.5),
    span: between(6, 8.5),
    free: false,
    p: new THREE.Vector3(),
    v: new THREE.Vector3(),
  }));
  const positions = new Float32Array(FLOCK * POINTS * 3);
  const colors = new Float32Array(FLOCK * POINTS * 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const material = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: false });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;

  const f = new THREE.Vector3();
  const r = new THREE.Vector3();
  const u = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const at = new THREE.Vector3();
  let scattered = false;

  return {
    mesh,
    update(time, dt, eye, shipD) {
      mesh.visible = shipD < cd + 150;
      if (!mesh.visible) return;
      // (startled as the ship comes: off they go, each its own way, up and away)
      if (!scattered && shipD > cd - 160) {
        scattered = true;
        for (const b of birds) {
          b.free = true;
          b.v.set(between(-1, 1) * 10 + (b.p.x - eye.x > 0 ? 8 : -8), between(6, 14), between(-10, -4));
        }
      }
      let o = 0;
      for (const b of birds) {
        let bank = 0;
        let amp: number;
        if (b.free) {
          b.v.y += 4 * dt;
          b.p.addScaledVector(b.v, dt);
          f.copy(b.v).normalize();
          b.flap += b.rate * 1.6 * dt;
          amp = 0.75;
        } else {
          // round and round over the canyon, flapping and gliding by turns
          const a = b.phase + b.w * time;
          const d = cd + b.r * Math.sin(a) * 1.4;
          const across = cu + b.r * Math.cos(a);
          b.p.set(c.center(d) + across, ch + b.dh + 1.2 * Math.sin(time * 0.7 + b.phase), -d);
          f.set(-Math.sin(a) * b.w, 0, -Math.cos(a) * b.w * 1.4).normalize();
          // (leaning into the turn: its inner wing down)
          bank = Math.sign(b.w) * 0.35;
          const g = 0.5 + 0.5 * Math.sin(time * 0.9 + b.phase);
          amp = 0.12 + 0.5 * smooth(0.35, 0.8, g);
          b.flap += b.rate * dt;
        }
        if (calm) amp *= 0.5;
        // its frame: right, up (banked), forward
        r.crossVectors(f, up).normalize();
        u.crossVectors(r, f);
        if (bank) {
          const cb = Math.cos(bank);
          const sb = Math.sin(bank);
          at.copy(r).multiplyScalar(cb).addScaledVector(u, sb);
          u.multiplyScalar(cb).addScaledVector(r, -sb);
          r.copy(at);
        }
        const S = b.span;
        const lift = amp * Math.sin(b.flap);
        const tipLift = lift + amp * 0.8 * Math.sin(b.flap - 0.9);
        const ex = 0.42 * S * Math.cos(lift);
        const ey = 0.42 * S * Math.sin(lift) * 0.8;
        const tx = ex + 0.55 * S * Math.cos(tipLift);
        const ty = ey + 0.55 * S * Math.sin(tipLift);
        const put = (x: number, y: number, z: number) => {
          positions[o++] = b.p.x + r.x * x + u.x * y + f.x * z;
          positions[o++] = b.p.y + r.y * x + u.y * y + f.y * z;
          positions[o++] = b.p.z + r.z * x + u.z * y + f.z * z;
        };
        for (const side of [-1, 1]) {
          // the inner wing (a quad, the body's side to the elbow), and the tip swept back
          put(0, 0, 0.16 * S);
          put(0, 0, -0.12 * S);
          put(side * ex, ey, -0.08 * S);
          put(0, 0, 0.16 * S);
          put(side * ex, ey, -0.08 * S);
          put(side * ex, ey, 0.08 * S);
          put(side * ex, ey, 0.08 * S);
          put(side * ex, ey, -0.08 * S);
          put(side * tx, ty, -0.22 * S);
        }
        // the body
        put(0, 0, 0.3 * S);
        put(0.05 * S, 0, 0);
        put(0, 0, -0.32 * S);
        put(0, 0, 0.3 * S);
        put(-0.05 * S, 0, 0);
        put(0, 0, -0.32 * S);
        // dark against the haze, fading into it far off
        const k = 1 - Math.exp(-b.p.distanceTo(eye) * 0.0022);
        const [hr, hg, hb] = palette.hazeLow;
        const cr = DARK[0] + (hr * 1.05 - DARK[0]) * k;
        const cg = DARK[1] + (hg * 1.05 - DARK[1]) * k;
        const cbl = DARK[2] + (hb * 1.05 - DARK[2]) * k;
        for (let i = o - POINTS * 3; i < o; i += 3) {
          colors[i] = cr;
          colors[i + 1] = cg;
          colors[i + 2] = cbl;
        }
      }
      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.color.needsUpdate = true;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
