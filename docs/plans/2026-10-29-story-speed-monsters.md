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

## The Sun as an orb

The user pointed at ThreeUI's Energy Orb (threeui.com/backgrounds/energy-orb). It's in the MIT
Community set (`public/community-sync-report.json`), so it could be used, but ours was preferred:
`sunOrb.ts` is our own shader in its manner (smoke of two layers of noise on a sphere, the second
bent by the first, light round the rim, a glow out into space), with what the turn needs as
uniforms: its colours (deep, middle, hot smoke, rim, veins and their glow), the smoke's scale,
strength and speed (its own clock, so a change of speed never jumps), the glow, saturation,
brightness, and veins (ridges of a slower smoke creeping in from the rim). It's drawn by ogl on a
canvas of its own, at most 1024 px across (640 and 448 at the lighter graphics steps), and stamped
onto the story's canvas.

`StorySun` draws it as the Sun's face before it turns (`drawBright`, the face drawn on it) and as
the Black Sun's disc after (`drawDisc`, under its eyes and grin; the launch's Black Sun too).
`turning(k)` takes it from `WARM` to `EVIL`, halfway draining its colour and churning its smoke
hardest; the opening runs `k` from 10.2 s to 13.2 s, its glow flickering with the Sun's. After
the turn the warm corona dies away round the orb, not over it. Without WebGL the Sun's drawn as
before. With the CPU slowed 4× the story runs as it did (55–60 fps).

### Second pass (the user's notes)

- The veins looked naive and the 3 s colour fade was slow and unconvincing: both are gone. The
  turn is now a front: the dark eats the light from the rim in over 1.2 s (from 10.85 s), ragged
  with the smoke, glowing hot pink where it meets the gold, the last of the gold in the middle, the
  smoke surging as it goes (`turning(k)`, `uCorrupt`). Three octaves of noise instead of four and
  no vein noise make it a third cheaper; it's at most 768 px across (512, 384).
- The Black Sun's two shock circles are space rippling instead (`spaceRipple.ts`, our own, after
  the three.js forum's shockwave VFX): a WebGL canvas over the story's, shown only while it runs,
  draws the story's picture bent by two waves (the second 0.3 s after) racing out from the Sun over
  2.2 s, a lens's bend (pushed out ahead of the front and in behind it), the colours split a
  little. `StorySun.rippling` drops its awakening's rings; with reduced motion the rings stay.
- The launch charges then blasts (`LAUNCH.charge`, `blast`): from 2.4 s the engines' glow swells
  and pulses faster, specks of light spiral into them, the ship trembles and edges in (a seventh
  of the way) and the stars all but stop; at 4.2 s a flash and an impact frame, the ship's gone to
  the vanishing point in 0.3 s leaving eight fading afterimages, the stars are streaks in 0.15 s,
  manga speed lines flicker round (redrawn 24 times a second) and Earth falls away. Sounds:
  `chargeUp` and the charge buzz, then `ignite`, `hyperdrive` and a boom. It's 2 s shorter.
- Then the engines and the stars, on feedback ("don't reinvent the wheel"): the ship's engines
  burn with the main game's plume (scene/plume.ts's LaserFlow beam, through
  traffic/trafficPlume.ts, as Space Traffic and the bay's ship do), its power climbing from about
  0.45 at lift-off to 1.9 with the charge (EngineExhaust's build: 0.62 of the charge, flickering,
  and 0.6 of the ignition), so it heats from ion blue to hot pink; in the blast it's stretched back
  to where the ship was 50 ms before. The hand-made glow and specks are gone: the build-up is
  EngineGlow.tsx's in 2D, its numbers kept (the aura round the hull and the glow at the nozzles,
  cool to hot, pulsing at 7 + 26 × the charge; 44 sparks curling in; at ignition, decaying as
  e^(−3.2 t), a white flash and a shockwave ring over 0.55 s). The stars are no longer flung out
  of the vanishing point at the camera: they lie across the screen, turned to the ship's heading
  on screen (lift-off to vanishing point), and drift back past it, slower as it charges; in the
  warp they rush back along that heading, 4.5 diagonals a second at their nearest, each a streak
  of up to 0.6 of the diagonal, and the speed lines are slivers along it too. Without WebGL, and
  with reduced motion, the engines are glowing flames as before. The launch holds 56–60 fps with
  the CPU slowed 4× (58–60 on a phone-sized screen).
- Then the jump itself, on "make it resemble Star Trek's warp launches": the afterimages, the
  ignition's big flash and ring and the impact frame are gone, and so is the plume stretched
  back. It jumps as a starship does: its bow reaches the distance in 0.14 s (easing out) and its
  stern sets off 0.1 s after the blast and gets there at 0.3 s (easing in), and between them it's
  drawn 28 times, each as far into the distance as its stern will be there (a √ of the way, so
  they spread), added together into a streak in its own colours with a line of light down it,
  each copy as bright as it is far from the last (bunched near the stern, they'd blow out) and
  skipped if that's next to nothing; the ignition's glow at the nozzles is a third of the game's,
  so the hull stays in sight. When its stern gets there (`LAUNCH.flash`, 4.5 s, replacing the
  glint) the warp flash goes off at the vanishing point: a blue-white burst in 0.07 s dying away
  over 0.9 s, a long flare level across the screen as a lens's, four rays along and across its
  heading, a ring of light spreading and the screen catching it for a moment; `flareOut` and the
  boom's buzz (moved there from the blast, which keeps `ignite` and `hyperdrive`). With the CPU
  slowed 4× the launch holds 54–57 fps (57–58 on a phone-sized screen).
