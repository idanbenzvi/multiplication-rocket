# The launch bay: choosing a pilot and a ship, and launching it

## Goal

The game starts in a hangar. After the studio's intro, choosing who's flying, naming a new pilot or
editing one happens there, over the pixel-art launch bay the kids picked (Gemini, "Select your
vehicle!"). The kids' own idea was the ships standing on the bay's launch pad, one at a time, to
switch between until they find theirs. A ship leaves in a flare of light, and the next is beamed
down onto the pad. The one they choose takes off with the game's own engine, slowly, the pad
billowing jet smoke, the sign wishing them luck. It plays its own music, Apex Ascent. (A ribbon
saying "Time to save the galaxy, good luck <name>!" in React Bits' ASCIIText was tried and taken
out: it wasn't good enough.)

## The bay (components/bay/)

- **LaunchBay.tsx** is mounted in App. It's open while any screen holds it (BayScreen). It's
  portalled over everything below the studio splash, fades in and out, and pauses the game, so the
  3D scene stops drawing. It also switches to Apex Ascent and back (the 'bay' track); those
  changes happen with the tap that opens or closes it.
- **The picture** is drawn by the About page's CycleScene, which now takes a `src`. The art is laid
  out at exactly half its size, 688 × 384, with crisp pixels. It covers the screen, the pad as near
  the middle as the art allows, and the top always in view so the sign shows (layout.ts, tested).
- **BayScreen** is how a screen shows in the bay. It holds the bay open, says what the sign reads
  and which ship stands on the pad, and draws into the bay's slot: either as a card beside the pad
  (where there's 360 px of room to its right) or over the bay, below the sign. Under a screen
  opened over it, it keeps its state, hidden. What's inside can put a ship on the pad (the BayShip
  context): a pilot's card shows their ship, with the animal they're choosing at its window.
- **Screens.** ProfileGate (the welcome, "Who's flying?", a new or edited pilot), the top bar's
  pilots (PilotButton), and the hangar's ship chooser (Hangar.tsx).

## Colour cycling, keeping the picture's own colours (scripts/bay-cycle.py)

The canyon is pure palette cycling: 256 colours, a few runs of them rotating. This picture has far
too many colours for that. So each moving pixel keeps its own colour, and a range holds **gains**
instead of colours: how much brighter or dimmer, and which way tinted, a pixel is at each step of
the cycle (bytes, × 64, so up to 4×).

- **The files.** The JSON carries `base` (the picture, `hangar.webp`, lossy at 92, which looks the
  same as lossless at a third of the size). Index 0 is a pixel that doesn't move; the shader
  multiplies the picture's colour by the turned, blended gain.
- **What moves** (14 ranges), each with its phase laid out so the turning reads as motion:
  - the sign's arrows chase in towards its words;
  - the ceiling lamp pulses;
  - glitter falls and twinkles through its beam, and a haze shimmers down it;
  - the three lasers flow out from their emitters;
  - the steam on the left billows up;
  - the stars beyond the bay doors twinkle, the galaxy swirls out from its core, and its sun glows;
  - the pad's ring breathes;
  - the big red, yellow and green lamps blink in turn, and the little console lights twinkle;
  - the screens' lines scroll.
- **The robot arms** stay still, and the green and blue lightning round them is painted out of
  the picture (filled in from what's round it, lightly dithered like the art).
- **The sign's words** are taken off the picture (filled with the panel's own dark blue) and
  written by the game: lit cyan in a pixel font (Silkscreen, with Rubik Pixels for Hebrew), in
  dots, sloping with the panel. They change with the screen: WELCOME, PILOT! · WHO'S FLYING? ·
  NEW PILOT · PILOT CARD · SELECT YOUR VEHICLE! · GOOD LUCK!

## The pad (PadShip.tsx, PadSmoke.tsx)

- **Switching ships.** The ship there blazes white, with a lens flare (a blazing core, a long blue
  anamorphic streak, rays, and ghosts down the line through the middle of the screen). Then it
  comes apart (ShipDissolve.tsx): the ship as drawn on the pad, on a canvas, in blocks of 1.5 of
  the picture's pixels, each leaving at a turn set by an 8 × 8 ordered-dither (Bayer) matrix and
  its row, so it dithers away from the top down. Each block heats white, then rises as a glowing
  pixel into the ceiling lamp, speeding up and turning to the beam's light. About 0.9 s later
  React Bits' LaserFlow beam (its "floor" preset) drops from the lamp
  onto the pad. The next ship appears from the top down as the beam's front passes, glowing like a
  hologram until the beam lands and flashes, with a scan line at the edge. The beam is drawn over
  the ship, adding light, and fades once the ship is there. The port can replay its drop on the
  same canvas and reports its front each frame. Choosing is done with ‹ ›, ← →, a swipe across the
  ship, or the ship's name; ‹ › run the other way in Hebrew.
- **The jets.** React Bits' FlyingButton smoke (reactbits/JetSmoke.ts): its GPU fluid simulation,
  lit and shaded. Four jets fire down under the pad's rim, all the time. Idling, a little steam
  rolls out over the floor and thins away (less buoyant, fading faster). Launching, they fire all
  out and a great cloud billows up, dying down as the ship climbs away.
- **The take-off** (4.5 s):
  1. The hull glows, pulsing faster and faster, as the engine lights with the game's own plume
     (the LaserFlow plume, scene/plume.ts, through Space Traffic's TrafficPlume). It's given the
     glow the game's bloom gives it, in its colour by power.
  2. At 0.8 s, a white flash and a shockwave ring burst from the nozzle, the bay trembles, and the
     ship lifts off slowly.
  3. Then it climbs away out of the top, the plume growing longer and hotter (cyan, violet, pink).
     The plume stops at the pad, where its blast of light spreads.
  4. It's gone at 3.6 s. The bay fades out at 4.5 s, the pad's smoke settling, and the game's
     rocket flies in. The ship is saved then.
  5. The music goes back to the theme without a tap. The launch's tap unlocks it beforehand, for
     browsers that only play sound after one.
- **Reduced motion.** The picture is still, ships just appear and go, there's no smoke and no beam,
  and the ship fades away.
