import { Canyon, type CanyonSpec } from './field';
import { buildChunk, type Quality } from './chunk';

// The canyon's chunks, built off the main thread (builder.ts asks), so the
// flight never stutters while the next stretch is made.

export type ToWorker = { type: 'canyon'; spec: CanyonSpec } | { type: 'chunk'; seed: number; index: number; quality: Quality };

let canyon: Canyon | null = null;

self.onmessage = (e: MessageEvent<ToWorker>) => {
  const m = e.data;
  if (m.type === 'canyon') {
    canyon = new Canyon(m.spec);
    return;
  }
  if (!canyon || canyon.seed !== m.seed) return;
  const chunk = buildChunk(canyon, m.index, m.quality);
  (self as unknown as Worker).postMessage({ seed: m.seed, ...chunk }, [chunk.positions.buffer, chunk.normals.buffer, chunk.shade.buffer, chunk.ground.buffer, chunk.indices.buffer]);
};
