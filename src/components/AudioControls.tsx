import { useEffect, useRef, useState } from 'react';
import { useAudio } from '../audio/useAudio';
import { sfx } from '../audio/sfx';
import { useT } from '../i18n/useLang';

function speakerIcon(volume: number): string {
  if (volume === 0) return '🔇';
  if (volume < 0.34) return '🔈';
  if (volume < 0.67) return '🔉';
  return '🔊';
}

// Arrow keys etc. on a slider shouldn't reach the game's global shortcuts
// (H toggles the hint) — but Escape still has to bubble up to close the panel.
function keepKeysLocal(e: React.KeyboardEvent) {
  if (e.key !== 'Escape') e.stopPropagation();
}

// Top-bar speaker button that opens a small panel with separate music and
// sound-effect volume sliders (0 = off).
export function AudioControls() {
  const t = useT();
  const musicVolume = useAudio((s) => s.musicVolume);
  const effectsVolume = useAudio((s) => s.effectsVolume);
  const setMusicVolume = useAudio((s) => s.setMusicVolume);
  const setEffectsVolume = useAudio((s) => s.setEffectsVolume);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !wrapRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  return (
    <div className="audio-controls" ref={wrapRef}>
      <button
        className="reset-button music-button"
        onClick={() => setOpen((o) => !o)}
        title={t.sound}
        aria-label={t.sound}
        aria-expanded={open}
      >
        {speakerIcon(musicVolume)}
      </button>
      {open && (
        <div className="audio-panel" role="group" aria-label={t.sound}>
          <label className="audio-row">
            <span>🎵 {t.music}</span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(musicVolume * 100)}
              onChange={(e) => setMusicVolume(Number(e.target.value) / 100)}
              onKeyDown={keepKeysLocal}
            />
          </label>
          <label className="audio-row">
            <span>✨ {t.effects}</span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(effectsVolume * 100)}
              onChange={(e) => setEffectsVolume(Number(e.target.value) / 100)}
              // Preview at the new level when the slider is released.
              onPointerUp={() => sfx.correct(3, false)}
              onKeyDown={keepKeysLocal}
            />
          </label>
        </div>
      )}
    </div>
  );
}
