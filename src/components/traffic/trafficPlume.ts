import * as THREE from 'three';
import { plumeMaterial, stepPlume } from '../scene/plume';

// Space Traffic's ship flies with the same engine plume as the rocket in the
// main game (scene/plume.ts). The round draws on a 2D canvas, so the plume
// renders every frame on a little transparent WebGL canvas of its own, which
// the scene then lays out of each nozzle, adding its light as the main scene
// does.

export class TrafficPlume {
  readonly canvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0, 1);
  private readonly material = plumeMaterial(true);
  private last = -1;

  /** null without WebGL: the ship keeps plain ion trails then; `gold`: a Space Admiral's */
  static create(gold = false): TrafficPlume | null {
    try {
      return new TrafficPlume(gold);
    } catch {
      return null;
    }
  }

  private readonly gold: boolean;

  private constructor(gold: boolean) {
    this.gold = gold;
    this.canvas = document.createElement('canvas');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: false, preserveDrawingBuffer: true, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(128, 384, false);
    this.renderer.setClearColor(0x000000, 0);
    // the light and its alpha land as the shader writes them, on a clear canvas
    this.material.blending = THREE.NoBlending;
    this.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.material));
  }

  /** this frame's plume at speed `s` (as in the main scene: 0 idle .. 1.3 flat out), sputtering (0..1) after a wrong drill */
  frame(now: number, s: number, sputter: number): HTMLCanvasElement {
    const dt = this.last < 0 ? 0 : Math.min(0.1, Math.max(0, now - this.last));
    this.last = now;
    stepPlume(this.material, dt, s, sputter, this.gold);
    this.renderer.render(this.scene, this.camera);
    return this.canvas;
  }

  dispose() {
    this.material.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
