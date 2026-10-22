"""Finds the winged deer's stars for the studio splash, from the sky with only its stars lit.

    python3 scripts/splash-stars.py <sky-with-stars.jpeg>

prints src/components/splash/deerStars.ts (redirect it there): each of the constellation's
glowing stars, as fractions of the deer picture (public/splash/deer.webp), and
how big it glows. The splash lights them one by one before the deer itself
appears over them.

The picture of the sky with the stars lit (Gemini, from the deer's
constellation picture with the deer taken out) is in the sky's own frame, not
the deer's. So its stars are matched to the deer's (the bright white points
in deer.webp) by a scale and shift fitted to them, and each is placed exactly
on the deer star it matches. A star that matches none is a star of the sky,
not the deer's, and is left out. Needs OpenCV (cv2) and numpy.
"""
import sys
import cv2
import numpy as np

sky = cv2.imread(sys.argv[1])
deer = cv2.imread('public/splash/deer.webp', cv2.IMREAD_UNCHANGED)
DH, DW = deer.shape[:2]

# the sky's lit stars: white cores (two close together are two stars) and the cyan glow round each
hsv = cv2.cvtColor(sky, cv2.COLOR_BGR2HSV).astype(int)
g = cv2.cvtColor(sky, cv2.COLOR_BGR2GRAY)
glow = ((hsv[..., 0] >= 80) & (hsv[..., 0] <= 100) & (hsv[..., 2] > 150) & (hsv[..., 1] > 60)) | (g > 235)
# (a core: the brightest point for a few pixels round, in a glow)
soft = cv2.GaussianBlur(g, (5, 5), 1.2).astype(int)
peak = (soft == cv2.dilate(soft.astype(np.uint8), np.ones((9, 9), np.uint8)).astype(int)) & (soft > 190) & (glow > 0)
n, lab, st, cen = cv2.connectedComponentsWithStats(peak.astype(np.uint8))
cores = np.array([cen[i] for i in range(1, n)])
yy, xx = np.mgrid[0:sky.shape[0], 0:sky.shape[1]]
# each core's glow: the lit pixels round it nearer to it than to any other core
nearest = np.argmin([np.hypot(xx - x, yy - y) for x, y in cores], axis=0)
reach = np.min([np.hypot(xx - x, yy - y) for x, y in cores], axis=0)
radius = np.array([np.sqrt((glow & (nearest == i) & (reach < 22)).sum() / np.pi) for i in range(len(cores))])

# the deer's stars: its brightest white points
dg = cv2.cvtColor(deer[..., :3], cv2.COLOR_BGR2GRAY)
white = cv2.morphologyEx(((dg > 240) & (deer[..., 3] > 200)).astype(np.uint8), cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
n, lab, st, cen = cv2.connectedComponentsWithStats(white)
points = np.array([cen[i] for i in range(1, n) if st[i, 4] >= 6])

# sky → deer: a scale and shift, from a first guess (the wing's tip and the back hoof), refined on the stars that match
s, t = 1.575, np.array([-419.0, 1.0])
for _ in range(8):
    d = np.linalg.norm((cores * s + t)[:, None] - points[None], axis=2)
    ok = d.min(1) < 12
    a, b = cores[ok], points[d.argmin(1)[ok]]
    s = ((a - a.mean(0)) * (b - b.mean(0))).sum() / ((a - a.mean(0)) ** 2).sum()
    t = b.mean(0) - s * a.mean(0)
d = np.linalg.norm((cores * s + t)[:, None] - points[None], axis=2)
match = d.argmin(1)
ok = d.min(1) < 6
print(f'// {ok.sum()} of {len(cores)} lit stars on the deer (scale {s:.4f}), worst {d.min(1)[ok].max():.1f} px off', file=sys.stderr)

print("""// The winged deer's stars, lit one by one before the deer appears over them
// (StudioSplash): where each is, as fractions of the deer picture
// (public/splash/deer.webp), and how far its glow reaches, as a fraction of
// the picture's width. Made by scripts/splash-stars.py; don't edit by hand.
export const DEER_STARS: ReadonlyArray<{ x: number; y: number; r: number }> = [""")
for i in np.argsort(cores[:, 1]):
    if not ok[i]:
        continue
    x, y = points[match[i]]
    print(f'  {{ x: {x / DW:.4f}, y: {y / DH:.4f}, r: {radius[i] * s / DW:.4f} }},')
print('];')
