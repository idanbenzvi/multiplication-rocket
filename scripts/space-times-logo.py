#!/usr/bin/env python3
"""The SPACE TIMES logo (docs/brand/space-times-logo.jpg, Gemini's art) cut
into the layers SpaceTimesLogo.tsx animates, in public/brand/space-times/:

  base.webp      the logo without its background, the pieces that move
                 taken out of it (the tokens' places on the ring filled in)
  plate.webp     where the letters' plate is (alpha only): the letters drawn
                 again over what passes behind them
  shine.webp     the letters' chrome (alpha: how bright), for a shine to sweep
  globe.webp     the globe's lines (alpha), for a light to scan down them
  sparks.webp    the lightning (alpha), to flicker
  token-N.webp   the + × − ÷ tokens, to orbit the globe
  rocket-N.webp  the little rockets, to swoop off along their trails
  sparkle-N.webp the sparkles, to twinkle

and src/components/logo/layout.ts, where each one is.

The background is a near-black navy. What's lighter than it is the logo's
light, its brightness above the navy its opacity (and its colour that light
unmultiplied from the navy), so a glow stays a glow on anything dark; the
haze of nebula round the logo is too faint to keep. The globe's glass and the
letters' dark plate would come out see-through that way, so they're kept
solid.

  python3 scripts/space-times-logo.py
"""

import json
import os

import cv2
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'docs/brand/space-times-logo.jpg')
OUT = os.path.join(ROOT, 'public/brand/space-times')
LAYOUT = os.path.join(ROOT, 'src/components/logo/layout.ts')

NAVY = np.array([1, 2, 33], np.float32) / 255

# measured on the art (1024 × 1024): the globe (fitted to its rim), and the
# tokens' centres and radii on the ring
GLOBE = (518.5, 496.9, 261.0)
TOKENS = [('+', 685, 252, 30), ('×', 827.5, 255, 31), ('−', 180, 632.5, 28), ('×', 165, 720, 31), ('÷', 296, 730, 30)]
# the rockets: their outline (nose, then round their trail), and which way they fly
ROCKETS = [
    ([(196, 206), (268, 236), (345, 322), (318, 346), (238, 272), (190, 240)], (-0.69, -0.72)),
    ([(160, 276), (222, 300), (300, 352), (284, 372), (210, 330), (158, 298)], (-0.82, -0.57)),
    ([(758, 660), (812, 684), (856, 726), (846, 748), (800, 722), (752, 684)], (0.82, 0.57)),
    ([(700, 684), (760, 730), (812, 792), (800, 812), (740, 770), (692, 704)], (0.7, 0.71)),
]
# the sparkles: centre and reach
SPARKLES = [(512, 205, 26), (325, 247, 22), (722, 320, 13), (872, 565, 24), (850, 645, 13), (157, 485, 14), (135, 465, 9), (437, 832, 15), (185, 342, 11)]
# the words' boxes, for the letters' plate
WORDS = [(188, 362, 842, 520), (230, 508, 822, 682)]
# where the lightning crackles
SPARK_BOXES = [(760, 200, 885, 400), (575, 290, 720, 375), (118, 560, 335, 800)]


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def disc(shape, x, y, r):
    m = np.zeros(shape, np.uint8)
    cv2.circle(m, (int(round(x)), int(round(y))), int(round(r)), 1, -1, cv2.LINE_AA)
    return m.astype(bool)


def ring_band(shape, ctr, long_r, short_r, u):
    """the ring's glowing tube along the orbit: a cyan glow, its body, and a white-hot core (colour, alpha)"""
    h, w = shape
    angle = float(np.degrees(np.arctan2(u[1], u[0])))
    centre = (int(round(ctr[0] * 16)), int(round(ctr[1] * 16)))
    axes = (int(round(long_r * 16)), int(round(short_r * 16)))

    def stroke(width, blur):
        m = np.zeros((h, w), np.float32)
        cv2.ellipse(m, centre, axes, angle, 0, 360, 1.0, width, cv2.LINE_AA, 4)
        return cv2.GaussianBlur(m, (0, 0), blur)

    c = np.zeros((h, w, 3), np.float32)
    a = np.zeros((h, w), np.float32)
    for (width, blur, strength, colour) in [(22, 6, 0.55, (0.36, 0.86, 1.0)), (9, 1.2, 0.95, (0.42, 0.9, 1.0)), (3, 0.8, 1.0, (0.94, 1.0, 1.0))]:
        k = stroke(width, blur) * strength
        c = c * (a * (1 - k))[..., None] + np.array(colour, np.float32) * k[..., None]
        a = k + a * (1 - k)
        c = c / np.maximum(a, 1e-4)[..., None]
    return c, a


