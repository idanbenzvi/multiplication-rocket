import { useAudio } from './useAudio';

// Sound effects synthesized with Web Audio — no sample files to ship or
// license. The correct-answer chime climbs a major pentatonic scale as the
// streak grows, so a long streak literally sounds like it's going up.

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null; // no Web Audio — stay silent
  }
}

// iOS keeps a Web Audio context silent until it's resumed inside a user
// gesture (and won't count a sound triggered later from a timer), so resume
// it — and play one silent sample — on the first touch or key.
function unlock() {
  const c = audio();
  if (c) {
    const src = c.createBufferSource();
    src.buffer = c.createBuffer(1, 1, c.sampleRate);
    src.connect(c.destination);
    src.start();
  }
  for (const type of UNLOCK_EVENTS) window.removeEventListener(type, unlock);
}
const UNLOCK_EVENTS = ['touchend', 'click', 'keydown'] as const;
for (const type of UNLOCK_EVENTS) window.addEventListener(type, unlock);

/** game paused: silence anything still ringing out */
export function suspendSfx() {
  void ctx?.suspend().catch(() => {});
}

export function resumeSfx() {
  void ctx?.resume().catch(() => {});
}

function volume(): number {
  return useAudio.getState().effectsVolume;
}

// Major pentatonic, in semitones above C5 — every combination sounds happy.
const PENTATONIC = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28];
const C5 = 523.25;

function noteFreq(step: number): number {
  const octave = Math.floor(step / PENTATONIC.length);
  const semis = PENTATONIC[step % PENTATONIC.length] + octave * 24;
  return C5 * Math.pow(2, semis / 12);
}

interface ToneOptions {
  type?: OscillatorType;
  gain?: number;
  attack?: number;
  /** frequency to glide to over the note's duration */
  glideTo?: number;
}

// A bell-ish note: fast attack, exponential decay, plus a quiet octave
// partial so it rings instead of beeping.
function tone(c: AudioContext, freq: number, start: number, dur: number, opts: ToneOptions = {}) {
  const { type = 'sine', gain = 0.25, attack = 0.006, glideTo } = opts;
  const out = c.createGain();
  const peak = gain * volume();
  out.gain.setValueAtTime(0.0001, start);
  out.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), start + attack);
  out.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  out.connect(c.destination);

  for (const [mult, level] of [
    [1, 1],
    [2, 0.25],
  ] as const) {
    const osc = c.createOscillator();
    const g = c.createGain();
    g.gain.value = level;
    osc.type = type;
    osc.frequency.setValueAtTime(freq * mult, start);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo * mult, start + dur);
    osc.connect(g).connect(out);
    osc.start(start);
    osc.stop(start + dur + 0.05);
  }
}

function noiseBurst(c: AudioContext, start: number, dur: number, fromHz: number, toHz: number, gain: number) {
  const buffer = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buffer;
  const filter = c.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = 1.2;
  filter.frequency.setValueAtTime(fromHz, start);
  filter.frequency.exponentialRampToValueAtTime(toHz, start + dur);
  const out = c.createGain();
  out.gain.setValueAtTime(0.0001, start);
  out.gain.exponentialRampToValueAtTime(Math.max(gain * volume(), 0.0002), start + dur * 0.3);
  out.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  src.connect(filter).connect(out).connect(c.destination);
  src.start(start);
}

