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

/** the effects' audio context (for the "how does it work?" page to listen in on them), null without Web Audio */
export const sfxContext = audio;

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

// ---------- the engine's hum, heard through the rocket's window ----------
// A steady sound (where everything else here is a one-off), like a plane's
// cabin or a car's at speed, heard from inside: mostly air, a deep rumble of
// brown noise and a whoosh of wind whose pitch wanders and gusts, over the
// engine's low drone and a faint turbine whine. engineHum() eases it to a
// level; the closer it gets (the louder), the more the rumble opens up, the
// higher the wind and the engine.

interface Hum {
  out: GainNode;
  /** what rises with the level: [param, at level 0, at level 1] */
  rise: Array<[AudioParam, number, number]>;
  sources: AudioScheduledSourceNode[];
}
let hum: Hum | null = null;
const noiseLoops = new WeakMap<BaseAudioContext, { white: AudioBuffer; brown: AudioBuffer }>();

/** four seconds of white noise and of brown (its running sum: deep, like rumbling air), to loop */
function noise(c: BaseAudioContext) {
  let loops = noiseLoops.get(c);
  if (!loops) {
    const n = c.sampleRate * 4;
    const white = c.createBuffer(1, n, c.sampleRate);
    const brown = c.createBuffer(1, n, c.sampleRate);
    const w = white.getChannelData(0);
    const b = brown.getChannelData(0);
    let last = 0;
    let peak = 0;
    for (let i = 0; i < n; i++) {
      w[i] = Math.random() * 2 - 1;
      last = (last + 0.02 * w[i]) / 1.02;
      b[i] = last;
      peak = Math.max(peak, Math.abs(last));
    }
    for (let i = 0; i < n; i++) b[i] /= peak;
    loops = { white, brown };
    noiseLoops.set(c, loops);
  }
  return loops;
}

/** the hum's sound, into `dest`, silent until a level is set (engineHum) */
export function humGraph(c: BaseAudioContext, dest: AudioNode): Hum {
  const out = c.createGain();
  out.gain.value = 0.0001;
  out.connect(dest);
  const sources: AudioScheduledSourceNode[] = [];
  const rise: Hum['rise'] = [];
  const loop = (buffer: AudioBuffer) => {
    const src = c.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    sources.push(src);
    return src;
  };
  const lfo = (hz: number, depth: number, param: AudioParam) => {
    const osc = c.createOscillator();
    osc.frequency.value = hz;
    const g = c.createGain();
    g.gain.value = depth;
    osc.connect(g).connect(param);
    sources.push(osc);
  };
  const { white, brown } = noise(c);

  // the rumble: brown noise, its lowpass opening as it comes closer
  const rumbleLp = c.createBiquadFilter();
  rumbleLp.type = 'lowpass';
  rumbleLp.Q.value = 0.5;
  const rumble = c.createGain();
  rumble.gain.value = 1;
  loop(brown).connect(rumbleLp).connect(rumble).connect(out);
  rise.push([rumbleLp.frequency, 170, 620]);

  // the wind: noise through a soft band, its pitch wandering, its loudness gusting
  const windBp = c.createBiquadFilter();
  windBp.type = 'bandpass';
  windBp.Q.value = 0.9;
  const wind = c.createGain();
  wind.gain.value = 0.32;
  loop(white).connect(windBp).connect(wind).connect(out);
  rise.push([windBp.frequency, 480, 1350]);
  lfo(0.17, 110, windBp.frequency);
  lfo(0.11, 0.1, wind.gain);

  // the engine: two deep tones a hair apart (a slow beat), and its octave, softly
  const engineLp = c.createBiquadFilter();
  engineLp.type = 'lowpass';
  engineLp.frequency.value = 260;
  const engine = c.createGain();
  engine.gain.value = 0.22;
  engineLp.connect(engine).connect(out);
  for (const [freq, type, level] of [
    [64, 'sine', 1],
    [64.7, 'sine', 0.8],
    [128, 'triangle', 0.25],
  ] as Array<[number, OscillatorType, number]>) {
    const osc = c.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = c.createGain();
    g.gain.value = level;
    osc.connect(g).connect(engineLp);
    sources.push(osc);
    rise.push([osc.detune, 0, 500]);
  }

  // the turbine: a faint high whine, far off
  const whine = c.createOscillator();
  whine.frequency.value = 1400;
  const whineG = c.createGain();
  whineG.gain.value = 0.012;
  whine.connect(whineG).connect(out);
  sources.push(whine);
  rise.push([whine.detune, 0, 700]);

  // (the loops each start somewhere else in their four seconds, so the layers never line up)
  const t = c.currentTime;
  for (const src of sources) {
    if (src instanceof AudioBufferSourceNode) src.start(t, Math.random() * 3);
    else src.start(t);
  }
  return { out, rise, sources };
}

