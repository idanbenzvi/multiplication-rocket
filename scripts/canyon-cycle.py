"""Turns the About page's canyon (pixel art) into a colour-cycling scene.

    python3 scripts/canyon-cycle.py <canyon.jpeg> [--preview <dir>]

writes public/about/canyon.json: the picture at its pixel-art size as one
palette index per pixel, its 256-colour palette, and the palette's cycling
ranges, which components/about/CycleScene.tsx animates in a WebGL shader the
way Mark Ferrari's scenes were (docs/plans/2026-10-21-canyon-cycle.md). With
--preview, it also plays the cycle here and saves a few frames. Needs OpenCV
(cv2) and numpy.

What moves: ripples drift across the lake and its reflections, the shallows
lap at the shore, sparkles glint on the water, the stars twinkle, the
rocket's porthole pulses and its engine flickers. Each is a run of palette
entries (a range) that the shader rotates; a pixel's index within its range
is its "phase", laid out so the rotation reads as motion: along the ripples,
towards the shore, outwards from the porthole. The rest of the picture is a
palette of its own colours, ordered-dithered.
"""
import base64
import json
import sys
import cv2
import numpy as np

W, H = 640, 357
src = sys.argv[1]
preview = sys.argv[sys.argv.index('--preview') + 1] if '--preview' in sys.argv else None

img = cv2.resize(cv2.imread(src), (W, H), interpolation=cv2.INTER_AREA)
rgb = img[..., ::-1].astype(np.float32)
hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV).astype(int)
hh, ss, vv = hsv[..., 0], hsv[..., 1], hsv[..., 2]
gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(int)
lum = rgb @ np.array([0.299, 0.587, 0.114], np.float32)
yy, xx = np.mgrid[0:H, 0:W]
BAYER = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]], np.float32) / 16 - 0.47
bayer = BAYER[yy % 4, xx % 4]

# ---------- where things move ----------

