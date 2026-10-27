import { Canyon, type CanyonSpec } from './field';
import { buildChunk, CHUNK, type ChunkData, type Quality } from './chunk';
import type { ToWorker } from './terrain.worker';

// Asks for the canyon's chunks as the flight needs them, nearest first, and
// hands each one over when it's built: by the terrain's worker, or (where
// there are no workers) here, one a frame.

export class Builder {
  readonly canyon: Canyon;
  readonly quality: Quality;
  private readonly spec: CanyonSpec;
  private worker: Worker | null = null;
  private readonly ready = new Map<number, ChunkData>();
  private readonly asked = new Set<number>();
  private readonly queue: number[] = [];
  private busy = 0;
  private timer = 0;
  private disposed = false;

  constructor(spec: CanyonSpec, quality: Quality) {
    this.spec = spec;
    this.canyon = new Canyon(spec);
    this.quality = quality;
    try {
      this.worker = new Worker(new URL('./terrain.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e: MessageEvent<ChunkData & { seed: number }>) => {
        if (e.data.seed !== spec.seed) return;
        this.busy--;
        this.ready.set(e.data.index, e.data);
        this.pump();
      };
      this.worker.onerror = () => this.fallBack();
      this.send({ type: 'canyon', spec });
    } catch {
      this.worker = null;
    }
  }

  private send(m: ToWorker) {
    this.worker?.postMessage(m);
  }

  /** the worker failed: build what's left here */
  private fallBack() {
    this.worker?.terminate();
    this.worker = null;
    this.busy = 0;
    for (const i of this.asked) if (!this.ready.has(i) && !this.queue.includes(i)) this.queue.push(i);
    this.pump();
  }

  /** the chunks from `from` to `to` (inclusive) are wanted: ask for the ones not asked for yet, nearest first */
  want(from: number, to: number) {
    if (this.disposed) return;
    const last = Math.floor(this.spec.end / CHUNK) + 4;
    for (let i = Math.max(0, from); i <= Math.min(to, last); i++) {
      if (this.asked.has(i)) continue;
      this.asked.add(i);
      this.queue.push(i);
    }
    this.pump();
  }

  private pump() {
    // (two at a time in the worker: one building, the next waiting)
    while (this.worker && this.busy < 2 && this.queue.length) {
      this.busy++;
      this.send({ type: 'chunk', seed: this.spec.seed, index: this.queue.shift()!, quality: this.quality });
    }
    if (!this.worker && !this.disposed && this.queue.length && !this.timer) {
      this.timer = window.setTimeout(() => {
        this.timer = 0;
        const i = this.queue.shift();
        if (i !== undefined) this.ready.set(i, buildChunk(this.canyon, i, this.quality));
        this.pump();
      }, 0);
    }
  }

  /** a chunk built since last asked, taken (once) */
  take(index: number): ChunkData | null {
    const c = this.ready.get(index);
    if (c) this.ready.delete(index);
    return c ?? null;
  }

  /** forget a chunk gone by (so it isn't asked for again either) */
  drop(index: number) {
    this.ready.delete(index);
  }

  dispose() {
    this.disposed = true;
    window.clearTimeout(this.timer);
    this.worker?.terminate();
    this.worker = null;
    this.queue.length = 0;
  }
}
