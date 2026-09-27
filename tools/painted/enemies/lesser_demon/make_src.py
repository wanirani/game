#!/usr/bin/env python3
"""Lesser demon sources (ART-ENEMY-2). demon_ref.webp = Kling Step-1 reference (shot demon_ref, take 1, the chosen
design: red horned imp, black mane, glowing chest rune, bat wings, goat legs, arrow tail); demon_side.webp = Kling
strict side view made from it (shot demon_side, take 1, facing left: one bat wing raised behind the back, the far arm
reaching forward, the near arm hanging, the tail curling down). Every part is cut from the side view (parts.json).
The painting has a cold blue rim glow behind the mane that the matte keeps as a haze; it is keyed back to the grey
backdrop here (only inside the mane/back region) so the cut edge is the mane itself.
Kling raw downloads live in tools/.qa_art-enemy-2/raw/ while the package runs (tools/kling/manifest_art-enemy-2.json)."""
import os
import numpy as np
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..'))
RAW = os.path.join(ROOT, 'tools', '.qa_art-enemy-2', 'raw')
OUT = os.path.join(HERE, 'src'); os.makedirs(OUT, exist_ok=True)
p = os.path.join(RAW, 'demon_ref_1.png')
if os.path.exists(p): Image.open(p).convert('RGB').save(os.path.join(OUT, 'demon_ref.webp'), 'WEBP', quality=93, method=6); print('demon_ref.webp')
p = os.path.join(RAW, 'demon_side_1.png')
if os.path.exists(p):
    im = np.asarray(Image.open(p).convert('RGB')).astype(np.float32)
    x0, y0, x1, y1 = 880, 480, 1260, 1200
    reg = im[y0:y1, x0:x1]
    r, g, b = reg[..., 0], reg[..., 1], reg[..., 2]
    t = np.clip((b - np.maximum(r, g) - 4) / 26.0, 0, 1)[..., None]
    bg = np.array([109, 105, 102], np.float32)
    im[y0:y1, x0:x1] = reg * (1 - t) + bg * t
    Image.fromarray(im.clip(0, 255).astype(np.uint8)).save(os.path.join(OUT, 'demon_side.webp'), 'WEBP', quality=93, method=6); print('demon_side.webp')
