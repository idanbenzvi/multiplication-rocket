import { useEffect, useRef, useState } from 'react';
import { sfx } from '../../audio/sfx';
import { onEmote, type DroidMood } from './droidBus';

interface Props {
  /** which settings it answers to (droidBus.ts) */
  who: 'sound' | 'switch';
  side: 'left' | 'right';
  /** its casing's colour */
  color: string;
}

interface Bit {
  id: number;
  kind: 'note' | 'spark' | 'zed';
  /** where across it starts, -1..1 */
  x: number;
}

const NOTES = ['♪', '♫', '♪', '♬'];
/** how long a mood lasts before it's back to idling (cheering, longer) */
const MOOD_MS = 1500;
const CHEER_MS = 2400;
/** notes or sparks fly off no oftener than this, however fast a slider moves */
const BIT_MS = 160;

// A little helper droid on the dashboard's corner, with a screen for a face.
// Idling it hovers and blinks; as the settings change it reacts: the sound
// droid bops along as the music goes up, notes and sound waves streaming
// off it (as loud as the music), and sparkles for the effects; the switch
// droid is happy at an ON, sleepy at an OFF, buzzes when the vibration's
// switched on, says hello in the new language, and is scared when the reset
// button's cover is lifted. Both cheer as the hyperdrive kicks in.
export function Droid({ who, side, color }: Props) {
  const [mood, setMood] = useState<DroidMood | 'idle'>('idle');
  const [beat, setBeat] = useState(0);
  const [level, setLevel] = useState(0.5);
  const [word, setWord] = useState('');
  const [bits, setBits] = useState<Bit[]>([]);
  const lastBit = useRef(0);
  const nextId = useRef(1);

  useEffect(
    () =>
      onEmote((e) => {
        if (e.who !== who && e.who !== 'both') return;
        // (the switch droid beeps along, just after the switch's own clunk)
        if (who === 'switch' && e.mood !== 'cheer' && e.mood !== 'buzz') {
          window.setTimeout(() => sfx.droid(e.mood !== 'sleepy' && e.mood !== 'scared'), 140);
        }
        setMood(e.mood);
        setBeat((b) => b + 1);
        if (e.level !== undefined) setLevel(e.level);
        if (e.word) setWord(e.word);
        const kind = e.mood === 'music' ? 'note' : e.mood === 'effects' || e.mood === 'cheer' ? 'spark' : e.mood === 'sleepy' ? 'zed' : null;
        const now = performance.now();
        if (!kind || now - lastBit.current < BIT_MS || (e.mood === 'music' && e.level === 0)) return;
        lastBit.current = now;
        const id = nextId.current++;
        setBits((b) => [...b.slice(-5), { id, kind, x: Math.random() * 2 - 1 }]);
        window.setTimeout(() => setBits((b) => b.filter((x) => x.id !== id)), 1300);
      }),
    [who],
  );
  // and back to idling
  useEffect(() => {
    if (mood === 'idle') return;
    const t = window.setTimeout(() => setMood('idle'), mood === 'cheer' ? CHEER_MS : MOOD_MS);
    return () => window.clearTimeout(t);
  }, [mood, beat]);

  // (all the way down, the music droid looks sleepy rather than bopping)
  const face = mood === 'music' && level === 0 ? 'sleepy' : mood;
  const waves = (mood === 'music' || mood === 'effects') && level > 0;

  return (
    <div className={`ck-droid is-${side} is-${face}`} style={{ '--droid': color, '--level': level } as React.CSSProperties} aria-hidden>
      {/* (keyed by the beat, so each reaction plays from the start) */}
      <div key={beat} className="ck-droid-bot">
        <svg viewBox="0 0 64 74" className="ck-droid-svg">
          <line x1="32" y1="15" x2="32" y2="5" className="ck-droid-wire" />
          <circle cx="32" cy="5" r="3.6" className="ck-droid-tip" />
          <rect x="5" y="23" width="6" height="12" rx="3" className="ck-droid-ear" />
          <rect x="53" y="23" width="6" height="12" rx="3" className="ck-droid-ear" />
          <rect x="9" y="14" width="46" height="31" rx="12" className="ck-droid-head" />
          <rect x="14" y="19" width="36" height="20" rx="8" className="ck-droid-visor" />
          {/* the face: its eyes and mouth for each mood */}
          <g className="ck-droid-face">
            {face === 'idle' || face === 'hello' ? (
              <g className="ck-droid-eyes">
                <rect x="21" y="23" width="7" height="9" rx="3.5" />
                <rect x="36" y="23" width="7" height="9" rx="3.5" />
              </g>
            ) : face === 'sleepy' ? (
              <g className="ck-droid-lines">
                <path d="M20 29 h9 M35 29 h9" />
              </g>
            ) : face === 'buzz' ? (
              <g className="ck-droid-lines">
                <path d="M20 24 l7 4 -7 4 M44 24 l-7 4 7 4" />
              </g>
            ) : face === 'scared' ? (
              <g className="ck-droid-eyes">
                <circle cx="24.5" cy="27" r="5" />
                <circle cx="39.5" cy="27" r="5" />
              </g>
            ) : (
              <g className="ck-droid-lines">
                <path d="M20 30 q4.5 -6 9 0 M35 30 q4.5 -6 9 0" />
              </g>
            )}
            {face === 'music' || face === 'effects' ? (
              <g className="ck-droid-eq">
                <rect x="26" y="33" width="3" height="4" rx="1" />
                <rect x="30.5" y="33" width="3" height="4" rx="1" />
                <rect x="35" y="33" width="3" height="4" rx="1" />
              </g>
            ) : face === 'scared' ? (
              <circle cx="32" cy="35" r="1.8" className="ck-droid-mouth" />
            ) : face === 'happy' || face === 'cheer' || face === 'hello' ? (
              <path d="M27 34 q5 4 10 0" className="ck-droid-smile" />
            ) : null}
          </g>
          <rect x="17" y="46" width="30" height="17" rx="6" className="ck-droid-body" />
          <circle cx="32" cy="54.5" r="3.4" className="ck-droid-heart" />
          <rect x="5" y="47" width="8" height="13" rx="4" className="ck-droid-arm is-l" />
          <rect x="51" y="47" width="8" height="13" rx="4" className="ck-droid-arm is-r" />
          <ellipse cx="32" cy="68" rx="13" ry="4.5" className="ck-droid-wheel" />
        </svg>
        {waves && (
          <span className="ck-droid-waves">
            <i />
            <i />
            <i />
          </span>
        )}
        {face === 'buzz' && <span className="ck-droid-buzz" />}
        {face === 'hello' && word && <span className="ck-droid-say">{word}</span>}
        {face === 'cheer' && word && <span className="ck-droid-say">{word}</span>}
      </div>
      {bits.map((b) => (
        <span key={b.id} className={`ck-droid-bit is-${b.kind}`} style={{ '--x': b.x } as React.CSSProperties}>
          {b.kind === 'note' ? NOTES[b.id % NOTES.length] : b.kind === 'zed' ? 'z' : '✦'}
        </span>
      ))}
    </div>
  );
}
