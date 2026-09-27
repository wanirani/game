#!/usr/bin/env python3
"""Corpse worm source (ART-ENEMY-2, T1): corpse_worm_ref.webp = Kling text_to_image (shot worm, take 2: giant pale
maggot, side view facing right, lamprey mouth). Kling raw downloads live in tools/.qa_art-enemy-2/raw/ while the package
runs (tools/kling/manifest_art-enemy-2.json)."""
import os
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..'))
p = os.path.join(ROOT, 'tools', '.qa_art-enemy-2', 'raw', 'worm_2.png')
OUT = os.path.join(HERE, 'src'); os.makedirs(OUT, exist_ok=True)
if os.path.exists(p): Image.open(p).convert('RGB').save(os.path.join(OUT, 'corpse_worm_ref.webp'), 'WEBP', quality=93, method=6); print('corpse_worm_ref.webp')
