# Crew Flight: two pilots, one rocket

Design and implementation plan for the game's first multiplayer mode.

## Goal

Let two children (typically siblings of different ages) fly **one rocket together on one device**,
so that both contribute fairly even when one of them is far ahead, and so that the joint
moments make them talk about multiplication out loud.

## Design

### Who plays, and how

- **Same device, taking turns.** No networking, accounts or chat: nothing leaves the device,
  as with the rest of the game. A tablet passed back and forth, or two kids side by side at a laptop.
- **Two pilot profiles** from the existing profiles list form a **crew**. Each crew member keeps
  their own mastery map and answer history. Crew answers are recorded there with the new
  answer source `crew`, so the parent dashboard shows them.
- **Two seats** (asymmetric roles):
  - 🚀 **Pilot**: the normal timed `x × y` drill from the full 1–10 pool, weighted towards the
    pilot's own hard facts. It reuses `QuestionForm`, so typing/choosing settings apply.
  - 🧭 **Navigator**: a picture question for a younger child. *"3 pods, 4 stars in each. How many
    stars?"* The stars are drawn as equal groups and there are 4 big answer buttons. Facts come from a
    small pool (factors 1–5), widening to 1–6 and 1–7 as the navigator masters it. A miss replays
    the groups with skip-count labels (4, 8, 12) before moving on: the Academy's "equal
    groups" lesson, practised.
  - Both members may take the Pilot seat (two equal players). Setup suggests the higher-level
    pilot as Pilot and the other as Navigator, and either can switch.
- **Turns alternate** seat by seat. A clear banner with the avatar, name and seat colour shows
  whose turn it is.

### One shared tank

- Every correct answer pours fuel into **one shared tank**, coloured by who added it, so each child
  can see their own part of the launch.
- Each seat's fuel is scaled so a navigator's correct picture answer is worth as much as a
  pilot's average-speed answer. The younger child is never dead weight.
- A wrong answer doesn't drain the shared tank (a sibling shouldn't lose the other's fuel).
  It just brakes the rocket (`bump()`).
- A full tank launches the crew to the next destination. **Crew level** is kept per pair of
  pilots (`multiplication-rocket:crew:v1:<idA>+<idB>`), separate from each child's solo level.

### Docking: the joint round

Every 4th turn is a **Docking** round, played by both at once:

- A space station shows a number, e.g. **24**.
- Each child secretly taps a number 1–10 on **their own half** of the screen (left seat on the
  left, right seat on the right). A picked number shows as 🔒, not the number itself.
- When both have locked in, the numbers are revealed: `4 × 6 = 24`, and the rockets dock.
  On a miss, the game shows `5 × 6 = 30`, *too big*, and lets them try again.
- To win reliably they have to agree out loud ("you take 6, I'll take 4"), which means saying
  factor pairs to each other.
- Up to 3 tries. After that, a working pair is shown. A dock on the 1st/2nd/3rd try is
  worth 3×/2×/1× a normal answer's fuel.
- Targets are products with at least two factor pairs within 1–10 (so there's something to
  agree on), picked through the pilot's mastery weighting. When a navigator is on board, one
  factor of some valid pair is always ≤ 5, so the younger child can find a part.
- Every docking attempt is recorded for **both** players under the canonical key of the pair they
  picked, if it's a real fact. Only a successful dock counts as correct.

### Ending a mission

- **Land** (always visible) ends the crew flight with a summary: each pilot's correct answers,
  docks, launches. Then back to solo play as the previously active pilot.

### Entry point

- The pilot picker ("Who's flying today?" / top-bar pilot chip) gets a **👩‍🚀👨‍🚀 Fly together**
  card when there are 2+ pilots. It opens the crew setup: pick two pilots, then check their seats,
  then **Launch together**.

### Out of scope (later ideas)

- Badges for crew play (achievements track only the active solo pilot today).
- Rescue Beacons, split-signal Stranded Fleet, ghost runs, networked play.
- Two-player keyboard controls for Docking (it's touch/click; the tablet is the main target).

## Architecture

| Unit | Responsibility |
|---|---|
| `src/game/crew.ts` (pure) | Seats, navigator pool, fact picking, fuel per answer, turns to launch, docking targets and checks, seat suggestion, pair key. Unit-tested. |
| `src/game/facts.ts` | Takes `recordAttempt` (moved from the game store) so both stores share it. |
| `src/storage/progressStore.ts` | Adds `loadProgressFor(id)` / `saveProgressFor(id, p)`, so crew mode can write a non-active pilot's mastery. |
| `src/stats/answerLog.ts` | Adds the `crew` source (appended, so stored indices don't shift). |
| `src/game/useCrewStore.ts` | Crew session state machine: `setup → turn ⇄ feedback → docking → launch → summary`. |
| `src/components/crew/*` | `CrewSetup`, `CrewFlight` (HUD + turn router), `NavigatorQuestion`, `Docking`, `CrewSummary`, `crew.css`. |
| `App.tsx` | While a crew flight is active, hides the solo HUD/questions and renders `CrewFlight`. On exit, `init()` reloads the solo pilot. |
| `i18n/strings.ts` | `crew` strings in English and Hebrew. |

The rocket scene keeps flying behind everything. Crew answers drive it through the existing
`kick()` / `bump()` helpers in `flight.ts`.

## Implementation plan

Each task ends green on `npm run lint`, `npm test` and `npm run build`, and is committed on its own.

1. **Test harness.** Add `vitest` and an `npm test` script.
2. **Shared mastery helper.** Move `recordAttempt` to `facts.ts` and add tests. Add per-profile
   load/save to `progressStore.ts`. Add the `crew` log source.
3. **Crew logic (TDD).** Write `crew.test.ts` first, covering the navigator pool widening, seat
   suggestion, fuel parity between seats, turns to launch, the docking target rules (≥2 pairs, a
   ≤5 factor with a navigator), dock checks (dock/over/under), try-based multipliers and the pair key.
   Then implement `crew.ts`.
4. **Crew store.** `useCrewStore.ts`: start/answer/next/docking/launch/land, recording into each
   member's progress and log, persisted crew level.
5. **Strings.** English and Hebrew `crew` block.
6. **UI.** `CrewSetup`, `NavigatorQuestion`, `Docking`, `CrewSummary`, `CrewFlight`, styles
   (phone width, RTL).
7. **Wiring.** A Fly-together card in the pilot picker, and the App switch between solo and crew.
8. **Docs.** A README section.
9. **Verify.** Run it in the browser through a full loop: setup, both seats, docking hit/miss, launch, land.
