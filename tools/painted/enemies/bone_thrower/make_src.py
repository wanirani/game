#!/usr/bin/env python3
"""뼈 던지는 해골 (bone_thrower) source prep: the skeleton's armless side-view edit with the dark red loincloth
recoloured to a rotten moss green (like the vector version's '#3a4a2a'), so the rig-reuse variant reads apart from the
plain skeleton. Only saturated red/brown cloth texels inside the pelvis/loincloth box are shifted; bones and the grey
background are untouched (the matte still keys the grey).
    python3 tools/painted/enemies/bone_thrower/make_src.py   -> src/bt_edit_green.webp
"""
import os
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
src = os.path.join(HERE, '..', 'skeleton', 'src', 'skeleton_edit.webp')
a = np.asarray(Image.open(src).convert('RGB')).astype(np.float32) / 255.0
r, g, b = a[..., 0], a[..., 1], a[..., 2]
mx, mn = a.max(-1), a.min(-1)
sat = (mx - mn) / np.maximum(mx, 1e-4)
red = (r > g * 1.18) & (r > b * 1.18) & (sat > 0.28)
box = np.zeros_like(red); box[960:1980, 600:1060] = True          # pelvis + loincloth only (parts.json pelvis box)
m = red & box
lum = 0.3 * r + 0.55 * g + 0.15 * b
# moss green: keep the cloth's luminance pattern (folds, tears), map to a desaturated rotten green
out = a.copy()
out[..., 0] = np.where(m, lum * 0.78, r)
out[..., 1] = np.where(m, lum * 1.18 + 0.02, g)
out[..., 2] = np.where(m, lum * 0.70, b)
Image.fromarray((np.clip(out, 0, 1) * 255 + 0.5).astype(np.uint8)).save(os.path.join(HERE, 'src', 'bt_edit_green.webp'), quality=93)
print('recoloured texels', int(m.sum()))
