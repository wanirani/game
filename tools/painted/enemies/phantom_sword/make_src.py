#!/usr/bin/env python3
"""Phantom sword source (ART-ENEMY-2, T1): phantom_sword_ref.webp = Kling text_to_image (shot phantom, take 1: rune-etched
longsword, bat-wing gold guard, eye-gem pommel, horizontal, point right). Kling raw downloads live in
tools/.qa_art-enemy-2/raw/ while the package runs (tools/kling/manifest_art-enemy-2.json)."""
import os
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..'))
p = os.path.join(ROOT, 'tools', '.qa_art-enemy-2', 'raw', 'phantom_1.png')
OUT = os.path.join(HERE, 'src'); os.makedirs(OUT, exist_ok=True)
if os.path.exists(p): Image.open(p).convert('RGB').save(os.path.join(OUT, 'phantom_sword_ref.webp'), 'WEBP', quality=93, method=6); print('phantom_sword_ref.webp')