/** how loud the hum is at a level, before the effects volume (it's mostly noise: its loudness is in its spread) */
export const humGain = (level: number) => 0.24 * level ** 1.3;

/**
 * The engine's hum at `level` (0 off … 1 its loudest), easing there over
 * `seconds`; at 0 it fades out and stops.
 */
export function engineHum(level: number, seconds = 0.35) {
  const c = audio();
  if (!c) return;
  const t = c.currentTime;
  const ramp = (p: AudioParam, v: number) => {
    p.cancelScheduledValues(t);
    p.setValueAtTime(p.value, t);
    p.linearRampToValueAtTime(v, t + seconds);
  };
  if (level <= 0) {
    if (!hum) return;
    ramp(hum.out.gain, 0.0001);
    for (const src of hum.sources) src.stop(t + seconds + 0.05);
    hum = null;
    return;
  }
  if (volume() === 0) return;
  hum ??= humGraph(c, c.destination);
  ramp(hum.out.gain, humGain(level) * volume());
  for (const [param, from, to] of hum.rise) ramp(param, from + (to - from) * level);
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
  /** where it's heard (the speakers, unless something's listening in) */
  dest?: AudioNode;
}

// A bell-ish note: fast attack, exponential decay, plus a quiet octave
// partial so it rings instead of beeping.
function tone(c: AudioContext, freq: number, start: number, dur: number, opts: ToneOptions = {}) {
  const { type = 'sine', gain = 0.25, attack = 0.006, glideTo, dest = c.destination } = opts;
  const out = c.createGain();
  const peak = gain * volume();
  out.gain.setValueAtTime(0.0001, start);
  out.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), start + attack);
  out.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  out.connect(dest);

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

// A brassy note for fanfares: a sawtooth whose filter opens on the attack
// and closes as it fades, so it blares instead of buzzing.
function brass(c: AudioContext, freq: number, start: number, dur: number, gain = 0.12) {
  const osc = c.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(freq, start);
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = 2;
  filter.frequency.setValueAtTime(freq * 1.2, start);
  filter.frequency.exponentialRampToValueAtTime(freq * 6, start + 0.06);
  filter.frequency.exponentialRampToValueAtTime(freq * 1.5, start + dur);
  const out = c.createGain();
  out.gain.setValueAtTime(0.0001, start);
  out.gain.exponentialRampToValueAtTime(Math.max(gain * volume(), 0.0002), start + 0.03);
  out.gain.setValueAtTime(Math.max(gain * volume() * 0.8, 0.0002), start + dur * 0.6);
  out.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(filter).connect(out).connect(c.destination);
  osc.start(start);
  osc.stop(start + dur + 0.05);
}

