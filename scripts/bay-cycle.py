"""Turns the hangar's launch bay (pixel art) into a colour-cycling scene.

    python3 scripts/bay-cycle.py <hangar.jpg> [--preview <dir>]

writes public/bay/hangar.webp, the picture at its pixel-art size (688 × 384,
exactly half the art's), with the sign's lettering taken off it (the game
writes the sign itself, in the player's language) and the lightning round the
robot arms painted out, and public/bay/hangar.json:
for each pixel that moves, which cycling range it's in and its phase there,
and for each range how its light changes as it turns (the same
components/about/CycleScene.tsx draws it, docs/plans/2026-10-22-launch-bay.md).

Unlike the canyon, the picture keeps all its own colours: a range doesn't
hold colours but gains, how much brighter or dimmer (and which way tinted) a
pixel is at each step of the cycle, so a moving pixel is its own colour,
brightened and dimmed in turn. With --preview, it also plays the cycle here
and saves a few frames and a map of what moves. Needs OpenCV (cv2) and numpy.

What moves: the sign's arrows chase in towards its words; the lamp in the
ceiling pulses and glitter falls through its beam; the three lasers flow from
their emitters; the steam on the left billows up; the stars beyond the bay doors twinkle, the galaxy swirls
and its sun glows; the launch pad's ring breathes; the big red, yellow and
green lamps blink in turn, the little ones on the consoles twinkle, and the
screens' green lines scroll.
"""
import base64
import json
import os
import sys
import cv2
import numpy as np

W, H = 688, 384
src = sys.argv[1]
preview = sys.argv[sys.argv.index('--preview') + 1] if '--preview' in sys.argv else None

img = cv2.resize(cv2.imread(src), (W, H), interpolation=cv2.INTER_AREA)
hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV).astype(int)
hh, ss, vv = hsv[..., 0], hsv[..., 1], hsv[..., 2]
gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(int)
med = cv2.medianBlur(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY), 5).astype(int)
yy, xx = np.mgrid[0:H, 0:W]


def box(x0, y0, x1, y1):
    return (xx >= x0) & (xx < x1) & (yy >= y0) & (yy < y1)


def poly(*pts):
    m = np.zeros((H, W), np.uint8)
    cv2.fillPoly(m, [np.array(pts, np.int32)], 1)
    return m > 0


def ellipse(cx, cy, rx, ry):
    return ((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2 <= 1


def specks(region, lift=25, floor=110, most=6):
    """small bright dots in a region: their mask and an id each"""
    cand = (region & (gray - med > lift) & (gray > floor)).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(cand)
    keep = np.zeros(n, bool)
    keep[1:] = st[1:, 4] <= most
    return keep[lab], np.where(keep[lab], lab, 0)


# ---------- the sign: its lettering comes off (the game writes its own) ----------

# the lit panel between the hazard stripes: it slopes down to the right
SIGN_X0, SIGN_X1 = 146, 368
SIGN_SLOPE = 0.155
SIGN_TOP = 9  # at SIGN_X0
SIGN_HEIGHT = 24
panel = (xx >= SIGN_X0) & (xx <= SIGN_X1) & (yy >= SIGN_TOP + SIGN_SLOPE * (xx - SIGN_X0)) & (yy <= SIGN_TOP + SIGN_HEIGHT + SIGN_SLOPE * (xx - SIGN_X0))
# (the words are light cyan on the dark panel; its stripes are orange)
letters = panel & (vv > 85) & (hh >= 75) & (hh <= 110)
letters = cv2.dilate(letters.astype(np.uint8), np.ones((3, 3), np.uint8)) > 0
# (not into the stripes below)
letters &= panel & (yy <= SIGN_TOP + 21 + SIGN_SLOPE * (xx - SIGN_X0)) & ~((hh >= 8) & (hh <= 35) & (ss > 90))
base = img.copy()
# the panel's own dark blue, with its faint dot grid
dark = np.median(img[panel & ~letters], axis=0)
grid = ((xx + yy) % 2 == 0)[..., None]
fill = np.where(grid, dark * 1.18, dark * 0.9)
base[letters] = np.clip(fill[letters], 0, 255).astype(np.uint8)

# ---------- the robots: the lightning round their arms comes off ----------

# green and blue bolts round the left arm, green ones round the right (and a blue arc behind it),
# filled in from what's round them. (Bright, saturated lines only: the arms' own metal is bluish too.)
bolt_box_l = poly((88, 155), (184, 155), (186, 272), (88, 272))
bolt_box_r = poly((296, 184), (402, 184), (402, 262), (296, 262))
green = (hh >= 40) & (hh <= 85) & (ss > 100) & (vv > 110)
blue = (hh >= 84) & (hh <= 108) & (ss > 90) & (vv > 150)
# (the blue ones: behind the left claw, short of the lamp's beam; and the arc behind the right arm)
bolts = (bolt_box_l & (green | (blue & (xx >= 118) & (xx < 172)))) | (bolt_box_r & (green | (blue & (xx > 371))))
bolts = cv2.dilate(bolts.astype(np.uint8), np.ones((3, 3), np.uint8)) > 0
bolts &= bolt_box_l | bolt_box_r
base = cv2.inpaint(base, bolts.astype(np.uint8), 3, cv2.INPAINT_TELEA)
# (dithered a little, like the pixel art round it, rather than airbrushed)
BAYER = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]], np.float32) / 16 - 0.47
base[bolts] = np.clip(base[bolts].astype(np.float32) + (BAYER[yy % 4, xx % 4][bolts] * 10)[:, None], 0, 255).astype(np.uint8)

