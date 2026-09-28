#!/usr/bin/env python3
"""clockwork_soldier: strip the cyan rim glow Kling painted around every figure of the parts sheet (take 2).
Reads the RGBA matte of the sheet (<work>/matte/a3_clockwork_soldier_sheet2.png, from matte.py) and writes
<work>/matte/a3_clockwork_soldier_sheet2c.png: bright cyan pixels (the glow) are dropped, the 3-px band inside the new
edge is de-blued (bright blue-cast pixels pulled to their red/green level) so no blue fringe is left on the red coat,
the black shako and boots. The navy trousers are dark and untouched. <work> = $ENEMY_WORK (tools/painted/.work/enemies)."""
import os
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

WORK = os.environ.get('ENEMY_WORK') or os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '.work', 'enemies')
src = os.path.join(WORK, 'matte', 'a3_clockwork_soldier_sheet2.png')
A = np.asarray(Image.open(src).convert('RGBA')).astype(np.float32)
r, g, b, a = A[..., 0], A[..., 1], A[..., 2], A[..., 3]
cyan = (b > r + 55) & (g > 110) & (b > 170)
a2 = np.where(cyan, 0, a)
# drop the last semi-transparent glow ring hanging on the new edge
solid = a2 > 200
ring = (a2 > 0) & ~solid & ~ndi.binary_erosion(a2 > 0, iterations=1)
a2 = np.where(ring & (b > r + 25), 0, a2)
# de-blue the band just inside the edge (only bright, blue-cast pixels: the glow bleeding into the paint)
band = (a2 > 0) & ~ndi.binary_erosion(a2 > 0, iterations=3)
cast = band & (b > np.maximum(r, g) + 12) & ((r + g + b) / 3 > 70)
top = np.maximum(r, g) + 6
out = A.copy()
out[..., 2] = np.where(cast, np.minimum(b, top), b)
out[..., 3] = a2
Image.fromarray(out.clip(0, 255).astype(np.uint8)).save(os.path.join(WORK, 'matte', 'a3_clockwork_soldier_sheet2c.png'))
print('ok', int(cyan.sum()), 'glow px dropped,', int(cast.sum()), 'edge px de-blued')
