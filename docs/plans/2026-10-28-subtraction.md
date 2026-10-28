# Subtraction: a − mission and a +− mix

## Goal

Subtraction was the step missing before division (the user, 2026-10-28). The user's choices:
missions **−** and **+−** (sums and differences mixed) alongside ×, + and ×+; the core game and an
Academy first, the bonus rounds that need rethinking for − left for later; and three stages that
mirror addition's. A difference is never negative.

## Missions

`Mission` (one operation) gains `'sub'`; `PilotMission` gains `'sub'` and `'addsub'`
(`opsOf('addsub') = ['add', 'sub']`). `PILOT_MISSIONS` is append-only because the answer log stores
a mission by its index (`['mul','add','mix','sub','addsub']`); `MISSION_MENU` is the order pilots see
(× + − ×+ +−). A difference's key puts the number taken from first (`"13-5"`), and a difference
never swaps its order (`commutes`), where a sum's or product's question can be shown either way.
Each mission keeps its own journey; the facts are the pilot's, shared as before (`covers` goes by
the key's sign).

## Stages (game/subtraction.ts, game/stages.ts)

| Stage | Range | Example | What's being learned |
| --- | --- | --- | --- |
| 1 | take away within 10 | 7 − 3 | taking away, counting back, think of the sum |
| 2 | back from teens | 13 − 5 | back to ten first: 13 − 3 − 2 |
| 3 | numbers up to 100 | 52 − 27 | tens then ones, breaking a ten (borrowing) |

- The table is the addition table read backwards: (b + d) − b for b, d in 1..10, so stage 1 is the
  45 differences from 10 or less, stage 2 the 55 from 11 to 20; on the map it's a 10 × 10 grid of b
  by d, each cell showing the number taken from.
- Stage 3 tracks kinds, as addition does: tens − tens, two-digit − one-digit, two-digit −
  two-digit, the last two with and without borrowing (`2d-1d:b`), and makes up a fresh problem of
  the kind picked (never a table fact, never below 1).
- `Progress.subStage` is subtraction's own stage beside `Progress.stage` (addition's), so a +−
  pilot climbs both, each as its facts are mastered (`climbStages`); a launch that opens one says
  which (`stageUp: StageStep`). 80% of a stage mastered opens the next; one question in five reviews
  the earlier stages.

## Teaching

- **Hints** (strategy.ts), always one step short: one less, minus ten, half of a double, count back
  (taking 3 or less), back through ten (`13 − 5 → 13 − 3 − 2`), think of the sum (`15 − 7 → 7 + ? =
  15`); with two digits, tens like a small fact (`70 − 30` like `7 − 3`), taking the ones, then the
  tens, breaking a ten.
- **After a miss** (SubtractionExplainer): within 20, ten-frames with the number taken away crossed
  out from the end, so going back to the 10 first is visible; with two digits, rods and dots, a ten
  broken into ten ones (in the second colour) when there aren't enough ones.
- **The ship's computer** (thinkThrough.ts): taking away (`takeAway` picture), counting back, the
  sum that makes it, tens taken from tens.
- **Distractors:** one to three off, a ten off when borrowing slips, and the sum (adding instead of
  taking away) within 20.
- **The Academy** (academy/SubtractionAcademy.tsx): three courses, one per stage, the pilot's own
  marked: *Take away within 10* (stars flying off a ten-frame, the − sign, counting back on a number
  line, think of the sum and fact families, then fading practice); *Back from 20* (a teen as ten and
  some more, back to ten first, sums and doubles, practice with hops); *Within 100* (rods and dots,
  taking tens, tens then ones, breaking a ten, practice with hops back).

## Game modes

- **Played in −:** Wormhole (three differences that make the target), Meteor Shower, Space Traffic
  (the D-pad's near misses, never flipped), the Canyon Run, Crew Flight (the navigator counts stars
  left after some fly off; docking is an addition round when anyone's mission has no ×), Monster Sun
  (a − fact can go to anyone but a pure + pilot), Split Sky (a − host's game is played with sums at
  their subtraction stage) and the Black Sun.
- **Not yet in −:** Constellation, Fleet Battle, Stranded Fleet, Stardust Run and Road. A − pilot's
  bonus rounds rotate through the three above (`rotationFor`); on +− the others play with sums
  (`roundOpFor`). Eclipse Hunters stays × only.

## Left for later

- − versions of the five bonus rounds above.
- The knowledge badges count × facts only, and Mission Specialist needs every round kind, so a −
  pilot can't earn them yet (a + pilot has the first problem too).
