import { Suspense, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import { Stars } from '@react-three/drei';
import * as THREE from 'three';
import { useT } from '../../i18n/useLang';
import { PANORAMA_URL } from '../cockpit360/panorama';
import { Slider, Toggle } from './parts';

// The "how does it work?" page about the cockpit: its 360° picture as it's
// kept, flat (a full turn across, from straight down to straight up), curled
// by a slider into a ball round the camera, which is how the cockpit draws
// it. Wrapped, a drag looks round, and a little map of the flat picture shows
// the part that's seen; a grid of 30° boxes, all the same size flat, shows
// them squeezed towards the top and bottom on the ball.

/** the ball's radius; flat, the picture is a full turn of it across and half a turn up */
const R = 10;
const FOV_FLAT = 60;
const FOV_IN = 75;
/** how far up or down a drag can look (never as far as straight up or down) */
const MAX_PITCH = 0.7;

const VERTEX = /* glsl */ `
  uniform float uK;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    // the sheet curled into a piece of a ball, uK of the way: by 1 a full turn
    // across and half a turn up, round the middle of a ball of radius R;
    // less, a bigger ball's piece, the middle of the picture staying put, R ahead
    float k = max(uK, 0.001);
    float yaw = (uv.x - 0.5) * 6.2831853 * k;
    float pitch = (uv.y - 0.5) * 3.1415927 * k;
    float r = ${R.toFixed(1)} / k;
    vec3 p = vec3(sin(yaw) * cos(pitch), sin(pitch), -cos(yaw) * cos(pitch)) * r;
    p.z += r - ${R.toFixed(1)};
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  uniform sampler2D map;
  uniform float uGrid;
  varying vec2 vUv;
  void main() {
    vec4 c = texture2D(map, vUv);
    // (the windows: space shows through)
    if (c.a < 0.5) discard;
    // the grid, a line every 30°: 12 boxes across, 6 up
    vec2 g = vUv * vec2(12.0, 6.0);
    vec2 d = abs(fract(g - 0.5) - 0.5) / (fwidth(g) * 1.4);
    float line = 1.0 - min(min(d.x, d.y), 1.0);
    gl_FragColor = vec4(mix(c.rgb, vec3(0.36, 0.95, 1.0), line * uGrid * 0.9), 1.0);
    #include <colorspace_fragment>
  }
`;

/** the grid on the little map, as on the picture */
const MAP_GRID = [
  ...Array.from({ length: 11 }, (_, i) => `M${((i + 1) * 200) / 12} 0V100`),
  ...Array.from({ length: 5 }, (_, i) => `M0 ${((i + 1) * 100) / 6}H200`),
].join('');

/** where the camera's looking, and whether it's being dragged round */
interface Look {
  yaw: number;
  pitch: number;
  dragging: boolean;
  /** seconds since it was last dragged */
  idle: number;
}

/** what it takes for a sample of the screen's edge to be turned into a direction */
const ndc = new THREE.Vector3();
const EDGE = [
  ...Array.from({ length: 12 }, (_, i) => [-1 + i / 6, -1]),
  ...Array.from({ length: 12 }, (_, i) => [1, -1 + i / 6]),
  ...Array.from({ length: 12 }, (_, i) => [1 - i / 6, 1]),
  ...Array.from({ length: 12 }, (_, i) => [-1, 1 - i / 6]),
];

/** the screen's edge on the flat picture (the map's 200 × 100): each sample's direction is a spot on it, how far round across and how high up */
function outlineOf(camera: THREE.PerspectiveCamera) {
  const points: [number, number][] = [];
  let shift = 0;
  for (const [x, y] of EDGE) {
    const dir = ndc.set(x, y, 0.5).unproject(camera).sub(camera.position).normalize();
    let u = (Math.atan2(dir.x, -dir.z) / (2 * Math.PI) + 0.5) * 200;
    const v = (0.5 - Math.asin(dir.y) / Math.PI) * 100;
    // (kept going round, not jumping back across the picture where its ends meet)
    const prev = points[points.length - 1];
    if (prev) {
      while (u + shift - prev[0] > 100) shift -= 200;
      while (u + shift - prev[0] < -100) shift += 200;
    }
    u += shift;
    points.push([u, v]);
  }
  // drawn three times, a picture's width apart, for whatever of it goes off one end to come in at the other
  return [-200, 0, 200].map((o) => `M${points.map(([u, v]) => `${(u + o).toFixed(1)} ${v.toFixed(1)}`).join('L')}Z`).join('');
}

function Sheet({
  wrap,
  grid,
  look,
  outline,
  onInside,
}: {
  wrap: number;
  grid: boolean;
  look: RefObject<Look>;
  outline: RefObject<SVGPathElement | null>;
  onInside: (inside: boolean) => void;
}) {
  const loaded = useLoader(THREE.TextureLoader, PANORAMA_URL);
  const material = useMemo(() => {
    // (a copy of the cockpit's: flat, this one's seen shrunk, so it's mipmapped)
    const map = loaded.clone();
    map.colorSpace = THREE.SRGBColorSpace;
    map.generateMipmaps = true;
    map.minFilter = THREE.LinearMipmapLinearFilter;
    map.magFilter = THREE.LinearFilter;
    map.wrapS = THREE.RepeatWrapping;
    map.wrapT = THREE.ClampToEdgeWrapping;
    map.anisotropy = 8;
    map.needsUpdate = true;
    return new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      side: THREE.DoubleSide,
      uniforms: { map: { value: map }, uK: { value: 0 }, uGrid: { value: 0 } },
    });
  }, [loaded]);
  useEffect(
    () => () => {
      material.uniforms.map.value.dispose();
      material.dispose();
    },
    [material],
  );

  const k = useRef(0);
  const inside = useRef(false);
  const [calm] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);

  useFrame((state, raw) => {
    const dt = Math.min(raw, 0.1);
    const ease = Math.min(1, dt * 3);
    k.current += (wrap - k.current) * ease;
    if (Math.abs(wrap - k.current) < 0.0005) k.current = wrap;
    material.uniforms.uK.value = k.current;
    material.uniforms.uGrid.value += ((grid ? 1 : 0) - material.uniforms.uGrid.value) * Math.min(1, dt * 6);

    // flat, the camera far enough back to see all of it; wrapped, in the middle of the ball, seeing wider
    const camera = state.camera as THREE.PerspectiveCamera;
    const aspect = state.size.width / state.size.height;
    const back = (Math.max((Math.PI * R) / 2, (Math.PI * R) / aspect) * 1.12) / Math.tan(THREE.MathUtils.degToRad(FOV_FLAT / 2));
    const s = THREE.MathUtils.smoothstep(k.current, 0.35, 1);
    camera.position.set(0, 0, THREE.MathUtils.lerp(back, R, s) - R);
    camera.fov = THREE.MathUtils.lerp(FOV_FLAT, FOV_IN, s);
    camera.updateProjectionMatrix();

    // looking round once it's wrapped (turning slowly by itself when left), and back to straight ahead as it unwraps
    const l = look.current;
    if (!l.dragging) l.idle += dt;
    if (wrap < 1) {
      l.yaw = Math.atan2(Math.sin(l.yaw), Math.cos(l.yaw));
      l.yaw -= l.yaw * ease;
      l.pitch -= l.pitch * ease;
    } else if (!calm && !l.dragging && l.idle > 2.5) {
      l.yaw += dt * 0.12;
    }
    camera.rotation.set(l.pitch, -l.yaw, 0, 'YXZ');
    camera.updateMatrixWorld();

    const now = k.current > 0.97;
    if (now !== inside.current) {
      inside.current = now;
      onInside(now);
    }
    if (now) outline.current?.setAttribute('d', outlineOf(camera));
  });

  return (
    <mesh material={material} frustumCulled={false}>
      <planeGeometry args={[1, 1, 128, 64]} />
    </mesh>
  );
}

