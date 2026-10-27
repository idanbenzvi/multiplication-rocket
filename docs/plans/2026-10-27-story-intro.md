# The story: an intro, a launch, and the SPACE TIMES logo

The user, 2026-10-25 to 27: the game was criticised for having no plot and no intro. The story
they asked for: the Sun turns into the Black Sun, in a cool transforming effect, and starts
sucking all the numbers out of the universe; ships are stranded, space traffic stops, and Earth
needs a saviour. Earth recruits *you*, the pilot, and gives you Orbie, the ship's computer, to fly
with you and help. It's counting on you to reach the Black Sun and defeat it. Told with the game's
own art, animated (not still images), with captions and narration in English and Hebrew.

Then, after the Sun turns dark, a launch: the ship lifts off from Earth at the bottom left and
turns 35 to 45 degrees into space. Earth is below it, its edge a glowing line running from the top
of the screen to the bottom, with a purple haze and an aura (after React Bits Pro's Horizon Bloom,
its planet on its side; the component itself is Pro, so this is our own). The stars warp,
stretching and blooming as it climbs, and the ship zooms off into a tiny dot. The screen fades out
at the end, like a movie.

And the game's logo becomes SPACE TIMES (the Gemini art, docs/brand), its background removed, its
objects and its chrome letters animated.

Then, on the preview (2026-10-27), more film to it: before a scene, as in sci-fi films, the date,
*Location: Near Earth Orbit* and so on typed in at the bottom left in glowing green. Each number
swallowed bursts like React Bits Pro's Glyph Stream, and the Sun throws off glowing ASCII
characters, the numbers it's corrupted, like its Liquid ASCII (both Pro, so both our own). The
numbers each get a little bloom instead of the glow round them, and Earth is drawn like
Kurzgesagt's.

## The flow, the first time the game opens

1. The studio's opening, as now.
2. **The story's opening** (`story/StoryOpening.tsx`), over the launch bay. Its first frame waits
   under a **▶ Start** (the tap lets the music and the voice start), and *Skip* goes straight to
   the bay. Black bars slide in, top and bottom, like a film. One continuous shot, about 40 s:
   1. *Everything in space runs on numbers.* The Sun shines and ships glide past it, numbers
      twinkling all round like stars.
   2. *But one day, the Sun turned bad.* The camera closes in. The Sun flickers, two angry eyes
      open, and its light caves in. Its shell goes dark from the rim inwards, a ring of violet
      flashes, and a whirlpool spins up round a black hole: the Black Sun.
   3. *It's swallowing every number in the universe.* The camera pulls back. The numbers are
      pulled in from everywhere, spiralling in and swallowed. The ships' engines sputter and go
      out, and they drift to a stop.
   4. *Earth is in danger.* The camera turns to Earth, its lights flickering. Orbie lights up
      beside it.
   5. *Will it be you?* The camera pushes in on Earth and the shot fades into the bay.
3. **The bay**: the new-pilot form is the enlistment. Its sign reads *EARTH NEEDS A PILOT!*.
4. **The hangar**: for a new pilot, Orbie greets them by name over the ships (*Hi Maya! I'm
   Orbie…*), and they pick the ship.
5. **Take off**: the pad's launch as now, then **the launch** (`story/StoryLaunch.tsx`), about 9 s:
   - Earth's night side fills the lower left, its city lights flickering. Its edge is a razor
     line of light from the top of the screen to the bottom, with an atmosphere band of pink to
     violet, a purple haze and an aura where the Black Sun hangs above it.
   - The pilot's own ship (their ship, colour and animal) lifts off at the bottom left and turns
     about 40° into space. Its flame grows, and it shrinks as it pulls away.
   - The stars stretch out from where it's heading, longer and brighter, glowing.
   - The ship becomes a glint, then a dot. The screen washes out to white.
6. **The title**: out of the white, the SPACE TIMES logo, animated. It holds, then flies to its
   place in the top bar as the game appears, and the pilot's ship flies in (`flyHome`).

