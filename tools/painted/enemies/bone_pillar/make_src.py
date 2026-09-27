#!/usr/bin/env python3
"""Bone pillar source (ART-ENEMY-2, T1): bone_pillar_ref.webp = Kling text_to_image (shot pillar, take 1: horned dragon
skull, fanged skull, a column of stacked vertebrae on a heap of bones and skulls). Kling raw downloads live in
tools/.qa_art-enemy-2/raw/ while the package runs (tools/kling/manifest_art-enemy-2.json)."""
import os
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..', '..'))
p = os.path.join(ROOT, 'tools', '.qa_art-enemy-2', 'raw', 'pillar_1.png')
OUT = os.path.join(HERE, 'src'); os.makedirs(OUT, exist_ok=True)
if os.path.exists(p): Image.open(p).convert('RGB').save(os.path.join(OUT, 'bone_pillar_ref.webp'), 'WEBP', quality=93, method=6); print('bone_pillar_ref.webp')
