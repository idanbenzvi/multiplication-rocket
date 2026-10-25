"""The 360° cockpit (components/cockpit360) from its concept art.

    python3 scripts/cockpit-360.py <nasa_punk_360.jpeg>

The art is an equirectangular panorama (2:1, the pilot's seat at its centre,
straight ahead in the middle of the picture), drawn with its windows and its
screens black. This writes public/cockpit/nasa-punk-360.webp, the same
picture with the glass of its six windows cut out (the windscreen, the two
side windows and the three panes of the canopy overhead), so space shows
through them, and prints where its seven screens' corners are and where its
little lit buttons are, which screens.ts's numbers come from (u across the
picture, v down it, both 0 … 1). Needs OpenCV (cv2) and numpy.

Each window is the black that's joined up with a point known to be on its
glass. The left window's black runs on round the bezels of the screens
mounted beside it, so thin strokes are opened away first (only the glass
itself goes), and each window keeps the outermost couple of pixels of its
black, the ink line round its frame.
"""
import os
import sys
import cv2
import numpy as np

OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'cockpit', 'nasa-punk-360.webp')

# a point on each pane of glass (u, v)
WINDOWS = {
    'canopy': (0.50, 0.20),
    'back-left': (0.15, 0.10),
    'back-right': (0.85, 0.10),
    'windscreen': (0.50, 0.44),
    'left': (0.38, 0.45),
    'right': (0.66, 0.45),
}
# a point on each screen (u, v)
SCREENS = {
    'pilot': (0.231, 0.430),
    'badges': (0.303, 0.433),
    'sound': (0.232, 0.527),
    'systems': (0.301, 0.525),
    'map': (0.500, 0.580),
    'modes': (0.769, 0.476),
}
BLACK = 26
# strokes thinner than this (px) are opened away from the glass
OPEN_PX = 9
# the ink line kept round each window's frame (px)
RIM_PX = 2


def component_at(mask, u, v):
    h, w = mask.shape
    n, lab = cv2.connectedComponents(mask, connectivity=8)
    i = lab[int(v * h), int(u * w)]
    if i == 0:
        raise SystemExit(f'no black at ({u}, {v})')
    return (lab == i).astype(np.uint8)


def corners(region):
    """the four corners of a screen's black, its extreme points along the diagonals"""
    ys, xs = np.nonzero(region)
    s = xs + ys
    d = xs - ys
    pick = lambda k: (int(xs[k]), int(ys[k]))
    return [pick(np.argmin(s)), pick(np.argmax(d)), pick(np.argmax(s)), pick(np.argmin(d))]


def leds(img, glass):
    """small round lit buttons (orange, red, green): bright saturated blobs, not the long orange straps"""
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    h, s, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    lit = ((s > 150) & (v > 170)).astype(np.uint8)
    n, lab, stats, cent = cv2.connectedComponentsWithStats(lit, connectivity=8)
    found = []
    H, W = lit.shape
    for i in range(1, n):
        x, y, bw, bh, area = stats[i]
        if not (12 <= area <= 420) or max(bw, bh) > 2.2 * min(bw, bh) or max(bw, bh) > 34:
            continue
        cx, cy = cent[i]
        if glass[int(cy), int(cx)]:
            continue
        hue = int(np.median(h[lab == i]))
        found.append((cx / W, cy / H, max(bw, bh) / W, hue))
    return found


def main():
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    img = cv2.imread(sys.argv[1])
    H, W = img.shape[:2]
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    black = (gray < BLACK).astype(np.uint8)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (OPEN_PX, OPEN_PX))

    glass = np.zeros_like(black)
    for name, (u, v) in WINDOWS.items():
        pane = component_at(black, u, v)
        pane = component_at(cv2.morphologyEx(pane, cv2.MORPH_OPEN, kernel), u, v)
        glass |= pane
        print(f'window {name}: {int(pane.sum())} px')
    # (the panes at the picture's left and right edges are one, round the back: the seam wraps)
    rim = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * RIM_PX + 1, 2 * RIM_PX + 1))
    wrapped = np.concatenate([glass[:, -16:], glass, glass[:, :16]], axis=1)
    clear = cv2.erode(wrapped, rim)[:, 16:-16]
    # a soft edge, a pixel wide
    alpha = 1.0 - cv2.GaussianBlur(clear.astype(np.float32), (3, 3), 0.8)

    rgba = np.dstack([img, np.clip(alpha * 255, 0, 255).astype(np.uint8)])
    # (what shows through the glass is space, so the colour under it doesn't matter: black compresses best)
    rgba[clear.astype(bool), :3] = 0
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    cv2.imwrite(OUT, rgba, [cv2.IMWRITE_WEBP_QUALITY, 92])
    print(f'wrote {os.path.relpath(OUT)}: {W} x {H}, {os.path.getsize(OUT) // 1024} KB')

    print('\n// screens: corners (u, v), clockwise from top-left')
    for name, (u, v) in SCREENS.items():
        quad = corners(component_at(black, u, v))
        pts = ', '.join(f'[{x / W:.4f}, {y / H:.4f}]' for x, y in quad)
        print(f'  {name}: [{pts}],')

    print('\n// lit buttons: [u, v, size, hue]')
    for u, v, size, hue in leds(img, glass):
        print(f'  [{u:.4f}, {v:.4f}, {size:.4f}, {hue}],')


if __name__ == '__main__':
    main()
