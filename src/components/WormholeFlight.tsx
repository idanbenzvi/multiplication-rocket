import { useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import { sfx } from '../audio/sfx';
import { useT } from '../i18n/useLang';
import { ROCKET_PORTHOLE, rocketSvg } from './scene/illustrations';
import { useProfiles } from '../profiles/useProfiles';
import { colorForLevel } from './scene/palette';
import LightTunnel from './reactbits/LightTunnel';

interface Props {
  level: number;
  /** false while the challenge is being played: the tunnel is mounted but hidden */
  active: boolean;
  onDone: () => void;
}

const DURATION_S = 3.1;

// The fly-through: a portal irises open onto React Bits' LightTunnel, the
// rocket dives into it (shrinking toward the vanishing point while the
// tunnel zooms in, which reads as accelerating), "DOUBLE BOOST" pops, and a
// flash carries us back out — where the boost is applied (onDone).
//
// Mounted for the whole challenge, not just the flight: while inactive it's a
// hidden 2×2px box, so the tunnel's WebGL context and shader are already
// compiled when the portal opens. Otherwise that compile stalls the first
// second of the animation, and compiled shaders can't be shared with a
// separate warm-up context — it has to be this same instance.
export function WormholeFlight({ level, active, onDone }: Props) {
  const t = useT();
  const avatar = useProfiles((s) => s.profiles.find((p) => p.id === s.activeId)?.avatar);
  const rocketSrc = useMemo(
    () => `data:image/svg+xml;utf8,${encodeURIComponent(rocketSvg(colorForLevel(level)))}`,
    [level],
  );

  useEffect(() => {
    if (!active) return;
    sfx.wormhole();
    const id = window.setTimeout(onDone, DURATION_S * 1000);
    return () => window.clearTimeout(id);
    // onDone is stable for the life of this overlay
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // The portal and tunnel elements stay mounted across active/inactive (only
  // their animation targets change) so LightTunnel is never re-created.
  return (
    <div className={`wormhole-flight ${active ? '' : 'is-prewarm'}`} aria-hidden="true">
      <motion.div
        className="wormhole-portal"
        initial={{ clipPath: 'circle(0% at 50% 45%)' }}
        animate={
          active
            ? { clipPath: ['circle(0% at 50% 45%)', 'circle(28% at 50% 45%)', 'circle(150% at 50% 45%)'] }
            : { clipPath: 'circle(0% at 50% 45%)' }
        }
        transition={active ? { duration: 1.1, times: [0, 0.45, 1], ease: 'easeOut' } : { duration: 0 }}
      >
        <motion.div
          className="wormhole-tunnel"
          initial={{ scale: 1, rotate: 0 }}
          animate={active ? { scale: [1, 1.15, 2.6], rotate: [0, 25, 90] } : { scale: 1, rotate: 0 }}
          transition={active ? { duration: DURATION_S, times: [0, 0.4, 1], ease: 'easeIn' } : { duration: 0 }}
        >
          <LightTunnel
            cableColor="#6ad7ff"
            pulseColor="#ff6ad5"
            tunnelColor="#5227ff"
            tunnelOpacity={0.3}
            speed={0.6}
            pulseSpeed={4}
            cableCount={26}
            glow={1.4}
            brightness={1.2}
            mouseInteraction={false}
          />
        </motion.div>
      </motion.div>

      {active && (
        <>
          <motion.div
            className="wormhole-rocket"
            initial={{ y: '32vh', scale: 1, opacity: 0, rotate: 0 }}
            animate={{ y: ['32vh', '30vh', '-4vh'], scale: [1, 1, 0.08], opacity: [0, 1, 1], rotate: [0, -4, 12] }}
            transition={{ duration: 2.1, delay: 0.5, times: [0, 0.2, 1], ease: 'easeIn' }}
          >
            <img src={rocketSrc} alt="" />
            {avatar && (
              <span
                className="rocket-porthole-avatar"
                style={{
                  left: `${ROCKET_PORTHOLE.x * 100}%`,
                  top: `${ROCKET_PORTHOLE.y * 100}%`,
                  width: `${ROCKET_PORTHOLE.radius * 200}%`,
                }}
              >
                {avatar}
              </span>
            )}
          </motion.div>

          <motion.div
            className="wormhole-boost"
            initial={{ opacity: 0, scale: 0.3 }}
            animate={{ opacity: [0, 1, 1, 0], scale: [0.3, 1.15, 1, 1.4] }}
            transition={{ duration: 1.3, delay: 1.6, times: [0, 0.25, 0.75, 1] }}
          >
            {t.wormholeBoost} <span className="wormhole-boost-x">×2</span>
          </motion.div>

          <motion.div
            className="wormhole-flash"
            initial={{ opacity: 0 }}
            // Ends fully white; App's warp-burst fades that out over the scene.
            animate={{ opacity: [0, 0, 1, 1] }}
            transition={{ duration: DURATION_S, times: [0, 0.75, 0.9, 1] }}
          />
        </>
      )}
    </div>
  );
}
