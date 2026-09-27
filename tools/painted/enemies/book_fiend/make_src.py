#!/usr/bin/env python3
"""Book fiend source (ART-ENEMY-2, T1): book_fiend_ref.webp = Kling image_to_image of the grimoire (shot book_front,
take 2: the demonic book seen straight from the front, both halves spread like wings, fanged eye in the gutter, red
ribbon). Kling raw downloads live in tools/.qa_art-enemy-2/raw/ while the package runs
(tools/kling/manifest_art-enemy-2.json)."""
import os
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..'))
p = os.path.join(ROOT, 'tools', '.qa_art-enemy-2', 'raw', 'book_front_2.png')
OUT = os.path.join(HERE, 'src'); os.makedirs(OUT, exist_ok=True)
if os.path.exists(p): Image.open(p).convert('RGB').save(os.path.join(OUT, 'book_fiend_ref.webp'), 'WEBP', quality=93, method=6); print('book_fiend_ref.webp')
