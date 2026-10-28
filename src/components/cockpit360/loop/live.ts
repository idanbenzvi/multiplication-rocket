// The loop as the space outside the cockpit sees it (Space.tsx reads it each
// frame; LoopShow.tsx writes it): how far round the ship has pitched (the
// stars, the nebula and the destination wheel past the glass the other way;
// the streaks and the numbers, flying along the nose, don't), how fast time
// runs out there (nearly stopped while a moment's frozen), and how much
// faster than usual the streaks rush past.

export const loopFx = {
  on: false,
  /** the ship's pitch round the loop (radians) */
  pitch: 0,
  /** the flight's time: 1 flying, nearly 0 frozen */
  time: 1,
  /** the streaks' speed and length, times this */
  warp: 1,
};

export function resetLoopFx() {
  loopFx.on = false;
  loopFx.pitch = 0;
  loopFx.time = 1;
  loopFx.warp = 1;
}
