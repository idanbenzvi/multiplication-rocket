import { useEffect, useRef, useState } from 'react';
import { useT } from '../../i18n/useLang';
import { useAudio } from '../../audio/useAudio';
import { humGain, humGraph, sfx, sfxContext } from '../../audio/sfx';

// The game's sounds made from waves (audio/sfx.ts), and seen: an
// oscilloscope listening in on them as they play. A note in each of the four
// shapes of wave, the right-answer chime (a step higher each time, as a
// streak climbs) and the engine's hum, all made the way the game makes them.

type Wave = 'sine' | 'triangle' | 'square' | 'sawtooth';
const WAVES: Wave[] = ['sine', 'triangle', 'square', 'sawtooth'];
/** low enough for a few of its waves to be seen across the scope */
const WAVE_HZ = 220;
/** how loud the hum is (engineHum's 0 … 1) */
const HUM_LEVEL = 0.7;
/** samples across the scope */
const SPAN = 1024;

type Hum = ReturnType<typeof humGraph>;

/** the hum fading out, and stopped */
function fadeOut(h: Hum, c: BaseAudioContext) {
  const now = c.currentTime;
  h.out.gain.cancelScheduledValues(now);
  h.out.gain.setValueAtTime(h.out.gain.value, now);
  h.out.gain.linearRampToValueAtTime(0.0001, now + 0.4);
  for (const src of h.sources) src.stop(now + 0.45);
}

export function SoundDemo() {
  const t = useT().how.sound;
  const volume = useAudio((s) => s.effectsVolume);
  const canvas = useRef<HTMLCanvasElement>(null);
  const ear = useRef<AnalyserNode | null>(null);
  const hum = useRef<Hum | null>(null);
  const [humming, setHumming] = useState(false);
  const [streak, setStreak] = useState(1);
  const [wave, setWave] = useState<Wave | null>(null);

  /** the scope's ear, between the sounds and the speakers (made on a tap, for the browser to let sound start) */
  const listen = () => {
    const c = sfxContext();
    if (!c) return null;
    if (!ear.current) {
      ear.current = c.createAnalyser();
      ear.current.fftSize = 2048;
      ear.current.connect(c.destination);
    }
    return { c, analyser: ear.current };
  };

  const playWave = (w: Wave) => {
    setWave(w);
    const e = listen();
    if (!e || volume === 0) return;
    const { c, analyser } = e;
    const at = c.currentTime + 0.01;
    const osc = c.createOscillator();
    osc.type = w;
    osc.frequency.value = WAVE_HZ;
    // (the square and the saw sound much louder at the same height)
    const peak = (w === 'sine' || w === 'triangle' ? 0.3 : 0.12) * volume;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(peak, at + 0.02);
    g.gain.setValueAtTime(peak, at + 0.9);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 1.3);
    osc.connect(g).connect(analyser);
    osc.start(at);
    osc.stop(at + 1.35);
  };

  const chime = () => {
    const e = listen();
    if (!e) return;
    sfx.correct(streak, false, e.analyser);
    setStreak((s) => (s % 10) + 1);
  };

  const toggleHum = () => {
    if (hum.current) {
      fadeOut(hum.current, hum.current.out.context);
      hum.current = null;
      setHumming(false);
      return;
    }
    const e = listen();
    if (!e || volume === 0) return;
    const h = humGraph(e.c, e.analyser);
    const now = e.c.currentTime;
    h.out.gain.setValueAtTime(0.0001, now);
    h.out.gain.linearRampToValueAtTime(humGain(HUM_LEVEL) * volume, now + 0.5);
    for (const [param, from, to] of h.rise) param.setValueAtTime(from + (to - from) * HUM_LEVEL, now);
    hum.current = h;
    setHumming(true);
  };

  // leaving the page: the hum stops, and the scope's ear is let go
  useEffect(
    () => () => {
      if (hum.current) fadeOut(hum.current, hum.current.out.context);
      const analyser = ear.current;
      if (analyser) window.setTimeout(() => analyser.disconnect(), 600);
    },
    [],
  );

  // the scope: what's being heard, drawn from a wave's rising edge so it holds still
  useEffect(() => {
    const cv = canvas.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    const buf = new Float32Array(2048);
    let gain = 4;
    let raf = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.round(cv.clientWidth * dpr);
      const h = Math.round(cv.clientHeight * dpr);
      if (cv.width !== w || cv.height !== h) {
        cv.width = w;
        cv.height = h;
      }
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(143, 230, 255, 0.16)';
      ctx.lineWidth = dpr;
      for (let i = 1; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(0, (h * i) / 4);
        ctx.lineTo(w, (h * i) / 4);
        ctx.stroke();
      }
      const analyser = ear.current;
      let from = 0;
      let peak = 0;
      if (analyser) {
        analyser.getFloatTimeDomainData(buf);
        for (let i = 1; i < buf.length - SPAN; i++) {
          if (buf[i - 1] < 0 && buf[i] >= 0) {
            from = i;
            break;
          }
        }
        for (let i = from; i < from + SPAN; i++) peak = Math.max(peak, Math.abs(buf[i]));
      }
      // (quiet sounds drawn bigger, so they're seen; eased, so it doesn't jump)
      gain += ((peak > 0.002 ? Math.min(12, 0.85 / peak) : gain) - gain) * 0.08;
      ctx.beginPath();
      for (let i = 0; i < SPAN; i++) {
        const v = analyser ? buf[from + i] * gain : 0;
        const x = (i / (SPAN - 1)) * w;
        const y = h / 2 - v * h * 0.45;
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      }
      ctx.strokeStyle = '#8fe6ff';
      ctx.lineWidth = 2.5 * dpr;
      ctx.shadowColor = 'rgba(106, 215, 255, 0.9)';
      ctx.shadowBlur = 10 * dpr;
      ctx.stroke();
      ctx.shadowBlur = 0;
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <>
      <div className="how-stage how-scope">
        <canvas ref={canvas} className="how-scope-canvas" aria-hidden="true" />
        {volume === 0 && <p className="how-readout">{t.muted}</p>}
      </div>
      <div className="how-controls">
        <div className="how-waves">
          {WAVES.map((w) => (
            <button key={w} type="button" className={`how-button how-wave ${wave === w ? 'is-on' : ''}`} onClick={() => playWave(w)}>
              <WaveIcon wave={w} />
              {t.waves[w]}
            </button>
          ))}
        </div>
        <button type="button" className="how-button" onClick={chime}>
          <span aria-hidden="true">🔔</span> {t.chime(streak)}
        </button>
        <button type="button" className={`how-button ${humming ? 'is-on' : ''}`} onClick={toggleHum} aria-pressed={humming}>
          <span aria-hidden="true">🚀</span> {humming ? t.humOff : t.hum}
        </button>
      </div>
    </>
  );
}

/** a wave's shape, drawn small */
function WaveIcon({ wave }: { wave: Wave }) {
  const d = {
    sine: 'M1 8 C4 -1 7 -1 10 8 S16 17 19 8',
    triangle: 'M1 8 L5.5 2 L14.5 14 L19 8',
    square: 'M1 8 V2 H10 V14 H19 V8',
    sawtooth: 'M1 8 L10 2 V14 L19 8',
  }[wave];
  return (
    <svg className="how-wave-icon" viewBox="0 0 20 16" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}
