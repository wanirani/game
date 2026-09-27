#!/usr/bin/env python3
"""Scholar ghost source (ART-ENEMY-2, T1): scholar_ghost_ref.webp = Kling text_to_image (shot scholar, take 1: pieces of
the ghost of an old scholar — floating spectral body with beard, spectacles, mortarboard and reaching hand; a floating
open book). Kling raw downloads live in tools/.qa_art-enemy-2/raw/ while the package runs
(tools/kling/manifest_art-enemy-2.json)."""
import os
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..'))
p = os.path.join(ROOT, 'tools', '.qa_art-enemy-2', 'raw', 'scholar_1.png')
OUT = os.path.join(HERE, 'src'); os.makedirs(OUT, exist_ok=True)
if os.path.exists(p): Image.open(p).convert('RGB').save(os.path.join(OUT, 'scholar_ghost_ref.webp'), 'WEBP', quality=93, method=6); print('scholar_ghost_ref.webp')
