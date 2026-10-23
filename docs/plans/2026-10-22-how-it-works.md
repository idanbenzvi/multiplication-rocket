# "How does it work?": a page for curious kids

The user asked for it on 2026-10-22: a page explaining to curious children how the game works
behind the scenes, told with the game's own graphics, live, not with screenshots. Built on
2026-10-23 (`src/components/how/`, see "As built" below).

## Idea

A short tour, a page at a time, each with one of the game's real pieces running in it:

1. **The rocket is a picture.** Its art drawn on a flat card that turns to face you (show the card
   turning, then flat-on).
2. **Speed is stars.** The streaks and the camera's field of view widening (a slider: speed).
3. **The engine is a light shader.** The plume's flowing light (a slider: power), and how the
   computer works out every dot's colour each frame.
4. **The canyon's water isn't moving.** Colour cycling, as in the About page (shown with its palette
   turning beside it).
5. **The game remembers.** How it picks questions: facts you miss come back sooner, ones you know
   come back days later (the boxes, with a fact hopping between them).
6. **Orbie thinks with you.** How a hint is built: the same steps the computer takes.
7. **Sounds are made, not recorded.** A tone, a chime and the engine's hum built from waves (buttons
   to play each).

Written for 7 to 10 year olds, in English and Hebrew, read aloud like the Academy. It opens from
the About page, and maybe from the cockpit. The game is paused while it's open.

## As built

Seven pages, one per idea above. What changed from the idea:

- **The rocket is a sticker** walks the camera round the card over a launch pad's grid, rather
  than turning the card. With *Turn it to face me* on (the game's billboard), it always looks the
  same; off, it turns paper-thin. *Show the card* outlines it.
- **Speed** and **the engine** fly the pilot's own ship as `FlyingRocket` does, with the game's
  bloom. `SpeedStreaks` takes a speed of its own (`source`). The engine page outlines the plume's
  rectangle (*Show where it runs*) and counts its dots on screen, and frames a second, live.
- **The canyon** runs `CycleScene` from the page's clock (`clock`: stopped or turning, and `mark`
  dims the pixels outside every cycling range). Its loader moved to `about/sceneData.ts`, and the
  strips are three of its ranges (water, sparkles, engine), turning with it.
- **The boxes** use `memory.ts`'s `review()` on a made-up day count, starting from a fact that's
  been missed twice in three answers.
- **Orbie** waits `stuckAfterMs` at a usual pace (7 s), then lights up; its window uses
  `thinkSteps` with the pilot's own mastery. Its step wording moved to `computer/stepText.ts`.
- **Sounds**: an `AnalyserNode` between the sounds and the speakers. `sfx.correct` takes a
  `dest`, `sfxContext` is the effects' audio context, and the hum is `humGraph` into it.

It opens from the About page (not the cockpit); closing it goes back to the About page, and *Back
to my rocket* on the last page goes back to the game. It's loaded the first time it's opened.