export const sfx = {
  /**
   * Correct answer. `streak` is the streak *including* this answer; `fast`
   * adds a sparkle on top for answers in the BIG BOOST zone.
   */
  correct(streak: number, fast: boolean) {
    const c = audio();
    if (!c || volume() === 0) return;
    const t = c.currentTime + 0.01;
    const root = Math.min(streak - 1, 10);
    // Two-note "ding-ding" a pentatonic step apart, starting higher each time.
    tone(c, noteFreq(root), t, 0.35, { gain: 0.22 });
    tone(c, noteFreq(root + 2), t + 0.08, 0.5, { gain: 0.24 });
    // Longer streaks add a third note, so the reward literally grows.
    if (streak >= 3) tone(c, noteFreq(root + 4), t + 0.16, 0.6, { gain: 0.2 });
    if (fast) {
      for (let i = 0; i < 4; i++) {
        tone(c, noteFreq(root + 6 + i), t + 0.2 + i * 0.045, 0.25, { gain: 0.07, type: 'triangle' });
      }
    }
  },

  /** Streak milestone (5, 10, 15, ...): a little fanfare that grows with the milestone. */
  milestone(streak: number) {
    const c = audio();
    if (!c || volume() === 0) return;
    const t = c.currentTime + 0.05;
    const lift = Math.min(Math.floor(streak / 5) - 1, 4);
    const notes = [0, 2, 3, 5, 7].map((n) => n + lift);
    notes.forEach((n, i) => tone(c, noteFreq(n), t + i * 0.09, 0.5, { gain: 0.2, type: 'triangle' }));
    tone(c, noteFreq(notes[notes.length - 1] + 3), t + notes.length * 0.09, 1.1, { gain: 0.26 });
    noiseBurst(c, t + 0.3, 0.9, 3000, 9000, 0.05); // shimmer
  },

  /** Wrong answer: soft and short — a gentle "oops", never a buzzer. */
  wrong() {
    const c = audio();
    if (!c || volume() === 0) return;
    const t = c.currentTime + 0.01;
    tone(c, 330, t, 0.22, { type: 'triangle', gain: 0.14, glideTo: 280 });
    tone(c, 262, t + 0.16, 0.32, { type: 'triangle', gain: 0.12, glideTo: 220 });
  },

  /** Wormhole round: a correct drill picked. Rises with each find (1..3). */
  pick(found: number) {
    const c = audio();
    if (!c || volume() === 0) return;
    const t = c.currentTime + 0.01;
    tone(c, noteFreq(3 + found * 2), t, 0.25, { gain: 0.2, glideTo: noteFreq(4 + found * 2) });
    tone(c, noteFreq(6 + found * 2), t + 0.05, 0.3, { gain: 0.12, type: 'triangle' });
  },

  /** Flying through the wormhole: a swirling rising sweep with a sparkle tail. */
  wormhole() {
    const c = audio();
    if (!c || volume() === 0) return;
    const t = c.currentTime + 0.02;
    noiseBurst(c, t, 2.4, 150, 6000, 0.16);
    tone(c, 90, t, 2.2, { type: 'sawtooth', gain: 0.045, glideTo: 1400, attack: 0.3 });
    tone(c, 135, t + 0.1, 2.1, { type: 'triangle', gain: 0.06, glideTo: 2100, attack: 0.3 });
    for (let i = 0; i < 8; i++) tone(c, noteFreq(6 + i), t + 1.6 + i * 0.05, 0.4, { gain: 0.08 });
  },

  /** Meteor Shower: the right meteor blasted — boom plus a ding that climbs with the run. */
  boom(run: number) {
    const c = audio();
    if (!c || volume() === 0) return;
    const t = c.currentTime + 0.01;
    noiseBurst(c, t, 0.5, 1600, 120, 0.28);
    tone(c, 95, t, 0.35, { type: 'triangle', gain: 0.22, glideTo: 45 });
    tone(c, noteFreq(Math.min(run + 2, 12)), t + 0.1, 0.45, { gain: 0.18 });
  },

  /** Constellation completed: a sparkling rising chord. */
  constellation() {
    const c = audio();
    if (!c || volume() === 0) return;
    const t = c.currentTime + 0.01;
    [0, 2, 4, 7, 9].forEach((n, i) => tone(c, noteFreq(n + 3), t + i * 0.06, 0.7, { gain: 0.15 }));
    noiseBurst(c, t + 0.2, 0.7, 4000, 10000, 0.04);
  },

  /** Reaching the destination: rising engine whoosh plus a bright chord. */
  launch() {
    const c = audio();
    if (!c || volume() === 0) return;
    const t = c.currentTime + 0.02;
    noiseBurst(c, t, 1.6, 200, 4000, 0.18);
    tone(c, 110, t, 1.4, { type: 'sawtooth', gain: 0.05, glideTo: 880, attack: 0.2 });
    [0, 2, 3, 5].forEach((n, i) => tone(c, noteFreq(n + 3), t + 0.9 + i * 0.03, 1.2, { gain: 0.14 }));
  },

  /** Monster Sun: a teammate's beam hits the monster. Each pilot's beam has its own pitch. */
  zap(slot: number) {
    const c = audio();
    if (!c || volume() === 0) return;
    const t = c.currentTime + 0.01;
    tone(c, noteFreq(7 + (slot % 6)), t, 0.18, { type: 'square', gain: 0.05, glideTo: noteFreq(2 + (slot % 6)) });
    noiseBurst(c, t + 0.12, 0.25, 2400, 400, 0.1);
  },

  /** Monster Sun: a wrong answer feeds the monster, and it chuckles. */
  monsterLaugh() {
    const c = audio();
    if (!c || volume() === 0) return;
    const t = c.currentTime + 0.02;
    for (let i = 0; i < 3; i++) tone(c, 180 - i * 22, t + i * 0.13, 0.12, { type: 'sawtooth', gain: 0.05, glideTo: 140 - i * 20 });
  },

  /** Monster Sun: the monster is cured. Its letters whoosh out and swirl back as a friend. */
  monsterCured() {
    const c = audio();
    if (!c || volume() === 0) return;
    const t = c.currentTime + 0.01;
    noiseBurst(c, t, 1.4, 400, 7000, 0.12);
    tone(c, 196, t, 1.2, { type: 'triangle', gain: 0.08, glideTo: 784, attack: 0.25 });
    [0, 2, 4, 5, 7, 9, 10, 12].forEach((n, i) => tone(c, noteFreq(n), t + 0.6 + i * 0.1, 0.7, { gain: 0.12 }));
  },

  /** Monster Sun: a new, tougher monster assembles out of the dark. */
  monsterRise() {
    const c = audio();
    if (!c || volume() === 0) return;
    const t = c.currentTime + 0.02;
    tone(c, 55, t, 1.6, { type: 'sawtooth', gain: 0.05, glideTo: 110, attack: 0.4 });
    noiseBurst(c, t, 1.4, 120, 900, 0.08);
  },
};
