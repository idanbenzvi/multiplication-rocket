"""Makes the cockpit's gritty metal textures (16-bit pixel art).

    python3 scripts/cockpit-textures.py

writes src/components/cockpit/tex/: transparent overlays laid over the
cockpit's banded metal (cockpit.css), each pixel drawn 2 × 2 CSS px with
crisp edges, so every plate is stippled, scratched and grimy rather than a
flat colour:

- grit.png: stipple (dark and light specks), short scratches, grime;
- wear.png: heavier, for the hazard stripes and the lever's housing: chips
  and scuffs as well;
- rubber.png: the lever's gaiter, fine speckle.

All tile seamlessly. Needs numpy and OpenCV (cv2).
"""
import os
import cv2
import numpy as np

OUT = 'src/components/cockpit/tex'
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(1985)


def layer(n):
    return np.zeros((n, n, 4), np.float32)


def speck(img, frac, colour, alpha):
    n = img.shape[0]
    m = rng.random((n, n)) < frac
    a = rng.uniform(*alpha, (n, n))
    img[m, :3] = colour
    img[m, 3] = np.maximum(img[m, 3], a[m])


def scratches(img, count, colour, alpha, length):
    n = img.shape[0]
    for _ in range(count):
        x, y = rng.integers(0, n, 2)
        dx, dy = rng.choice([(1, 1), (1, -1), (1, 0), (2, 1)])
        for i in range(rng.integers(*length)):
            # (wrapping round, so it tiles)
            xx, yy = (x + i * dx) % n, (y + i * dy // max(1, dx)) % n
            img[yy, xx, :3] = colour
            img[yy, xx, 3] = max(img[yy, xx, 3], alpha)


def blobs(img, count, colour, alpha, size):
    n = img.shape[0]
    for _ in range(count):
        x, y = rng.integers(0, n, 2)
        r = rng.integers(*size)
        for yy in range(-r, r + 1):
            for xx in range(-r, r + 1):
                if xx * xx + yy * yy <= r * r and rng.random() < 0.7:
                    px, py = (x + xx) % n, (y + yy) % n
                    img[py, px, :3] = colour
                    img[py, px, 3] = max(img[py, px, 3], alpha * rng.uniform(0.6, 1))


def save(name, img):
    out = np.clip(img, 0, 1)
    bgra = (out[..., [2, 1, 0, 3]] * 255).round().astype(np.uint8)
    cv2.imwrite(f'{OUT}/{name}', bgra)


DARK = (0.03, 0.03, 0.06)
LIGHT = (0.85, 0.88, 1.0)

g = layer(64)
speck(g, 0.13, DARK, (0.22, 0.42))
speck(g, 0.05, LIGHT, (0.08, 0.18))
scratches(g, 7, LIGHT, 0.2, (3, 9))
blobs(g, 4, DARK, 0.35, (1, 3))
save('grit.png', g)

w = layer(64)
speck(w, 0.18, DARK, (0.25, 0.5))
speck(w, 0.06, LIGHT, (0.1, 0.22))
scratches(w, 12, LIGHT, 0.28, (3, 11))
blobs(w, 7, DARK, 0.55, (1, 3))
# chips: bare metal showing through
blobs(w, 5, (0.55, 0.58, 0.68), 0.6, (1, 2))
save('wear.png', w)

r = layer(32)
speck(r, 0.22, DARK, (0.3, 0.55))
speck(r, 0.07, (0.4, 0.4, 0.45), (0.15, 0.3))
save('rubber.png', r)
print('wrote', sorted(os.listdir(OUT)))
