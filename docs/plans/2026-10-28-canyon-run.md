# Canyon Run: a mini-game in the 360° cockpit

The user, 2026-10-28: a mini-game in the cockpit, maybe a generative canyon run with left and
right manoeuvres. Then a maths mechanic of its own, not one the game already has (answer buttons,
lanes of numbers to pick from). Then: React Bits for the UI's effects and encouragement, terrain
from researched procedural generation that suits the cockpit's WebGL and three.js, and make it
engaging, full of motion blur, jitters, light and shadow, unique and well made.

## The mechanic: the canyon is a number line

Each gate spans the canyon with a stretch of the number line, 21 numbers, every fifth named; its
fact is over it. The pilot steers to where the answer is and flies through. The verdict is how far
off they were: **bullseye** (right on it), **close** (one or two off), or a **miss**; for the last
two the windscreen draws the gap as a little number line from the number flown through to the
answer, so the miss itself is a lesson in difference ("2 further on"). It's estimation and
place on the number line, which no other mode asks for, and steering is the answer: there are no
buttons.

- The answer is never in the last three numbers either end of its stretch (`windowFor`), so the
  ends give nothing away; the stretch never starts below 0.
- No × 1 (the ruler would be all the help), no answer twice in a run, the pilot's hard facts
  first (the game's own `pickFact` weighting), each fact either way round.
- A tap steps one number, holding glides, a slide drags; let go and it settles on the nearest
  number, so a tap is exactly one number and a glide never ends between two.
- Near a gate the number line is painted on the floor too (a line along the canyon for each
  number, the ship's own lane lit), and an amber bar on the gate's pane shows where the ship will
  go through, so the pilot can read off where they are long before the gate.
- Bullseyes boost the ship; bullseyes in a row raise its cruising speed, so a good run is a faster
  one. Walls and spires slow it, but nothing ends a run.

**Rewards:** each gate's answer goes into the pilot's facts like any other (bullseye right, else
wrong; source `canyon` in the answer log). Fuel (half a right answer's for a bullseye, a fifth for
a close one) is paid only on the first finished run at each level (`canyonRecord.paidLevel`), and
never past 99%, so the launch is still the game's. Later runs are for fun and for the pilot's best.

## The canyon: procedural terrain

All in `src/components/cockpit360/canyon/`, deterministic from a seed (mulberry32), so the worker
and the flight's own collision checks see the same rock.

- **Noise** (`noise.ts`): Perlin gradient noise with the improved quintic fade, summed into fBm,
  and Musgrave's ridged multifractal (`1 - |n|`, squared, each octave weighted by the last), whose
  creases read as eroded rock.
- **The heightfield** (`field.ts`): a tableland of fBm with a canyon carved along a path made of
  three summed sines (the bends). The canyon's half-width wanders and widens to fit a gate's ruler
  where one is; its floor is sand in dunes with scree at the walls' foot; the walls rise as
  `1 - exp(-t / 11)` and are **terraced** (the height quantised in 9.5-unit steps with a smooth
  riser), the ledges of eroded sandstone; their foot is **domain-warped** (Quilez: the noise's
  input offset by noise) so the walls wander and overhang-like bays form, and creased with ridged
  **gullies**. Beyond the rim, mesas and buttes from thresholded noise stand in the haze, and
  spires (rock columns) stand in the canyon now and then, never near a gate.
- **Meshes** (`chunk.ts`): the canyon is built in 96-unit chunks, a grid along and across it, dense
  where the walls rise and coarse out to the horizon (1000 units across), two qualities (phones
  get the lighter one). Each vertex bakes what the shader can't afford per pixel:
  - **soft shadows**: a ray marched towards the sun through the heightfield, keeping the nearest
    miss (Quilez's soft-shadow `k·h/t` penumbra), on every other vertex and filled in between;
  - **ambient occlusion**: how open the point is to the sky (its cavity against its neighbours,
    and how deep in the canyon it is);
  - the **strata** coordinate (height, tilted and wavering) and the point's place across (for the
    floor's number line).
- **A worker** (`terrain.worker.ts`, `builder.ts`) builds chunks off the main thread and hands
  their buffers over (transferred), nearest first, two at a time; without workers it falls back
  to one a frame. A chunk takes 30 to 45 ms, so on the main thread it would hitch every chunk.
- **Shading** (`materials.ts`): sandstone strata from a 1D texture, sand on the flats, the sun
  wrapped a little round (light scattered in rock) times the baked shadow, the violet sky's
  ambient times the baked occlusion, light bounced off sunny rock, a rim light on edges against
  the sun, and a haze that's the sky's own colour along the view (lilac, warming towards the sun)
  thickening with distance, plus a low mist in the canyon, so the canyon fades into the sky with
  no seam.
- **Sky**: deep violet overhead, high cloud streaks lit from below, a glow low in the sky
  brighter than white (so it blooms), and the first stars. The star at its heart is the **next
  destination** (the game's own planet drawing, with a glow in its colour), so the canyon's sun is
  where the pilot's going next.
- **The world's colours** (`palette.ts`): the canyon's on the destination being flown to (or, on
  an arrival, the one just reached), and its sandstone, sand and bounced light lean towards that
  world's colours (`LOOKS`: its base and band, alternating up the strata), its air towards its glow,
  and the sunlight towards the star's. Each colour keeps its own brightness and takes some of the
  other's hue (`tint`), so the strata stay as light and dark as they were and every world still
  reads as a sunset canyon.

## The flight and the feel

The user, after the first version: steer with the mouse too; show the number being aimed at in the
HUD with the cockpit's rolling digits; let the speed follow how well the pilot's doing, so it
doesn't frustrate; land in a canyon now and then at a level's end (every 3 or 4 levels, at random,
never into the asteroid belt), after a short blazing descent into the destination with React Bits
effects and a zoom-blur to white into the cockpit; tint the terrain with the destination's colours;
make the star in the sky the next destination; and throw the pilot about in the seat with the
ship's moves.

- **The mouse** steers too (`useMouseSteering`): its place across the screen, short of a tenth at
  either edge, is the place across the ruler, settled on the nearest number (`Run.aimAt`).
- **AIM** under the crosshair: the number the ship's heading for (`Run.aimed`: where the finger or
  mouse is dragging it, else where it's settling, else where it is), in React Bits' Counter, the
  cockpit's rolling, motion-blurred digits.
- **Adaptive pace** (`Run.pace`): every gate moves it, +0.05 for a bullseye, -0.04 for a close one,
  -0.09 for a miss, between 0.65 and 1.25 of the cruising speed, starting at 0.85; it's kept with
  the pilot's canyon record, so the next run starts where the last ended.
- **The seat** (`World.tsx`): the ship's sideways and forward acceleration, smoothed, drive the
  head on an underdamped spring: a swerve yaws the view a little against it and rolls it outward,
  speeding up tips it back. It's added into the cockpit's jolt with the shudders; not with reduced
  motion.

- **The ship never moves; the world does** (`World.tsx`): the canyon's matrix is the ship's
  attitude (heading, pitch, bank from its sideways speed and the canyon's curve) inverted, times
  the cockpit's nose pitch, so the horizon tilts as it banks into a bend, all through the
  cockpit's real glass.
- **Motion blur** (`Effects.tsx`'s lens): the rock smears in towards where the ship's heading,
  more the faster it goes and sideways as it turns, masked to the glass by the panorama's alpha
  (the cockpit itself isn't moving). Dust streaks past; sparks fly off a scraped wall.
- **Jitter** (`view.jolt`, `view.kick`): the cockpit shudders with the speed, more near a wall,
  jolts against one, and a bullseye kicks the field of view wider for a moment.
- **Light**: the cockpit's own lights follow the sun (warm and bright in it, cool in the rock's
  shadow, from a sunlight march at the ship); the sun flares on the lens with a streak and ghosts
  when it's in view; a bullseye floods the canyon gold; diving in and climbing out white the view.
- **Sound** (`sfx.ts`): wind (brown rumble, a rushing band, hiss) rising with speed and near the
  walls, beacons as a gate nears, ticks per number stepped, a chord through a gate (rising with
  the run in a row), scrapes and thuds.
- **React Bits**: DecryptedText (MANUAL CONTROL), ParticleText (the title gathering), ShinyText
  (BULLSEYE, NEW BEST), GradientText (in a row, the results' title), ElectricBorder (the results
  card), CountUp (its numbers), StarBorder (Fly again).
- **Reduced motion**: slower, no shudders, no blur, no kick or ring, softer flashes; the run's the
  same.

## Steering, polished

The user, after flying it: one number per step looked awful with the mouse, or moving more than
one number; debounce the keys and add up their presses with a counter; give the mouse smooth
control with a target reticle to choose how far to go; polish the effects; vary the ground.

- **The slide** (`Run.slide`): the stiff spring per number is gone. Every way of steering sets a
  place across (`steer.target`), and the ship closes on it at the speed that's keen near it
  (5.5 × the distance), never faster than it could stop in time (√(2·a·0.7·distance)) nor than 36
  units/s, taken up with a lag of 1/14 s and never pushed harder than 150 units/s². So several
  numbers are one smooth slide, accelerating, cruising and easing in, and a new target mid-slide
  bends it rather than restarting it. Where it's going stays put through a gate (every ruler's
  numbers are at the same places across), and short of a wall it waits where the canyon widens.
- **Keys** (`Run.press`): each press moves the target one number on from where it's going (not
  from where the ship is), so taps add up; a press within 35 ms of the last that way (by the
  event's own clock) is a bounce, or ← and A together, and counts once. Held 0.26 s it glides: the
  target runs ahead of the ship at 24 units/s, up to 32 held longer; let go, it's the number the
  ship would naturally stop at, never one behind it.
- **The mouse and a finger** (`Run.aimAt`, `dragTo`): the place pointed at, drawn gently towards
  the nearest number while it moves (a smooth detent, `x − 0.6·sin 2πx / 2π` of a lane), and
  snapped to it once the pointer has rested 0.2 s. Knocked off a spire, the pointer waits 0.6 s
  before steering again, so it doesn't drive the ship straight back into it.
- **The bank** follows the slide (its speed, and a quarter of its push), so braking no longer
  throws the horizon the other way.
- **The steering rail** (`SteerRail`, moved each frame outside React): the next gate's 21 numbers
  across the screen, where the mouse steers by them; the ship's chevron; where it's going, its
  number boxed; the span between; and the count still to go (`Run.pending`), popping as taps add
  up. With a mouse the **reticle** replaces the cursor: the number under it, and how far that is
  from the ship's (*+4 ▶*), green once it's there.
- **On the floor and the gate**: the lane it's going to is outlined in pulsing gold until it's
  there (`uGoal`, in the terrain's and the bridge's shaders).
- **Through a gate** its pane bursts into shards of light (110 gold for a bullseye, 60 cyan for a
  close one, 28 violet for a miss), flung out round the ship ahead of it and keeping most of its
  speed, so they stream back past the glass; a bullseye's ring comes twice.
- **The floor** (`Canyon.floors`, `ground`): stretches of 420 to 880 units, each kind in turn in
  a shuffled order (dunes on the way down at the start): dunes, in long ridges under their
  ripples; a dry lake's clay, flat, its cracks Worley's cell edges in the shader, warped so they
  wander, some wider, each plate its own shade and its edges curled to the light; a wash, a stream
  bed winding along it (two sines), its sand darker and speckled with pebbles, and boulders (a
  hashed 11-unit grid, more near the stream, 2 to 3.6 across, off the walls' scree and out of the
  gates' number lines) dark with desert varnish. The chunks carry each point's clay, wash and
  boulder (a `ground` attribute); building them costs the same as before (~32 ms a chunk on the
  worker).

## Arriving in a canyon

`arrival.ts` counts down levels in the pilot's canyon record (`due`, 3 or 4 at random, set the
first time). At a level's end the launch card peeks (`canyonAhead`, which doesn't count it) and
says a canyon's next; flying on takes it (`takeCanyon`). If it's due on the asteroid belt
(`NO_CANYON`) it's put off to the next level's end. Not on a crew flight.

`Descent.tsx` (over everything): the game pauses, the run's built (`useCanyon.start(…,
'arrival')`: phase `ready`, its world held behind a veil) while the ship, from behind, dives into
the destination for 3.9 s: the world grows from ahead to the whole sky, stars streaking, the air
turning its colour; round the ship a shock glow, flame tongues, 260 embers and streaks of air, and
JetSmoke's four jets streaming smoke back; ENTERING ATMOSPHERE (DecryptedText) over the world's
name (ShinyText). From 2.85 s the scene scales up, blurs and brightens, and the white comes up.
Under the full white the cockpit opens (`useCockpit.open(null, { before })`, its 'white' way:
there at once, looking out at the canyon, its music the run's, *Canyon Sprint*) and the run flies; the white holds
till the canyon's first stretch has been drawn (`seen`, at most 3 s), then clears as the lens
flashes, and CANYON RUN · ON MARS comes up over the windscreen. The run's results say **Fly on**,
which closes the cockpit back to the game, as does ending the run early. Skip (or Escape, Enter,
Space) jumps to the white. With reduced motion the dive's a still picture that fades.

## Checked

27 unit tests (`canyon.test.ts`): determinism, a clear floor and walls, gates widening the canyon,
spires away from gates, the floor's stretches and boulders, shadows, chunk seams, 16-bit indices,
ruler windows, judging, the gates for ×, + and mixed, a full run that stays in bounds, a perfect
run, taps and glides, taps adding up into one slide (and a bounce counting once), following the
mouse, scraping, the pace, aiming, when a canyon's due (and never the asteroid belt), and the
palette.
In the browser: desktop, phone, Hebrew and reduced motion, flown on an autopilot through all
eight gates to the results; manual runs on Mars, Neptune, the alien planet and Earth; an arrival
from the level's end through the descent, the run, its results, Fly again and back to the game;
60 fps with the CPU slowed 4× on a production build, the descent included (the cockpit's half
second of setting up falls under the white).
