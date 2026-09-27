#!/usr/bin/env python3
"""gargoyle statue source: the matted body (e1_gargoyle_body.png) turned to cold dormant stone — desaturated towards a
blue-grey granite, the lava cracks (hot orange) put out to dark fissures, the moss kept as a faint grey-green.
Writes e1_gargoyle_stone.png next to it (same size, so parts.json reuses the body's box and pivots).
Usage: python3 tools/painted/enemies/gargoyle/prep.py [--work tools/painted/.work/enemies]"""
import sys, os
import numpy as np
from PIL import Image

W = sys.argv[sys.argv.index('--work') + 1] if '--work' in sys.argv else 'tools/painted/.work/enemies'
src = os.path.join(W, 'matte', 'e1_gargoyle_body.png')
a = np.asarray(Image.open(src).convert('RGBA')).astype(np.float32)
rgb = a[..., :3] / 255.0
mx, mn = rgb.max(2), rgb.min(2)
sat = np.where(mx > 1e-3, (mx - mn) / np.maximum(mx, 1e-3), 0)
lum = rgb @ np.array([0.299, 0.587, 0.114], np.float32)
r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
hot = np.clip((sat - 0.35) / 0.3, 0, 1) * (r > g) * (g > b * 0.9) * np.clip((r - 0.45) / 0.3, 0, 1)   # lava cracks
moss = np.clip((sat - 0.2) / 0.3, 0, 1) * (g > r) * (g > b)
stone = np.stack([lum * 0.92, lum * 0.95, lum * 1.06], -1)                       # cool granite grey
stone = stone * (1 - 0.72 * hot[..., None])                                       # put the cracks out
tint = np.stack([lum * 0.9, lum * 1.0, lum * 0.88], -1)                          # moss: faint grey-green
stone = stone * (1 - 0.35 * moss[..., None]) + tint * 0.35 * moss[..., None]
out = a.copy(); out[..., :3] = np.clip(stone * 255.0 * 0.7, 0, 255)
Image.fromarray(out.astype(np.uint8), 'RGBA').save(os.path.join(W, 'matte', 'e1_gargoyle_stone.png'))
print('e1_gargoyle_stone.png')
