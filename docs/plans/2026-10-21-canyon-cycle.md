# The About page's canyon: colour cycling, Mark Ferrari style

## Goal

The About page's background becomes the user's pixel-art canyon (made with Gemini): red cliffs
under a night sky of stars and planets, a glowing turquoise lake, and a rocket standing on the
shore. It moves the way Mark Ferrari's scenes did in the late 80s and early 90s, and in Joseph
Huckaby's Canvas Cycle: nothing is redrawn. The picture is one palette index per pixel, and runs of
the palette are rotated, so colours flow through the pixels that hold those indices.

## Rendering (components/about/CycleScene.tsx)

- **Textures.** The picture is an **R8 texture**, one byte per pixel (the palette index). Its 256
  colours are a **256 × 1 texture**. Both are NEAREST-filtered: a pixel is its index, and is never
  blended with a neighbour's.
- **The fragment shader** (WebGL 2):
  1. reads the pixel's index (`texelFetch`, red × 255);
  2. finds the cycling range it falls in, if any (up to 24, as uniforms: start, length, rate,
     blend);
  3. turns it within that range by `u_time × rate`;
  4. looks up the colour, blending between the two neighbouring entries by the step's fraction,
     so the flow is smooth (Canvas Cycle's "blend shift").
- **No CPU work per frame.** Nothing is copied on the CPU from frame to frame. Each frame is one
  quad drawn at the picture's own 640 × 357, and CSS scales the canvas up with
  `image-rendering: pixelated`, with `object-fit: cover`. The crop keeps the rocket in view on a
  tall phone.
- **Fallbacks.** Without WebGL 2, or with reduced motion, the first frame is drawn once on a 2D
  canvas. Each mount gets a fresh canvas, and the GL context is given back on close.

## The scene (scripts/canyon-cycle.py → public/about/canyon.json)

- **Size and format.** The picture is brought down to its pixel-art size, 640 × 357. The JSON holds
  the palette (base64, 768 bytes), the indices (base64), and the ranges. It's about 140 KB as sent
  (GitHub Pages compresses it), and is fetched only when the About page opens.
- **What moves, and how its phases are laid out.** The rotation reads as motion because of where
  each phase sits:
  - **Ripples** across the lake: a sine wave of brightness, its phase along wavy slanted lines.
    Three tiers, from the water's own colours.
  - **Reflections** of the cliffs in the water: a gentler wave, in four tiers of their purple-brown
    colours.
  - **Shallows** lapping at the shore: a soft crest of foam, its phase the distance to the shore,
    so it runs in towards it. The rocket stands in front of the water, so its edge isn't shore.
  - **Sparkles** on the water: glints, each one at its own phase.
  - **Stars**: twinkling, each at its own phase. Stars are small bright specks well inside the
    sky, above the skyline (the first rock in each column) and with no rock near them.
  - **The porthole**: a pulse rippling outwards from its middle.
  - **The engine's glow**: a flicker rippling outwards from under the rocket.
- **Tiers.** Each moving thing's colours are clustered into a few tiers (k-means, darkest first),
  each tier a range of 8 colours made from its own colour, so the shading of the original stays.
  The tiers' edges are Bayer-dithered.
- **The rest.** Whatever doesn't move is quantised to the other 128 palette colours (k-means in
  Lab) with a 4 × 4 ordered (Bayer) dither: the crosshatch texture of the era. In all, 128 cycling
  colours in 16 ranges, and 128 still ones.
- **Preview.** `--preview <dir>` plays the cycle in Python and saves a few frames.
