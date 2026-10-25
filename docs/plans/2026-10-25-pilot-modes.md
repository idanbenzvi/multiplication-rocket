# A pilot's missions: journeys of their own, facts shared

## Goal

A pilot can fly every mission (×, +, ×+, and any added later) and move between them easily, each
keeping its own progress, and what they've learned counts wherever they fly (the user's choice,
2026-10-25: levels and fuel per mission, the facts shared). Until now each mission kept everything
of its own, its facts too (`progress:v1:<id>[:<mission>]`), so a pilot who'd mastered the 7 times
table in × started Mixed with an empty map; and switching was in the pilot's editor only.

## What's whose

- **The mission's journey** (still `progress:v1:<id>` for ×, `…:<id>:add`, `…:<id>:mix`): level,
  fuel, streaks, right answers, launches, the sums' stage, the pilot's pace.
- **The pilot's facts** (`facts:v1:<id>`, `{ version: 1, facts }`): every fact's answers and its
  place in the spaced review (`FactStat`, game/memory.ts), whichever mission it was answered in. A
  fact's key says its operation ("7x8", "3+4", "2d+1d:c"), so a mission sees the facts it practises
  (`factsView`, `covers`): × the times tables, + the sums, Mixed all of them.

`storage/progressStore.ts` puts the two together: a mission's `Progress` is its journey with its
view of the facts as `mastery`, so the game itself doesn't change; saving writes the journey to the
mission's key and merges its facts into the pilot's (it never removes one). Backups carry the new
key (it has the pilot's id in it); deleting a pilot deletes it.

## Sharing them, once

The first time a pilot's facts are read and there's no `facts:v1` yet (`shareFacts`), each
mission's facts are taken from its save (brought up to spaced review first if older), and made one
(`combineFacts`, game/sharedFacts.ts): a fact only one mission had stays as it was; one in two or
three has its answers added up and its place in the review from the mission it was answered in
last (the answer log knows when; rows from before missions were noted go by the fact's own), or,
where nothing says, from the one that knows it best (higher box, then later check). Only once the
facts are saved do the missions' saves let go of theirs. A backup from before is shared the same
way on its first load.

## Switching

`game/switchMission.ts`: the pilot's mission changes, the mission is prepared (`prepareMission`: a
mission with sums starts them as far on as the sums already known open, `stageFor` in
addition.ts, never further back than its own journey has got), and the game starts again in it.

- **The cockpit's Pilot screen** has the missions side by side (rows on a phone): each one's
  symbol, name, level (or *New*), a bar and count of its facts mastered, the one flying lit. Tapping
  another leaves the cockpit (the hyperdrive's sound) and flies it.
- **The pilot's editor** in the launch bay switches the same way.
- **The pilot cards** in the launch bay show, under the current mission's level and right answers,
  the other missions they've flown and their levels.

## Resetting

A reset is the mission's: its journey, and the facts it practises, which for Mixed are all of them
(and for × the times tables Mixed shares). The confirmation and the hold-to-reset hint name the
mission. Its answer history and its Black Sun go, as before.

## Also

- In the multi-phone games a mixed pilot's own answers weren't saved (`recordOwn` compared the
  fact's operation with the mission); now they are, like Crew Flight's (`covers`).
- A launch is still held while any fact the mission practises is struggling, now wherever it was
  missed: a × fact missed in Mixed holds back a × launch.

## Testing

- `sharedFacts.test.ts`: the views, a reset's facts, combining (one mission's as it was; answers
  added up; the review from the last answered, else the best known), the sums' stage on switching.
- In the browser (desktop, phone upright and on its side, Hebrew): a pilot saved the old way
  (× level 4, + level 2 with its sums within 10 mastered, Mixed level 1 having just missed 7×8
  twice) is shared on load (68 facts; 7×8's answers added up, reviewed as Mixed left it; the saves
  keep just their journeys); the Pilot screen shows 4/55, 25/60 and 29/115; switching to + resumes
  level 2 at *Sums to 20*, to Mixed level 1 with its sums caught up too; answers in Mixed land in
  the shared facts; back in × level 4; the pilot card lists the others; a reset in × takes its
  journey and its facts, leaving +'s and the other journeys.
