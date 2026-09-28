#!/usr/bin/env python3
"""Derived source for the vampire bride's screaming head (ART-ENEMY-5): src/bride_sheet.webp → src/bride_scream.webp.
The screaming face is painted in greys close to the flat background, so the grey key of matte.py punches holes into it;
the neural matte (--rembg) keeps it whole but, run on the full sheet, it locks onto the big gown and drops the small
pieces. This copy keeps only the screaming head's region (everything else painted over with the background grey), so
rembg sees one object. Same size as the sheet → the parts.json boxes stay in sheet coordinates.
    python3 tools/painted/enemies/vampire_bride/derive.py
"""
import os
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
a = np.asarray(Image.open(os.path.join(HERE, 'src', 'bride_sheet.webp')).convert('RGB')).copy()
bg = np.median(np.concatenate([a[:8].reshape(-1, 3), a[:, :8].reshape(-1, 3)]), 0).astype(np.uint8)
x0, y0, x1, y1 = 1680, 10, 2290, 710
out = np.empty_like(a); out[:] = bg
out[y0:y1, x0:x1] = a[y0:y1, x0:x1]
Image.fromarray(out).save(os.path.join(HERE, 'src', 'bride_scream.webp'), 'WEBP', quality=93)
print('bride_scream.webp written')
