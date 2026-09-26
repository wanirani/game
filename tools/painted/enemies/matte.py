#!/usr/bin/env python3
"""Background removal for Kling enemy art on flat grey (adapted from the boss prototype B matte).
alpha = rembg (isnet-general-use) soft matte, forced to 0 where the pixel is within a tight distance of the flat bg
colour (punches holes: torn wing membranes, gaps between bones), then colour decontamination (un-mix the grey fringe).
The Kling watermark (bottom-right 'KlingAI 3.0 Omni') is painted over with the bg colour first.

Usage: python3 matte.py <in.png> <out.png> [--soft]     (--soft: ghosts/ectoplasm keep translucent mist; weaker key)
"""
import sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

_sess = None


def rembg_alpha(im):
    global _sess
    from rembg import remove, new_session
    if _sess is None:
        _sess = new_session('isnet-general-use')
    r = remove(im, session=_sess, only_mask=True, post_process_mask=False)
    return np.asarray(r).astype(np.float32) / 255.0


def bg_colour(a):
    border = np.concatenate([a[:6].reshape(-1, 3), a[:, :6].reshape(-1, 3), a[:, -6:].reshape(-1, 3), a[-6:].reshape(-1, 3)])
    return np.median(border, 0)


def kill_watermark(a, bg):
    h, w, _ = a.shape
    y0, x0 = int(h * 0.88), int(w * 0.68)
    reg = a[y0:, x0:]
    white = (reg.min(2) > 185) & ((reg.max(2) - reg.min(2)) < 40)
    ys, xs = np.where(white)
    if len(ys) > 30:
        yb = ys.max(); sel = ys > yb - int(h * 0.05)
        ys, xs = ys[sel], xs[sel]
        by0, by1, bx0, bx1 = ys.min() - 10, ys.max() + 10, xs.min() - 60, xs.max() + 10   # logo glyph sits left of the text
        a[y0 + max(0, by0):y0 + by1, x0 + max(0, bx0):x0 + bx1] = bg
    return a


def matte(src, dst, soft=False):
    im = Image.open(src).convert('RGB')
    a = np.asarray(im).astype(np.float32).copy()
    bg = bg_colour(a)
    a = kill_watermark(a, bg)
    # per-row background (Kling greys often have a slight vertical gradient)
    rowbg = np.median(np.concatenate([a[:, :20], a[:, -20:]], 1), axis=1)
    dist = np.sqrt(((a - rowbg[:, None, :]) ** 2).sum(2))
    ar = rembg_alpha(Image.fromarray(a.astype(np.uint8)))
    if soft:
        key = np.clip((dist - 6.0) / 30.0, 0, 1)
        alpha = np.maximum(ar * np.clip((dist - 3.0) / 14.0, 0, 1), key * (ar > 0.01))
    else:
        key = np.clip((dist - 9.0) / 22.0, 0, 1)
        alpha = np.minimum(np.maximum(ar, key * (ar > 0.02)), np.clip((dist - 5.0) / 10.0, 0, 1))
    alpha = ndi.gaussian_filter(alpha, 0.6)
    alpha[dist < (4 if soft else 6)] = 0
    A = alpha[..., None]
    B = rowbg[:, None, :]
    col = np.where(A > 0.05, (a - (1 - A) * B) / np.maximum(A, 0.05), a)
    col = np.clip(col, 0, 255)
    Image.fromarray(np.dstack([col, alpha * 255]).astype(np.uint8), 'RGBA').save(dst)
    print(dst, 'bg', bg.round(1), 'alpha mean %.3f' % float(alpha.mean()))


if __name__ == '__main__':
    args = [x for x in sys.argv[1:] if not x.startswith('--')]
    matte(args[0], args[1], soft='--soft' in sys.argv)
