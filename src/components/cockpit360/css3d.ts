import * as THREE from 'three';
import { CSS3DObject, CSS3DRenderer } from 'three/examples/jsm/renderers/CSS3DRenderer.js';
import { angleBetween, type Quad, type Vec3 } from './geometry';
import { HOTSPOT_QUADS, HOTSPOTS, pageSize, QUADS, SCREENS, WINDSCREEN_PX, WINDSCREEN_QUAD, type HotspotId, type ScreenId } from './screens';

// The game's own pages on the cockpit's screens: each is a page laid out
// flat (a div of the screen's size, ScreenFace.tsx renders into it) and
// placed on its screen's glass with CSS 3D, drawn each frame with the same
// camera as the cockpit (three's CSS3DRenderer), so it turns with it, shudders
// with it and zooms with it, right on the picture's black screen. The
// windscreen's HUD is one too, and so are the parts that do something when
// touched (the joystick, the panel overhead, the remote), as invisible pads.
// What's behind the camera isn't drawn.

export type FaceId = ScreenId | 'windscreen' | HotspotId;

export interface Face {
  id: FaceId;
  element: HTMLDivElement;
  object: CSS3DObject;
  quad: Quad;
  /** the angle (radians) from its middle to its farthest corner */
  reach: number;
}

/** a page of `px` (w, h) laid on a quad: its top left at the quad's, its right along its top edge, its bottom down its left */
function placement(quad: Quad, [w, h]: [number, number]): THREE.Matrix4 {
  const x = new THREE.Vector3(...quad.across).divideScalar(w);
  // (three's y is up; CSS3DRenderer flips it back to CSS's down)
  const y = new THREE.Vector3(...quad.down).divideScalar(-h);
  const z = new THREE.Vector3(...quad.normal).multiplyScalar(x.length());
  return new THREE.Matrix4().makeBasis(x, y, z).setPosition(...quad.center);
}

export class CssLayer {
  renderer = new CSS3DRenderer();
  scene = new THREE.Scene();
  faces = {} as Record<FaceId, Face>;

  constructor() {
    const add = (id: FaceId, quad: Quad, px: [number, number], className: string) => {
      const element = document.createElement('div');
      element.className = className;
      element.style.width = `${px[0]}px`;
      element.style.height = `${px[1]}px`;
      element.dataset.face = id;
      const object = new CSS3DObject(element);
      object.matrixAutoUpdate = false;
      object.matrix.copy(placement(quad, px));
      object.matrixWorldNeedsUpdate = true;
      this.scene.add(object);
      const reach = Math.max(...quad.corners.map((c) => angleBetween(c, quad.center)));
      this.faces[id] = { id, element, object, quad, reach };
    };
    // the HUD first: under the screens and the pads, if ever they overlap
    add('windscreen', WINDSCREEN_QUAD, WINDSCREEN_PX, 'ck3-face ck3-windscreen');
    for (const s of SCREENS) add(s.id, QUADS[s.id], pageSize(QUADS[s.id], s.width), `ck3-face ck3-screen is-${s.id}`);
    for (const h of HOTSPOTS) add(h.id, HOTSPOT_QUADS[h.id], pageSize(HOTSPOT_QUADS[h.id], 200), `ck3-face ck3-hotspot is-${h.id}`);
    const el = this.renderer.domElement;
    el.className = 'ck3-css';
    el.style.pointerEvents = 'none';
  }

  mount(host: HTMLElement | null) {
    if (host && this.renderer.domElement.parentNode !== host) host.appendChild(this.renderer.domElement);
  }

  setSize(w: number, h: number) {
    this.renderer.setSize(w, h);
  }

  /** draw it for this frame's camera (looking along `forward`, with field of view `fov` radians, diagonally `diag`) */
  render(camera: THREE.Camera, forward: Vec3, diag: number) {
    for (const face of Object.values(this.faces)) {
      // (only what's in front: anything behind the camera would be drawn inside out)
      face.object.visible = angleBetween(face.quad.center, forward) < diag / 2 + face.reach + 0.05;
    }
    this.renderer.render(this.scene, camera);
  }

  dispose() {
    this.renderer.domElement.remove();
  }
}
