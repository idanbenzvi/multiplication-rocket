# Orbie, the ship's computer: help for a pilot who's stuck

## Goal

When a child can't answer, they shouldn't just wait for the clock to run out or guess. The ship's
computer notices, offers to help, and thinks the question through with them, one way at a time,
each with a picture. Like the hints, it never gives the answer away: every step stops one short,
for the child to finish.

## When it appears

- **A while without an answer** (in game time, so not while paused): 1.5 × the pilot's own pace,
  7 s at least (7.5 s at the starting pace). For a fact the pilot keeps missing (a struggling
  fact), after 3.5 s. (`stuckAfterMs`)
- **Only on the main question,** not during a bonus round, a launch, the practice map, the Academy
  or the answer's feedback. A new question starts over.

## Orbie

The ship's computer has a name, **Orbie** (אורבי), and a switch of its own in the cockpit, "Help
from Orbie", on by default. Beside the switch, a little glowing orb floats while Orbie is on and dims
while it's off. Switched off, no orb comes.

## The orb and its window

- **Where the orb floats:** beside the rocket, never over it (`orbPlace.ts`).
  - The rocket's outline on screen is worked out every frame, the four corners of its art turned
    with it as it leans with the level's course (`flight.rocketScreen`, written by FlyingRocket).
  - The orb tries a ring of directions around it, the most natural first (right, a little up or
    down, left…), and sits as close as it can along the first one that's clear. It keeps 22 px
    from the rocket (11 px if a phone has no room for more), stays inside the screen, and keeps off
    the top bar, the fuel gauge and the question.
  - It keeps to the side it chose while that's clear, so it doesn't hop about. It's smaller on a
    phone (70 px).
- **The orb itself:** React Bits' Orb (MIT + Commons Clause, which allows a paid app; the notice is kept in
  `reactbits/Orb.tsx`) lights up beside the rocket's hull and follows it as it floats. It breathes
  gently with a "?" in it, and a bubble says "Stuck? I can help!" for its first five seconds. One
  change to the Orb: each mount makes a canvas of its own (on remounting the same canvas, as
  React's StrictMode does in development, the context it had given back drew nothing).
- **Tapped,** it opens a small floating window: a soft blob of glass titled "Ship's computer".
  It shows one step at a time with a picture, ‹ › to page through them, dots for where you are,
  and 🔊 to read the step aloud. "Now you try! 🚀" closes the last step. ✕, the orb again, or
  Android's Back closes it.
- **One size:** the window is the same size for every step (380 px tall, or less where the
  screen is shorter), so ‹ › stay right where the finger or the mouse is while paging. A step too
  tall for it scrolls inside.
- **Placement:** clear of the question and its answers, since the child reads it and answers.
  - On a computer or a tablet it goes beside the orb, on the side away from the rocket.
  - On a phone it fills the space above the question, held by its bottom edge so a taller step
    grows up over the rocket instead of down over the answers. It scrolls if even that isn't
    enough.

## The steps (game/thinkThrough.ts)

**Multiplication, x × y:**
1. **What does it mean?** x rows of y dots, each row a colour of its own.
2. **Count in jumps:** counting by the bigger number, the smaller number of jumps, as chips:
   8, 16, 24, 32, 40, ? (not for ×1).
3. **A shortcut:** the game's own hint for the fact (strategy.ts).
4. **Start from one you know:** only when the pilot has mastered a fact one group smaller (6 × 7,
   for 6 × 8): "6 × 7 = 42 → 42 + 6 → ?". It builds on what this child already knows.
5. **Turn it around:** x × y is y × x, its dots turned the other way (not for a square).

**Addition, x + y:**
1. **Put them together:** x dots and y more in rows of ten, two colours (up to 20), or **tens and
   ones** as bars and dots (two-digit sums).
2. **Count on:** from the bigger number, as chips: 8, 9, 10, ? (when the smaller is 2–9).
3. **A shortcut:** the game's hint (make ten, doubles, tens then ones…).
4. **Start with the bigger one:** x + y is y + x (when the bigger comes second).

The tests check that no step ever shows the answer, for every multiplication fact and for a range of
sums.

## Scoring

Asking for help takes the answer off the clock (`helpedAt` in the game store):
- the answer gets the steady boost (as with the speed boost switched off) and the full
  celebration;
- it doesn't move the pilot's pace or count toward the speed badges;
- it's logged without a time, so the parents' speed and rushing charts leave it out.

Mastery is recorded as usual.
