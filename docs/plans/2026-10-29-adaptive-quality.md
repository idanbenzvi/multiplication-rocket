# Graphics that adapt: lighter on a device that can't keep up

The user, 2026-10-29: when the game's frame rate stays under 30 for more than a few seconds, the
hardware is struggling, so lower the effects' fidelity, intensity or resolution until it can run at
30 or more again. Asked whether a grown-up should also be able to set it by hand: yes.

## Watching (settings/quality.ts)

`startQuality()` runs from the start (main.tsx), on every device. It's one requestAnimationFrame
loop counting frames over windows of about a second. A frame more than 250 ms after the last is a
hitch (something loading or opening), not how the device is keeping up, so it isn't counted, and
nothing's counted while the page is hidden. Each window is judged (`judge`, a pure function, tested):

- **Struggling**: under 28 frames a second (under 30, with room for a screen held to 30 a second,
  as a phone saving its battery does, so it isn't mistaken for struggling). After 3 seconds of it in
  a row, one step down.
- **Smooth**: 50 a second or more. After 15 seconds of it in a row, it tries the step above.
- In between (keeping up, just), it stays where it is either way.
- After any change, and at the start, it waits 4 seconds before judging, so what's changed has
  settled (canvases resized, effects remade).
- If it falls back down within a minute of stepping up, the step above was too much: the wait
  before trying it again doubles (15 s, 30, 1 min, 2, at most 4).

The step's kept for this device (`multiplication-rocket:quality`, never in a backup), so a tablet
that struggled starts where it left off next time.

## The steps

| | Everything (0) | Lighter (1) | Lightest (2) |
|---|---|---|---|
| Canvas sharpness (times the screen's pixels, each canvas's own limit too) | up to 1.5–2 | 1 | 0.75 (1 where there's writing) |
| The game's 3D scene | glow (bloom) and speed blur | the same | neither; half the stars |
| The cockpit | multisampled lens effects | no multisampling | no multisampling, less sharp |
| The Canyon Run | by the device | the low version | the low version |
| Stardust Run | a 96 × 640 fluid | a coarser fluid (64 × 448, fewer passes) | the 2D trail instead |
| The page itself | frosted glass behind panels | the same | no frosted glass (`backdrop-filter`) |

Sharpness is the biggest saving on a tablet: its screen has 2 or 3 pixels per point, and a step to 1
draws a quarter as many. Every canvas reads it through `pixelRatio(max, floor)`, as it's made or
resized; the step changing sends a resize, so those that size themselves on one take it up at once,
and the 3D scenes (the game's and the cockpit's) follow it as they draw. What's chosen at the start
of a round (the Canyon Run's version, the stardust) takes it up the next time. The aurora stays at
every step: it's one pass, and without it the sky loses its colour.

## By hand (the cockpit's Systems)

**Graphics: Auto · High · Low** (*גרפיקה: אוטומטי · גבוהה · נמוכה*). Auto is the above; its hint
says when it's lowered the graphics on this device. High is everything, always; Low the lightest,
always. Choosing Auto again judges afresh.

## Dev mode

The dev panel shows the graphics (mode and step), and the hiccup log notes each step, with what was
on screen.

## Checked

quality.test.ts (9): down after 3 s struggling, not before; settling first, then down again, never
past the lightest; a moment's struggle among smooth ones forgiven; in between, staying; up after
15 s smooth; falling back doubling the wait; a screen held to 30 a second not struggling; how sharp
a canvas draws at each step. In the browser, the page slowed to about 20 frames a second (a busy
wait each frame): down a step after about 4 s (the game's scene from 1.5 to 1 times the pixels),
down again 8 s later (0.75, no frosted glass); let go, back up a step 17 s later, kept in storage
each time.
