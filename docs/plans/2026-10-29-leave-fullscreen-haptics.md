# Leaving, full screen on an iPhone, and the buzz (2026-10-29)

Three requests in one: ask before a computer's tab is closed, get Safari's bars out of the way on an
iPhone on its side, and vibrate at every moment that deserves it on iPhone and Android phones. A
fourth came in at the same time: a second soundtrack for the game itself.

## Closing the tab (browser/leave.ts)

`askBeforeLeaving()` (main.tsx) listens for `beforeunload` and cancels it, so the browser asks
"Leave site?". The wording is the browser's: pages haven't been allowed their own for years, and the
browser only asks once the page has been clicked or typed in (a tab opened and closed untouched just
closes). It's only on a computer (`(hover: hover) and (pointer: fine)`): phone browsers seldom ask,
and tabs are closed there from the tab switcher. Not in the Android app, and not on the dev server,
which reloads the page on every change.

The game leaving on purpose calls `leaveQuietly()` first, which keeps it quiet for 1.5 s: restoring
a backup (which reloads), and the About page's email address (a `mailto:` link, which some browsers
treat as leaving).

Checked in Chromium: a reload after a click asks (and Cancel keeps the game); never clicked, or on
a phone, it doesn't.

## Safari's bars, on an iPhone on its side (browser/SwipeUp.tsx)

No iPhone browser lets a page go full screen (the Fullscreen API is only for video there), and
`minimal-ui` went in iOS 8. What Safari does do is tuck its bars away as the page scrolls down. The
game doesn't scroll, so:

- On an iPhone, in the browser (not from the Home Screen, which has no bars), on its side, when the
  window is more than 20 px short of `100lvh` (the height with the bars away), a sheet asks
  **Swipe up to fill the screen** (החליקו למעלה למסך מלא), a finger sliding up over chevrons.
- While it shows, `html.swipe-room` puts 240 px of room under the page (`body::after`), and the sheet
  lets a swipe through to the page (`touch-action: pan-y`), so the swipe scrolls the page.
- Safari tucks its bars away, the window grows to `100lvh`, the sheet and the room go, and the page,
  no longer taller than the window, is back at the top: the game where it was, with the whole height.
- If the bars come back (a tap at the screen's top edge) it asks again. **Not now**, or a browser
  whose bars stay however it's scrolled (scrolled 60 px and still there 1.2 s later), and it doesn't
  ask again for the rest of the visit.

Checked in Chromium with an iPhone's user agent and its bars faked (the window's height made 54 px
short): the sheet, the room, the swipe, the bars going (the sheet and room gone, back at the top),
coming back (asked again), and a browser that keeps its bars (given up). The bars themselves can only
be seen going on a real iPhone.

## The buzz (audio/haptics.ts, audio/TapTick.tsx)

**Android** has the Vibration API (Chrome, Firefox, Samsung Internet, and the Android app, which now
asks for the VIBRATE permission). Each moment has a pattern of its own:

| Moment | Buzz |
| --- | --- |
| a right answer / a mistake / a pick | the rev (longer with a streak) / a thump / a tick (as before) |
| a streak's milestone, a badge, a round won, the academy finished | `cheer`: ta-da-DAA, once the answer's own buzz is done (bigger for a promotion, the boss cured, the loop done) |
| the engines charging (a bonus round's departure, the hangar, the Acceleration Road, the afterburner's lever) | `charge`: pulses growing and closing in, for as long as the charge |
| a lift-off (a new level, a departure's ignition, the bay, the story, a crew flight, the academy, the Canyon Run's GO) | `launch`: a rumble building to a roar |
| a warp, a hyperdrive jump, a mission switch, back to the game from the cockpit | `warp`: a swell |
| into a wormhole, the dive into the canyon | `wormhole`: a longer swell |
| a monster waking (the story, Monster Sun, the Black Sun) | `monster`: a slow, heavy wobble |
| the Black Sun shattering, the afterburner igniting | `boom` |
| the Canyon Run: a gate (bullseye, close, miss), a scrape (at most every 120 ms), a spire, levelling out, the count | `gate`, `scrape`, `crash`, `bump` |
| the afterburner loop: the slash, each burst, time stopping | `slash`, `bump`, `freeze` |
| the title's glitch to the top bar | `glitch`: a stutter |

A celebration waits for the buzz under way to finish (`buzz(pattern, after)`); anything else cuts in.
The cockpit's turbulence and its menus stay quiet.

**iPhone**: no browser there has the Vibration API. Safari (17.4 on) ticks when a switch
(`<input type="checkbox" switch>`) is flipped, and pages used to flip a hidden one from code for a
buzz whenever they liked; iOS 26.5 stopped that, and only a finger's own tap on a switch ticks now.
So the answers' buttons (the game's, every bonus round's, the boss's, the crew's, Monster Sun's,
Split Sky's, the academy's) and the number pad's keys each carry an invisible switch over the whole
button (`TapTick`, last in the button; `position: relative` given to the button only where nothing
else positions it; not over a disabled one). The finger flips it, Safari ticks, and the tap goes on to
the button as ever. That's all an iPhone can have: a tick per answer, the same for right and wrong
(the page can't know which before the tap, and can't buzz after it). iPads have no vibration motor.

Ship systems → Vibration shows wherever there's something to feel, with its own hint on an iPhone.

Checked in Chromium: on an Android phone, a right answer revs, a badge's ta-da follows it, and a level
launch roars; with an iPhone's user agent, each answer button has its switch over all of it, a tap
reaches the switch, the button's click runs once and the answer counts. The tick itself can only be
felt on a real iPhone. haptics.test.ts: the charge's shape, a celebration waiting its turn and cut off
by a new moment, the scrape's limit, and nothing with the switch off.

## The game's second soundtrack (audio/useAudio.ts)

*The Little Explorer's Comet* (public/audio/little-explorers-comet.mp3) joins the theme as the game's
own music. `playGameMusic()` picks one at random: on each new level (the launch, `fresh`: the one
playing may well carry on) and back from Monster Sun, a crew flight or the Black Sun (keeping one
already picked on the way: the warp home and the close both ask). Both carry on where they left off,
as the theme always did; the others start from the top. The game still starts on the theme. The comet
is fetched only once it's needed, and is readied (played a moment, muted) on the first tap, so it can
start at a launch on an iPhone too.

Checked in Chromium: over a run of launches it changed to the comet, back to the theme and to the
comet again, carrying on in between.
