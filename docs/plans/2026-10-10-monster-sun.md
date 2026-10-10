# Monster Sun: a co-op fight for 2–6 phones

## Goal

Several children, each on their own phone, team up against a menacing **ASCII monster**: a
glowing sun made of flickering characters, burning in the middle of the warp starfield. Every
phone drills its own times-table questions. Each right answer makes the monster shiver and shed
characters; each wrong answer feeds it a little. Defeat it together and a tougher one appears.

The co-op twist that makes it a *learning* game: **a fact you miss is sent to a teammate.** A
random other player gets it as a "Help Noa!" card. When they solve it, you see their answer
("Ari solved 7 × 8 = 56 for you"), and the same fact comes back to you two questions later, so
you practise it right after a friend showed you.

## Rules

- **Players:** 2–6 phones. One hosts (shows a 4-digit code), the others join with the code. Same
  link as the two-phone games (PeerJS cloud for the introduction, then WebRTC data channels),
  but the host accepts several guests: a star, with the host as referee.
- **Monsters:** 3 per game. Monster *k* (0-based) has `(5 + k) × players` hit points, so it's
  "5 × X" right answers for X players to beat the first one.
- **Harder each time:** questions use factors 2–6 for the first monster, 2–8 for the second,
  2–10 for the third, weighted by each pilot's own mastery (facts they miss come up more).
  Tougher monsters also have more rays, flicker faster and look meaner.
- **Answering:** 4 choices, one try. Right: monster −1 HP. Wrong: monster +1 HP (up to its full
  strength) and the right answer is shown.
- **Sharing misses:** a wrong answer to one of your own questions puts that fact in a random
  other online player's inbox as a help card. Help cards come before their own questions.
  - Helper right → the one who missed gets a tip ("🐱 Ari solved 7 × 8 = 56 for you!") and a
    retry card for that fact, served after two more of their own answers.
  - A wrong help or retry card isn't passed on again (no ping-pong); the answer is shown.
- **Defeated:** the monster bursts into flying characters. The host taps "Next monster".
  After the third: a summary with each player's hits and helps.

## Architecture

- `src/game/sun.ts`: pure, tested referee `sunReducer(state, action, rand)`: players (by a
  stable per-tab id, so a reloaded phone gets its seat back), HP, inboxes, tips, phases
  `lobby → fight → defeated → … → summary`. Plus `sunFactorMax(monster)`, `nextQuestion`.
- `src/net/peerLink.ts`: `hostGroup` (many guests, messages tagged by connection) next to the
  one-guest `hostLink`; a separate id prefix so a Monster Sun code can't join a Split Sky game.
- `src/game/useSunStore.ts`: host dispatches + broadcasts the whole state; a guest sends only
  `hello` and its own answers, and the host attributes them by connection. Each phone records
  its own pilot's answers (answer-log source `sun`).
- `src/components/sun/`: `SunMonster.tsx` overlay (lobby, fight, defeated, summary) over the
  shared warp starfield, and `MonsterCanvas.tsx`: the ASCII sun on a 2D canvas (characters
  mutate every frame, shiver + flying characters on a hit, red flash on a heal, burst on defeat).
- Entry: a "👾 Monster Sun" card next to "Two phones" in the pilot picker.

## Testing

- Unit tests for the reducer: HP maths, sharing to someone else, never to yourself or an offline
  player, tips and retries, no re-sharing, reconnecting, phase changes.
- E2E with three browser contexts against the dev server and then the preview page.
