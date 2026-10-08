import { useEffect, useMemo, useRef } from 'react';
import { motion } from 'motion/react';
import { skyNames, useSkyStore } from '../../game/useSkyStore';
import { orbitChoices, predictChoices, type EclipseState } from '../../game/eclipse';
import type { Side } from '../../game/splitSky';
import { useT } from '../../i18n/useLang';
import { sfx } from '../../audio/sfx';
import { haptics } from '../../audio/haptics';
import { Choices, StatusLine } from './parts';

const other = (s: Side): Side => (s === 'left' ? 'right' : 'left');
const SECONDS_PER_TICK = 0.22;

// The planet with this phone's moon. Its orbit is marked with one dot per
// tick, and every orbit counted sends the moon all the way round past them.
// A finished orbit ends facing the seam (towards the other phone), so at
// the eclipse the two moons point straight at each other across the gap.
function Orbit({ period, orbits, side, eclipse }: { period: number; orbits: number; side: Side; eclipse: boolean }) {
  const facing = side === 'left' ? 90 : -90;
  const R = 70;
  return (
    <div className={`ecl-scene is-${side} ${eclipse ? 'is-eclipse' : ''}`} dir="ltr">
      <svg viewBox="0 0 200 200" className="ecl-svg" aria-hidden>
        <circle cx="100" cy="100" r={R} className="ecl-ring" />
        {Array.from({ length: period }, (_, i) => {
          const a = ((facing + (360 / period) * i) * Math.PI) / 180;
          return <circle key={i} cx={100 + R * Math.sin(a)} cy={100 - R * Math.cos(a)} r={i === 0 ? 5 : 3.2} className={`ecl-tick ${i === 0 ? 'is-start' : ''}`} />;
        })}
        <circle cx="100" cy="100" r="30" className="ecl-planet" />
        <motion.g
          style={{ transformBox: 'view-box', transformOrigin: '100px 100px' }}
          initial={{ rotate: facing }}
          animate={{ rotate: facing + orbits * 360 }}
          transition={{ duration: Math.min(2.4, period * SECONDS_PER_TICK), ease: 'easeInOut' }}
        >
          <circle cx="100" cy={100 - R} r="11" className="ecl-moon" />
        </motion.g>
      </svg>
      {eclipse && <div className="ecl-shadow" />}
    </div>
  );
}

export function EclipsePlay({ state }: { state: EclipseState }) {
  const t = useT();
  const mySide = useSkyStore((s) => s.mySide);
  const role = useSkyStore((s) => s.role);
  const orbit = useSkyStore((s) => s.orbit);
  const predict = useSkyStore((s) => s.predict);
  const nextRound = useSkyStore((s) => s.nextRound);
  const round = state.rounds[state.roundIndex];
  const partner = state.players[other(mySide)];
  const partnerName = partner?.name ?? skyNames.fallback;
  const mine = state.orbit[mySide];
  const theirs = state.orbit[other(mySide)];

  const predictOptions = useMemo(
    () => (round ? predictChoices(round, mySide) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.roundIndex, mySide],
  );

  // fixed per step: the partner's progress re-renders this phone mid-choice
  const orbitOptions = useMemo(
    () => (round ? orbitChoices(round.periods[mySide], mine.step + 1) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.roundIndex, mySide, mine.step],
  );

  // sounds for this phone's own results, and the eclipse for both
  const prev = useRef(state);
  useEffect(() => {
    const before = prev.current;
    prev.current = state;
    if (before.roundIndex !== state.roundIndex) return;
    const a = before.orbit[mySide];
    const b = state.orbit[mySide];
    if (b.totalMisses > a.totalMisses || state.predict[mySide].misses > before.predict[mySide].misses) {
      sfx.wrong();
      haptics.thump();
    } else if (b.step > a.step) {
      sfx.pick(Math.min(3, b.step));
      haptics.tick();
    }
    if (state.phase === 'eclipse' && before.phase !== 'eclipse') {
      sfx.wormhole();
      haptics.correct(5);
    }
  }, [state, mySide]);

  if (!round) return null;
  const period = round.periods[mySide];
  const steps = round.steps[mySide];
  const ticks = Array.from({ length: mine.step }, (_, i) => period * (i + 1));
  const eclipse = state.phase === 'eclipse';
  const myPredict = state.predict[mySide];

  return (
    <div className="sky-play">
      <div className="sky-round">{t.sky.eclipse.round(state.roundIndex + 1, state.rounds.length)}</div>
      <div className="ecl-top">
        <div className="ecl-mymoon">🌙 {t.sky.eclipse.myMoon(period)}</div>
        <div className="ecl-partner">
          {partner?.avatar} {t.sky.eclipse.partnerProgress(partnerName, Math.min(theirs.step, round.steps[other(mySide)]), round.steps[other(mySide)])}
        </div>
      </div>

      <Orbit period={period} orbits={mine.step} side={mySide} eclipse={eclipse} />

      <div className="ecl-list">
        <span className="sky-chip-label">{t.sky.eclipse.myList}</span>
        <div className="ecl-ticks" dir="ltr">
          {ticks.map((v) => (
            <motion.span
              key={v}
              className={`ecl-tick-chip ${eclipse && v === round.eclipse ? 'is-eclipse' : ''}`}
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
            >
              {v}
            </motion.span>
          ))}
        </div>
      </div>

      <div className="sky-card">
        {state.phase === 'orbit' &&
          (mine.step < steps ? (
            <>
              <div className="sky-prompt">{t.sky.eclipse.orbitPrompt(period)}</div>
              <Choices
                key={`o${state.roundIndex}-${mine.step}-${mine.misses}`}
                choices={orbitOptions}
                misses={mine.misses}
                onPick={orbit}
              />
            </>
          ) : (
            <div className="sky-status is-pulse">{t.sky.waitPartner(partnerName)}</div>
          ))}

        {state.phase === 'predict' &&
          (!myPredict.done ? (
            <>
              <div className="sky-prompt">{t.sky.eclipse.predictPrompt}</div>
              <div className="sky-hint">{myPredict.misses > 0 ? t.sky.eclipse.predictHint : t.sky.eclipse.predictTalk}</div>
              <Choices key={`p${state.roundIndex}-${myPredict.misses}`} choices={predictOptions} misses={myPredict.misses} onPick={predict} />
            </>
          ) : (
            <div className="sky-status is-pulse">{t.sky.waitPartner(partnerName)}</div>
          ))}

        {eclipse && (
          <motion.div className="sky-lit" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 1.2 }}>
            <div className="sky-lit-title">{t.sky.eclipse.eclipseTitle}</div>
            <div>{t.sky.eclipse.eclipseAt(round.eclipse)}</div>
            <bdi dir="ltr" className="sky-lit-math">
              {round.periods.left} × {round.periods.right} = {round.eclipse}
            </bdi>
            <div>{t.sky.eclipse.eclipseAgain(round.eclipse)}</div>
            {role === 'host' ? (
              <button type="button" className="profile-primary" onClick={nextRound} autoFocus>
                {t.sky.eclipse.next}
              </button>
            ) : (
              <div className="sky-status">{t.sky.waitHost}</div>
            )}
          </motion.div>
        )}
      </div>
      <StatusLine />
    </div>
  );
}
