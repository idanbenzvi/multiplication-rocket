import { useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { skyNames, useSkyStore } from '../../game/useSkyStore';
import { groupColumns, MAX_MISSES, type Side, type SkyStage, type SkyState } from '../../game/splitSky';
import { additionStrategy } from '../../game/strategy';
import { useMission, useProfiles } from '../../profiles/useProfiles';
import type { DuoGame } from '../../game/duo';
import { EclipsePlay } from './EclipsePlay';
import { Choices, CodeDisplay, CodeEntry, StatusLine } from './parts';
import { distractors } from '../../game/distractors';
import { useT } from '../../i18n/useLang';
import { sfx } from '../../audio/sfx';
import { haptics } from '../../audio/haptics';
import { SkyGrid } from './SkyGrid';
import GradientText from '../reactbits/GradientText';
import { warpTo } from '../warpTransition';
import { flyHome } from '../../game/flight';
import { ModeArrival } from '../arrival/ModeArrival';
import { useArrivalCard, useCardEntrance, type ArrivalCard } from '../arrival/arrivalCard';
import './sky.css';

const other = (s: Side): Side => (s === 'left' ? 'right' : 'left');

function shuffled<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- lobby ----------

function Players() {
  const t = useT();
  const players = useSkyStore((s) => s.state.players);
  const mySide = useSkyStore((s) => s.mySide);
  return (
    <div className="sky-phones" dir="ltr" aria-label={t.sky.placePhones}>
      {(['left', 'right'] as const).map((side) => {
        const p = players[side];
        return (
          <div key={side} className={`sky-phone ${side === mySide ? 'is-me' : ''} ${p ? '' : 'is-empty'}`}>
            <span className="sky-phone-avatar">{p?.avatar ?? '…'}</span>
            <span className="sky-phone-name" dir="auto">
              {p?.name ?? ''}
            </span>
          </div>
        );
      })}
    </div>
  );
}

const GAME_ICONS: Record<DuoGame, string> = { split: '✨', eclipse: '🌑' };

function GamePicker() {
  const t = useT();
  const game = useSkyStore((s) => s.state.game);
  const chooseGame = useSkyStore((s) => s.chooseGame);
  // Eclipse Hunters is about multiples: a + host plays Split Sky only
  const games: DuoGame[] = useMission() === 'add' ? ['split'] : ['split', 'eclipse'];
  return (
    <div className="settings-segment sky-games">
      {games.map((g) => (
        <button
          key={g}
          type="button"
          className={`settings-option ${game === g ? 'is-on' : ''}`}
          aria-pressed={game === g}
          onClick={() => chooseGame(g)}
        >
          <span className="settings-option-name">
            {GAME_ICONS[g]} {t.sky.games[g].name}
          </span>
          <span className="settings-option-hint">{t.sky.games[g].hint}</span>
        </button>
      ))}
    </div>
  );
}

function HostLobby() {
  const t = useT();
  const code = useSkyStore((s) => s.code);
  const status = useSkyStore((s) => s.status);
  const players = useSkyStore((s) => s.state.players);
  const mySide = useSkyStore((s) => s.mySide);
  const swapSides = useSkyStore((s) => s.swapSides);
  const startGame = useSkyStore((s) => s.startGame);
  const both = !!players.left && !!players.right;
  return (
    <div className="sky-lobby">
      {code && (
        <>
          <div className="settings-label">{t.sky.yourCode}</div>
          <CodeDisplay code={code} />
          {!both && <div className="sky-hint">{t.sky.tellCode}</div>}
        </>
      )}
      {status === 'waiting' && !both && <div className="sky-status is-pulse">{t.sky.waiting}</div>}
      <StatusLine />
      {both && (
        <>
          <GamePicker />
          <div className="sky-hint">{t.sky.placePhones}</div>
          <Players />
          <div className="sky-side-row">
            <span>{t.sky.myPhoneIs}</span>
            <strong>{mySide === 'left' ? t.sky.left : t.sky.right}</strong>
            <button type="button" className="profile-secondary sky-swap" onClick={swapSides}>
              {t.sky.swap}
            </button>
          </div>
          <button type="button" className="profile-primary" onClick={startGame}>
            {t.sky.start}
          </button>
        </>
      )}
    </div>
  );
}

function ChosenGame() {
  const t = useT();
  const game = useSkyStore((s) => s.state.game);
  return (
    <div className="sky-chosen-game">
      {GAME_ICONS[game]} {t.sky.games[game].name}
      <div className="sky-hint">{t.sky.games[game].hint}</div>
    </div>
  );
}

function GuestLobby() {
  const t = useT();
  const status = useSkyStore((s) => s.status);
  const join = useSkyStore((s) => s.join);
  const players = useSkyStore((s) => s.state.players);
  if (status === 'connected' || status === 'lost') {
    return (
      <div className="sky-lobby">
        {players.left && players.right && (
          <>
            <ChosenGame />
            <Players />
          </>
        )}
        <StatusLine />
        {status === 'connected' && <div className="sky-status is-pulse">{t.sky.waitHost}</div>}
      </div>
    );
  }
  return (
    <CodeEntry hint={t.sky.enterCode} busy={status === 'connecting'} onJoin={join}>
      <StatusLine />
    </CodeEntry>
  );
}

// back to the game through the warp, the rocket flying home as it clears
function warpHome(e: React.MouseEvent<HTMLElement>) {
  warpTo(() => {
    useSkyStore.getState().closeSky();
    flyHome();
  }, e.currentTarget);
}

function Lobby({ card }: { card: ArrivalCard }) {
  const t = useT();
  const role = useSkyStore((s) => s.role);
  const host = useSkyStore((s) => s.host);
  const leave = useSkyStore((s) => s.leave);
  const entrance = useCardEntrance(card);
  return (
    <div className={`sky-panel ${entrance.className}`} style={entrance.style}>
      {/* the emoji stays outside: the gradient fill would flatten it */}
      <div className="sky-title-row">
        <span aria-hidden>📱📱</span>
        <GradientText className="sky-title" colors={['#6ad7ff', '#c9a4de', '#ffd77a', '#6ad7ff']} animationSpeed={4}>
          {t.sky.lobbyTitle}
        </GradientText>
      </div>
      {role === null && (
        <>
          <p className="sky-intro">{t.sky.intro}</p>
          <div className="settings-segment">
            <button type="button" className="settings-option" onClick={host}>
              <span className="settings-option-name">{t.sky.host}</span>
              <span className="settings-option-hint">{t.sky.hostHint}</span>
            </button>
            <button type="button" className="settings-option" onClick={() => useSkyStore.setState({ role: 'guest', status: null, error: null })}>
              <span className="settings-option-name">{t.sky.join}</span>
              <span className="settings-option-hint">{t.sky.joinHint}</span>
            </button>
          </div>
        </>
      )}
      {role === 'host' && <HostLobby />}
      {role === 'guest' && <GuestLobby />}
      <button type="button" className="profile-secondary sky-close" onClick={role ? leave : warpHome}>
        {role ? t.sky.back : t.sky.close}
      </button>
    </div>
  );
}

// ---------- playing ----------

function Chip({ label, rows, cols, mine, adding }: { label: string; rows: number; cols: number; mine?: boolean; adding?: boolean }) {
  return (
    <div className={`sky-chip ${mine ? 'is-mine' : ''}`}>
      <span className="sky-chip-label">
        {label}
      </span>
      <bdi dir="ltr" className="sky-chip-math">
        {adding ? `⭐ ${cols}` : `${rows} × ${cols} = ${rows * cols}`}
      </bdi>
    </div>
  );
}

function SplitPlay({ state }: { state: SkyState }) {
  const t = useT();
  const mySide = useSkyStore((s) => s.mySide);
  const role = useSkyStore((s) => s.role);
  const answer = useSkyStore((s) => s.answer);
  const nextRound = useSkyStore((s) => s.nextRound);
  const round = state.rounds[state.roundIndex];
  const partner = state.players[other(mySide)];
  const partnerName = partner?.name ?? skyNames.fallback;
  const stage: SkyStage | null = state.phase === 'count' || state.phase === 'join' ? state.phase : null;
  const mine = stage ? state[stage][mySide] : null;
  const whole = round ? round.cols.left + round.cols.right : 0;
  const myCols = round?.cols[mySide] ?? 0;
  const partnerCols = round?.cols[other(mySide)] ?? 0;
  // addition: each phone's group of stars, and the two added together
  const adding = round?.mission === 'add';

  // choices stay put for the whole question (a miss doesn't reshuffle them)
  const choices = useMemo(() => {
    if (!round || !stage) return [];
    const cols = stage === 'count' ? myCols : whole;
    const answerValue = round.rows * cols;
    const near = !adding
      ? distractors(round.rows, cols, 3)
      : stage === 'count'
        ? distractors(myCols, 0, 3, 'add')
        : distractors(round.cols.left, round.cols.right, 3, 'add');
    // in the whole-sky question, "just my half" is a tempting slip
    const half = round.rows * myCols;
    if (stage === 'join' && !near.includes(half)) near[2] = half;
    return shuffled([answerValue, ...near]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.roundIndex, stage]);

  // sounds for this phone's own results, and the lit wave for everyone
  const prev = useRef(state);
  useEffect(() => {
    const before = prev.current;
    prev.current = state;
    if (before.roundIndex !== state.roundIndex) return;
    for (const s of ['count', 'join'] as const) {
      const a = before[s][mySide];
      const b = state[s][mySide];
      if (b.misses > a.misses) {
        sfx.wrong();
        haptics.thump();
      } else if (b.done && !a.done && b.misses < MAX_MISSES) {
        sfx.correct(1, false);
        haptics.correct(1);
      }
    }
    if (state.phase === 'lit' && before.phase !== 'lit') {
      sfx.constellation();
      haptics.correct(5);
    }
  }, [state, mySide]);

  if (!round) return null;
  const lit = state.phase === 'lit';

  return (
    <div className="sky-play">
      <div className="sky-round">{t.sky.round(state.roundIndex + 1, state.rounds.length)}</div>
      {adding ? (
        <SkyGrid
          key={state.roundIndex}
          rows={Math.ceil(myCols / groupColumns(round))}
          cols={groupColumns(round)}
          sizeCols={groupColumns(round)}
          side={mySide}
          lit={lit}
          count={myCols}
        />
      ) : (
        <SkyGrid
          key={state.roundIndex}
          rows={round.rows}
          cols={myCols}
          sizeCols={Math.max(round.cols.left, round.cols.right)}
          side={mySide}
          lit={lit}
        />
      )}

      <div className="sky-card">
        {state.phase === 'count' && mine && (
          <>
            {!mine.done ? (
              <>
                <div className="sky-prompt">
                  {adding ? (myCols > 10 ? t.sky.yourHalfTens : t.sky.yourHalfAdd) : t.sky.yourHalf(round.rows, myCols)}
                </div>
                <Choices key={`c${state.roundIndex}-${mine.misses}`} choices={choices} misses={mine.misses} onPick={(v) => answer('count', v)} />
              </>
            ) : (
              <>
                <Chip label={t.sky.myHalf} rows={round.rows} cols={myCols} mine adding={adding} />
                <div className="sky-status is-pulse">{t.sky.waitPartner(partnerName)}</div>
              </>
            )}
          </>
        )}

        {(state.phase === 'join' || lit) && (
          <div className="sky-chips" dir="ltr">
            {/* in the order the phones sit, so the sum reads like the sky */}
            {(['left', 'right'] as const).map((side) =>
              side === mySide ? (
                <Chip key={side} label={t.sky.myHalf} rows={round.rows} cols={myCols} mine adding={adding} />
              ) : (
                <Chip key={side} label={t.sky.partnerHalf(partnerName)} rows={round.rows} cols={partnerCols} adding={adding} />
              ),
            )}
          </div>
        )}

        {state.phase === 'join' && mine && (
          <>
            {!mine.done ? (
              <>
                <div className="sky-prompt">{t.sky.wholeSky}</div>
                <div className="equation-row sky-equation" dir="ltr">
                  <span className="equation-operand">{adding ? round.cols.left : round.rows}</span>
                  <span className="equation-op">{adding ? '+' : '×'}</span>
                  <span className="equation-operand">{adding ? round.cols.right : whole}</span>
                  <span className="equation-op">=</span>
                  <span className="equation-operand">?</span>
                </div>
                {mine.misses > 0 && <JoinHint round={round} adding={adding} />}
                <Choices key={`j${state.roundIndex}-${mine.misses}`} choices={choices} misses={mine.misses} onPick={(v) => answer('join', v)} />
              </>
            ) : (
              <div className="sky-status is-pulse">{t.sky.waitPartner(partnerName)}</div>
            )}
          </>
        )}

        {lit && (
          <motion.div className="sky-lit" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
            <div className="sky-lit-title">{t.sky.litTitle}</div>
            <bdi dir="ltr" className="sky-lit-math">
              {adding
                ? `${round.cols.left} + ${round.cols.right} = ${whole}`
                : `${round.rows} × ${round.cols.left} + ${round.rows} × ${round.cols.right} = ${round.rows} × ${whole} = ${round.rows * whole}`}
            </bdi>
            {role === 'host' ? (
              <button type="button" className="profile-primary" onClick={nextRound} autoFocus>
                {t.sky.nextSky}
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

/** after a miss on the whole sky: add the halves (×), or a way to add the two groups (+) */
function JoinHint({ round, adding }: { round: SkyState['rounds'][number]; adding: boolean }) {
  const t = useT();
  if (!adding) return <div className="sky-hint">{t.sky.hintAdd(round.rows * round.cols.left, round.rows * round.cols.right)}</div>;
  const s = additionStrategy(round.cols.left, round.cols.right, t);
  return (
    <div className="sky-hint">
      {s.text}
      {s.text && s.math && ' '}
      {s.math && <bdi dir="ltr">{s.math}</bdi>}
    </div>
  );
}

function Summary() {
  const t = useT();
  const state = useSkyStore((s) => s.state);
  const role = useSkyStore((s) => s.role);
  const startGame = useSkyStore((s) => s.startGame);
  return (
    <div className="sky-panel">
      <GradientText className="sky-title" colors={['#6ad7ff', '#c9a4de', '#ffd77a', '#6ad7ff']} animationSpeed={4}>
        {t.sky.summaryTitle}
      </GradientText>
      <Players />
      <div className="sky-summary">
        {state.game === 'split' ? (
          <span>✨ {t.sky.summaryLit(state.lit)}</span>
        ) : (
          <span>🌑 {t.sky.eclipse.summaryEclipses(state.eclipses)}</span>
        )}
        <span>💎 {t.sky.summaryPerfect(state.perfect)}</span>
      </div>
      {role === 'host' ? (
        <>
          <GamePicker />
          <button type="button" className="profile-primary" onClick={startGame}>
            {t.sky.playAgain}
          </button>
        </>
      ) : (
        <div className="sky-status">{t.sky.waitHost}</div>
      )}
      <button type="button" className="profile-secondary sky-close" onClick={warpHome}>
        {t.sky.close}
      </button>
    </div>
  );
}

export function SplitSky() {
  const t = useT();
  const open = useSkyStore((s) => s.open);
  skyNames.fallback = t.defaultPilotName;
  if (!open) return null;
  // no fade of its own: it opens behind the warp (warpTransition.ts), which clears to show it
  return createPortal(<SkyOverlay />, document.body);
}

/** the mode, from opening to closing: the ship arrives over a planet at sunrise (ModeArrival), then the lobby */
function SkyOverlay() {
  const state = useSkyStore((s) => s.state);
  const avatar = useProfiles((s) => s.profiles.find((p) => p.id === s.activeId)?.avatar);
  const [card, arrived] = useArrivalCard();
  const { phase } = state;
  return (
    <div className="sky-overlay">
      <ModeArrival sky="horizon" avatar={avatar} show={phase === 'lobby'} onArrived={arrived} />
      {phase === 'lobby' ? (
        <Lobby card={card} />
      ) : phase === 'summary' ? (
        <Summary />
      ) : state.game === 'split' ? (
        <SplitPlay state={state} />
      ) : (
        <EclipsePlay state={state} />
      )}
    </div>
  );
}
