import { Suspense, useEffect, useState, type RefObject } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PerformanceMonitor } from '@react-three/drei';
import type { PerspectiveCamera } from 'three';
import { dirOfLook } from './geometry';
import { Shell } from './Shell';
import { Space, type Destination } from './Space';
import { Effects } from './Effects';
import { CanyonWorld } from './canyon/World';
import { glowLights } from './lights';
import type { CssLayer } from './css3d';
import { SCREENS, type ScreenId } from './screens';
import { baseFov, shownLook, stepView, view } from './view';

// The cockpit's 3D view: the space outside (or, flying a Canyon Run, the
// canyon), the cockpit round it, the lens, and the pages on its screens
// (css3d.ts) drawn after it all with the same camera, each frame.

interface Props {
  css: CssLayer;
  destination?: Destination;
  calm: boolean;
  low: boolean;
  /** a pointer held down: the shudders wait */
  holding: RefObject<boolean>;
  /** the screen under the hand, and the one zoomed into */
  hovered: RefObject<string | null>;
  focused: ScreenId | null;
  /** drawing at all (not while the game's away) */
  running: boolean;
  /** flying a Canyon Run: the canyon outside instead of space (keyed by the run) */
  canyon: number | null;
}

function Rig({ css, holding, hovered, focused }: Pick<Props, 'css' | 'holding' | 'hovered' | 'focused'>) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const size = useThree((s) => s.size);
  useEffect(() => css.setSize(size.width, size.height), [css, size]);

  useFrame((_, raw) => {
    const dt = Math.min(raw, 0.05);
    view.base = baseFov(size.width / Math.max(1, size.height));
    stepView(dt, performance.now(), holding.current ?? false);
    const look = shownLook();
    camera.rotation.set(look.pitch, -look.yaw, look.roll, 'YXZ');
    camera.position.set(view.head.x, view.head.y, view.head.z);
    camera.fov = (view.fov * (1 + view.kick) * 180) / Math.PI;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    // each screen's glow: brightest zoomed into, brighter under the hand, and breathing a little
    const t = performance.now() / 1000;
    const ease = 1 - Math.exp(-dt * 8);
    SCREENS.forEach((s, i) => {
      const goal = s.id === focused ? 1 : s.id === hovered.current ? 0.75 : 0.32 + 0.06 * Math.sin(t * 1.3 + i * 1.9);
      glowLights.screens[s.id] += (goal - glowLights.screens[s.id]) * ease;
    });
    glowLights.flicker *= Math.exp(-dt * 7);
  }, -1);

  // (after the composer has drawn the frame)
  useFrame(() => {
    const look = shownLook();
    const aspect = size.width / Math.max(1, size.height);
    const diag = 2 * Math.atan(Math.tan(view.fov / 2) * Math.hypot(1, aspect));
    css.render(camera, dirOfLook(look), diag);
  }, 2);
  return null;
}

export function Scene({ css, destination, calm, low, holding, hovered, focused, running, canyon }: Props) {
  // the sharpest it draws, and (should the device struggle) how far towards plain 1 it's come down
  const top = Math.min(low ? 1.25 : 1.5, window.devicePixelRatio || 1);
  const [dpr, setDpr] = useState(top);
  return (
    <Canvas
      className="ck3-canvas"
      flat
      dpr={dpr}
      frameloop={running ? 'always' : 'never'}
      // (its size from its layout, not from what's on screen: it opens scaled up, flying in through the window)
      resize={{ offsetSize: true }}
      gl={{ antialias: false, alpha: false, powerPreference: 'high-performance' }}
      camera={{ fov: 70, near: 0.1, far: 2000, position: [0, 0, 0] }}
    >
      {/* (a device that can't keep up draws a little less sharp) */}
      <PerformanceMonitor onChange={({ factor }) => setDpr(Math.round((1 + (top - 1) * factor) * 20) / 20)} />
      <Rig css={css} holding={holding} hovered={hovered} focused={focused} />
      {canyon === null ? <Space destination={destination} calm={calm} /> : <CanyonWorld key={canyon} />}
      <Suspense fallback={null}>
        <Shell />
      </Suspense>
      <Effects low={low} />
    </Canvas>
  );
}
