// A colour-cycling scene's data (CycleScene.tsx): its palette, a palette
// index for each pixel, and the ranges of the palette that turn.

export interface Range {
  start: number;
  length: number;
  /** palette steps a second */
  rate: number;
  blend: boolean;
  /** what it is (the lake's ripples, the sparkles…), e.g. "ripples0" */
  name?: string;
}

export interface Scene {
  width: number;
  height: number;
  /** 256 × RGB: colours, or with a picture of its own, gains (× 64) */
  palette: Uint8Array;
  /** width × height palette indices, row by row from the top */
  index: Uint8Array;
  ranges: Range[];
  /** the picture in its own colours, if it keeps them */
  base?: HTMLImageElement;
}

/** the most cycling ranges a scene has (the shader's array) */
export const MAX_RANGES = 24;

const bytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

const loading = new Map<string, Promise<Scene>>();
/** a scene (its JSON, and its picture if it has one), fetched once */
export function loadScene(src: string): Promise<Scene> {
  let scene = loading.get(src);
  if (!scene) {
    scene = fetch(src)
      .then((r) => {
        if (!r.ok) throw new Error(`${src}: ${r.status}`);
        return r.json() as Promise<{ width: number; height: number; palette: string; index: string; ranges: Range[]; base?: string }>;
      })
      .then(async (d) => {
        let base: HTMLImageElement | undefined;
        if (d.base) {
          base = new Image();
          base.src = new URL(d.base, new URL(src, document.baseURI)).href;
          await base.decode();
        }
        return { ...d, palette: bytes(d.palette), index: bytes(d.index), ranges: d.ranges.slice(0, MAX_RANGES), base };
      });
    scene.catch(() => loading.delete(src));
    loading.set(src, scene);
  }
  return scene;
}
