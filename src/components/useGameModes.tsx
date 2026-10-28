import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { useMission, useProfiles } from '../profiles/useProfiles';
import { useCrewStore } from '../game/useCrewStore';
import { useSkyStore } from '../game/useSkyStore';
import { useSunStore } from '../game/useSunStore';
import { useBossStore } from '../game/useBossStore';
import { useGameStore } from '../game/useGameStore';
import { bossProgress, bossReady } from '../game/blackSun';
import { DEV_MODE } from '../dev/devMode';
import { useT } from '../i18n/useLang';
import { playTrack } from '../audio/useAudio';
import { flyOffTo, type SheetLeave } from './warpTransition';
import { opsOf } from '../game/mission';

/**
 * The Black Sun for the active pilot: it opens once every fact of their
 * mission is mastered (and stays open after that), and till they've looked
 * at it, it's new.
 */
function useBossAccess() {
  const mastery = useGameStore((s) => s.progress.mastery);
  const mission = useMission();
  const activeId = useProfiles((s) => s.activeId);
  const record = useBossStore((s) => s.record);
  useEffect(() => useBossStore.getState().refresh(), [activeId, mission]);
  const ready = bossReady(mastery, mission);
  useEffect(() => {
    if (ready && !record.unlocked) useBossStore.getState().unlock();
  }, [ready, record.unlocked]);
  const open = record.unlocked || ready;
  return { unlocked: open || DEV_MODE, isNew: open && !record.seen, wins: record.wins, ...bossProgress(mastery, mission) };
}

export interface GameMode {
  key: 'crew' | 'sky' | 'sun' | 'boss';
  icon: ReactNode;
  name: string;
  hint: string;
  disabled: boolean;
  /** how whatever it's in leaves: handing over to another sheet, or into the warp */
  leave: Exclude<SheetLeave, null>;
  /** start it, from what was tapped (the warp ripples out from there) */
  run: (card: Element) => void;
}

/**
 * The ways to play together and the final boss, for the active pilot: the
 * top bar's sheet (GameModesButton) and the cockpit's tall screen
 * (cockpit360/pages/ModesPage.tsx) both start them from here.
 */
export function useGameModes() {
  const t = useT();
  const pilots = useProfiles((s) => s.profiles.length);
  // the two-phone game of a pilot without × is Split Sky (Eclipse Hunters is about multiples)
  const mission = useMission();
  const boss = useBossAccess();
  const modes: GameMode[] = [
    {
      key: 'crew',
      icon: '👩‍🚀👨‍🚀',
      name: t.crew.flyTogether,
      hint: pilots >= 2 ? t.crew.flyTogetherHint : t.modes.needTwoPilots,
      disabled: pilots < 2,
      leave: 'handoff',
      run: () => useCrewStore.getState().openSetup(),
    },
    {
      key: 'sky',
      icon: '📱📱',
      name: t.sky.card,
      hint: opsOf(mission).includes('mul') ? t.sky.cardHint : t.sky.games.split.name,
      disabled: false,
      leave: 'warp',
      run: (card) => flyOffTo(() => useSkyStore.getState().openSky(), card),
    },
    {
      key: 'sun',
      icon: '👾',
      name: t.sun.card,
      hint: t.sun.cardHint,
      disabled: false,
      leave: 'warp',
      run: (card) => {
        // Monster Sun's soundtrack starts with the warp, from the tap (browsers only start music from one)
        playTrack('sun');
        flyOffTo(() => useSunStore.getState().openSun(), card);
      },
    },
    {
      key: 'boss',
      icon: <span className="boss-card-icon" />,
      name: t.boss.card,
      hint: !boss.unlocked ? t.boss.cardLocked(boss.have, boss.need) : boss.wins > 0 ? t.boss.cardCured(boss.wins) : boss.isNew ? t.boss.cardNew : t.boss.cardHint,
      disabled: !boss.unlocked,
      leave: 'warp',
      run: (card) => {
        // its own soundtrack starts with the warp, from the tap
        playTrack('boss');
        flyOffTo(() => useBossStore.getState().openBoss(), card);
      },
    },
  ];
  return { modes, boss };
}
