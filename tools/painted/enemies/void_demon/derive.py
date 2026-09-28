#!/usr/bin/env python3
"""Derived source for the void demon (ART-ENEMY-5): src/void_sheet_raw.webp (the kept Kling sheet void_sheet_1) →
src/void_sheet.webp. Kling painted a pale violet glow halo (and a thin white 'event horizon' ring behind the head)
around the dark silhouettes; the grey key keeps such light glow as a solid lavender disc. Every LIGHT pixel outside the
(hole-filled) dark silhouette is pulled back to the background grey — the eyes and the stars stay because they sit inside
the silhouette. Below the shoulders of the body piece the torso window onto the starfield is open towards the mist tail,
so there only the arms are cleaned. The renderer draws its own halo ring.
    python3 tools/painted/enemies/void_demon/derive.py
"""
import os
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

HERE = os.path.dirname(os.path.abspath(__file__))
a = np.asarray(Image.open(os.path.join(HERE, 'src', 'void_sheet_raw.webp')).convert('RGB')).astype(np.float32)
bg = np.median(np.concatenate([a[:8].reshape(-1, 3), a[:, :8].reshape(-1, 3)]), 0)
lum = a.mean(2)
dark = lum < 70
core = ndi.binary_fill_holes(ndi.binary_closing(dark, iterations=3))
core = ndi.binary_dilation(core, iterations=2)
light = lum > bg.mean() + 10
h, w = lum.shape
yy, xx = np.mgrid[0:h, 0:w]
zone = ((xx < 780) & (yy < 640)) | (xx >= 1350)          # head/shoulders of the body piece + both arms
kill = light & ~core & zone
m = ndi.gaussian_filter(kill.astype(np.float32), 1.2)[..., None]
out = a * (1 - m) + bg[None, None, :] * m
Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).save(os.path.join(HERE, 'src', 'void_sheet.webp'), 'WEBP', quality=93)
print('void_sheet.webp: glow pixels cleaned', int(kill.sum()))
