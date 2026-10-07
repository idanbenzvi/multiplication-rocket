# Badge art

Drop an image here named after a badge and it replaces that badge's emoji
medallion on the next build (`npm run dev` picks it up after a restart).
No code changes needed: `src/components/badges/BadgeArt.tsx` finds them.

- Formats: `.png`, `.webp`, `.jpg` or `.svg`. A transparent PNG/WebP works best.
- Size: square, 512×512 is plenty (shown at 26–84 px).
- The art replaces the whole medallion, so draw the round badge itself.

## Shared style prompt

Start every prompt with this so the set matches:

> A circular enamel achievement badge for a children's space-themed math game,
> bold clean vector style, thick gold rim, glossy highlights, soft glow,
> centered on a transparent background, no text, friendly and colorful.

Then add the badge-specific part below. Rim/enamel colors follow the game's
groups: knowledge = green, journey = blue, streaks = orange, speed = yellow,
missions = magenta, ranks = gold.

## Ranks (`rank-0` … `rank-6`)

| File | Rank | Idea |
| --- | --- | --- |
| `rank-0.png` | Cadet | a simple single chevron with a small rocket |
| `rank-1.png` | Ensign | one gold bar with a star |
| `rank-2.png` | Lieutenant | two gold bars with a star |
| `rank-3.png` | Lieutenant Commander | two and a half bars, a planet behind |
| `rank-4.png` | Commander | three bars and a comet |
| `rank-5.png` | Captain | four bars, a captain's wings around a star |
| `rank-6.png` | Honored Captain | a laurel wreath around a radiant star and rocket, crown of small stars |

## Badges

| File | Name | Earned for | Idea |
| --- | --- | --- | --- |
| `firstStar.png` | First Star | mastering 1 fact | one shining star |
| `starCluster.png` | Star Cluster | mastering 10 facts | a small cluster of stars |
| `galaxyMind.png` | Galaxy Mind | mastering 30 facts | a brain shaped like a spiral galaxy |
| `tableTamer.png` | Table Tamer | a whole times table | a glowing 10-row grid tamed by a lasso |
| `fiveTables.png` | Five Tables | 5 whole times tables | five stacked glowing grids |
| `toughNut.png` | Tough Nut Cracker | mastering 6×7, 6×8, 7×8, 7×9, 8×9 | an astronaut cracking a space walnut |
| `neverGiveUp.png` | Never Give Up | fixing 10 once-wrong facts | a determined little rocket climbing upward |
| `grandMaster.png` | Grand Master | all 55 facts | a crown over a complete glowing grid |
| `liftoff.png` | Liftoff | first level | a rocket lifting off with flames |
| `starHopper.png` | Star Hopper | 5 levels | a rocket hopping between planets |
| `galaxyExplorer.png` | Galaxy Explorer | 11 levels | a telescope pointed at a spiral galaxy |
| `deepSpace.png` | Deep Space Voyager | 22 levels | a UFO-like ship in deep purple space |
| `hundredRight.png` | Century | 100 right answers | a big glowing "100" made of stars |
| `thousandRight.png` | Thousand Club | 1,000 right answers | a golden trophy with a rocket |
| `regularFlyer.png` | Regular Flyer | 3 practice days | a calendar with 3 rocket stickers |
| `loyalFlyer.png` | Loyal Flyer | 10 practice days | a calendar full of stars |
| `onFire.png` | On Fire | 5 in a row | a flame |
| `blazing.png` | Blazing Comet | 10 in a row | a blazing comet |
| `supernova.png` | Supernova | 20 in a row | an exploding star |
| `quickThinker.png` | Quick Thinker | 25 BIG BOOST answers | a lightning bolt |
| `lightspeed.png` | Lightspeed | 250 BIG BOOST answers | a rocket with light-speed streaks |
| `wormholeRider.png` | Wormhole Rider | flying a wormhole | a swirling wormhole with a tiny rocket |
| `missionSpecialist.png` | Mission Specialist | every bonus round kind | a target with six mission icons around it |
| `flawless.png` | Flawless | 5 perfect bonus rounds | a sparkling diamond |
| `academyGraduate.png` | Academy Graduate | the Deep Space Academy | a graduation cap floating in space |