# ---------- where things move ----------

arrows = (box(110, 2, 141, 27) | box(369, 42, 397, 68)) & (hh >= 75) & (hh <= 105) & (vv > 140)
# chasing in towards the words: phase along x, the right one mirrored
arrow_phase = np.where(xx < 200, xx // 3, -(xx // 3))

lamp = ellipse(237, 86, 37, 9) & (vv > 200)
# the spotlight's beam, down to the pad
cone = poly((205, 92), (270, 92), (310, 246), (166, 246))
glitter, glitter_id = specks(cone & ~lamp, lift=18, floor=150, most=5)
haze = cone & ~glitter & ~lamp & (vv > 120) & (ss < 90)

# the lasers: each from its emitter, flowing outwards
LASERS = [
    ('cyan', (352, 133), (532, -2), (hh >= 80) & (hh <= 100)),
    ('magenta', (335, 160), (548, 30), (hh >= 140) & (hh <= 172)),
    ('orange', (347, 168), (428, 126), (hh >= 8) & (hh <= 32)),
]
lasers = []
taken = np.zeros((H, W), bool)
for name, (ax, ay), (bx, by), hue in LASERS:
    d = np.array([bx - ax, by - ay], float)
    length = np.hypot(*d)
    d /= length
    along = (xx - ax) * d[0] + (yy - ay) * d[1]
    across = np.abs(-(xx - ax) * d[1] + (yy - ay) * d[0])
    near = (across < 7) & (along > -9) & (along < length + 6)
    m = near & hue & (ss > 50) & (vv > 120) & ~taken
    # the white-hot core too, right along the line
    m |= (across < 2.5) & (along > -6) & (along < length + 4) & (vv > 225) & ~taken
    taken |= m
    lasers.append((name, m, along))
laser_mask = np.zeros((H, W), bool)
laser_phase = np.zeros((H, W))
for name, m, along in lasers:
    laser_mask |= m
    laser_phase[m] = -np.floor(along[m] / 4)

steam_area = poly((28, 0), (150, 0), (152, 40), (128, 70), (112, 120), (78, 150), (64, 188), (28, 188)) | poly((134, 96), (180, 96), (178, 158), (136, 158))
steam = steam_area & (ss < 95) & (vv > 105) & ~box(28, 18, 64, 82)
steam_phase = np.floor(yy / 3 + 2.0 * np.sin(xx * 0.21) + 1.2 * np.sin(yy * 0.13 + xx * 0.05))

window = box(504, 96, 622, 272)
moon = ellipse(609, 112, 14, 14)
sun = ellipse(556, 171, 8, 8)
stars, star_id = specks(window & ~moon & ~sun, lift=22, floor=105, most=6)
galaxy = window & ~stars & ~moon & ~sun & (vv > 120) & (ss > 35) & (((hh >= 85) & (hh <= 120)) | ((hh >= 125) & (hh <= 170)))
galaxy_phase = np.floor(np.hypot((xx - 566) * 0.8, (yy - 186) * 1.3) / 2.5 + np.arctan2(yy - 186, xx - 566) * 2.5)
sun_glow = sun & (vv > 150)

pad = ellipse(235, 268, 70, 11) & (vv > 185)
pad_phase = np.floor(np.hypot(xx - 235, (yy - 268) * 6.4) / 5)

BULBS = [ellipse(415, 322, 11, 12), ellipse(440, 322, 11, 12), ellipse(462, 322, 11, 12)]
bulb_mask = np.zeros((H, W), bool)
bulb_phase = np.zeros((H, W))
for i, b in enumerate(BULBS):
    b &= (vv > 70) & (ss > 60)
    bulb_mask |= b
    bulb_phase[b] = -4 * i
lights = (box(0, 226, 50, 241) | box(58, 318, 72, 334) | box(138, 318, 168, 337) | box(478, 340, 500, 352)) & (ss > 90) & (vv > 120)
light_ids = cv2.connectedComponents(lights.astype(np.uint8))[1]

SCREENS = box(0, 302, 52, 345) | box(70, 314, 102, 337) | box(108, 314, 135, 337) | box(648, 222, 688, 252)
screens = SCREENS & (((hh >= 40) & (hh <= 90)) | ((hh >= 92) & (hh <= 112))) & (ss > 50) & (vv > 95)
orange_screens = box(648, 172, 688, 218) & (hh >= 5) & (hh <= 28) & (ss > 80) & (vv > 120)

# ---------- the cycling ranges ----------
# Each: its pixels, how its light changes over a cycle (a gain per step, or
# an RGB gain), each pixel's phase, how fast it turns (steps a second) and
# whether it blends between steps.


def wave(k, amp):
    return [1 + amp * np.sin(2 * np.pi * j / k) for j in range(k)]


def chase(k, peak, rest=1.0, width=1.0):
    out = []
    for j in range(k):
        d = min(j, k - j) / width
        out.append(rest + (peak - rest) * np.exp(-d * d))
    return out


RANGES = [
    # name, mask, gains, phase, rate, blend
    ('arrows', arrows, chase(8, 2.2, 0.55, 1.4), arrow_phase, 7.0, True),
    ('lamp', lamp, wave(16, 0.18), np.floor(np.hypot(xx - 237, (yy - 86) * 4) / 4), 4.0, True),
    # (sparkling: mostly themselves, now and then flashing, now and then dimming)
    ('glitter', glitter, [1, 1, 1, 1.4, 2.3, 1.4, 1, 1, 1, 1, 0.85, 0.65, 0.85, 1, 1, 1], glitter_id * 7 - yy // 4, 5.0, True),
    ('haze', haze, wave(16, 0.07), -np.floor(yy / 4 + 2 * np.sin(xx * 0.15)), 6.0, True),
    ('lasers', laser_mask, chase(12, 2.0, 0.78, 1.6), laser_phase, 9.0, True),
    ('steam', steam, wave(16, 0.11), -steam_phase, 3.2, True),
    ('stars', stars, [1, 1, 1, 0.85, 0.55, 0.35, 0.55, 0.85, 1, 1, 1.25, 1.5, 1.25, 1, 1, 1], star_id * 5 % 16, 2.4, True),
    ('galaxy', galaxy, wave(16, 0.13), galaxy_phase, 2.5, True),
    ('sun', sun_glow, wave(16, 0.16), np.floor(np.hypot(xx - 556, yy - 171) * 0.8), 3.0, True),
    ('pad', pad, wave(12, 0.14), pad_phase, 3.0, True),
        # the three big lamps blink in turn: each has its own third of the cycle
    ('bulbs', bulb_mask, [1.45] * 4 + [0.42] * 8, bulb_phase, 1.5, True),
    ('lights', lights, [1, 1, 1.5, 1, 0.6, 1, 1, 1], light_ids * 3, 2.0, True),
    ('screens', screens, [1.15, 1.0, 0.85, 1.0, 1.25, 1.0, 0.9, 1.05], -(yy // 2), 6.0, True),
    ('orange-screens', orange_screens, [1.1, 0.8, 1.0, 1.3, 0.9, 1.0], -(yy // 3), 4.0, True),
]

index = np.zeros((H, W), np.int32)
palette = [np.zeros(3)]  # index 0: still
ranges = []
moving = np.zeros((H, W), bool)
for name, mask, gains, phase, rate, blend in RANGES:
    mask = mask & ~moving
    moving |= mask
    if not mask.any():
        print('nothing for', name)
        continue
    k = len(gains)
    start = len(palette)
    for g in gains:
        palette.append(np.broadcast_to(np.asarray(g, float), 3))
    ranges.append({'name': name, 'start': start, 'length': k, 'rate': rate, 'blend': blend})
    index[mask] = start + (phase[mask].astype(int) % k)
assert len(palette) <= 256, len(palette)
palette += [np.ones(3)] * (256 - len(palette))
# gains up to 4×, as bytes
pal = np.clip(np.round(np.array(palette) * 64), 0, 255).astype(np.uint8)

os.makedirs('public/bay', exist_ok=True)
# (lossy at 92 is as good to the eye as lossless, at a third of the size)
cv2.imwrite('public/bay/hangar.webp', base, [cv2.IMWRITE_WEBP_QUALITY, 92])
out = {
    'width': W,
    'height': H,
    'base': 'hangar.webp',
    'palette': base64.b64encode(pal.tobytes()).decode(),
    'index': base64.b64encode(index.astype(np.uint8).tobytes()).decode(),
    'ranges': [{k: r[k] for k in ('start', 'length', 'rate', 'blend')} | {'name': r['name']} for r in ranges],
}
with open('public/bay/hangar.json', 'w') as f:
    json.dump(out, f, separators=(',', ':'))
print(len(ranges), 'ranges,', len(palette), 'palette entries,', int(moving.sum()), 'moving pixels')

if preview:
    gains = pal.astype(np.float32) / 64

    def frame(t):
        g = gains.copy()
        for r in ranges:
            s, k = r['start'], r['length']
            q = (np.arange(k) - t * r['rate']) % k
            i0 = np.floor(q).astype(int)
            f = (q - i0)[:, None] if r['blend'] else 0
            g[s:s + k] = gains[s + i0] * (1 - f) + gains[s + (i0 + 1) % k] * f
        g[0] = 1
        return np.clip(base.astype(np.float32) * g[index][..., ::-1], 0, 255).astype(np.uint8)

    for t in (0, 0.25, 0.5, 0.75, 1.0):
        cv2.imwrite(f'{preview}/frame-{t:.2f}.png', cv2.resize(frame(t), None, fx=2, fy=2, interpolation=cv2.INTER_NEAREST))
    # what moves, each range its own colour over the picture darkened
    rng = np.random.default_rng(3)
    colours = rng.integers(80, 255, (len(ranges) + 1, 3))
    which = np.zeros((H, W), int)
    for i, r in enumerate(ranges):
        which[(index >= r['start']) & (index < r['start'] + r['length'])] = i + 1
    m = (base * 0.35).astype(np.uint8)
    m[which > 0] = colours[which[which > 0]]
    cv2.imwrite(f'{preview}/map.png', cv2.resize(m, None, fx=2, fy=2, interpolation=cv2.INTER_NEAREST))