The game is paused under all of it. With reduced motion, the camera cuts from shot to shot and
nothing streaks or shakes. The words are always on screen, and narration reads them aloud (the
browser's voice, as the Academy's 🔊 does; 🔇 turns it off, and it's kept). The story's clock waits at
the end of a beat while its line is still being read (5 s at most), so the pictures never run ahead
of the words (`story/timeline.ts`, tested). A recorded voice can replace it beat by beat later.

The music is the launch bay's (Apex Ascent), which is already playing under the opening and plays on
through the hangar, the launch and the title; the theme comes back as the game begins. Watching it
again from About, it plays over About's own, which comes back after.

## Once, and again

- **The opening** plays the first time the game opens on a device with no pilots, once
  (`story-seen`). Existing players aren't made to watch it.
- **The launch** is each new pilot's first take-off.
- **About** gets *▶ Watch the story*: the opening, then the launch with the pilot flying now,
  then back.

## The words

| | English | Hebrew |
|-|-|-|
| 1 | Everything in space runs on numbers. The stars shine with them, and every ship flies on them. | כל מה שיש בחלל פועל בעזרת מספרים. הכוכבים זורחים בזכותם, וכל חללית טסה בזכותם. |
| 2 | But one day, the Sun turned bad. It became the Black Sun! | אבל יום אחד, השמש התקלקלה. היא הפכה לשמש השחורה! |
| 3 | Now it's swallowing every number in the universe. Without numbers, no ship can fly. All of space has stopped! | עכשיו היא בולעת את כל המספרים ביקום. בלי מספרים, אף חללית לא יכולה לטוס. כל החלל נעצר! |
| 4 | Earth is in danger! Orbie, the cleverest ship's computer, is ready to help. Now Earth needs a brave pilot to fly to the Black Sun and stop it. | כדור הארץ בסכנה! אורבי, מחשב החללית הכי חכם, מוכן לעזור. עכשיו צריך טייסים אמיצים שיטוסו אל השמש השחורה ויעצרו אותה. |
| 5 | Will it be you? | אולי זה אתם? |
| bay | EARTH NEEDS A PILOT! | כדור הארץ צריך אתכם! |
| Orbie | Hi Maya! I'm Orbie, your ship's computer. I'll fly with you and help with every question. Pick our ship, and let's go stop the Black Sun! | שלום מאיה! אני אורבי, מחשב החללית שלכם. אטוס איתכם ואעזור בכל שאלה. בחרו לנו חללית, ויוצאים לעצור את השמש השחורה! |
| launch | Earth is counting on you, Maya! | כדור הארץ סומך עליכם, מאיה! |

## How it's drawn

- Both shots are canvas 2D scenes in the style of the arrivals' (`arrival/eclipse.ts`,
  `arrival/horizon.ts`, the Black Sun's): gradients and glows added with `lighter`, the traffic's
  ship sprites and glows (`traffic/trafficArt.ts`), the hyperspace streaks (`arrival/dropOut.ts`),
  and the pilot's ship from `shipArt`. Each is a class stepped by time (`draw(ctx, w, h, t)`),
  so it's easy to seek and to test frame by frame.
- Orbie is the game's own `Orb` (React Bits), laid over the canvas where the scene says.
- **The where and when** (`film.tsx`'s `Slate`): typed a character at a time (34 ms each, 0.3 s
  between lines, `timeline.ts`'s `typedAt`, tested), a key's click with each (`sfx.type`), in
  VT323 (Rubik Pixels for Hebrew), green with a glow and a faint flicker; at the bottom left
  (the right, in Hebrew), above the film's bar. The opening's is today's date and time, *Near
  Earth orbit* and *space traffic: normal*; the launch's, the launch pad, the pilot and the
  mission. The lights go down after ▶ Start, it's typed on the dark, and the pictures come up
  under it (the story's clock waits till then); in the launch it's gone as they do, since the
  ship lifts off where it is. With reduced motion it's just there.
- **The numbers' bloom** (`bloom.ts`): each drawn once with its colour hazed close round it, a
  tighter glow on its strokes and their middles nearly white, added with `lighter`. The Black
  Sun's scene takes a `numberArt` the story's sun overrides, so the swallowed ones bloom too.
- **What the Black Sun does to them** (`corruption.ts`, the story's sun only; the boss fight is
  unchanged): the Black Sun's scene now says where each number touched the dark (`swallowed`).
  There a crown of glyph tiles is thrown up and falls back (rounded squares from violet to pink,
  a sheen along the top, their characters flickering fast and then settling, each with a short
  tail, one tile to a grid cell). From the far side what's left of it gushes out as liquid made of
  characters: lumps under the sun's pull, spread over a grid of terminal-shaped cells (0.6 as wide
  as tall), each cell's character by how thick it is there (`.:-~=+*#%@`), violet to pink, the
  number's own digits and glitches flickering in it while it's fresh. Arcs of it leap off the sun
  all the while, most falling back like prominences. The grid's drawn on a canvas of its own 30
  times a second, a terminal's refresh, and moved with the sun in between (about 56 fps with the
  CPU slowed 4×, in dev).
- **Earth** (`earth.ts`), Kurzgesagt's way: a ball, its lands, deserts, ice and clouds kept in
  longitude and latitude, rounded off, and seen from far off as it turns (an orthographic view;
  what's round the back is pressed to the edge). A blue sea, flat green lands, a light blue haze
  round and just inside its edge, a soft shine on its lit side, and its night side in four soft
  bands (each the shadow's half-ellipse a little further round). 640 cities' lights, crowded
  round the great cities, on land only, twinkling, going out as the numbers go. The launch sees
  the same Earth's night side, turned so Europe is just below the bloom.
- The overlays sit over the bay (under the studio's opening), pause the game, and handle Back,
  Esc and *Skip*.

## The logo

`scripts/space-times-logo.py` cuts docs/brand/space-times-logo.jpg into layers in
`public/brand/space-times/` (about 360 KB in all), and writes where each one is to
`src/components/logo/layout.ts`:

- **the whole logo** without its background. Dark pixels joined to the edge are background, and
  what's left glowing on it gets its brightness as its opacity (unmultiplied from the navy, so the
  glow stays a glow on anything dark). Shapes the neon encloses stay solid. The faint stars and
  nebula round it go.
- **the letters** as a mask, for a chrome shine sweeping across them.
- **the + × − ÷ tokens**, cut out whole (their dark faces solid), to orbit round the globe along
  the ellipse fitted through them, nearer and bigger on the near side, hidden by the globe on the
  far side, and passing behind the letters. Each one's spot on the ring is filled with the stretch
  of ring beside it.
- **the little rockets**, cut out to swoop off along their trails and come back.
- **the globe's lines** as a mask, for a light scanning down them; **the lightning**, to flicker;
  and **the sparkles'** places, to twinkle.

`SpaceTimesLogo.tsx` lays them together with CSS (masks and keyframes, a `plus-lighter` blend
for the light) and moves the tokens round their orbit each frame; with reduced motion it's still.
It replaces MULT-ROCKET / SPACESUM / MIX-ROCKET in the top bar (sized to it, hanging over its edge a
little; on a phone it shares the first row with the level), and it's the story's title card.
