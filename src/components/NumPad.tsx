import { useT } from '../i18n/useLang';

interface Props {
  onDigit: (d: string) => void;
  onBackspace: () => void;
  disabled: boolean;
}

const ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
];

// Big on-screen number pad for touch devices, so answering never summons the
// OS keyboard (which covers half a tablet screen). Answers check themselves
// once enough digits are in, so there's no Enter key.
export function NumPad({ onDigit, onBackspace, disabled }: Props) {
  const t = useT();
  return (
    <div className="numpad" dir="ltr">
      {ROWS.flat().map((d) => (
        <button key={d} type="button" className="numpad-key" onClick={() => onDigit(d)} disabled={disabled}>
          {d}
        </button>
      ))}
      <span />
      <button type="button" className="numpad-key" onClick={() => onDigit('0')} disabled={disabled}>
        0
      </button>
      <button type="button" className="numpad-key numpad-back" onClick={onBackspace} disabled={disabled} aria-label={t.deleteDigit}>
        ⌫
      </button>
    </div>
  );
}
