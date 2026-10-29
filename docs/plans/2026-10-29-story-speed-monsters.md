# The story, smooth again, and the little monsters (2026-10-29)

## Why it got slow

Measured on a production build (`vite build --minify false`), the real GPU, the CPU slowed 4×
(about a tablet) and a 2× screen, frame by frame through the whole story:

| | opening, swallowing (20–30 s) | opening, on Earth (40–45 s) | launch |
|---|---|---|---|
| 57973a6 (the first story) | 60 | 59 | 57–58 |
| 6331d47 (corruption, Kurzgesagt Earth) | 46–54 | 48 | 51–55 |
| d686fc6 (before this) | 43–51 | 48 | 51–55 |
| now | 56 | 59–60 | 58–59 |

A CPU profile put it on what 6331d47 added:

- the Black Sun's liquid ASCII: a few thousand characters drawn 30 times a second, each from a
  canvas of its own; and still made while the camera was on Earth, the Sun off screen;
- the glyph splash, the same way;
- Earth's 640 city lights, each with a save, translate, rotate, scale and restore.

## What changed

- `bloom.ts`'s `Atlas`: sprites of one size side by side on one canvas, each painted once; the
  liquid's glyphs, the splash's tiles and the monsters' characters are drawn from one image each.
- `corruption.ts`: the liquid's grid is only what's on screen (and a margin), so nothing at all
  is made while the Sun's out of shot.
- `earth.ts`: each lamp's transform is set outright (`setTransform`), with no trigonometry.
- `openingScene.ts`: Earth, while it's no bigger than 1400 device px across, is drawn into a
  picture of its own 20 times a second (or when it's grown 4%) and moved with the camera; close
  up, it's drawn as it is.

Tried and left out (no difference beyond noise): making the liquid 20 times a second instead of
30, and its picture at 1× instead of the screen's pixels.

## The little monsters

`littleMonsters.ts`, on the opening's camera. From 14.3 s (story time), one every 0.55 s, the
Black Sun spits one out (`StorySun.spit`: a gush of its liquid that way and a splash at its rim)
of Monster Sun's ghost, bat, octopus, alien and slime (`roster.ts`'s `LITTLE_ONES`), on a 17-cell
grid rather than 29. Its letters fly out of the liquid just inside the rim, in its violet and
pink, into place, taking on the monster's colours; its eyes pop open at 1.05 s; then it wobbles
off, curving a little, faster and growing a little, looking where it's going, its letters
flickering, its mouth chomping, its limbs swaying as Monster Sun's do, gone by about 25 s. Each
has `sfx.spawn` (a gloopy pop and a chirp) and a little buzz. With reduced motion they fade in
where they'd be, still. They cost nothing measurable: the opening holds 56–60 fps (4× slower
CPU), 59–60 on a phone-sized screen at 3×.
