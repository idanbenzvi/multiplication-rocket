# The title: liquid metal, then the logo, then a glitch to the top bar

The user, 2026-10-29: when the game's logo appears, have the text come first with a liquid metal
effect, then the rest of the logo's elements. When it's done, don't shrink it and move it to the
top left; have it glitch-teleport to the same place.

The title is the story's last act (StoryTitle.tsx, after the launch's white-out; About's ▶ plays
it again). Before, the whole logo came out of the white blurred and bright, held, and flew to its
place in the top bar, shrinking.

## The letters, poured (logo/LiquidMetal.tsx)

A WebGL canvas (ogl) over the logo's art, at its size, drawing only the letters:

- **The letters** are their own mask, `letters.webp`, cut by `scripts/space-times-logo.py`
  (`letter_shapes`). Each letter's ringed by the plate's dark navy, so whatever's lighter than that
  inside the words' boxes is a letter, taken at every brightness from 0.36 to 0.70, since each
  comes apart from the background at a different one. The chrome's horizon, a thin dark line across
  each word, is closed over a word at a time (so the two words don't join), and the slivers that
  leaves are opened away. The art's other layers come out of the script byte for byte as before.
- **The pour**: a softened copy of the letters, high in the strokes' middles, half at their edges
  (two box blurs, three passes each, made once at half the art's size), and a level rising through
  it, so the metal fills each stroke from its middle out to its edges, left to right and the top
  word a little first, its edge wobbling and glowing hot. At the end everything's filled, thin
  strokes too.
- **The chrome**: bands of light and dark (what it reflects), bent round the bevel (the slope of
  the softened letters) and by the ripples on its surface while molten, wandering and running; its
  red, green and blue a little apart at the bands' edges, as liquid metal's are, with a touch of the
  logo's cyan above and magenta below, a highlight, and the rim catching the light.
- **Then** the surface settles (1.3–2.3 s), the chrome cools into the letters as they're drawn
  (1.75–2.45 s), and a gleam runs across (1.95–2.75 s). All in 2.8 s.

It starts pouring 0.45 s in, when the white has mostly gone. Everything costly (loading, softening,
building the shader) happens before that, during the white: the shader's built by drawing once
while it waits.

## The rest of the logo (StoryTitle.tsx's `build`)

As the letters cool, the logo itself (SpaceTimesLogo, already mounted, its tokens orbiting) is
shown, piece by piece, over 1.25 s, a frame at a time by inline styles (rAF, so a fake clock
drives it too):

- the globe and everything drawn with it open out from the globe's middle (a growing
  `clip-path: circle()`), a ring of light running out with the edge;
- the + × − ÷ tokens pop onto their orbit one by one (the `scale` property, which goes with their
  orbit's own `transform`), overshooting a little;
- the rockets fly in along their trails (`translate`);
- the sparkles pop; the lightning, the shine and the scan switch on.

The canvas stays on top until the gleam's done, then goes: under it are the same letters.

## The glitch teleport (story/GlitchTeleport.tsx)

After a 1.5 s hold, the logo's hidden and a 2D canvas over the whole screen draws it instead, from
its art split into its red and its green and blue (story/glitchArt.ts, made as the title starts):

- **out** (440 ms): torn into bands that jump sideways (most a little, a few a long way, some
  dropped), the red pulled one way and the green and blue the other, blocks of colour flashing round
  it, scan lines, flickering; it tears more and more, then squashes into a bright line, and the line
  into a dot, like an old screen switched off;
- **across** (150 ms): the dot zips to the logo's place in the top bar, a streak behind it, bits
  shed along the way;
- **in** (420 ms): the dot opens into a line there, the line into the logo, torn, settling whole.

It's stepped every 42 ms, so it jumps rather than slides. The game appears under it (the title's
dark fades away as it begins), and as it lands the top bar's own logo takes over. In Hebrew the top
bar's logo is on the right, and it goes there.

Sounds (sfx.ts): `metalPour` (a heavy rush rising, the metal ringing, a ting with the gleam) and
`teleport` (a digital stutter, a fizz, a zip, and a stutter in).

## Again, and calm

Watching it again from About, About's over the top bar, so the logo only glitches out. With
reduced motion there's no metal and no glitch: the whole logo fades in, holds, and fades away.

## Performance

In dev (slower than a production build) with the CPU slowed 4×: 60 fps from the pour to the end; the
setup (the title's mount, the softening, the shader) takes about 0.3 s before the pour, inside the
white.
