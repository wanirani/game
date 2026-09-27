#!/usr/bin/env python3
"""Lesser demon sources (ART-ENEMY-2). demon_ref.webp = Kling Step-1 reference (shot demon_ref, take 1, the chosen
design: red horned imp, black mane, glowing chest rune, bat wings, goat legs, arrow tail); demon_side.webp = Kling
strict side view made from it (shot demon_side, take 1, facing left: one bat wing raised behind the back, the far arm
reaching forward, the near arm hanging, the tail curling down). Every part is cut from the side view (parts.json).
Kling raw downloads live in tools/.qa_art-enemy-2/raw/ while the package runs (tools/kling/manifest_art-enemy-2.json)."""
import os
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..'))
RAW = os.path.join(ROOT, 'tools', '.qa_art-enemy-2', 'raw')
OUT = os.path.join(HERE, 'src'); os.makedirs(OUT, exist_ok=True)
for raw, name in (('demon_ref_1.png', 'demon_ref.webp'), ('demon_side_1.png', 'demon_side.webp')):
    p = os.path.join(RAW, raw)
    if os.path.exists(p): Image.open(p).convert('RGB').save(os.path.join(OUT, name), 'WEBP', quality=93, method=6); print(name)
