#!/usr/bin/env python3
"""미믹 (mimic) matte clean-up: the reference painted grey-blue cast shadows of the spider legs on the floor, and the
matte keeps them (opaque slate shapes around the legs). Outside the chest body only the red legs (and their dark
outlines) are kept; everything else there is cut.
    python3 tools/painted/enemies/matte.py tools/painted/enemies/mimic/src/mimic_ref.webp <WORK>/matte/e1_mimic_ref.png
    python3 tools/painted/enemies/mimic/prep.py            -> <WORK>/matte/e1_mimic_ref_clean.png (parts.json source 'r')
"""
import os
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

HERE = os.path.dirname(os.path.abspath(__file__))
WORK = os.environ.get('ENEMY_WORK') or os.path.abspath(os.path.join(HERE, '..', '..', '.work', 'enemies'))
src = os.path.join(WORK, 'matte', 'e1_mimic_ref.png')
a = np.asarray(Image.open(src).convert('RGBA')).astype(np.float32)
h, w = a.shape[:2]
# chest body + open lid (source px): everything inside is kept as matted
CHEST = [(450, 300), (750, 180), (1440, 165), (1680, 300), (1770, 840), (1740, 990), (1665, 1260), (1380, 1440), (1065, 1620), (645, 1380), (585, 990), (450, 780)]
m = Image.new('L', (w, h), 0); ImageDraw.Draw(m).polygon(CHEST, fill=255)
inside = np.asarray(m) > 0
r, g, b = a[..., 0], a[..., 1], a[..., 2]
red = (r > g * 1.18) & (r > b * 0.95) & (a[..., 3] > 40)
red = ndi.binary_opening(red, iterations=1)
keep = inside | ndi.binary_dilation(red, iterations=5)
a[..., 3] *= ndi.gaussian_filter(keep.astype(np.float32), 0.8)
Image.fromarray(a.clip(0, 255).astype(np.uint8), 'RGBA').save(os.path.join(WORK, 'matte', 'e1_mimic_ref_clean.png'))
print('mimic clean: kept', int(keep.sum()), 'of', h * w)
