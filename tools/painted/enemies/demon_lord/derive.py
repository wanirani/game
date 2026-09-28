#!/usr/bin/env python3
"""Derived sources for the demon lord (ART-ENEMY-5): src/dl_sheet{1,2}_raw.webp (the kept Kling parts sheets) →
src/dl_sheet{1,2}.webp. Kling painted a cyan rim-light halo around every piece; the grey key keeps such coloured glow as
a blue fringe, so every cyan/blue pixel is pulled back to the flat background grey (the demon has no blue: maroon hide,
black-gold armour, lava cracks, amber eyes).
    python3 tools/painted/enemies/demon_lord/derive.py
"""
import os
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

HERE = os.path.dirname(os.path.abspath(__file__))
for n in ('dl_sheet1', 'dl_sheet2'):
    a = np.asarray(Image.open(os.path.join(HERE, 'src', n + '_raw.webp')).convert('RGB')).astype(np.float32)
    bg = np.median(np.concatenate([a[:8].reshape(-1, 3), a[:, :8].reshape(-1, 3)]), 0)
    R, G, B = a[..., 0], a[..., 1], a[..., 2]
    blue = np.clip((B - np.maximum(R, G * 0.92) - 6) / 34.0, 0, 1)
    blue = ndi.gaussian_filter(blue, 1.2)
    out = a * (1 - blue[..., None]) + bg[None, None, :] * blue[..., None]
    Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).save(os.path.join(HERE, 'src', n + '.webp'), 'WEBP', quality=93)
    print(n + '.webp: halo pixels', int((blue > 0.5).sum()))
