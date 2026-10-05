import { motion } from 'motion/react';
import { getLevelConfig } from '../game/levels';
import { destinationName } from '../i18n/strings';
import { useT } from '../i18n/useLang';
import Hyperspeed, { type HyperspeedOptions } from './reactbits/Hyperspeed';
import { hyperspeedPresets } from './reactbits/HyperSpeedPresets';
import GradientText from './reactbits/GradientText';
import StarBorder from './reactbits/StarBorder';

interface Props {
  completedLevel: number;
  onContinue: () => void;
}

// Module-level so the reference is stable — Hyperspeed rebuilds its whole
// three.js scene whenever effectOptions changes identity.
const PRESET = hyperspeedPresets.one as unknown as HyperspeedOptions; // preset tuples widen to number[]
const WARP_OPTIONS: Partial<HyperspeedOptions> = {
  ...PRESET,
  initialBoostMs: 1800,
  colors: {
    ...PRESET.colors,
    background: 0x140e24,
    leftCars: [0xff9d76, 0xffd77a, 0xf2a6c0],
    rightCars: [0xc9a4de, 0x7ec4b0, 0x8fb8d9],
    sticks: 0xffd77a,
  },
};

export function LaunchOverlay({ completedLevel, onContinue }: Props) {
  const t = useT();
  const config = getLevelConfig(completedLevel);
  const next = getLevelConfig(completedLevel + 1);
  return (
    <div className="launch-overlay">
      <div className="launch-warp">
        <Hyperspeed effectOptions={WARP_OPTIONS} />
      </div>
      <div className="launch-warp-hint">{t.holdToBoost}</div>
      <motion.div
        className="launch-overlay-card"
        initial={{ opacity: 0, scale: 0.6, y: 60 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ delay: 0.9, type: 'spring', stiffness: 260, damping: 16 }}
      >
        <div className="launch-overlay-emoji">🚀{config.destinationEmoji}</div>
        <GradientText
          className="launch-overlay-title"
          colors={['#ffd77a', '#ff9d76', '#f2a6c0', '#c9a4de', '#ffd77a']}
          animationSpeed={3}
        >
          {t.blastOff}
        </GradientText>
        <p>
          {t.youReached} {config.destinationEmoji} {destinationName(t, config)}!
        </p>
        <p className="launch-overlay-next">
          {t.nextStop} {next.destinationEmoji} {destinationName(t, next)}
        </p>
        <StarBorder
          className="launch-overlay-button"
          color="#ffd77a"
          speed="3s"
          thickness={3}
          backgroundColor="#2d224a"
          textColor="#ffd77a"
          borderColor="rgba(255, 215, 122, 0.4)"
          onClick={onContinue}
        >
          {t.nextMission}
        </StarBorder>
      </motion.div>
    </div>
  );
}
