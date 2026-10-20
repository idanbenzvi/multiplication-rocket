"""Cuts a ship (components/scene/ships.ts) out of its concept art.

    python3 scripts/ship-cutout.py explorer <concept-art.jpeg>
    python3 scripts/ship-cutout.py nova <concept-art.jpeg>

writes public/ships/<ship>.webp and <ship>-admiral.webp (the same with its
trim turned gold), and prints where its window and its picture go in the
rocket's 200 × 400 frame, which ships.ts's numbers come from. Needs OpenCV
(cv2) and numpy.

"C" coordinates are the art's at 1195 × 1600, less (100, 80). In the frame,
the window's middle goes at the classic porthole's height (y 188) and the
engine bell's bottom middle on the centre line (x 100), at the ship's scale:
the Explorer's has its bell where the classic's nozzle is (y 326), Nova's has
its window the Explorer's size.
"""
import sys
import cv2
import numpy as np

SHIPS = {
    'explorer': {
        'glass_box': (260, 500, 500, 780), 'glass_hue': (85, 108), 'glass_sat': 90, 'outline_v': 90,
        'bell': (500, 1275), 'scale': ('nozzle', 326), 'crop': (66, 30, 930, 1446),
        # the bright orange trim (the copper bell, darker, stays)
        'trim': lambda h, s, v: np.clip((s - 120) / 50, 0, 1) * np.clip((v - 135) / 40, 0, 1) * ((h >= 2) & (h <= 22)),
        'gold_saturation': 0.82,
    },
    'nova': {
        'glass_box': (500, 470, 760, 730), 'glass_hue': (78, 105), 'glass_sat': 80, 'outline_v': 110,
        'bell': (505, 1322), 'scale': ('window', 21.35), 'crop': (132, 10, 866, 1451),
        # the rose gold (warm and fairly saturated; the cream panels are paler)
        'trim': lambda h, s, v: np.clip((s - 55) / 30, 0, 1) * np.clip((v - 110) / 40, 0, 1) * ((h <= 18) | (h >= 170)),
        'gold_saturation': 1.45,
    },
}

name, src = sys.argv[1], sys.argv[2]
cfg = SHIPS[name]
img = cv2.imread(src)
S = img.shape[1] / 1195
O = lambda cx, cy: (round((cx + 100) * S), round((cy + 80) * S))
C = lambda x, y: (x / S - 100, y / S - 80)

# the ship: everything the dark outline encloses (the background is flooded from the edges)
hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
H, Sa, V = [hsv[..., i].astype(int) for i in range(3)]
dark = cv2.dilate((V < cfg['outline_v']).astype(np.uint8) * 255, np.ones((3, 3), np.uint8))
h, w = dark.shape
mask = np.zeros((h + 2, w + 2), np.uint8)
for seed in [(5, 5), (w - 6, 5), (5, h - 6), (w - 6, h - 6), (w // 2, 5)]:
    cv2.floodFill(dark, mask, seed, 128)
ship = ((dark != 128) * 255).astype(np.uint8)
ship = cv2.morphologyEx(ship, cv2.MORPH_OPEN, np.ones((9, 9), np.uint8))
n, lab, stats, _ = cv2.connectedComponentsWithStats(ship)
ship = ((lab == 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA])) * 255).astype(np.uint8)

# the window's glass
lo, hi = cfg['glass_hue']
g = ((H >= lo) & (H <= hi) & (Sa > cfg['glass_sat']) & (V > 70)).astype(np.uint8) * 255
x0, y0, x1, y1 = cfg['glass_box']
(x0, y0), (x1, y1) = O(x0, y0), O(x1, y1)
box = np.zeros_like(g)
box[y0:y1, x0:x1] = 255
g = cv2.morphologyEx(g & box, cv2.MORPH_CLOSE, np.ones((15, 15), np.uint8))
cs, _ = cv2.findContours(g, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
(ex, ey), (ew, eh), ang = cv2.fitEllipse(max(cs, key=cv2.contourArea))
gx, gy = C(ex, ey)
print('window C', round(gx, 1), round(gy, 1), 'half-axes', round(ew / S / 2, 1), round(eh / S / 2, 1), 'angle', round(ang, 1))

# into the frame
bx, by = cfg['bell']
how, target = cfg['scale']
k = (target - 188) / (by - gy) if how == 'nozzle' else target / (ew / S / 2)
vb = lambda cx, cy: (100 + (cx - bx) * k, 188 + (cy - gy) * k)
crop = cfg['crop']
print('scale', round(k, 5))
print('picture in the frame', [round(v, 2) for v in vb(*crop[:2])], [round(v, 2) for v in vb(*crop[2:])])
print('window in the frame', [round(v, 2) for v in vb(gx, gy)], 'half-axes', round(ew / S / 2 * k, 2), round(eh / S / 2 * k, 2))
print('nozzle (the bell bottom) at y', round(vb(bx, by)[1], 1))

# cut out a hair inside the outline, softened, at half size
alpha = cv2.GaussianBlur(cv2.erode(ship, np.ones((3, 3), np.uint8)), (0, 0), 1.0)
(ox0, oy0), (ox1, oy1) = O(*crop[:2]), O(*crop[2:])
cut = np.dstack([img, alpha])[oy0:oy1, ox0:ox1]
cut = cv2.resize(cut, ((ox1 - ox0) // 2, (oy1 - oy0) // 2), interpolation=cv2.INTER_AREA)
cv2.imwrite(f'public/ships/{name}.webp', cut, [cv2.IMWRITE_WEBP_QUALITY, 88])

# the admiral's: the trim turned gold (not what's behind the window's glass)
bgr, a = cut[..., :3], cut[..., 3]
f = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV).astype(np.float32)
fh, fs, fv = f[..., 0], f[..., 1], f[..., 2]
wt = cfg['trim'](fh, fs, fv).astype(np.float32)
glass = np.zeros(wt.shape, np.uint8)
centre = ((O(gx, gy)[0] - ox0) / 2, (O(gx, gy)[1] - oy0) / 2)
cv2.ellipse(glass, ((centre[0], centre[1]), (ew / 2 * 1.04, eh / 2 * 1.04), ang), 255, -1)
wt[glass > 0] = 0
wt = cv2.GaussianBlur(wt, (0, 0), 0.8)[..., None]
gold = np.dstack([24 + (np.where(fh > 90, fh - 180, fh) - 12) * 0.25, np.minimum(255, fs * cfg['gold_saturation']), np.minimum(255, fv * 1.08 + 18)])
out = cv2.cvtColor((f * (1 - wt) + gold * wt).astype(np.uint8), cv2.COLOR_HSV2BGR)
cv2.imwrite(f'public/ships/{name}-admiral.webp', np.dstack([out, a]), [cv2.IMWRITE_WEBP_QUALITY, 88])
