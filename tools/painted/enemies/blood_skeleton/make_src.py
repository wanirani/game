#!/usr/bin/env python3
"""Blood skeleton sources (ART-ENEMY-2): the skeleton rig's Kling sources re-coloured as blood-soaked bone.

    python3 tools/painted/enemies/blood_skeleton/make_src.py

Reads  tools/painted/enemies/skeleton/src/{skeleton_edit,skeleton_sheet1,skeleton_ref}.webp (read-only; the skeleton
       rig belongs to ART-ENEMY-1) and tools/.qa_art-enemy-2/raw/props_1.png (Kling props sheet, see
       tools/kling/manifest_art-enemy-2.json → shot "props"; only needed once, the crop is stored as src/club.webp)
Writes src/blood_edit.webp, src/blood_sheet1.webp, src/blood_skeleton_ref.webp (+ src/club.webp when props_1 exists)

Re-colour = gradient map on luminance (dark maroon → crimson → wet salmon highlights), a low-frequency 'dried blood'
blotch field and 12 % of the original colour, applied only inside the rembg matte and composited back over the flat
grey background, so matte.py / build.py treat it like any Kling source. Deterministic (seeded noise).
"""
import os, sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..'))
sys.path.insert(0, os.path.join(ROOT, 'tools', 'painted', 'enemies'))
import matte as M   # noqa: E402  (shared matte helpers: rembg alpha, background colour, watermark fill)

STOPS = [(0.00, (14, 1, 3)), (0.16, (52, 5, 8)), (0.36, (112, 20, 17)), (0.58, (168, 50, 38)),
         (0.78, (206, 98, 82)), (0.93, (240, 176, 160)), (1.00, (252, 214, 200))]


def gradmap(L):
    xs = np.array([s[0] for s in STOPS]); out = np.zeros(L.shape + (3,), np.float32)
    for c in range(3):
        out[..., c] = np.interp(L, xs, np.array([s[1][c] for s in STOPS], np.float32))
    return out


def bloodify(src, dst, seed=7):
    im = Image.open(src).convert('RGB')
    a = np.asarray(im).astype(np.float32).copy()
    bg = M.bg_colour(a)
    a = M.kill_watermark(a, bg)
    rowbg = np.median(np.concatenate([a[:, :20], a[:, -20:]], 1), axis=1)
    alpha = M.rembg_alpha(Image.fromarray(a.astype(np.uint8)))
    dist = np.sqrt(((a - rowbg[:, None, :]) ** 2).sum(2))
    alpha = np.minimum(alpha, np.clip((dist - 4.0) / 10.0, 0, 1))
    A = alpha[..., None]
    B = rowbg[:, None, :]
    col = np.where(A > 0.05, (a - (1 - A) * B) / np.maximum(A, 0.05), a)          # un-mix the grey fringe
    L = (0.299 * col[..., 0] + 0.587 * col[..., 1] + 0.114 * col[..., 2]) / 255.0
    rng = np.random.default_rng(seed)
    n = ndi.gaussian_filter(rng.random(L.shape).astype(np.float32), 18)
    n = (n - n.min()) / max(1e-6, n.max() - n.min())
    blot = 1.0 - 0.28 * np.clip((n - 0.55) / 0.25, 0, 1)                             # darker dried-blood patches
    rc = gradmap(np.clip(L * 1.02, 0, 1)) * blot[..., None]
    rc = rc * 0.88 + col * 0.12
    out = rc * A + B * (1 - A)
    Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).save(dst, 'WEBP', quality=93, method=6)
    print(dst)


if __name__ == '__main__':
    SK = os.path.join(ROOT, 'tools', 'painted', 'enemies', 'skeleton', 'src')
    OUT = os.path.join(HERE, 'src')
    os.makedirs(OUT, exist_ok=True)
    bloodify(os.path.join(SK, 'skeleton_edit.webp'), os.path.join(OUT, 'blood_edit.webp'))
    bloodify(os.path.join(SK, 'skeleton_sheet1.webp'), os.path.join(OUT, 'blood_sheet1.webp'))
    bloodify(os.path.join(SK, 'skeleton_ref.webp'), os.path.join(OUT, 'blood_skeleton_ref.webp'))
    props = os.path.join(ROOT, 'tools', '.qa_art-enemy-2', 'raw', 'props_1.png')
    if os.path.exists(props):
        Image.open(props).convert('RGB').crop((40, 120, 480, 1300)).save(os.path.join(OUT, 'club.webp'), 'WEBP', quality=93, method=6)
        print('club.webp')
