import { useT } from '../i18n/useLang';

interface Props {
  onDigit: (d: string) => void;
  onBackspace: () => void;
  /** confirm mode: a ✓ key that submits what's typed */
  onConfirm?: () => void;
  disabled: boolean;
}

const ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
];

// Big on-screen number pad for touch devices, so answering never summons the
// OS keyboard (which covers half a tablet screen). In "right away" mode
// answers check themselves; in confirm mode the ✓ key (or a tap on the
// screen) submits.
export function NumPad({ onDigit, onBackspace, onConfirm, disabled }: Props) {
  const t = useT();
  return (
    <div className="numpad" dir="ltr">
      {ROWS.flat().map((d) => (
        <button key={d} type="button" className="numpad-key" onClick={() => onDigit(d)} disabled={disabled}>
          {d}
        </button>
      ))}
      {onConfirm ? (
        <button type="button" className="numpad-key numpad-ok" onClick={onConfirm} disabled={disabled} aria-label={t.check}>
          ✓
        </button>
      ) : (
        <span />
      )}
      <button type="button" className="numpad-key" onClick={() => onDigit('0')} disabled={disabled}>
        0
      </button>
      <button type="button" className="numpad-key numpad-back" onClick={onBackspace} disabled={disabled} aria-label={t.deleteDigit}>
        ⌫
      </button>
    </div>
  );
}
