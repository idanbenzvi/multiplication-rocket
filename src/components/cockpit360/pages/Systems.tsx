import type { ReactNode } from 'react';
import { useT } from '../../../i18n/useLang';
import { useGameStore } from '../../../game/useGameStore';
import { paceMs } from '../../../game/scoring';
import { activeProfile, pilotName, useMission, useProfiles } from '../../../profiles/useProfiles';
import { missionName } from '../../../i18n/strings';
import { isTouchDevice, useSettings, type AnswerMode, type TypedCheck } from '../../../settings/useSettings';
import { useQuality, type QualityMode } from '../../../settings/quality';
import { canFeel, canTick, haptics } from '../../../audio/haptics';
import { sfx } from '../../../audio/sfx';
import SquishSwitch from '../../reactbits/SquishSwitch';
import HoldButton from '../../reactbits/HoldButton';

// The bottom right of the bank on the left wall: the ship's systems, every
// setting the game has. How answers are given (and, typing on a touch
// screen, when they're checked), Orbie, the practice map opening by itself,
// the speed boost (this pilot's own), the buzz, the graphics (Auto lowers
// them on a device that struggles: settings/quality.ts); and for grown-ups, their
// dashboard, what the game is and how it works, and starting a pilot over
// (held down a moment, so it can't happen by accident).

function Segments<T extends string>({ value, choices, onChange, label }: { value: T; choices: Array<[T, string]>; onChange: (v: T) => void; label: string }) {
  return (
    <div className="ck3-segments" role="radiogroup" aria-label={label}>
      {choices.map(([v, name]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          className={value === v ? 'is-on' : ''}
          onClick={() => {
            if (value === v) return;
            sfx.clunk(true);
            onChange(v);
          }}
        >
          {name}
        </button>
      ))}
    </div>
  );
}

function Row({ name, hint, children }: { name: string; hint?: string; children: ReactNode }) {
  return (
    <div className="ck3-field">
      <div className="ck3-field-text">
        <span className="ck3-field-name">{name}</span>
        {hint && <span className="ck3-field-hint">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function Switch({ on, onChange, label }: { on: boolean; onChange: (on: boolean) => void; label: string }) {
  return (
    <SquishSwitch
      checked={on}
      onChange={(v) => {
        sfx.clunk(v);
        onChange(v);
      }}
      ariaLabel={label}
      trackColor="#1b1f2a"
      trackOnColor="#2a7a4e"
      thumbColor="#9aa3b8"
      thumbOnColor="#b9ffd6"
      width={64}
      height={34}
    />
  );
}

export function SystemsPage({ onParents, onReset, onAbout }: { onParents: () => void; onReset: () => void; onAbout: () => void }) {
  const t = useT();
  const d = t.deck;
  const mission = useMission();
  const answerMode = useSettings((s) => s.answerMode);
  const setAnswerMode = useSettings((s) => s.setAnswerMode);
  const typedCheck = useSettings((s) => s.typedCheck);
  const setTypedCheck = useSettings((s) => s.setTypedCheck);
  const review = useSettings((s) => s.mistakeReview);
  const setReview = useSettings((s) => s.setMistakeReview);
  const orbie = useSettings((s) => s.orbie);
  const setOrbie = useSettings((s) => s.setOrbie);
  const vibration = useSettings((s) => s.vibration);
  const setVibration = useSettings((s) => s.setVibration);
  const graphics = useQuality((s) => s.mode);
  const lowered = useQuality((s) => s.tier > 0);
  const setGraphics = useQuality((s) => s.setMode);
  const profile = useProfiles((s) => s.profiles.find((p) => p.id === s.activeId));
  const boost = profile?.timedBoost !== false;
  // the big boost's window, as it has followed this pilot's pace
  const paceSeconds = String(Math.round(paceMs(useGameStore((s) => s.progress.pace)) / 100) / 10);
  const checkName = (c: TypedCheck) => (c === 'auto' ? t.typedCheckAuto : t.typedCheckConfirmTouch);

  return (
    <div className="ck3-page ck3-systems">
      <Row name={t.answerBy} hint={answerMode === 'type' ? t.modeTypeHint : t.modeChoiceHint}>
        <Segments<AnswerMode>
          label={t.answerBy}
          value={answerMode}
          onChange={setAnswerMode}
          choices={[
            ['choice', t.modeChoice],
            ['type', t.modeType],
          ]}
        />
      </Row>
      {/* touch screens only: on a computer, typed answers always wait for Enter */}
      {answerMode === 'type' && isTouchDevice && (
        <Row name={t.typedCheckLabel} hint={typedCheck === 'auto' ? t.typedCheckAutoHint : t.typedCheckConfirmTouchHint}>
          <Segments<TypedCheck>
            label={t.typedCheckLabel}
            value={typedCheck}
            onChange={setTypedCheck}
            choices={[
              ['auto', checkName('auto')],
              ['confirm', checkName('confirm')],
            ]}
          />
        </Row>
      )}
      <Row name={t.orbieLabel} hint={orbie ? t.orbieOnHint : t.orbieOffHint}>
        <Switch on={orbie} onChange={setOrbie} label={t.orbieLabel} />
      </Row>
      <Row name={t.mistakeReviewLabel} hint={t.mistakeReviewHint}>
        <Switch on={review} onChange={setReview} label={t.mistakeReviewLabel} />
      </Row>
      {profile && (
        <Row name={t.timedBoostLabel} hint={boost ? t.timedBoostOnHint(paceSeconds) : t.timedBoostOffHint}>
          <Switch on={boost} onChange={(on) => useProfiles.getState().update(profile.id, { timedBoost: on })} label={t.timedBoostLabel} />
        </Row>
      )}
      {/* only where the device has a buzz to give (an iPhone only a tick as an answer's tapped; an iPad none) */}
      {canFeel && (
        <Row name={t.vibrationLabel} hint={canTick ? t.vibrationTapHint : t.vibrationHint}>
          <Switch
            on={vibration}
            onChange={(on) => {
              setVibration(on);
              if (on) haptics.correct(); // feel it, switching on
            }}
            label={t.vibrationLabel}
          />
        </Row>
      )}

      <Row name={t.graphicsLabel} hint={graphics === 'high' ? t.graphicsHighHint : graphics === 'low' ? t.graphicsLowHint : lowered ? t.graphicsAutoLoweredHint : t.graphicsAutoHint}>
        <Segments<QualityMode>
          label={t.graphicsLabel}
          value={graphics}
          onChange={setGraphics}
          choices={[
            ['auto', t.graphicsAuto],
            ['high', t.graphicsHigh],
            ['low', t.graphicsLow],
          ]}
        />
      </Row>

      <h3 className="ck3-page-section">👪 {d.grownUps}</h3>
      <div className="ck3-page-buttons">
        <button type="button" className="ck3-button" onClick={onParents}>
          📊 {t.cockpit.parents}
        </button>
        <button type="button" className="ck3-button" onClick={onAbout}>
          ℹ️ {d.about}
        </button>
      </div>
      <Row name={t.progressSection} hint={d.resetHint(pilotName(activeProfile(), t.defaultPilotName), missionName(t, mission))}>
        <HoldButton backgroundColor="#2a0f0c" fillColor="#ff5a3d" textColor="#ffc9bd" fillTextColor="#1a0503" holdTime={1600} doneLabel={d.resetDone} resetAfter={1600} onHold={onReset}>
          ⚠️ {d.holdToReset}
        </HoldButton>
      </Row>
    </div>
  );
}