turq = ((hh >= 78) & (hh <= 102) & (ss > 70) & (vv > 110)).astype(np.uint8)
n, lab, st, _ = cv2.connectedComponentsWithStats(turq)
water = np.isin(lab, [i for i in range(1, n) if st[i, 4] > 300]).astype(np.uint8)
lake = cv2.morphologyEx(water, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
cs, _ = cv2.findContours(lake, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
lake = np.zeros_like(lake)
cv2.drawContours(lake, [c for c in cs if cv2.contourArea(c) > 300], -1, 1, -1)
# the rocket stands in front of the water: its edges aren't shore
rocket = np.zeros_like(lake)
rocket[105:325, 392:520] = 1
shore = cv2.distanceTransform(((lake | rocket) > 0).astype(np.uint8), cv2.DIST_L2, 5)
inside = lake > 0
bright = (vv > 205) & (ss < 120)
shallow = inside & (shore < 7) & ((turq > 0) | bright)
sparkle = inside & bright & ~shallow
ripple = inside & (turq > 0) & ~bright & ~shallow
reflect = inside & (turq == 0) & ~bright & (rocket == 0)

sky = (gray < 75).astype(np.uint8) * 255
m = np.zeros((H + 2, W + 2), np.uint8)
for x in range(0, W, 4):
    if sky[0, x] == 255:
        cv2.floodFill(sky, m, (x, 0), 128)
skyreach = cv2.morphologyEx((sky == 128).astype(np.uint8), cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
# the skyline: the first row of each column with rock in it (the sky's dark reaches into the cliffs' shadows)
rocky = (hh <= 25) & (ss > 90) & (vv > 60)
skyline = np.where(rocky.any(axis=0), rocky.argmax(axis=0), H)
med = cv2.medianBlur(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY), 5).astype(int)
cand = ((gray - med > 22) & (gray > 80)).astype(np.uint8)
skyfrac = cv2.blur(skyreach.astype(np.float32), (9, 9))
# (not a bright speck on a cliff's rim: no rock near it)
rock = cv2.dilate(rocky.astype(np.uint8), np.ones((7, 7), np.uint8))
n2, lab2, st2, _ = cv2.connectedComponentsWithStats(cand)
stars = np.zeros((H, W), bool)
star_id = np.zeros((H, W), int)
for i in range(1, n2):
    x, y, w, h, a = st2[i]
    cx, cy = x + w // 2, y + h // 2
    if a <= 6 and skyfrac[cy, cx] > 0.75 and cy < skyline[cx] - 3 and not rock[cy, cx]:
        stars |= lab2 == i
        star_id[lab2 == i] = i

pd = np.hypot(xx - 435, yy - 188)
porthole = (pd < 13) & (((hh >= 75) & (hh <= 105) & (ss > 40) & (vv > 140)) | ((vv > 230) & (ss < 60)))
ed = np.hypot(xx - 456, (yy - 309) * 1.4)
engine = (ed < 13) & (vv > 190) & (hh >= 5) & (hh <= 35)

# ---------- the cycling ranges ----------
# Each: its pixels, how many tiers of brightness (each a range of K colours),
# the colours of a tier's range (from the tier's own colour), each pixel's
# phase, and how fast it turns (palette steps a second; blended in between).

def wave(k, amp):
    return lambda base, j: base * (1 + amp * np.sin(2 * np.pi * j / k))

def towards(colour, weights):
    return lambda base, j: base + (np.array(colour, np.float32) - base) * weights[j]

ripple_phase = np.floor(xx / 3 + 2.5 * np.sin(yy * 0.55) + 1.5 * np.sin(yy * 1.7 + xx * 0.05))
sparkle_ids = cv2.connectedComponents(sparkle.astype(np.uint8))[1]
RANGES = [
    # name, mask, tiers, K, palette(base, j), phase, rate
    ('ripples', ripple, 3, 8, wave(8, 0.07), ripple_phase, 3.0),
    ('reflections', reflect, 4, 8, wave(8, 0.06), np.floor(xx / 4 + 3 * np.sin(yy * 0.4)), 2.2),
    ('shallows', shallow, 3, 8, towards((236, 255, 252), [0, 0, 0.06, 0.2, 0.45, 0.2, 0.06, -0.06]), -np.floor(shore), 2.4),
    ('sparkles', sparkle, 1, 8, towards((255, 252, 230), [0.15, 0.55, 1.0, 0.55, 0.15, -0.25, -0.35, -0.25]), sparkle_ids * 3 + xx // 2, 4.5),
    ('stars', stars, 2, 8, towards((22, 18, 44), [0, 0, 0, 0.15, 0.55, 0.8, 0.55, 0.15]), star_id * 5 % 8, 1.6),
    ('porthole', porthole, 2, 8, towards((255, 255, 255), [0, 0.1, 0.3, 0.55, 0.3, 0.1, 0, -0.08]), np.floor(pd * 0.6), 2.6),
    ('engine', engine, 1, 8, towards((255, 248, 220), [0.32, 0.22, 0.28, 0.12, 0.24, 0.34, 0.16, 0.26]), np.floor(ed * 0.6), 7.0),
]

index = np.zeros((H, W), np.int32)
palette = []
ranges = []
animated = np.zeros((H, W), bool)
for name, mask, tiers, k, pal, phase, rate in RANGES:
    mask = mask & ~animated
    animated |= mask
    if not mask.any():
        continue
    # tiers: its own colours (clustered, darkest first), their edges dithered
    if tiers > 1:
        _, _, cc = cv2.kmeans(rgb[mask], tiers, None, (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 30, 0.5), 3, cv2.KMEANS_PP_CENTERS)
        cc = cc[np.argsort(cc @ np.array([0.299, 0.587, 0.114], np.float32))]
        d = ((rgb[..., None, :] + bayer[..., None, None] * 18 - cc[None, None]) ** 2).sum(-1)
        tier = d.argmin(-1)
    else:
        cc = rgb[mask].mean(axis=0)[None]
        tier = np.zeros((H, W), int)
    for t in range(tiers):
        base = cc[t]
        start = len(palette)
        for j in range(k):
            palette.append(np.clip(pal(base, j), 0, 255))
        ranges.append({'name': f'{name}{t}', 'start': start, 'length': k, 'rate': rate, 'blend': True})
        px = mask & (tier == t)
        index[px] = start + (phase[px].astype(int) % k)

# ---------- the rest: its own colours, ordered-dithered ----------

static = ~animated
STATIC = 256 - len(palette)
lab_img = cv2.cvtColor(img, cv2.COLOR_BGR2LAB).astype(np.float32)
samples = lab_img[static]
crit = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 40, 0.2)
cv2.setRNGSeed(7)
_, _, centres = cv2.kmeans(samples, STATIC, None, crit, 3, cv2.KMEANS_PP_CENTERS)
cent_rgb = cv2.cvtColor(centres.reshape(1, -1, 3).astype(np.uint8), cv2.COLOR_LAB2BGR)[0][:, ::-1].astype(np.float32)
target = (rgb + bayer[..., None] * 14)[static]
best = np.zeros(len(target), int)
for i in range(0, len(target), 20000):
    d = ((target[i:i + 20000, None, :] - cent_rgb[None]) ** 2).sum(-1)
    best[i:i + 20000] = d.argmin(1)
s0 = len(palette)
palette.extend(cent_rgb)
index[static] = s0 + best

palette = np.array(palette).round().astype(np.uint8)
assert len(palette) == 256, len(palette)
out = {
    'width': W,
    'height': H,
    'palette': base64.b64encode(palette.tobytes()).decode(),
    'index': base64.b64encode(index.astype(np.uint8).tobytes()).decode(),
    'ranges': [{k: r[k] for k in ('start', 'length', 'rate', 'blend')} | {'name': r['name']} for r in ranges],
}
with open('public/about/canyon.json', 'w') as f:
    json.dump(out, f, separators=(',', ':'))
print(len(ranges), 'ranges,', s0, 'cycling colours,', STATIC, 'still ones')

if preview:
    pal = palette.astype(np.float32)

    def frame(t):
        p = pal.copy()
        for r in ranges:
            s, k = r['start'], r['length']
            shift = t * r['rate']
            j = np.arange(k)
            q = (j - shift) % k
            i0 = np.floor(q).astype(int)
            f = (q - i0)[:, None]
            p[s:s + k] = pal[s + i0] * (1 - f) + pal[s + (i0 + 1) % k] * f
        return p[index].astype(np.uint8)[..., ::-1]

    for t in (0, 0.33, 0.66, 1.0, 1.33):
        cv2.imwrite(f'{preview}/frame-{t:.2f}.png', frame(t))
