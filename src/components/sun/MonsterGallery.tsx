import { useState } from 'react';
import { createPortal } from 'react-dom';
import { MonsterCanvas } from './MonsterCanvas';
import { MONSTERS } from './roster';
import { useT } from '../../i18n/useLang';
import './sun.css';

// Dev mode only (the dev panel's ⇧U): every monster in Monster Sun side by
// side, and the friends they turn into, to look them over without a fight on
// several phones.
export function MonsterGallery({ onClose }: { onClose: () => void }) {
  const t = useT();
  const [cured, setCured] = useState(false);
  return createPortal(
    <div className="sun-gallery" dir="ltr">
      <div className="sun-gallery-bar">
        <button type="button" className="profile-primary" onClick={() => setCured((c) => !c)}>
          {cured ? '👾 Monsters' : '💛 Cure them all'}
        </button>
        <button type="button" className="profile-secondary" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>
      <div className="sun-gallery-grid">
        {MONSTERS.map((_, k) => (
          <figure key={k} className="sun-gallery-tile">
            <MonsterCanvas monster={1} kind={k} hp={cured ? 0 : 1} maxHp={1} lurk={!cured} />
            <figcaption>
              {k + 1}. {t.sun.names[k]}
            </figcaption>
          </figure>
        ))}
      </div>
    </div>,
    document.body,
  );
}