def fit_orbit():
    """the tokens' orbit: the ellipse through their centres (its centre, long and short radii, and axes: u up the long one to the right, v across it, downwards)"""
    P = np.array([(x, y) for _, x, y, _ in TOKENS], float)
    A = np.array([[x * x, x * y, y * y, x, y, 1] for x, y in P])
    a_, b_, c_, d_, e_, f_ = np.linalg.svd(A)[2][-1]
    M = np.array([[a_, b_ / 2], [b_ / 2, c_]])
    ctr = np.linalg.solve(2 * M, [-d_, -e_])
    F = f_ + (d_ * ctr[0] + e_ * ctr[1]) / 2
    ev, V = np.linalg.eigh(M)
    radii = np.sqrt(-F / ev)
    # the long axis, pointing up and to the right
    i_long = int(np.argmax(radii))
    u = V[:, i_long] * (1 if V[0, i_long] > 0 else -1)
    if u[1] > 0:
        u = -u
    v = np.array([-u[1], u[0]])
    if v[1] < 0:
        v = -v
    long_r, short_r = float(radii[i_long]), float(radii[1 - i_long])
    return ctr, long_r, short_r, u, v


def main():
    bgr = cv2.imread(SRC)
    rgb = bgr[..., ::-1].astype(np.float32) / 255
    h, w = rgb.shape[:2]
    lum = rgb.max(-1)

    ctr, long_r, short_r, u, v = fit_orbit()

    # ---- the light above the navy, and its colour
    a_raw = (np.clip(rgb - NAVY, 0, None) / (1 - NAVY)).max(-1)
    col = np.clip(NAVY + (rgb - NAVY) / np.maximum(a_raw, 1e-3)[..., None], 0, 1)
    alpha = smoothstep(0.3, 0.62, a_raw) * a_raw

    # ---- the solid parts: the globe's glass, and the letters with their dark plate
    globe = disc((h, w), *GLOBE)
    letters = np.zeros((h, w), bool)
    for x0, y0, x1, y1 in WORDS:
        box = np.zeros((h, w), bool)
        box[y0:y1, x0:x1] = True
        letters |= box & (lum > 0.55)
    letters = cv2.morphologyEx(letters.astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    plate = cv2.dilate(letters, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (29, 29)))
    plate = cv2.morphologyEx(plate, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
    # (holes filled: everything the plate's outline encloses)
    ff = plate.copy() * 255
    mask = np.zeros((h + 2, w + 2), np.uint8)
    cv2.floodFill(ff, mask, (0, 0), 128)
    plate = (ff != 128)
    solid = globe | plate
    alpha = np.where(solid, 1.0, alpha)
    col = np.where(solid[..., None], rgb, col)

    # ---- specks of dust round it go
    keep = (alpha > 0.12).astype(np.uint8)
    n, lab, stats, _ = cv2.connectedComponentsWithStats(keep, connectivity=8)
    small = np.isin(lab, [i for i in range(1, n) if stats[i, cv2.CC_STAT_AREA] < 36])
    alpha = np.where(small & ~solid, 0, alpha)

    # ---- the pieces that move, taken out
    layout = {'tokens': [], 'rockets': [], 'sparkles': []}
    os.makedirs(OUT, exist_ok=True)
    for f in os.listdir(OUT):
        os.remove(os.path.join(OUT, f))

    def save_piece(name, m, pad=4):
        ys, xs = np.nonzero(m)
        x0, y0, x1, y1 = xs.min() - pad, ys.min() - pad, xs.max() + pad + 1, ys.max() + pad + 1
        x0, y0 = max(0, x0), max(0, y0)
        a = (alpha * m)[y0:y1, x0:x1]
        c = col[y0:y1, x0:x1]
        out = np.dstack([c[..., ::-1] * 255, a * 255]).round().astype(np.uint8)
        cv2.imwrite(os.path.join(OUT, name), out, [cv2.IMWRITE_WEBP_QUALITY, 92])
        return x0, y0, x1 - x0, y1 - y0

    taken = np.zeros((h, w), bool)
    fill = np.zeros((h, w), np.uint8)
    # tokens: a disc round each (its glow ring with it)
    for i, (sym, x, y, r) in enumerate(TOKENS):
        m = np.zeros((h, w), np.float32)
        cv2.circle(m, (int(x), int(y)), int(r + 7), 1, -1, cv2.LINE_AA)
        m = cv2.GaussianBlur(m, (0, 0), 1.5)
        ys, xs = np.nonzero(m > 0.01)
        x0, y0, x1, y1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
        # (the token itself solid, as drawn, its dark face and all; its glow round it as light)
        face = cv2.GaussianBlur(disc((h, w), x, y, r - 1).astype(np.float32), (0, 0), 1.0)
        a = np.maximum(alpha * m, face)[y0:y1, x0:x1]
        c = (col * (1 - face[..., None]) + rgb * face[..., None])[y0:y1, x0:x1]
        cv2.imwrite(os.path.join(OUT, f'token-{i}.webp'), np.dstack([c[..., ::-1] * 255, a * 255]).round().astype(np.uint8), [cv2.IMWRITE_WEBP_QUALITY, 92])
        layout['tokens'].append({'symbol': sym, 'x': float(x), 'y': float(y), 'left': int(x0), 'top': int(y0), 'width': int(x1 - x0), 'height': int(y1 - y0)})
        cv2.circle(fill, (int(x), int(y)), int(r + 8), 1, -1)
    # rockets: their bright pixels inside their outline (not the globe's or the letters' they cross)
    for i, (poly, heading) in enumerate(ROCKETS):
        pm = np.zeros((h, w), np.uint8)
        cv2.fillPoly(pm, [np.array(poly, np.int32)], 1)
        pm = cv2.dilate(pm, np.ones((5, 5), np.uint8)).astype(bool)
        m = pm & (alpha > 0.04) & ~solid
        x0, y0, bw, bh = save_piece(f'rocket-{i}.webp', m)
        layout['rockets'].append({'left': int(x0), 'top': int(y0), 'width': int(bw), 'height': int(bh), 'dx': heading[0], 'dy': heading[1]})
        taken |= m
    # sparkles
    for i, (x, y, r) in enumerate(SPARKLES):
        m = disc((h, w), x, y, r) & ~solid
        x0, y0, bw, bh = save_piece(f'sparkle-{i}.webp', m, pad=1)
        layout['sparkles'].append({'x': float(x), 'y': float(y), 'left': int(x0), 'top': int(y0), 'width': int(bw), 'height': int(bh)})
        taken |= m

    # the base: without them; where each token was, the stretch of ring beside it carried in
    # (from along the orbit, on whichever side is clear of the other tokens and the letters)
    base_a = np.where(taken, 0, alpha)
    prem = col * base_a[..., None]
    for sym, x, y, r in TOKENS:
        dx, dy = x - ctr[0], y - ctr[1]
        th = np.arctan2((dx * v[0] + dy * v[1]) / short_r, (dx * u[0] + dy * u[1]) / long_r)
        tangent = -long_r * np.sin(th) * u + short_r * np.cos(th) * v
        tangent /= np.linalg.norm(tangent)
        best = None
        for sign in (1, -1):
            sx, sy = np.array([x, y]) + sign * tangent * (2 * r + 18)
            clear = min(np.hypot(sx - ox, sy - oy) for _, ox, oy, _ in TOKENS) - r
            if plate[int(sy), int(sx)]:
                clear -= 100
            if best is None or clear > best[0]:
                best = (clear, sx - x, sy - y)
        _, ox, oy = best
        shift = np.float32([[1, 0, -ox], [0, 1, -oy]])
        moved_p = cv2.warpAffine(prem, shift, (w, h), flags=cv2.INTER_LINEAR, borderValue=0)
        moved_a = cv2.warpAffine(base_a, shift, (w, h), flags=cv2.INTER_LINEAR, borderValue=0)
        m = np.zeros((h, w), np.float32)
        cv2.circle(m, (int(x), int(y)), int(r + 9), 1.0, -1, cv2.LINE_AA)
        m = cv2.GaussianBlur(m, (0, 0), 4)
        prem = prem * (1 - m[..., None]) + moved_p * m[..., None]
        base_a = base_a * (1 - m) + moved_a * m
    base_c = np.where(base_a[..., None] > 1e-4, prem / np.maximum(base_a, 1e-4)[..., None], col)

    # ---- the crop: everything that's there, and a margin
    ys, xs = np.nonzero(alpha > 0.03)
    X0, Y0, X1, Y1 = xs.min() - 8, ys.min() - 8, xs.max() + 9, ys.max() + 9
    X0, Y0, X1, Y1 = int(max(0, X0)), int(max(0, Y0)), int(min(w, X1)), int(min(h, Y1))
    crop = lambda img: img[Y0:Y1, X0:X1]

    base = np.dstack([np.clip(base_c, 0, 1)[..., ::-1] * 255, base_a * 255]).round().astype(np.uint8)
    cv2.imwrite(os.path.join(OUT, 'base.webp'), crop(base), [cv2.IMWRITE_WEBP_QUALITY, 90])

    def save_mask(name, a):
        m = np.dstack([np.full((h, w, 3), 255, np.uint8), (np.clip(a, 0, 1) * 255).round().astype(np.uint8)])
        cv2.imwrite(os.path.join(OUT, name), crop(m), [cv2.IMWRITE_WEBP_QUALITY, 80])

    soft_plate = cv2.GaussianBlur(plate.astype(np.float32), (0, 0), 1.2)
    save_mask('plate.webp', soft_plate)
    save_mask('shine.webp', plate * smoothstep(0.45, 1.0, lum) ** 1.5)
    lines = globe & ~cv2.dilate(plate.astype(np.uint8), np.ones((9, 9), np.uint8)).astype(bool)
    save_mask('globe.webp', lines * smoothstep(0.55, 0.95, lum))
    boxes = np.zeros((h, w), bool)
    for x0, y0, x1, y1 in SPARK_BOXES:
        boxes[y0:y1, x0:x1] = True
    # (white-hot and jagged: not where the tokens were, nor along the ring's band through them)
    base_lum = (base_c * base_a[..., None]).max(-1)
    base_sat = base_c.max(-1) - base_c.min(-1)
    along = ring_band((h, w), ctr, long_r, short_r, u)[1] > 0.2
    sparks = boxes & ~plate & ~cv2.dilate(fill, np.ones((9, 9), np.uint8)).astype(bool) & ~along & (base_lum > 0.82) & (base_sat < 0.45)
    save_mask('sparks.webp', cv2.GaussianBlur(sparks.astype(np.float32), (0, 0), 0.8))

    # ---- where it all is, in the crop's pixels
    gx, gy, gr = GLOBE
    for t in layout['tokens']:
        dx, dy = t['x'] - ctr[0], t['y'] - ctr[1]
        t['angle'] = float(np.arctan2((dx * v[0] + dy * v[1]) / short_r, (dx * u[0] + dy * u[1]) / long_r))
    shift = lambda o: {**o, 'left': o['left'] - X0, 'top': o['top'] - Y0, **({'x': o['x'] - X0, 'y': o['y'] - Y0} if 'x' in o else {})}
    data = {
        'width': int(X1 - X0),
        'height': int(Y1 - Y0),
        'globe': {'x': float(gx - X0), 'y': float(gy - Y0), 'r': float(gr)},
        'orbit': {'x': float(ctr[0] - X0), 'y': float(ctr[1] - Y0), 'long': long_r, 'short': short_r, 'ux': float(u[0]), 'uy': float(u[1]), 'vx': float(v[0]), 'vy': float(v[1])},
        'tokens': [shift(t) for t in layout['tokens']],
        'rockets': [shift(r) for r in layout['rockets']],
        'sparkles': [shift(s) for s in layout['sparkles']],
    }
    os.makedirs(os.path.dirname(LAYOUT), exist_ok=True)
    with open(LAYOUT, 'w') as fh:
        fh.write('// Where the SPACE TIMES logo\'s pieces are, in its pixels: made by\n// scripts/space-times-logo.py with the layers in public/brand/space-times/.\n\n')
        fh.write('export const LOGO = ' + json.dumps(data, indent=2, ensure_ascii=False) + ' as const;\n')
    print('crop', (X0, Y0, X1, Y1), 'orbit', ctr.round(1), round(long_r, 1), round(short_r, 1))


if __name__ == '__main__':
    main()