export function CockpitDemo() {
  const t = useT().how.cockpit;
  const [wrap, setWrap] = useState(0);
  const [grid, setGrid] = useState(false);
  const [inside, setInside] = useState(false);
  const [dragged, setDragged] = useState(false);
  const look = useRef<Look>({ yaw: 0, pitch: 0, dragging: false, idle: 0 });
  const outline = useRef<SVGPathElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const wrapped = wrap === 100;

  // a drag pulls the picture round, once it's wrapped
  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!wrapped) return;
    drag.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
    look.current.dragging = true;
    setDragged(true);
  };
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const l = look.current;
    const perPixel = THREE.MathUtils.degToRad(FOV_IN) / e.currentTarget.clientHeight;
    l.yaw -= (e.clientX - d.x) * perPixel;
    l.pitch = THREE.MathUtils.clamp(l.pitch + (e.clientY - d.y) * perPixel, -MAX_PITCH, MAX_PITCH);
    d.x = e.clientX;
    d.y = e.clientY;
  };
  const onUp = () => {
    drag.current = null;
    look.current.dragging = false;
    look.current.idle = 0;
  };

  return (
    <>
      <div
        className={`how-stage how-pano ${wrapped ? 'is-wrapped' : ''}`}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <Canvas flat dpr={[1, 1.5]} camera={{ position: [0, 0, 30], fov: FOV_FLAT, near: 0.1, far: 300 }}>
          <color attach="background" args={['#0b0820']} />
          <Stars radius={60} depth={40} count={2000} factor={4} fade speed={0.4} />
          <Suspense fallback={null}>
            <Sheet wrap={wrap / 100} grid={grid} look={look} outline={outline} onInside={setInside} />
          </Suspense>
        </Canvas>
        {inside && (
          <figure className="how-pano-map">
            <svg viewBox="0 0 200 100" preserveAspectRatio="none" aria-hidden="true">
              <image href={PANORAMA_URL} width="200" height="100" preserveAspectRatio="none" />
              {grid && <path className="how-pano-grid" d={MAP_GRID} />}
              <path ref={outline} className="how-pano-view" />
            </svg>
            <figcaption>{t.map}</figcaption>
          </figure>
        )}
        {wrapped && !dragged && <p className="how-readout how-pano-hint">{t.drag}</p>}
      </div>
      <div className="how-controls">
        <Slider label={t.wrap} min={0} max={100} value={wrap} onChange={setWrap} />
        <Toggle label={t.grid} on={grid} onChange={setGrid} />
      </div>
    </>
  );
}
