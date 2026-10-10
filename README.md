# 🚀 Multiplication Rocket

A space-rocket game for practicing the multiplication table (1–10), in **English and Hebrew**.
The rocket is always flying, under northern-lights curtains that change color every level. Every correct answer fuels it and speeds it up, and a streak of
correct answers makes it go faster still: stars stretch into streaks, the screen motion-blurs,
and the engine plume grows hotter. A wrong answer makes it brake and slow down. Fill the tank to
reach the destination planet, which grows in the sky as you get closer, and warp to the next one.

![Gameplay](docs/game-en.png)

## Play in your browser

**[idanbenzvi.github.io/multiplication-rocket](https://idanbenzvi.github.io/multiplication-rocket/)**. Nothing to install. Works on computers and tablets.

## Download & play (no installation needed)

Grab the file for your computer from the **[latest release](https://github.com/idanbenzvi/multiplication-rocket/releases/latest)**:

| Computer | File | How to open |
|---|---|---|
| **Windows** | `Multiplication-Rocket-…-win-x64.exe` | Double-click it. If Windows shows *"Windows protected your PC"*, click **More info → Run anyway** (the app isn't code-signed). |
| **Mac** | `Multiplication-Rocket-…-mac-universal.dmg` | Open the `.dmg` and drag the app to Applications. The first time, **right-click the app → Open → Open** (the app isn't notarized by Apple). |
| **Linux** | `Multiplication-Rocket-…-linux-x86_64.AppImage` | Right-click → Properties → allow executing as a program, then double-click. |

Progress is saved automatically on the computer.

Leaving the game (another tab or app, minimizing, locking the tablet) pauses it: music and sounds stop, the answer timer and any bonus round freeze, and a tap or key press carries on exactly where you left off.

### Tablets and phones

The browser version is made for touch. Answers are multiple choice by default (tap one of four),
or switch **⚙️ Settings → Answer by → Typing** for a big on-screen number pad. In **⚙️ Settings**
you can also choose when a typed answer is checked: **right away** (as soon as all its digits are
in) or **when you tap the screen** (or press ✓). On a computer, typed answers always wait for
**Enter**, so a typo can be fixed first. On Android, right answers give a revving buzz and
mistakes a thump; this can be switched off in Settings. iPhone and iPad browsers don't support
vibration. To make it feel like an app, use **Share → Add to Home Screen** (iPad/iPhone) or
**⋮ → Add to Home screen** (Android). It then opens full-screen with its own icon.

## How it works

- **Fuel = speed × correctness.** A correct answer adds fuel. A fast answer (green **BIG BOOST** zone) adds much more. A wrong answer empties the tank, unless it was already full.
- **No skipping facts you still miss.** Even with a full tank, the rocket won't launch while a recently missed fact is still unresolved. The game keeps asking it until it's fixed.
- **Wrong answers teach.** A miss shows the fact as a grid (*x rows of y*) before moving on.
- **Strategy hints** (press **H**) break hard facts into easy steps, like `7 × 9 → 7 × 10 − 7`, and leave the last step to the player.
- **Mastery map.** *Stop & Review* shows a 10×10 heatmap of what's mastered (green) and what needs practice (red). It can also open by itself after 5 mistakes (off by default, in ⚙️ Settings). With a mouse, just hover over *Stop & Review* for a quick read-only peek at the map, with a mastered / to-practice / not-tried-yet count, without pausing the game.
- **On fire 🔥.** Three in a row lights up an electric border around the question, and it gets wilder the longer the streak lasts.
- **Bonus rounds.** Every 6th question becomes a bonus round, rotating through six kinds:
  - **Wormhole 🌀.** A target number and five floating drills. Pick the three that equal the target (tap them, or press 1–5) to open a wormhole, fly through it, and get a **double boost** of fuel. Two wrong picks and the wormhole closes, with no penalty. The correct drills always include at least two different factor pairs, and sometimes a swapped order (3 × 4 and 4 × 3), so it also teaches that order doesn't matter.
  - **Meteor Shower ☄️.** A drill shows at the top and numbered meteors fall across the sky. Tap the one with the answer before it burns up. A wrong tap cracks that meteor and makes the right one glow. Each hit in a row makes the next meteors fall faster. Five drills per round, each first-try hit adds fuel, and the answers count toward the mastery map.
  - **Build-a-Constellation ✨.** Make a number by dragging across a grid of stars to frame a rectangle. A live label reads "3 rows × 4 = 12", and the right size lights up as a constellation. It shows what multiplication *is* (rows times columns) and that one number can be built different ways. After two misses, a dotted outline hints at an answer.
  - **Fleet Battle ⚔️.** The view warps to forward-looking and an enemy fleet appears on the horizon, say 👾 24. Fly around (← ↑ → ↓ or drag) to collect the laser cannons, here 4. Then: "Each ship carries 4 cannons. How many ships do we need for 24 enemies?" Answer 6 and six ships fly in and circle your ship faster and faster inside a blazing ring while a power meter charges. Then one huge beam fires, flinging every enemy away in all directions, with one flying straight at you. Only the exact answer wins. Too few ships leave enemies standing ("5 ships × 4 = 20: 4 enemies left!"), and too many overload the beam ("7 ships × 4 = 28: 4 cannons too many!"). After three tries the right fleet is shown doing it. It's a first taste of division: the missing factor.
  - **Stranded Fleet 🛸.** The ship jumps to lightspeed, banking and rolling as if the pilot is fighting the controls. Stranded, out-of-fuel ships fly in one by one, each projecting a hologram drill that hides the same number: `[ ] × 4 = 28`, `[ ] × 9 = 63`, `[ ] × 2 = 14`… Spot the number they all share (7) to power them up: your ship sends an energy pulse rippling through space (a WebGL shader that bends the starfield), each ship powers up as the ring reaches it, and the whole fleet jumps to lightspeed. The sooner you guess, the bigger the fuel bonus (3× with one ship showing, down to 1× with all five). A wrong guess makes every ship check it ("6 × 4 = 24 ✗ 28"), so you can see why it doesn't fit.
  - **Stardust Run ✨.** One times table, laid out as a glowing path of stops (`7 × 4 = 28`, `7 × 5`, `7 × 6`…). Each question is the next stop, with 4 answers stacked top to bottom. A right answer and the ship glides along an arc of swirling stardust (a WebGL fluid simulation from React Bits' Splash Cursor, stirred by the ship's flight) to the next stop, which lights up and stays lit, so the chain of answers builds up behind it. Every hop is labelled `+7`: the next answer is always the last one plus the table. The wrong choices are real skip-counting slips (one stop too far, one or two off, a slipped ten), and a wrong pick gives the hint "From 28, jump 7 more." At the end the whole table is shown with the run highlighted, plus the table's pattern to remember (the 9s' digits add up to 9, the 4s end in 4, 8, 2, 6, 0…). The table comes from a fact the child finds hard, and the 3-4 jumps pass through it. On devices too slow for the fluid, it switches to a light particle trail.
- **Celebrations that grow.** The praise word, spark bursts and chime all escalate with the streak (the chime climbs higher with every answer in a row). Every 5 in a row sets off fireworks and a banner.

| Hebrew + streak | Launch | Mastery map |
|---|---|---|
| ![On fire](docs/on-fire-he.png) | ![Launch](docs/launch-he.png) | ![Heatmap](docs/heatmap-he.png) |

| Wormhole challenge | Flying through |
|---|---|
| ![Wormhole challenge](docs/wormhole-challenge.png) | ![Wormhole flight](docs/wormhole-flight.png) |

| Meteor Shower | Build-a-Constellation | Fleet Battle |
|---|---|---|
| ![Meteor Shower](docs/meteor-shower.png) | ![Build-a-Constellation](docs/constellation.png) | ![Fleet Battle](docs/fleet-battle.png) |

## Deep Space Academy 🪐 (hidden)

**Tap the rocket's window three times quickly** to warp into the Deep Space Academy. Until a pilot has found it, their window shimmers (a pulsing halo, a glint sweeping across the glass) to invite the taps. Each tap pulls the camera closer to the ship, and the third dives through the window into the Academy. If the taps stop, the camera eases back out. The Academy is a calm
screen that teaches multiplication from the ground up, for a child who has never met "×". The
game waits while it's open. Every step can be read aloud (🔊) in English or Hebrew, so
pre-readers can follow.

The lessons follow the order the research on early multiplication supports:

1. **Equal groups.** Buses of 4 aliens; tap to count them all. Children's own starting model is
   equal groups and counting ([Mulligan & Mitchelmore, *Young children's intuitive models of
   multiplication and division*](https://researchers.mq.edu.au/en/publications/young-childrens-intuitive-models-of-multiplication-and-division-2/);
   [Mathematics Education Research Journal, 2022](https://link.springer.com/10.1007/s13394-022-00413-1)).
2. **Adding the same number:** `4 + 4 + 4`, then skip counting on a number line. Repeated
   addition is children's most common intuitive model, so it's the bridge, not the destination.
3. **The × sign** as a shortcut for "groups of": the first number is how many groups, the second
   is how many in each.
4. **Arrays.** The aliens park in rows; each row is an equal group, and the whole array is a group
   of groups ([Barmby, Harries, Higgins & Suggate 2009, *The array representation and primary
   children's understanding and reasoning in multiplication*](https://dro.dur.ac.uk/5458);
   [Outhred, PME28](https://emis.univie.ac.at/proceedings/PME28/RR/RR018_Outhred.pdf)).
5. **Turn it around.** Rotating the array shows `3 × 4 = 4 × 3`: a reasoning strategy that halves
   what has to be learned, in line with strategy-based fact fluency rather than rote drilling
   ([Baroody's phases, via NCTM/Georgia Standards](https://www.georgiastandards.org/Georgia-Standards/Documents/3rd-Math-Fluency-NCTM-2015.pdf);
   [Wisconsin DPI fact-fluency progression](https://dpi.wi.gov/sites/default/files/imce/math/files/Fact_Fluency_Infographic_-_FINAL.pdf)).
6. **Your turn**, with support that fades: build 2 groups of 3 with buttons, then read a dot
   picture, then a symbols-only problem with an optional "show me". This is the
   concrete → representational → abstract sequence
   ([meta-analytic review of CRA, University of Kentucky](https://scholars.uky.edu/en/publications/a-meta-analytic-review-of-the-concrete-representational-abstract-/)).

## Pilot profiles (siblings)

Each child can have their own pilot: a name plus an animal avatar (🐶🐱🐰🦊🐻🐼🐨🐯🦁🐮🐷🐸🐵🐧🦄🐙).
Every pilot has separate progress: level, fuel, streaks and practice map. With more than one
pilot, the game opens on **"Who's flying today?"**. Switch pilots, add a new one, or edit or delete
one from the avatar button in the top bar. **Reset** in Settings only resets the current pilot.
Everything is stored on the device; nothing is sent anywhere. Progress from before profiles existed
is kept and becomes the first pilot.

The pilot's animal also rides in the rocket's porthole.

Answer mode, language and sound are shared by everyone on the device.

<img src="docs/pilots.png" alt="Who's flying today? pilot picker" width="280">

## Crew Flight 👩‍🚀👨‍🚀 (two players)

Two pilots fly **one rocket together on one device**, taking turns. Open it from the pilot picker
(**Fly together**, shown when there are 2+ pilots), pick the two pilots, and give each a seat:

- **🚀 Pilot.** The usual timed times-table drills, weighted towards that pilot's hard facts.
- **🧭 Navigator.** For a younger child: picture questions about equal groups ("3 groups of
  4 stars. How many stars?") with four big answers and a 🔊 read-aloud button. The facts start
  at factors up to 5 and widen to 6 and 7 as the navigator masters them. A miss counts the groups
  up together (4, 8, 12).

The pilot further along is suggested as Pilot, and two equals can both fly as Pilots. Every right
answer pours fuel into **one shared tank**, coloured by who added it. A navigator's answer is worth
as much as a pilot's average-speed one, so the younger child's part of the launch is just as big. A
wrong answer brakes the rocket but never drains a sibling's fuel.

Every 4th turn is **Docking 🛰️**: the station shows a number (say 24), and each child secretly
taps one number on **their own half** of the screen. The picks stay hidden (🔒) until both are in,
then `4 × 6 = 24` docks the rockets. To win, the two have to agree out loud first ("you take 4,
I'll take 6"). There are three tries, and an earlier dock is worth more fuel (3× / 2× / 1×). After
three misses, the ways to make the number are shown.

Answers count as practice for each child: they go into each pilot's own practice map and the
parent dashboard. A full tank launches the crew. Each pair of pilots has its own crew level,
separate from their solo levels. **Land** ends the flight with a summary for both, then it's back to solo
play. Design notes: [`docs/plans/2026-10-08-crew-flight.md`](docs/plans/2026-10-08-crew-flight.md).

## Split Sky 📱📱 (two phones)

Two children, two phones, **side by side**. One sky of stars spans both screens, split at the
seam where the phones touch. Each child counts their own half, then together they find the whole
sky: `6 × 8 = 6 × 3 + 6 × 5`. Breaking a hard fact into easier pieces is the same idea as the
strategy hints, but here each child holds one of the pieces.

- **Connect:** on one phone, **📱📱 Two phones → Host a game** shows a 4-digit code. On the other,
  **Join a game** and type it. Each phone needs one pilot. The host says which side its phone is on.
- **A round:** each phone shows only its own half (say "6 rows of 3"), and each child answers
  privately. Then both phones show both halves (`6 × 3 = 18`, `6 × 5 = 30`) and ask for the whole,
  `6 × 8`. A miss on the whole gives the hint "18 + 30". When both are done, the constellation
  lights with a glow that starts at the seam and runs out across both screens.
- When the sky is wider than 5 columns, one half is a **5** (`7 × 8 = 7 × 5 + 7 × 3`), the classic
  way to split a hard fact.
- There are 5 skies a game. Each phone records its own pilot's answers in its own practice map.
- **How it connects:** the free [PeerJS](https://peerjs.com) cloud server introduces the phones
  using the code. After that, the game goes directly phone to phone (WebRTC), and names and
  answers never touch the server. A phone that drops can rejoin with the same code and carries on
  where it left off. Both phones need the internet to connect. Some guest or mesh Wi-Fi networks
  keep phones apart; the game says so if it can't connect.

### Eclipse Hunters 🌑 (two phones)

The second two-phone game: the host picks it in the lobby, or from the summary. Each phone
has **one moon**, going round every 3 ticks on one phone and every 4 on the other.

- **Orbit:** each child skip-counts their own moon, choosing the next tick each time (3, 6, 9,
  12, 15…). The moon flies round the planet past one dot per tick. Every step is a times-table
  fact and counts as practice. The other phone's progress shows only as a count, never its numbers.
- **Predict:** "When do both moons line up for the first time?" Each child sees only their own
  list, so they have to compare out loud to find the first number in both.
- **Eclipse:** a shadow sweeps across the left phone and then the right, the planet turns into a
  glowing corona, and it's explained: `3 × 4 = 12`, and again every 12 ticks. The two periods
  never share a factor, so the first eclipse is always their product.
- 4 eclipses a game.

Design notes: [`docs/plans/2026-10-08-split-sky.md`](docs/plans/2026-10-08-split-sky.md).

## Monster Sun 👾 (2–6 phones, co-op)

A grumpy monster sun made of flickering characters is swallowing the stars, and up to six
children team up to cure it, each on their own phone.

- **Connect:** **👾 Monster Sun → Host a fight** shows a 4-digit code; every other phone taps
  **Join a fight** and types it. At least 2 phones are needed.
- **Fight:** every phone drills its own questions (4 choices, weighted by that pilot's mastery).
  A right answer is a blow: the monster shivers and sheds characters. A wrong one feeds it back
  one hit point, and the right answer is shown. The first monster takes **5 right answers per
  player**.
- **Help each other:** a question you miss is sent to a random teammate as a **🆘 Help Ari!**
  card. When they solve it, you see their answer ("help from Tal: 7 × 8 = 56"), and the same
  fact comes back to you two questions later to try again.
- **Everyone sees the team:** each pilot has a colour, and every right answer on any phone is a
  beam in that colour flying into the monster on *all* the phones. The monster winces when hit,
  chomps and gloats ("YUM!") when fed, and sweats and panics when it's nearly beaten. Whoever is
  helping someone shows a 🆘 on their chip, and everyone sees "Noa helped Ari".
- **Cured, not destroyed:** at zero its scrambled letters fly out, swirl back and unscramble
  into a friend: the first becomes a sun that puts on sunglasses, the second a flower that
  blooms, the third a smiley with heart eyes. They shine, sparkle and float hearts, and the
  summary shows all three as the team's new friends.
- **Team combo:** right answers in a row by *anyone* build a shared combo; every 5 sends a
  shockwave through the monster.
- **Three monsters**, each tougher: more hit points (6, then 7 per player), bigger tables (up to
  6, 8, then 10), more rays and faster flicker.
- **The summary** shows the three friends, gives every pilot an award (🤝 Super helper first, then 💥 Monster smasher,
  🎯 Sharp eye, ⭐ Brave heart) and lists the facts the team "learned together".
- A phone that drops or reloads can rejoin with the same code and keeps its seat and score.

Design notes: [`docs/plans/2026-10-10-monster-sun.md`](docs/plans/2026-10-10-monster-sun.md).

## Parent dashboard 👪

**⚙️ Settings → 👪 Parent dashboard** shows how each pilot is doing over time. A
quick grown-up math question keeps kids out. Pick a pilot and a range (last 7
days, last 30 days, or all time). Each number is compared with the period just
before it.

- **Accuracy**: the share of answers that were right, per day.
- **Correct vs wrong**: daily answer counts.
- **Typical answer time**: the median time of correct answers. Falling times
  with steady accuracy mean the facts are becoming automatic.
- **Rushing**: wrong answers given in under 2 seconds, a sign of guessing
  instead of thinking.
- **Consistency**: how much daily accuracy swings from day to day.
- **Facts mastered**, the **hardest facts right now**, and the **most improved** facts.

Every chart has a table view. History is kept on the device only, per pilot,
and starts from v1.6. Answers from before that version weren't recorded.

## Hebrew

Click **עברית** in the top bar. The layout switches to right-to-left while equations and hint
formulas stay left-to-right, as in Israeli school workbooks. All text lives in
[`src/i18n/strings.ts`](src/i18n/strings.ts).

## Sound

The theme song, *Gliding Past the Rim*, was made for this game with Google Gemini. Click 🔊 in the
top bar for separate **music** and **sound-effect** volume sliders (all the way down = off). The
sound effects are synthesized in the browser with Web Audio, so there are no sample files.

## Development

Requires [Node.js](https://nodejs.org) 20+.

```bash
npm install
npm run dev      # play in the browser with hot reload
npm test         # unit tests for the game logic (vitest)
npm run app      # run as a desktop app (Electron)
npm run dist     # build a desktop executable for this OS into release/
```

Built with React, TypeScript, Vite, [react-three-fiber](https://github.com/pmndrs/react-three-fiber)
for the 3D launch scene, [zustand](https://github.com/pmndrs/zustand) for state, and animated
components adapted from [React Bits](https://reactbits.dev) (Hyperspeed, LightTunnel,
Aurora, ElectricBorder, ClickSpark, CountUp, ShinyText, GradientText, StarBorder) in
[`src/components/reactbits/`](src/components/reactbits/). The engine plume is React Bits'
LaserFlow shader, ported to run inside the 3D scene
([`laserFlowShader.ts`](src/components/scene/laserFlowShader.ts)). Flight speed is modeled in
[`src/game/flight.ts`](src/game/flight.ts).

### Dev mode

Add `?devmode=true` to the URL, for example `npm run dev` then http://localhost:5173/?devmode=true, or
https://idanbenzvi.github.io/multiplication-rocket/?devmode=true. A small **DEV** panel appears
in the corner. Its rows can be tapped on tablets, or use the shortcuts:

| Shortcut | Does |
|---|---|
| Shift+W | Wormhole challenge |
| Shift+M | Meteor Shower |
| Shift+C | Build-a-Constellation |
| Shift+B | Fleet Battle |
| Shift+S | Stranded Fleet |
| Shift+D | Stardust Run |
| Shift+K | Fleet Battle: collect all cannons |
| Shift+G | Answer the current Stranded Fleet / Fleet Battle / Stardust Run stop correctly |
| Shift+L | Complete the level (launch warp) |
| Shift+F | Fuel to 95% |
| Shift+A | Deep Space Academy |
| Shift+P | Practice map |

The panel's last line shows whether the Stranded Fleet energy pulse is running as a WebGL shader or has fallen back to CSS rings (with the reason), which is useful if the pulse looks wrong on a device.

Dev actions affect the current pilot's real saved progress (for example Shift+L really levels up),
so use a separate test pilot.

### Releasing a new version

Pushing a version tag builds Windows, Mac and Linux executables on GitHub Actions and attaches
them to a GitHub Release:

```bash
npm version patch        # bumps package.json, e.g. 1.0.0 -> 1.0.1, and tags v1.0.1
git push --follow-tags
```

## License

Code: [MIT](LICENSE). The app icon uses the 🚀 from [Noto Color Emoji](https://github.com/googlefonts/noto-emoji) (OFL).
