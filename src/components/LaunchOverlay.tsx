import { motion } from 'motion/react';
import { getLevelConfig } from '../game/levels';
import { destinationName } from '../i18n/strings';
import { useT } from '../i18n/useLang';
import Hyperspeed from './reactbits/Hyperspeed';
import { LAUNCH_WARP } from './launchWarp';
import GradientText from './reactbits/GradientText';
import StarBorder from './reactbits/StarBorder';

interface Props {
  completedLevel: number;
  /** this launch opened a new addition stage */
  newStage?: number;
  onContinue: () => void;
}

export function LaunchOverlay({ completedLevel, newStage, onContinue }: Props) {
  const t = useT();
  const config = getLevelConfig(completedLevel);
  const next = getLevelConfig(completedLevel + 1);
  return (
    <div className="launch-overlay">
      <div className="launch-warp">
        <Hyperspeed effectOptions={LAUNCH_WARP} />
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
        {newStage !== undefined && (
          <motion.div
            className="launch-stage-up"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 1.6, type: 'spring', stiffness: 300, damping: 12 }}
          >
            <div className="launch-stage-up-title">{t.stageUpTitle}</div>
            <div>{t.stageUp(newStage)}</div>
          </motion.div>
        )}
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
