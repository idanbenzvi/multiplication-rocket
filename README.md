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
- **Mastery map.** *Stop & Review* shows a 10×10 heatmap of what's mastered (green) and what needs practice (red). It can also open by itself after 5 mistakes (off by default, in ⚙️ Settings).
- **On fire 🔥.** Three in a row lights up an electric border around the question, and it gets wilder the longer the streak lasts.
- **Bonus rounds.** Every 6th question becomes a bonus round, rotating through five kinds:
  - **Wormhole 🌀.** A target number and five floating drills. Pick the three that equal the target (tap them, or press 1–5) to open a wormhole, fly through it, and get a **double boost** of fuel. Two wrong picks and the wormhole closes, with no penalty. The correct drills always include at least two different factor pairs, and sometimes a swapped order (3 × 4 and 4 × 3), so it also teaches that order doesn't matter.
  - **Meteor Shower ☄️.** A drill shows at the top and numbered meteors fall across the sky. Tap the one with the answer before it burns up. A wrong tap cracks that meteor and makes the right one glow. Each hit in a row makes the next meteors fall faster. Five drills per round, each first-try hit adds fuel, and the answers count toward the mastery map.
  - **Build-a-Constellation ✨.** Make a number by dragging across a grid of stars to frame a rectangle. A live label reads "3 rows × 4 = 12", and the right size lights up as a constellation. It shows what multiplication *is* (rows times columns) and that one number can be built different ways. After two misses, a dotted outline hints at an answer.
  - **Fleet Battle ⚔️.** The view warps to forward-looking and an enemy fleet appears on the horizon, say 👾 24. Fly around (← ↑ → ↓ or drag) to collect the laser cannons, here 4. Then: "Each ship carries 4 cannons. How many ships do we need for 24 enemies?" Answer 6 and six ships fly in and circle your ship faster and faster inside a blazing ring while a power meter charges. Then one huge beam fires, flinging every enemy away in all directions, with one flying straight at you. Only the exact answer wins. Too few ships leave enemies standing ("5 ships × 4 = 20: 4 enemies left!"), and too many overload the beam ("7 ships × 4 = 28: 4 cannons too many!"). After three tries the right fleet is shown doing it. It's a first taste of division: the missing factor.
  - **Stranded Fleet 🛸.** The ship jumps to lightspeed, banking and rolling as if the pilot is fighting the controls. Stranded, out-of-fuel ships fly in one by one, each projecting a hologram drill that hides the same number: `[ ] × 4 = 28`, `[ ] × 9 = 63`, `[ ] × 2 = 14`… Spot the number they all share (7) to power them up: fuel lines light every ship and the whole fleet jumps to lightspeed. The sooner you guess, the bigger the fuel bonus (3× with one ship showing, down to 1× with all five). A wrong guess makes every ship check it ("6 × 4 = 24 ✗ 28"), so you can see why it doesn't fit.
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
| Shift+K | Fleet Battle: collect all cannons |
| Shift+L | Complete the level (launch warp) |
| Shift+F | Fuel to 95% |
| Shift+P | Practice map |

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
