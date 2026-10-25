import type { CSSProperties } from 'react';
import { useLang, useT } from '../../../i18n/useLang';
import { useAudio } from '../../../audio/useAudio';
import { sfx } from '../../../audio/sfx';
import CometDial from '../../reactbits/CometDial';
import { Meter } from '../faces';

// The bottom left of the bank on the left wall: the music's and the effects'
// volumes on two dials (spun round, or tapped where you want them, the
// effects saying how loud they are now as you let go), their levels bouncing
// on meters, a chime to try them out, and the language.

export function SoundPage() {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const toggleLang = useLang((s) => s.toggle);
  const music = useAudio((s) => s.musicVolume);
  const effects = useAudio((s) => s.effectsVolume);
  const setMusic = useAudio((s) => s.setMusicVolume);
  const setEffects = useAudio((s) => s.setEffectsVolume);
  return (
    <div className="ck3-page ck3-sound">
      <div className="ck3-dials" dir="ltr">
        <div className="ck3-dial" style={{ '--dial': '#5cf2ff' } as CSSProperties}>
          <CometDial value={Math.round(music * 100)} onChange={(v) => setMusic(v / 100)} label={`🎵 ${t.deck.music}`} accent="#5cf2ff" ink="#dffbff" size={190} thickness={6} />
          <span className="ck3-dial-name">🎵 {t.deck.music}</span>
        </div>
        <div className="ck3-dial" style={{ '--dial': '#ffb35c' } as CSSProperties}>
          <CometDial
            value={Math.round(effects * 100)}
            onChange={(v) => setEffects(v / 100)}
            // at the new volume, on letting go
            onChangeEnd={() => sfx.correct(3, false)}
            label={`✨ ${t.deck.effects}`}
            accent="#ffb35c"
            ink="#fff1dc"
            size={190}
            thickness={6}
          />
          <span className="ck3-dial-name">✨ {t.deck.effects}</span>
        </div>
      </div>
      <div className="ck3-meters" aria-hidden>
        <Meter level={music} icon="🎵" name={t.deck.music} />
        <Meter level={effects} icon="✨" name={t.deck.effects} />
      </div>
      <div className="ck3-page-buttons">
        <button type="button" className="ck3-button" onClick={() => sfx.correct(5, true)}>
          🔔 {t.deck.tryIt}
        </button>
      </div>
      <div className="ck3-field">
        <span className="ck3-field-name">{t.language}</span>
        <div className="ck3-segments" role="radiogroup" aria-label={t.language}>
          {(
            [
              ['en', 'English'],
              ['he', 'עברית'],
            ] as const
          ).map(([l, name]) => (
            <button key={l} type="button" role="radio" aria-checked={lang === l} className={lang === l ? 'is-on' : ''} onClick={() => lang !== l && toggleLang()}>
              {name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
