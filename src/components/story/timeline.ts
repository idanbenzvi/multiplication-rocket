// The story's timing (docs/plans/2026-10-27-story-intro.md), kept apart from
// the drawing so it can be tested: the opening's five beats, each with its
// line of narration, and the clock that runs through them, waiting at the end
// of a beat while its line is still being read aloud.

/** the opening's beats: when each starts (seconds into the story), and the last one's end */
export const BEATS = [0, 8.5, 17, 26.5, 37] as const;
export const OPENING_END = 41.5;

/** what happens when, in the opening (seconds into the story) */
export const OPENING = {
  /** the Sun flickers, and its smile turns */
  flicker: 9.6,
  frown: 10.5,
  /** its light caves in (the eclipse's own clock starts here) */
  turn: 11,
  /** it becomes the Black Sun */
  awaken: 13.4,
  /** the little monsters are spat out, the first then, and one after another this far apart */
  spawn: [14.3, 0.55],
  /** the numbers are pulled in, from here to there */
  pull: [17.6, 24.4],
  /** the ships' engines sputter, from here to there, and go out */
  sputter: [19, 22.5],
  /** Orbie lights up beside Earth */
  orbie: 30.4,
  /** the shot fades out into the bay */
  fade: [40, OPENING_END],
} as const;

/** the launch, in seconds */
export const LAUNCH = {
  /** the engines light, and it lifts off */
  ignite: 0.5,
  /** it turns towards the Black Sun */
  turn: [0.9, 2.6],
  /** it gathers its power: its engines' glow swelling, light pulled into them, edging towards where it's going, space holding its breath */
  charge: [2.4, 4.2],
  /** then a blast, and it's gone into the warp in a blink, the stars smeared past it */
  blast: 4.2,
  /** a glint where it went */
  glint: 4.55,
  /** washing out to white */
  white: [5.5, 6.5],
  end: 6.6,
} as const;

/** the where-and-when typed in before a scene (film.tsx's Slate), a character at a time, a pause between its lines (seconds) */
export const TYPING = { char: 0.034, line: 0.3 } as const;

/** how many of `lines`' characters are typed in by `t` seconds */
export function typedAt(lines: readonly string[], t: number): number {
  let n = 0;
  let at = 0;
  for (let i = 0; i < lines.length; i++) {
    if (i) at += TYPING.line;
    if (t < at) return n;
    const k = Math.floor((t - at) / TYPING.char);
    if (k < lines[i].length) return n + k;
    n += lines[i].length;
    at += lines[i].length * TYPING.char;
  }
  return n;
}

/** how long `lines` take to type in (seconds) */
export function typeTime(lines: readonly string[]): number {
  return lines.reduce((sum, l) => sum + l.length * TYPING.char, 0) + Math.max(0, lines.length - 1) * TYPING.line;
}

/** a beat's index at `t` seconds into the opening */
export function beatAt(t: number): number {
  let i = 0;
  while (i + 1 < BEATS.length && t >= BEATS[i + 1]) i++;
  return i;
}

/** how long the story waits at a beat's end for its line to be read (seconds), at most */
export const HOLD_MAX = 5;

/**
 * The opening's clock: it runs on, but at the end of a beat it waits while
 * that beat's line is still being read aloud (no longer than HOLD_MAX), so
 * the pictures never run ahead of the words.
 */
export class StoryClock {
  t = 0;
  private held = 0;

  /** on by `dt` seconds; `speaking`: the narration is still reading */
  step(dt: number, speaking: boolean): number {
    const next = this.t + dt;
    const i = beatAt(this.t);
    const end = i + 1 < BEATS.length ? BEATS[i + 1] : OPENING_END - (OPENING.fade[1] - OPENING.fade[0]);
    if (speaking && this.t < end && next >= end && this.held < HOLD_MAX) {
      // (up to the end, and wait there)
      this.held += dt;
      this.t = end - 1e-6;
      return this.t;
    }
    if (next >= end) this.held = 0;
    this.t = next;
    return this.t;
  }
}

/**
 * The circle of radius `r` through points `a` and `b`, its centre off to
 * the left of the line from `a` down to `b` (on screen, y down): Earth's
 * edge in the launch, from the top of the screen to the bottom.
 */
export function circleThrough(a: { x: number; y: number }, b: { x: number; y: number }, r: number): { x: number; y: number; r: number } {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const half = Math.hypot(dx, dy) / 2;
  const rr = Math.max(r, half);
  const d = Math.sqrt(rr * rr - half * half);
  // (the line's normal pointing right, for a line going down)
  const nx = dy / (half * 2);
  const ny = -dx / (half * 2);
  return { x: mx - nx * d, y: my - ny * d, r: rr };
}