export const sfx = {
  /**
   * Correct answer. `streak` is the streak *including* this answer; `fast`
   * adds a sparkle on top for answers in the BIG BOOST zone; `dest`: where
   * it's heard, if not straight out of the speakers.
   */
  correct(streak: number, fast: boolean, dest?: AudioNode) {
    const c = audio();
    if (!c || volume() === 0) return;
    const t = c.currentTime + 0.01;
    const root = Math.min(streak - 1, 10);
    // Two-note "ding-ding" a pentatonic step apart, starting higher each time.
    tone(c, noteFreq(root), t, 0.35, { gain: 0.22, dest });
    tone(c, noteFreq(root + 2), t + 0.08, 0.5, { gain: 0.24, dest });
    // Longer streaks add a third note, so the reward literally grows.
    if (streak >= 3) tone(c, noteFreq(root + 4), t + 0.16, 0.6, { gain: 0.2, dest });
    if (fast) {
      for (let i = 0; i < 4; i++) {
        tone(c, noteFreq(root + 6 + i), t + 0.2 + i * 0.045, 0.25, { gain: 0.07, type: 'triangle', dest });
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

  /** Warping between the game and a game mode: a quick rising whoosh, a soft shimmer on arrival. */
  warp() {
    const c = audio();
    if (!c || volume() === 0) return;
    const t = c.currentTime + 0.02;
    noiseBurst(c, t, 1.2, 300, 5000, 0.1);
    tone(c, 120, t, 0.8, { type: 'triangle', gain: 0.06, glideTo: 960, attack: 0.25 });
    [4, 7, 9].forEach((n, i) => tone(c, noteFreq(n), t + 0.75 + i * 0.05, 0.6, { gain: 0.07 }));
  },

  /**
   * The rocket building up to a blast-off (its engine swelling, `seconds`
   * long): a rumble that swells and climbs under a whine rising with it, two
   * tones a little apart so they beat faster as they go up.
   */
  chargeUp(seconds: number) {
    const c = audio();
    if (!c || volume() === 0) return;
    const t = c.currentTime + 0.01;
    const end = t + seconds;
    const buffer = c.createBuffer(1, Math.ceil(c.sampleRate * seconds), c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buffer;
    const filter = c.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 0.9;
    filter.frequency.setValueAtTime(90, t);
    filter.frequency.exponentialRampToValueAtTime(1100, end);
    const out = c.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(Math.max(0.16 * volume(), 0.0002), end - 0.04);
    out.gain.linearRampToValueAtTime(0.0001, end);
    src.connect(filter).connect(out).connect(c.destination);
    src.start(t);
    tone(c, 150, t, seconds, { type: 'sine', gain: 0.05, glideTo: 820, attack: seconds * 0.9 });
    tone(c, 156, t, seconds, { type: 'triangle', gain: 0.04, glideTo: 846, attack: seconds * 0.9 });
  },

  /** The rocket blasting off for a bonus round or a game mode: a thump of ignition and an engine roar, rising away. */
  blastOff() {
    const c = audio();
    if (!c || volume() === 0) return;
    const t = c.currentTime + 0.01;
    tone(c, 62, t, 0.5, { type: 'sine', gain: 0.16, glideTo: 30 });
    noiseBurst(c, t, 0.75, 180, 2600, 0.14);
    tone(c, 70, t + 0.08, 0.7, { type: 'sawtooth', gain: 0.05, glideTo: 520, attack: 0.12 });
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

  /** Into the cockpit through the porthole: a soft rush, the hatch's hiss and a "welcome aboard" chime. */
  cockpitIn() {
    const c = audio();
    if (!c || volume() === 0) return;
    const t = c.currentTime + 0.02;
    noiseBurst(c, t, 0.9, 400, 3200, 0.08);
    noiseBurst(c, t + 0.75, 0.45, 6000, 2500, 0.05);
    [7, 4, 9].forEach((n, i) => tone(c, noteFreq(n), t + 0.9 + i * 0.09, 0.5, { gain: 0.08 }));
  },

  /** Back out of the cockpit to the flight: the rush the other way. */
  cockpitOut() {
    const c = audio();
    if (!c || volume() === 0) return;
    const t = c.currentTime + 0.02;
    noiseBurst(c, t, 0.9, 3200, 400, 0.07);
    tone(c, 660, t, 0.6, { type: 'triangle', gain: 0.04, glideTo: 220 });
  },

  /** A cockpit lever or switch thrown: a mechanical clunk, a little higher when it goes on. */
  clunk(on: boolean) {
    const c = audio();
    if (!c || volume() === 0) return;
    const t = c.currentTime + 0.005;
    noiseBurst(c, t, 0.06, 4200, 1800, 0.16);
    tone(c, on ? 240 : 170, t + 0.01, 0.12, { type: 'triangle', gain: 0.12, glideTo: on ? 180 : 120 });
  },

  /** Monster Sun: the hungry monster sucks a number in from space. */
  slurp() {
    const c = audio();
    if (!c || volume() === 0) return;
    const t = c.currentTime + 0.02;
    noiseBurst(c, t + 0.25, 0.8, 300, 2600, 0.07);
    tone(c, 330, t + 0.3, 0.7, { type: 'triangle', gain: 0.04, glideTo: 880, attack: 0.3 });
  },

  /** Monster Sun: the monster crunches the number, gulps, and its strength comes back. */
  crunch() {
    const c = audio();
    if (!c || volume() === 0) return;
    const t = c.currentTime + 0.01;
    [0, 0.1, 0.19, 0.31].forEach((d, i) => noiseBurst(c, t + d, 0.08, 2400 - i * 250, 600, 0.24));
    tone(c, 200, t + 0.42, 0.22, { gain: 0.16, glideTo: 90 });
    tone(c, 110, t + 0.6, 0.6, { type: 'sawtooth', gain: 0.045, glideTo: 330, attack: 0.15 });
  },

  /** Space Traffic: the pilot swerves past a slow ship, which drops back with a falling whoosh. */
  whoosh() {
    const c = audio();
    if (!c || volume() === 0) return;
    const t = c.currentTime + 0.01;
    noiseBurst(c, t, 0.32, 900, 5200, 0.12);
    noiseBurst(c, t + 0.26, 0.6, 4200, 260, 0.16);
    tone(c, 520, t + 0.22, 0.5, { type: 'triangle', gain: 0.04, glideTo: 160 });
  },

  /** the story's where and when, typed in: a terminal's key, a tiny click */
  type() {
    const c = audio();
    if (!c || volume() === 0) return;
    const t = c.currentTime + 0.005;
    noiseBurst(c, t, 0.03, 4200, 2400, 0.045);
    tone(c, 1800 + Math.random() * 400, t, 0.035, { type: 'square', gain: 0.01 });
  },

  /** Space Traffic: a slow ship closing in, each blip a little higher (0, 1, 2, …). */
  blip(step: number) {
    const c = audio();
    if (!c || volume() === 0) return;
    tone(c, noteFreq(5 + step), c.currentTime + 0.01, 0.14, { type: 'triangle', gain: 0.07 });
  },

  // ---- the Black Sun (the final boss) ----

  /** a number swallowed by the black hole: a falling "fwoop" and the little star blast as it crosses over (quiet for the ones drifting in by themselves) */
  swallow(loud: boolean) {
    const c = audio();
    if (!c || volume() === 0) return;
    const t = c.currentTime + 0.01;
    const k = loud ? 1 : 0.3;
    tone(c, 900, t, 0.45, { type: 'sine', gain: 0.09 * k, glideTo: 70 });
    noiseBurst(c, t, 0.4, 2600, 300, 0.05 * k);
    tone(c, noteFreq(9), t + 0.38, 0.25, { gain: 0.06 * k, type: 'triangle' });
    noiseBurst(c, t + 0.38, 0.22, 7000, 11000, 0.04 * k);
  },

  /** the ship fires the answer at the sun as a bolt of light; the bolt climbs with the run */
  bolt(run: number) {
    const c = audio();
    if (!c || volume() === 0) return;
    const t = c.currentTime + 0.01;
    const lift = Math.min(run, 14);
    tone(c, noteFreq(2 + Math.floor(lift / 2)), t, 0.2, { type: 'square', gain: 0.045, glideTo: noteFreq(9 + Math.floor(lift / 2)) });
    tone(c, noteFreq(4 + Math.floor(lift / 2)), t + 0.02, 0.35, { gain: 0.12 });
  },

  /** the bolt lands: a boom, and the black shell cracking */
  impact(run: number) {
    const c = audio();
    if (!c || volume() === 0) return;
    const t = c.currentTime + 0.01;
    noiseBurst(c, t, 0.45, 1800, 140, 0.22);
    tone(c, 110 - Math.min(run, 14) * 2, t, 0.4, { type: 'triangle', gain: 0.2, glideTo: 48 });
    [0, 0.05, 0.11].forEach((d, i) => noiseBurst(c, t + 0.08 + d, 0.06, 5200 - i * 600, 2400, 0.08));
  },

  /** a checkpoint: a layer of the dark shell shatters off, and a power chord rings out */
  checkpoint(n: number) {
    const c = audio();
    if (!c || volume() === 0) return;
    const t = c.currentTime + 0.01;
    for (let i = 0; i < 7; i++) noiseBurst(c, t + i * 0.035, 0.12, 9000 - i * 500, 3500, 0.09);
    noiseBurst(c, t, 0.9, 900, 120, 0.18);
    const root = n >= 10 ? 4 : 2;
    [0, 2, 4].forEach((d) => brass(c, noteFreq(root + d) / 2, t + 0.12, 0.9, 0.07));
    tone(c, noteFreq(root + 7), t + 0.2, 0.9, { gain: 0.12 });
  },

  /** the sun gets its strength back: a dark swell rising */
  sunHeal() {
    const c = audio();
    if (!c || volume() === 0) return;
    const t = c.currentTime + 0.02;
    tone(c, 62, t, 1.1, { type: 'sawtooth', gain: 0.06, glideTo: 124, attack: 0.35 });
    tone(c, 93, t + 0.1, 1.0, { type: 'sawtooth', gain: 0.035, glideTo: 186, attack: 0.35 });
    noiseBurst(c, t, 1.0, 200, 1200, 0.06);
  },

  /** the sun winds up a fireball: a rumble climbing, crackling */
  fireballCharge() {
    const c = audio();
    if (!c || volume() === 0) return;
    const t = c.currentTime + 0.01;
    tone(c, 48, t, 0.95, { type: 'sawtooth', gain: 0.07, glideTo: 150, attack: 0.25 });
    noiseBurst(c, t, 0.95, 300, 2600, 0.12);
    for (let i = 0; i < 6; i++) noiseBurst(c, t + 0.1 + i * 0.13, 0.05, 6000, 3000, 0.05);
  },

  /** the fireball roars off at the ship */
  fireballLaunch() {
    const c = audio();
    if (!c || volume() === 0) return;
    const t = c.currentTime + 0.01;
    noiseBurst(c, t, 1.1, 2400, 220, 0.24);
    tone(c, 160, t, 0.9, { type: 'sawtooth', gain: 0.05, glideTo: 60 });
  },

  /** dodged: the ship rolls aside, the fireball roars past, and a relieved "phew" */
  dodge() {
    const c = audio();
    if (!c || volume() === 0) return;
    const t = c.currentTime + 0.01;
    noiseBurst(c, t, 0.3, 900, 5200, 0.12);
    tone(c, noteFreq(4), t + 0.25, 0.2, { gain: 0.12 });
    tone(c, noteFreq(7), t + 0.36, 0.4, { gain: 0.13 });
  },

  /** the fireball hits the ship: a blast and a thump */
  burn() {
    const c = audio();
    if (!c || volume() === 0) return;
    const t = c.currentTime + 0.01;
    noiseBurst(c, t, 0.8, 2200, 90, 0.3);
    tone(c, 80, t, 0.6, { type: 'triangle', gain: 0.25, glideTo: 35 });
    tone(c, 300, t + 0.15, 0.4, { type: 'triangle', gain: 0.06, glideTo: 180 });
  },

  /** the 15th bolt: the dark shell shatters, everything it swallowed bursting out */
  shatter() {
    const c = audio();
    if (!c || volume() === 0) return;
    const t = c.currentTime + 0.01;
    noiseBurst(c, t, 2.2, 3000, 60, 0.32);
    tone(c, 55, t, 1.6, { type: 'triangle', gain: 0.28, glideTo: 30 });
    for (let i = 0; i < 14; i++) noiseBurst(c, t + 0.05 + i * 0.045, 0.1, 11000 - i * 350, 4000, 0.07);
    for (let i = 0; i < 10; i++) tone(c, noteFreq(6 + (i % 7)), t + 0.5 + i * 0.07, 0.4, { gain: 0.06, type: 'triangle' });
  },

  /** the sun lights up gold and smiles: a warm swelling chord and a climb of bells */
  sunrise() {
    const c = audio();
    if (!c || volume() === 0) return;
    const t = c.currentTime + 0.02;
    [130.81, 164.81, 196, 246.94].forEach((f, i) => tone(c, f, t + i * 0.05, 2.6, { type: 'triangle', gain: 0.07, attack: 0.6 }));
    [0, 2, 4, 5, 7, 9, 10, 12, 14].forEach((n, i) => tone(c, noteFreq(n), t + 0.6 + i * 0.12, 0.9, { gain: 0.11 }));
    noiseBurst(c, t + 0.5, 2, 4000, 11000, 0.04);
  },

  /** a little world blooms green round the happy sun */
  bloom(i: number) {
    const c = audio();
    if (!c || volume() === 0) return;
    const t = c.currentTime + 0.01;
    tone(c, noteFreq(7 + i * 2), t, 0.5, { gain: 0.1 });
    tone(c, noteFreq(9 + i * 2), t + 0.07, 0.6, { gain: 0.08, type: 'triangle' });
  },

  /** Space Admiral! A fanfare */
  admiral() {
    const c = audio();
    if (!c || volume() === 0) return;
    const t = c.currentTime + 0.05;
    const G4 = 392;
    const C5 = 523.25;
    const E5 = 659.25;
    const G5 = 783.99;
    const C6 = 1046.5;
    // ta-ta-taaa, ta-ta-TAAAA
    [
      [G4, 0, 0.16],
      [G4, 0.18, 0.16],
      [C5, 0.36, 0.5],
      [E5, 0.9, 0.16],
      [E5, 1.08, 0.16],
      [G5, 1.26, 0.5],
    ].forEach(([f, d, len]) => brass(c, f, t + d, len, 0.11));
    [C5, E5, G5, C6].forEach((f) => brass(c, f, t + 1.8, 1.8, 0.06));
    [0, 4, 7, 12, 16].forEach((n, i) => tone(c, noteFreq(n + 7), t + 1.8 + i * 0.08, 1.4, { gain: 0.08 }));
    noiseBurst(c, t + 1.8, 1.6, 5000, 12000, 0.05);
  },

  // ---- the cockpit ----

  /** the hyperdrive lever slammed forward: a heavy clunk, then the drive whining up and kicking in */
  hyperdrive() {
    const c = audio();
    if (!c || volume() === 0) return;
    const t = c.currentTime + 0.01;
    tone(c, 110, t, 0.18, { type: 'square', gain: 0.09, glideTo: 55 });
    noiseBurst(c, t, 0.12, 2600, 600, 0.14);
    tone(c, 180, t + 0.08, 0.55, { type: 'sawtooth', gain: 0.05, glideTo: 1400, attack: 0.4 });
    tone(c, 186, t + 0.08, 0.55, { type: 'triangle', gain: 0.05, glideTo: 1460, attack: 0.4 });
    noiseBurst(c, t + 0.5, 0.45, 400, 6000, 0.12);
  },

  /** a bump in the flight, felt in the cockpit: a faint low rumble (`strength` 0..1) */
  rumble(strength: number) {
    const c = audio();
    if (!c || volume() === 0) return;
    const t = c.currentTime + 0.01;
    noiseBurst(c, t, 0.7, 260, 70, 0.07 * strength);
    tone(c, 52, t, 0.5, { type: 'sine', gain: 0.05 * strength, glideTo: 38 });
  },

  // ---- the afterburner's loop (the cockpit's easter egg) ----

  /** the screen slashed in two: a blade's hiss and its ring */
  slash() {
    const c = audio();
    if (!c || volume() === 0) return;
    const t = c.currentTime + 0.01;
    noiseBurst(c, t, 0.2, 9000, 2400, 0.14);
    tone(c, 2400, t + 0.04, 0.5, { type: 'triangle', gain: 0.04, glideTo: 3600 });
    tone(c, 4800, t + 0.06, 0.7, { type: 'sine', gain: 0.025 });
  },

  /** the afterburner lighting: a deep boom, and a roar tearing away */
  ignite() {
    const c = audio();
    if (!c || volume() === 0) return;
    const t = c.currentTime + 0.01;
    tone(c, 58, t, 0.9, { type: 'sine', gain: 0.3, glideTo: 26 });
    noiseBurst(c, t, 0.12, 6000, 1400, 0.14);
    noiseBurst(c, t, 1.1, 140, 3800, 0.22);
    tone(c, 80, t + 0.05, 1.0, { type: 'sawtooth', gain: 0.05, glideTo: 680, attack: 0.12 });
  },

  /** time stopping, as an anime freezes a moment: the air sucked in, a deep bell, a shimmer hanging on */
  timeStop() {
    const c = audio();
    if (!c || volume() === 0) return;
    const t = c.currentTime + 0.01;
    noiseBurst(c, t, 0.24, 500, 8000, 0.08);
    tone(c, 196, t + 0.2, 1.8, { type: 'sine', gain: 0.08 });
    tone(c, 293.66, t + 0.2, 1.5, { type: 'sine', gain: 0.04 });
    noiseBurst(c, t + 0.22, 1.3, 9000, 12000, 0.025);
  },

  /** the loop done: a brassy ta-daa */
  loopDone() {
    const c = audio();
    if (!c || volume() === 0) return;
    const t = c.currentTime + 0.01;
    brass(c, 392, t, 0.14, 0.1);
    [523.25, 659.25, 783.99].forEach((f, i) => brass(c, f, t + 0.13, 0.9, 0.11 - i * 0.025));
    noiseBurst(c, t + 0.13, 0.9, 4000, 11000, 0.05);
  },

  // ---- the title ----

  /** the title's letters poured in molten metal: a heavy rush rising, the metal ringing, and a ting as the gleam runs across */
  metalPour() {
    const c = audio();
    if (!c || volume() === 0) return;
    const t = c.currentTime + 0.01;
    noiseBurst(c, t, 1.5, 260, 1600, 0.05);
    tone(c, 98, t, 1.7, { type: 'triangle', gain: 0.06, glideTo: 196, attack: 0.35 });
    [0, 0.3, 0.62, 0.95].forEach((d, i) => tone(c, 1320 + i * 190, t + d, 1.0, { type: 'sine', gain: 0.018 }));
    tone(c, noteFreq(14), t + 1.95, 1.3, { gain: 0.06 });
    tone(c, noteFreq(19), t + 2.01, 1.1, { gain: 0.035 });
  },

  /** the logo glitching out (a digital stutter, a fizz) and, `there`, zipping to the top bar and stuttering in */
  teleport(there: boolean) {
    const c = audio();
    if (!c || volume() === 0) return;
    const t = c.currentTime + 0.01;
    [7, 3, 9, 1, 6, 10, 2, 8].forEach((n, i) => tone(c, 160 + n * 130, t + i * 0.048, 0.04, { type: 'square', gain: 0.028 }));
    noiseBurst(c, t, 0.44, 1500, 9000, 0.05);
    if (!there) return;
    tone(c, 280, t + 0.44, 0.15, { type: 'sawtooth', gain: 0.035, glideTo: 3400 });
    [4, 9, 2, 7, 5].forEach((n, i) => tone(c, 200 + n * 150, t + 0.62 + i * 0.045, 0.035, { type: 'square', gain: 0.022 }));
    tone(c, noteFreq(12), t + 0.9, 0.5, { gain: 0.05 });
  },

  // ---- the launch bay ----

  /** the ship on the pad flares away: a shimmer rising to a bright ping */
  flareOut() {
    const c = audio();
    if (!c || volume() === 0) return;
    const t = c.currentTime + 0.01;
    tone(c, 280, t, 0.42, { type: 'triangle', gain: 0.06, glideTo: 1900, attack: 0.32 });
    noiseBurst(c, t + 0.08, 0.4, 2200, 9500, 0.05);
    tone(c, noteFreq(12), t + 0.36, 0.4, { gain: 0.07 });
  },

  /** the next one beamed down onto the pad: the beam falling (a falling shimmer), landing (a soft thump) and the ship there (a chime) */
  beamDown() {
    const c = audio();
    if (!c || volume() === 0) return;
    const t = c.currentTime + 0.01;
    tone(c, 1500, t, 1.0, { type: 'sine', gain: 0.045, glideTo: 240 });
    noiseBurst(c, t, 1.0, 7000, 700, 0.045);
    tone(c, 72, t + 1.0, 0.45, { type: 'sine', gain: 0.15, glideTo: 38 });
    [0, 2, 4].forEach((n, i) => tone(c, noteFreq(n + 5), t + 1.05 + i * 0.06, 0.8, { gain: 0.08 }));
  },

  // ---- the Canyon Run (the cockpit's manual flight) ----

  /** the ship comes onto the next number on the ruler ahead: a ruler's tick (a fifth's a little brighter) */
  tick(n: number) {
    const c = audio();
    if (!c || volume() === 0) return;
    const t = c.currentTime + 0.005;
    const five = n % 5 === 0;
    tone(c, five ? 2900 : 2300, t, 0.035, { type: 'square', gain: five ? 0.016 : 0.01 });
    noiseBurst(c, t, 0.025, 7000, 3500, 0.02);
  },

  /** a gate ahead, nearing: a beacon's ping, a step higher each time (0, 1, 2) */
  beacon(step: number) {
    const c = audio();
    if (!c || volume() === 0) return;
    const t = c.currentTime + 0.01;
    tone(c, noteFreq(7 + step * 2), t, 0.22, { type: 'sine', gain: 0.06 });
    tone(c, noteFreq(14 + step * 2), t, 0.12, { type: 'triangle', gain: 0.02 });
  },

  /** through a gate: a bullseye rings out, higher with each in a row; close, a softer chime; a miss, a low thud */
  gate(verdict: 'bullseye' | 'close' | 'miss', combo: number) {
    const c = audio();
    if (!c || volume() === 0) return;
    const t = c.currentTime + 0.01;
    if (verdict === 'bullseye') {
      const root = Math.min(combo, 6);
      [0, 2, 4, 5].forEach((n, i) => tone(c, noteFreq(root + n), t + i * 0.055, 0.7, { gain: 0.09 }));
      noiseBurst(c, t, 0.5, 2400, 9000, 0.06);
      tone(c, 90, t, 0.35, { type: 'sine', gain: 0.16, glideTo: 45 });
    } else if (verdict === 'close') {
      [2, 4].forEach((n, i) => tone(c, noteFreq(n), t + i * 0.07, 0.45, { gain: 0.07 }));
      noiseBurst(c, t, 0.3, 1800, 5000, 0.04);
    } else {
      tone(c, 160, t, 0.4, { type: 'triangle', gain: 0.08, glideTo: 90 });
      noiseBurst(c, t, 0.25, 900, 300, 0.06);
    }
  },

  /** scraping along a canyon wall: grinding, sparks flying (`strength` 0..1) */
  scrape(strength: number) {
    const c = audio();
    if (!c || volume() === 0) return;
    const t = c.currentTime + 0.01;
    const k = 0.4 + 0.6 * strength;
    noiseBurst(c, t, 0.4, 4200, 1100, 0.13 * k);
    noiseBurst(c, t + 0.04, 0.3, 700, 160, 0.12 * k);
    tone(c, 74, t, 0.3, { type: 'square', gain: 0.03 * k, glideTo: 42 });
  },

  /** knocked aside by a spire of rock: a heavy thump, stones rattling */
  thud() {
    const c = audio();
    if (!c || volume() === 0) return;
    const t = c.currentTime + 0.01;
    tone(c, 68, t, 0.5, { type: 'sine', gain: 0.22, glideTo: 30 });
    noiseBurst(c, t, 0.3, 1600, 200, 0.2);
    [0.08, 0.15, 0.24].forEach((d) => noiseBurst(c, t + d, 0.05, 3000, 1200, 0.06));
  },
};

// ---------- the canyon's wind, rushing past the cockpit ----------
// A steady sound for the Canyon Run: deep air rumbling (brown noise), the
// rush of wind past the hull (noise through a band that rises with the
// speed), and a higher hiss the nearer a wall goes by.

export interface Wind {
  /** `speed` and `near` 0 … 1 */
  set: (speed: number, near: number) => void;
  stop: () => void;
}

export function canyonWind(): Wind | null {
  const c = audio();
  if (!c) return null;
  const out = c.createGain();
  out.gain.value = 0.0001;
  out.connect(c.destination);
  const { white, brown } = noise(c);
  const sources: AudioBufferSourceNode[] = [];
  const loop = (buffer: AudioBuffer) => {
    const src = c.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    sources.push(src);
    return src;
  };
  const rumbleLp = c.createBiquadFilter();
  rumbleLp.type = 'lowpass';
  rumbleLp.frequency.value = 240;
  loop(brown).connect(rumbleLp).connect(out);
  const rushBp = c.createBiquadFilter();
  rushBp.type = 'bandpass';
  rushBp.Q.value = 0.8;
  const rush = c.createGain();
  rush.gain.value = 0.35;
  loop(white).connect(rushBp).connect(rush).connect(out);
  const hissHp = c.createBiquadFilter();
  hissHp.type = 'highpass';
  hissHp.frequency.value = 2600;
  const hiss = c.createGain();
  hiss.gain.value = 0;
  loop(white).connect(hissHp).connect(hiss).connect(out);
  const t = c.currentTime;
  for (const src of sources) src.start(t, Math.random() * 3);
  const ease = (p: AudioParam, v: number) => p.setTargetAtTime(v, c.currentTime, 0.08);
  return {
    set: (speed, near) => {
      ease(out.gain, (0.05 + 0.13 * speed) * volume());
      ease(rushBp.frequency, 380 + 1300 * speed);
      ease(rumbleLp.frequency, 160 + 260 * speed);
      ease(hiss.gain, near * 0.5);
    },
    stop: () => {
      const now = c.currentTime;
      out.gain.cancelScheduledValues(now);
      out.gain.setValueAtTime(out.gain.value, now);
      out.gain.linearRampToValueAtTime(0.0001, now + 0.6);
      for (const src of sources) src.stop(now + 0.7);
    },
  };
}

