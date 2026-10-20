"""Cuts the Explorer (components/scene/ships.ts) out of its concept art.

    python3 scripts/explorer-ship.py <concept-art.jpeg>

writes public/ships/explorer.webp and explorer-admiral.webp (the same with
the orange trim turned gold), and prints where the visor and the engine bell
are, which ships.ts's numbers come from. Needs OpenCV (cv2) and numpy.

"C" coordinates are the art's at 1195 × 1600, less (100, 80). In the rocket's
200 × 400 frame the bell's bottom (C y 1275, x 500) goes where the classic's
nozzle is (100, 326) and the visor's middle at the classic porthole's height
(y 188).
"""
import sys
import cv2
import numpy as np

src = sys.argv[1]
img = cv2.imread(src)
S = img.shape[1] / 1195
O = lambda cx, cy: (round((cx + 100) * S), round((cy + 80) * S))
C = lambda x, y: (x / S - 100, y / S - 80)

# the ship: everything the dark outline encloses (the background is flooded from the edges)
hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
H, Sa, V = [hsv[..., i].astype(int) for i in range(3)]
dark = cv2.dilate((V < 90).astype(np.uint8) * 255, np.ones((3, 3), np.uint8))
h, w = dark.shape
mask = np.zeros((h + 2, w + 2), np.uint8)
for seed in [(5, 5), (w - 6, 5), (5, h - 6), (w - 6, h - 6), (w // 2, 5)]:
    cv2.floodFill(dark, mask, seed, 128)
ship = ((dark != 128) * 255).astype(np.uint8)
ship = cv2.morphologyEx(ship, cv2.MORPH_OPEN, np.ones((9, 9), np.uint8))
n, lab, stats, _ = cv2.connectedComponentsWithStats(ship)
ship = ((lab == 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA])) * 255).astype(np.uint8)

# the visor's glass, and the bell's bottom
g = ((H >= 85) & (H <= 108) & (Sa > 90) & (V > 70)).astype(np.uint8) * 255
(x0, y0), (x1, y1) = O(260, 500), O(500, 780)
box = np.zeros_like(g)
box[y0:y1, x0:x1] = 255
g = cv2.morphologyEx(g & box, cv2.MORPH_CLOSE, np.ones((15, 15), np.uint8))
cs, _ = cv2.findContours(g, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
(ex, ey), (ew, eh), ang = cv2.fitEllipse(max(cs, key=cv2.contourArea))
print('visor C', [round(v, 1) for v in C(ex, ey)], 'half-axes', round(ew / S / 2, 1), round(eh / S / 2, 1), 'angle', round(ang, 1))

# cut out a hair inside the outline, softened, at half size
alpha = cv2.GaussianBlur(cv2.erode(ship, np.ones((3, 3), np.uint8)), (0, 0), 1.0)
CROP = (66, 30, 930, 1446)
(ox0, oy0), (ox1, oy1) = O(*CROP[:2]), O(*CROP[2:])
cut = np.dstack([img, alpha])[oy0:oy1, ox0:ox1]
cut = cv2.resize(cut, ((ox1 - ox0) // 2, (oy1 - oy0) // 2), interpolation=cv2.INTER_AREA)
k = 138 / (1275 - C(ex, ey)[1])
vb = lambda cx, cy: (100 + (cx - 500) * k, 188 + (cy - C(ex, ey)[1]) * k)
print('picture in the frame', [round(v, 2) for v in vb(*CROP[:2])], [round(v, 2) for v in vb(*CROP[2:])])
print('visor in the frame', [round(v, 2) for v in vb(*C(ex, ey))], 'half-axes', round(ew / S / 2 * k, 2), round(eh / S / 2 * k, 2))
cv2.imwrite('public/ships/explorer.webp', cut, [cv2.IMWRITE_WEBP_QUALITY, 88])

# the admiral's: the bright orange trim turned gold (the copper bell, darker, stays)
bgr, a = cut[..., :3], cut[..., 3]
f = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV).astype(np.float32)
fh, fs, fv = f[..., 0], f[..., 1], f[..., 2]
wt = np.clip((fs - 120) / 50, 0, 1) * np.clip((fv - 135) / 40, 0, 1) * ((fh >= 2) & (fh <= 22))
wt = cv2.GaussianBlur(wt.astype(np.float32), (0, 0), 0.8)[..., None]
gold = np.dstack([24 + (fh - 12) * 0.25, fs * 0.82, np.minimum(255, fv * 1.08 + 18)])
out = cv2.cvtColor((f * (1 - wt) + gold * wt).astype(np.uint8), cv2.COLOR_HSV2BGR)
cv2.imwrite('public/ships/explorer-admiral.webp', np.dstack([out, a]), [cv2.IMWRITE_WEBP_QUALITY, 88])
